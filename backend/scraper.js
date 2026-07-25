import fetch from 'node-fetch';

const USER_AGENT = 'Grammerde/1.0 (https://grammerde.onrender.com; tommydiago34@gmail.com)';

export async function scrapeRandom(lang = 'fr') {
  const MAX_RETRIES = 10;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await scrapeWikipedia(lang);
    } catch {
      if (attempt < MAX_RETRIES - 1) continue;
      throw new Error('Impossible de récupérer un article Wikipedia après plusieurs tentatives');
    }
  }
}

async function scrapeWikipedia(lang) {
  // Step 1: get a random article title via MediaWiki API
  const randomUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=1&format=json`;
  const randomRes = await fetch(randomUrl, { headers: { 'User-Agent': USER_AGENT } });
  const randomData = await randomRes.json();
  const title = randomData.query.random[0].title;

  // Step 2: fetch the article's plain-text extract
  const extractUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=true&format=json`;
  const extractRes = await fetch(extractUrl, { headers: { 'User-Agent': USER_AGENT } });
  const extractData = await extractRes.json();
  const pages = extractData.query.pages;
  const page = pages[Object.keys(pages)[0]];
  const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;

  if (!page.extract) throw new Error('Article sans contenu');

  let text = cleanText(page.extract, lang);
  text = trimToWordCount(text, 250, 350);

  if (text.split(/\s+/).length < 200) throw new Error('Article trop court');
  return { text, url };
}

function cleanText(text, lang = 'fr') {
  let cleaned = text
    .replace(/={2,}[^=]+=+/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\[note \d+\]/gi, '')
    .replace(/\[réf\.\s*nécessaire\]/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Remove foreign-script annotations only for Latin-script languages
  if (['fr', 'en', 'es', 'it', 'de'].includes(lang)) {
    cleaned = cleaned
      .replace(/\([^)]*[Ͱ-ϿЀ-ӿ؀-ۿ][^)]*\)/g, '')
      .replace(/\((?:en|de|it|es|pt|nl|pl|ar|zh|ja|ko|ru|la|gr|el)\s[^)]+\)/gi, '');
  }

  return cleaned;
}

function trimToWordCount(text, min, max) {
  const words = text.split(/\s+/);
  if (words.length <= max) return text;
  const slice = words.slice(0, max).join(' ');
  const lastDot = slice.lastIndexOf('.');
  return lastDot > min * 4 ? slice.slice(0, lastDot + 1) : slice;
}
