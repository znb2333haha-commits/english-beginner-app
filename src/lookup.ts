import type { Word } from './types';

/** 英文句子里的单词(含 don't 这类缩写) */
export function tokensOf(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

/** 词形 → 词库里的原词(过去式、复数、-ing 等),同一词形取排名靠前的 */
export function buildFormIndex(words: Word[]): Map<string, Word> {
  const index = new Map<string, Word>();
  const put = (form: string, w: Word) => {
    const k = form.toLowerCase();
    const old = index.get(k);
    if (!old || w.id < old.id) index.set(k, w);
  };
  for (const w of words) {
    put(w.word, w);
    for (const part of (w.forms || '').split('/')) {
      const i = part.indexOf(':');
      if (i > 0) put(part.slice(i + 1), w);
    }
  }
  return index;
}

export interface Line {
  id: string;
  en: string;
  zh: string;
}

/** 单词 id → 含有这个词的会话句子(按出现顺序) */
export function buildPhraseIndex(lines: Line[], forms: Map<string, Word>): Map<number, Line[]> {
  const out = new Map<number, Line[]>();
  for (const line of lines) {
    const seen = new Set<number>();
    for (const t of tokensOf(line.en)) {
      const w = forms.get(t);
      if (w && !seen.has(w.id)) {
        seen.add(w.id);
        const arr = out.get(w.id) ?? [];
        arr.push(line);
        out.set(w.id, arr);
      }
    }
  }
  return out;
}
