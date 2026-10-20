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
  /** true = 句子没有完全匹配,给的是"意思接近"的说法 */
  fuzzy?: boolean;
}

const HAS_CJK = /[一-鿿]/;

/** 口语说法 → 书面说法,让"你想吃点啥"也能对上"您想吃点什么" */
const COLLOQUIAL: [RegExp, string][] = [
  [/您/g, '你'],
  [/啥/g, '什么'],
  [/咋/g, '怎么'],
  [/哪儿|哪里/g, '哪'],
  [/[\s,，.。!！?？、~～…]/g, ''],
];

/** 中文归一化:统一口语写法、去掉标点和空格 */
export function normalizeZh(text: string): string {
  let t = text.toLowerCase();
  for (const [re, to] of COLLOQUIAL) t = t.replace(re, to);
  return t;
}

function bigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < text.length; i++) out.add(text.slice(i, i + 2));
  return out;
}

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

  const nq = cjk ? normalizeZh(q) : q;
  const phrases = lines
    .map((l) => {
      const hay = cjk ? normalizeZh(l.zh) : l.en.toLowerCase();
      const i = hay.indexOf(nq);
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

  // 完全搜不到时,按"相同的相邻两字"找意思接近的句子(只对 3 个字以上的中文)
  let fuzzy = false;
  if (cjk && phraseHits.length === 0 && nq.length >= 3) {
    const qb = bigrams(nq);
    const close = lines
      .map((l) => {
        const lb = bigrams(normalizeZh(l.zh));
        let shared = 0;
        for (const b of qb) if (lb.has(b)) shared++;
        return { l, shared, ratio: shared / qb.size };
      })
      .filter((x) => x.shared >= 2 && x.ratio >= 0.5)
      .sort((a, b) => b.ratio - a.ratio || b.shared - a.shared);
    for (const { l } of close.slice(0, 6)) {
      if (seen.has(l.en)) continue;
      seen.add(l.en);
      phraseHits.push(l);
    }
    phraseHits.splice(3);
    fuzzy = phraseHits.length > 0;
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
  const result: SearchResult = {
    phrases: phraseHits,
    words: scored.slice(0, limit).map(({ w }) => ({ word: w, gloss: gloss(w) })),
  };
  if (fuzzy) result.fuzzy = true;
  return result;
}
