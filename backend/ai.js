import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Same word-splitting logic as the frontend renderAllWords — must stay in sync
function processSegments(segments) {
  const corrupted_text = segments.map(s => s.type === 'error' ? s.invalide : s.content).join('');

  // Build character range for each segment
  let pos = 0;
  const ranges = segments.map((seg) => {
    const content = seg.type === 'error' ? seg.invalide : seg.content;
    const range = { start: pos, end: pos + content.length, seg };
    pos += content.length;
    return range;
  });

  // Walk the same token split as the frontend to assign span_idx
  const errors_map = [];
  const usedSegments = new Set();
  let spanIdx = 0;
  let charPos = 0;

  for (const token of corrupted_text.split(/(\s+)/)) {
    const isWhitespace = /^\s+$/.test(token);
    const isPunct    = /^[.,;:!?«»"'()\[\]\-—–]+$/.test(token);
    const clean      = token.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
    const isWord     = !isWhitespace && !isPunct && clean;

    if (isWord) {
      const range = ranges.find(r => charPos >= r.start && charPos < r.end);
      if (range?.seg.type === 'error' && !usedSegments.has(range)) {
        usedSegments.add(range);
        errors_map.push({
          span_idx:          spanIdx,
          displayed_invalid: clean,
          original_valid:    range.seg.valide,
          error_type:        range.seg.error_type,
          explanation:       range.seg.explanation,
        });
      }
      spanIdx++;
    }
    charPos += token.length;
  }

  return { corrupted_text, errors_map };
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

  const systemPrompt = `Tu es un assistant linguistique expert qui introduit des fautes dans un texte en ${langName}.

FORMAT DE SORTIE : JSON avec exactement deux champs :
- "plan" : tableau de réflexion préparatoire — liste des mots que tu vas corrompre avec leur contexte (5-6 mots autour), le remplacement prévu et le type. Sert uniquement à ta réflexion interne.
- "segments" : décomposition COMPLÈTE et EXHAUSTIVE du texte en segments consécutifs, chaque segment étant soit :
    { "type": "text",  "content": "..." }
    { "type": "error", "invalide": "...", "valide": "...", "error_type": "...", "explanation": "..." }

RÈGLES ABSOLUES (violation = résultat inutilisable) :
1. Les segments bout-à-bout doivent reconstituer le texte original EXACTEMENT, caractère par caractère, espaces et ponctuation inclus.
2. "valide" DOIT être le mot EXACT copié du texte original — même casse, même forme, aucune modification.
3. "invalide" est le mot fautif affiché au joueur à la place du mot original.
4. "invalide" ≠ "valide" — si les deux sont identiques, la faute est invalide.
5. UN SEUL MOT PAR FAUTE — INTERDICTION ABSOLUE de corrompre un groupe de mots. "invalide" et "valide" ne contiennent jamais d'espace. Exemples STRICTEMENT INTERDITS : invalide "ne pas", invalide "les chats", invalide "avait été", invalide "de la". Si tu veux corrompre une expression, choisis UN seul mot dans cette expression.
6. UNICITÉ — Ne jamais corrompre deux fois le même mot ou la même forme dans le texte. Si "était" apparaît 3 fois, tu ne peux le corrompre qu'une fois maximum. Chaque mot corrompu doit être unique dans le texte.
7. Ne corromps JAMAIS : noms propres, chiffres, sigles, abréviations, ponctuation.
8. La faute doit être INCONTESTABLEMENT fausse dans son contexte — évite tout cas ambigu ou subjectif.
9. Introduis entre 8 et 12 fautes, réparties équitablement sur les types demandés (minimum 2 par type si possible).

EXEMPLES PAR TYPE DE FAUTE :
${examplesBlock}

VALIDATION obligatoire avant chaque faute :
✓ "valide" est-il la copie exacte du mot original du texte ?
✓ "invalide" est-il clairement et incontestablement faux dans ce contexte précis ?
✓ Un locuteur natif de ${langName} reconnaîtrait-il cette faute sans hésitation ?
✓ "invalide" ≠ "valide" ?
Si une réponse est NON → ne pas inclure cette faute.`;

  const userPrompt = `Types de fautes à introduire (tous obligatoires, répartis équitablement) : ${activeTypes.join(', ')}

Texte :
${text}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content);
  if (!Array.isArray(result.segments)) {
    throw new Error('Réponse OpenAI invalide');
  }

  // Drop any error segment where invalide === valide (model validation bypass)
  const cleaned = result.segments.map(s =>
    s.type === 'error' && s.invalide === s.valide
      ? { type: 'text', content: s.valide }
      : s
  );

  return processSegments(cleaned);
}

export function validateCorrection(userAnswer, correctWord) {
  const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalize(userAnswer) === normalize(correctWord);
}
