import { describe, expect, it } from 'vitest';
import phonetics from '../data/phonetics.json';
import words from '../data/words.json';

const tokenize = (p: string) => p.match(/tʃ|dʒ|aɪ|aʊ|eɪ|oʊ|ɔɪ|[^ˈˌ]/g) ?? [];
const level1 = new Map(words.filter((w) => w.level === 1).map((w) => [w.word, w]));

describe('phonetics.json', () => {
  it('覆盖 words.json 里出现过的所有音素', () => {
    const used = new Set(words.flatMap((w) => tokenize(w.phonetic)));
    const have = new Set(phonetics.map((p) => p.symbol));
    expect([...used].filter((s) => !have.has(s))).toEqual([]);
  });

  it('示例词在第一级(有内置音频),并且真的含有这个音素', () => {
    for (const p of phonetics) {
      expect(p.examples.length).toBeGreaterThan(0);
      for (const ex of p.examples) {
        const w = level1.get(ex);
        expect(w, `${p.symbol}: ${ex} 不在第一级`).toBeDefined();
        expect(tokenize(w!.phonetic), `${p.symbol}: ${ex}`).toContain(p.symbol);
      }
    }
  });

  it('对比词在第一级,并且不含这个音素', () => {
    for (const p of phonetics) {
      const w = level1.get(p.contrast);
      expect(w, `${p.symbol}: ${p.contrast}`).toBeDefined();
      expect(tokenize(w!.phonetic), `${p.symbol}: ${p.contrast}`).not.toContain(p.symbol);
    }
  });

  it('符号不重复,提示不为空', () => {
    expect(new Set(phonetics.map((p) => p.symbol)).size).toBe(phonetics.length);
    for (const p of phonetics) expect(p.hint.length).toBeGreaterThan(5);
  });
});
