import { describe, expect, it } from 'vitest';
import { bandOf, decide, pickSample } from '../src/placement';
import type { Word } from '../src/types';

const words: Word[] = Array.from({ length: 600 }, (_, i) => ({
  id: i + 1, word: 'w' + i, phonetic: '', meaning: '', pos: 'n', collins: 1, oxford: true, tags: [], freq_rank: i + 1, forms: '', level: 1,
}));

describe('placement', () => {
  it('每段抽 4 个,共 20 个,且都在前 500 内', () => {
    const s = pickSample(words, () => 0.3);
    expect(s).toHaveLength(20);
    expect(s.every((w) => w.id <= 500)).toBe(true);
    for (let b = 0; b < 5; b++) expect(s.filter((w) => bandOf(w.id) === b)).toHaveLength(4);
  });
  it('一段认识 ≥3 个 → 整段标为已会', () => {
    const r = new Map<number, boolean>([[1, true], [2, true], [3, true], [4, false]]);
    const p = decide(r, words);
    expect(p.skipBands).toEqual([0]);
    expect(p.markIds).toHaveLength(100);
  });
  it('认识不够多只标认识的那几个', () => {
    const r = new Map<number, boolean>([[101, true], [102, true], [103, false], [104, false]]);
    const p = decide(r, words);
    expect(p.skipBands).toEqual([]);
    expect(p.markIds).toEqual([101, 102]);
  });
  it('什么都不认识不标任何词', () => {
    expect(decide(new Map([[1, false], [2, false]]), words).markIds).toEqual([]);
  });
});
