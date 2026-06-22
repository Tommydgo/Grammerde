import fetch from 'node-fetch';
import { load } from 'cheerio';

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
  const res = await fetch(`https://${lang}.wikipedia.org/wiki/Special:Random`, {
    headers: { 'Accept-Language': `${lang};q=0.9`, 'User-Agent': 'Grammerde/1.0' },
    redirect: 'follow',
  });
  const html = await res.text();
  const $ = load(html);
  const url = res.url;

  const paragraphs = [];
  $('#mw-content-text .mw-parser-output > p').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 50) paragraphs.push(text);
  });

  let text = paragraphs.join('\n\n');
  text = cleanText(text, lang);
  text = trimToWordCount(text, 250, 350);

  if (text.split(/\s+/).length < 200) throw new Error('Article trop court');
  return { text, url };
}

function cleanText(text, lang = 'fr') {
  let cleaned = text
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
