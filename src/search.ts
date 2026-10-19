/** 中文(或英文)一搜就有:同时搜会话句子和单词释义 */
import { gloss } from './practice';
import type { Word } from './types';

export interface SearchLine {
  id: string;
  en: string;
  zh: string;
}
export interface SearchResult {
  phrases: SearchLine[];
  words: { word: Word; gloss: string }[];
}

const HAS_CJK = /[一-鿿]/;

/** 释义里的每个小意思(去掉词性、括号里的补充) */
export function meaningItems(meaning: string): string[] {
  const out: string[] = [];
  for (const line of meaning.split('\n')) {
    const body = line.trim().replace(/^[a-z]+\.\s*/, '');
    for (const it of body.split(/[,，;；、]\s*/)) {
      const t = it.replace(/[(（][^)）]*[)）]/g, '').trim();
      if (t) out.push(t);
    }
  }
  return out;
}

export function search(query: string, words: Word[], lines: SearchLine[], limit = 8): SearchResult {
  const q = query.trim().toLowerCase();
  if (q === '') return { phrases: [], words: [] };
  const cjk = HAS_CJK.test(q);

  const phrases = lines
    .map((l) => {
      const hay = cjk ? l.zh : l.en.toLowerCase();
      const i = hay.indexOf(q);
      return i < 0 ? null : { l, score: i * 1000 + hay.length };
    })
    .filter((x): x is { l: SearchLine; score: number } => x !== null)
    .sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const phraseHits: SearchLine[] = [];
  for (const { l } of phrases) {
    if (seen.has(l.en)) continue;
    seen.add(l.en);
    phraseHits.push(l);
    if (phraseHits.length === limit) break;
  }

  const scored: { w: Word; score: number }[] = [];
  for (const w of words) {
    let score = -1;
    if (cjk) {
      for (const it of meaningItems(w.meaning)) {
        const s = it === q ? 0 : it.startsWith(q) ? 1 : it.includes(q) ? 2 : -1;
        if (s >= 0 && (score < 0 || s < score)) score = s;
      }
    } else {
      const s = w.word === q ? 0 : w.word.startsWith(q) ? 1 : -1;
      score = s;
    }
    if (score >= 0) scored.push({ w, score });
  }
  scored.sort((a, b) => a.score - b.score || a.w.freq_rank - b.w.freq_rank);
  return {
    phrases: phraseHits,
    words: scored.slice(0, limit).map(({ w }) => ({ word: w, gloss: gloss(w) })),
  };
}
