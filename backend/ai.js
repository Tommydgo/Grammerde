import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Same word-splitting logic as the frontend renderAllWords — must stay in sync.
// Substitutes corrections directly into the original text (rather than trusting the
// model to reconstruct the full text), so exact reconstruction is guaranteed regardless
// of model quality.
function applyCorrections(text, corrections) {
  const tokens = text.split(/(\s+)/);
  const usedWords = new Set();

  // Map each correction to the first unused matching token
  const byTokenIndex = new Map();
  for (const c of corrections) {
    if (usedWords.has(c.original)) continue;
    const idx = tokens.findIndex((token, i) => {
      if (byTokenIndex.has(i)) return false;
      const clean = token.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
      return clean === c.original;
    });
    if (idx === -1) continue;
    byTokenIndex.set(idx, c);
    usedWords.add(c.original);
  }

  const errors_map = [];
  let spanIdx = 0;
  const outTokens = tokens.map((token, i) => {
    const isWhitespace = /^\s+$/.test(token);
    const isPunct    = /^[.,;:!?«»"'()\[\]\-—–]+$/.test(token);
    const clean      = token.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
    const isWord     = !isWhitespace && !isPunct && clean;

    if (!isWord) return token;

    const correction = byTokenIndex.get(i);
    if (!correction) {
      spanIdx++;
      return token;
    }

    const lead  = (token.match(/^[^a-zA-ZÀ-ÿ]+/) || [''])[0];
    const trail = (token.match(/[^a-zA-ZÀ-ÿ]+$/) || [''])[0];

    errors_map.push({
      span_idx:          spanIdx,
      displayed_invalid: correction.invalide,
      original_valid:    correction.original,
      error_type:        correction.error_type,
      explanation:       correction.explanation,
    });
    spanIdx++;
    return lead + correction.invalide + trail;
  });

  return { corrupted_text: outTokens.join(''), errors_map };
}

const LANG_NAMES = {
  fr: 'français', en: 'anglais', es: 'espagnol',
  it: 'italien',  de: 'allemand', ar: 'arabe',
};

const ERROR_EXAMPLES = {
  fr: {
    conjugaison: '"il mange" → invalide "il mangent" | "elles sont parties" → invalide "elles est parties" | "nous avions" → invalide "nous avons eu"',
    accord:      '"les fleurs blanches" → invalide "blanc" | "une belle maison" → invalide "beau" | "des résultats positifs" → invalide "positive"',
    homophone:   '"il a" → invalide "à" | "ce livre" → invalide "se" | "leur maison" → invalide "leurs" | "on" → invalide "ont" | "dans" → invalide "dent"',
    orthographe: '"appeler" → invalide "appeller" | "occurrence" → invalide "occurence" | "charrette" → invalide "charette"',
  },
  en: {
    conjugaison: '"he goes" → invalide "he go" | "they went" → invalide "they gone" | "she has" → invalide "she have"',
    accord:      '"the results are" → invalide "is" | "they were" → invalide "was" | "some books" → invalide "book"',
    homophone:   '"their house" → invalide "there" | "it\'s raining" → invalide "its" | "you\'re right" → invalide "your" | "to go" → invalide "too"',
    orthographe: '"necessary" → invalide "necessery" | "separate" → invalide "seperate" | "occurrence" → invalide "occurence"',
  },
};

export async function injectErrors(text, difficulty = 'moyen', errorTypes = [], textSize = 'moyen', lang = 'fr') {
  const langName    = LANG_NAMES[lang] || lang;
  const activeTypes = errorTypes.length
    ? errorTypes
    : ['conjugaison', 'accord', 'homophone', 'orthographe'];

  const examples = ERROR_EXAMPLES[lang] || ERROR_EXAMPLES.fr;
  const examplesBlock = activeTypes
    .map(t => `- ${t} : ${examples[t] || '(voir définition standard)'}`)
    .join('\n');

  const systemPrompt = `Tu es un assistant linguistique expert qui repère des mots à corrompre dans un texte en ${langName}.

FORMAT DE SORTIE : JSON avec exactement un champ :
- "corrections" : tableau d'objets { "original": "...", "invalide": "...", "error_type": "...", "explanation": "..." }

RÈGLES ABSOLUES (violation = résultat inutilisable) :
1. "original" DOIT être un mot copié EXACTEMENT du texte (même casse), sans espace, sans ponctuation collée.
2. "invalide" est le mot fautif qui remplacera "original" — un seul mot, sans espace.
3. "invalide" ≠ "original" — si les deux sont identiques, la faute est invalide.
4. UNICITÉ — ne propose jamais deux corrections avec le même "original".
5. Ne corromps JAMAIS : noms propres, chiffres, sigles, abréviations.
6. La faute doit être INCONTESTABLEMENT fausse dans son contexte — évite tout cas ambigu ou subjectif.
7. Introduis entre 8 et 12 fautes, réparties équitablement sur les types demandés (minimum 2 par type si possible).

EXEMPLES PAR TYPE DE FAUTE :
${examplesBlock}

VALIDATION obligatoire avant chaque faute :
✓ "original" est-il la copie exacte d'un mot du texte ?
✓ "invalide" est-il clairement et incontestablement faux dans ce contexte précis ?
✓ Un locuteur natif de ${langName} reconnaîtrait-il cette faute sans hésitation ?
✓ "invalide" ≠ "original" ?
Si une réponse est NON → ne pas inclure cette faute.`;

  const userPrompt = `Types de fautes à introduire (tous obligatoires, répartis équitablement) : ${activeTypes.join(', ')}

Texte :
${text}`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content);
  if (!Array.isArray(result.corrections)) {
    throw new Error('Réponse Groq invalide');
  }

  const corrections = result.corrections.filter(c =>
    c.original && c.invalide && c.original !== c.invalide &&
    !/\s/.test(c.original) && !/\s/.test(c.invalide)
  );

  return applyCorrections(text, corrections);
}

export function validateCorrection(userAnswer, correctWord) {
  const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalize(userAnswer) === normalize(correctWord);
}
