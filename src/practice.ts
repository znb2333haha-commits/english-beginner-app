/**
 * 主动回忆练习(纯逻辑,方便测试):
 * - listen:先只听发音,选出中文意思
 * - spell:看中文意思,拼出英文单词
 * - cloze:句子挖空,选出该填的词
 * 新词仍然用普通卡片;学过的词才会进入这些练习。
 */
import type { Word } from './types';

export type PracticeKind = 'card' | 'listen' | 'spell' | 'cloze';

export interface QuizOption {
  label: string;
  ok: boolean;
}

export interface PracticeQuiz {
  kind: Exclude<PracticeKind, 'card'>;
  options: QuizOption[];
  /** cloze:带 ____ 的英文句子;spell:空 */
  prompt: string;
  /** cloze 的中文翻译,或 spell 的中文意思 */
  zh: string;
  answer: string;
}

/** 选项里用的简短中文:去掉词性,取前两个意思 */
export function gloss(w: Pick<Word, 'meaning'>): string {
  const line = (w.meaning.split('\n').find((l) => l.trim() !== '') ?? '').trim();
  const body = line.replace(/^[a-z]+\.\s*/, '');
  const items = body.split(/[,，;；]\s*/).filter(Boolean).slice(0, 2);
  const s = items.join('、');
  return s.length > 14 ? s.slice(0, 14) : s;
}

export function pickKind(opts: { isNew: boolean; hasCloze: boolean; enabled: boolean; rnd: number }): PracticeKind {
  if (!opts.enabled || opts.isNew) return 'card';
  const r = opts.rnd;
  if (r < 0.4) return 'listen';
  if (r < 0.7) return 'spell';
  return opts.hasCloze ? 'cloze' : 'listen';
}

/** 例句里恰好出现该词(不分大小写)才能挖空 */
export function makeCloze(en: string, word: string): string | null {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (!re.test(en)) return null;
  return en.replace(re, '____');
}

function shuffled<T>(a: T[], rnd: () => number): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** 从同级别词里挑 n 个干扰项,中文简义不能和正确答案相同 */
export function distractors(target: Word, pool: Word[], n: number, rnd: () => number, by: 'gloss' | 'word'): Word[] {
  const g = gloss(target);
  const out: Word[] = [];
  const seen = new Set<string>([by === 'gloss' ? g : target.word]);
  const cands = shuffled(pool, rnd).filter((c) => c.id !== target.id);
  // 完形填空:优先挑词性不同的词,避免出现"两个词都说得通"的歧义;不够再补同词性的
  const order = by === 'word' ? [...cands.filter((c) => c.pos !== target.pos), ...cands.filter((c) => c.pos === target.pos)] : cands;
  for (const c of order) {
    const key = by === 'gloss' ? gloss(c) : c.word;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

export function buildQuiz(
  kind: Exclude<PracticeKind, 'card'>,
  w: Word,
  pool: Word[],
  example: { en: string; zh: string } | undefined,
  rnd: () => number = Math.random,
): PracticeQuiz | null {
  if (kind === 'spell') {
    return { kind, options: [], prompt: '', zh: gloss(w), answer: w.word };
  }
  if (kind === 'listen') {
    const ds = distractors(w, pool, 3, rnd, 'gloss');
    if (ds.length < 3) return null;
    const options = shuffled([{ label: gloss(w), ok: true }, ...ds.map((d) => ({ label: gloss(d), ok: false }))], rnd);
    return { kind, options, prompt: '', zh: '', answer: w.word };
  }
  const blanked = example ? makeCloze(example.en, w.word) : null;
  if (!example || !blanked) return null;
  const ds = distractors(w, pool, 3, rnd, 'word');
  if (ds.length < 3) return null;
  const options = shuffled([{ label: w.word, ok: true }, ...ds.map((d) => ({ label: d.word, ok: false }))], rnd);
  return { kind, options, prompt: blanked, zh: example.zh, answer: w.word };
}

/** 拼写判断:忽略大小写和首尾空格 */
export function spellOk(input: string, answer: string): boolean {
  return input.trim().toLowerCase() === answer.toLowerCase();
}
