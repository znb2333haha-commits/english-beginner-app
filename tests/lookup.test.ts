import { describe, expect, it } from 'vitest';
import { buildFormIndex, buildPhraseIndex, tokensOf } from '../src/lookup';
import { duePhrases, learnPhrase, ratePhrase } from '../src/phrase-cards';
import { Rating } from 'ts-fsrs';
import type { PhraseCard, Word } from '../src/types';

const w = (id: number, word: string, forms = ''): Word =>
  ({ id, word, phonetic: '', meaning: '', pos: '', collins: 0, oxford: false, tags: [], freq_rank: id, forms, level: 1 }) as Word;

describe('lookup', () => {
  it('分词保留缩写', () => {
    expect(tokensOf("I don't know. Go!")).toEqual(['i', "don't", 'know', 'go']);
  });
  it('词形能找回原词', () => {
    const idx = buildFormIndex([w(1, 'go', 'p:went/d:gone/i:going/3:goes/s:goes')]);
    expect(idx.get('went')?.word).toBe('go');
    expect(idx.get('going')?.word).toBe('go');
  });
  it('单词到句子的反查', () => {
    const forms = buildFormIndex([w(1, 'go', 'p:went'), w(2, 'home')]);
    const idx = buildPhraseIndex(
      [
        { id: 'a-1', en: 'I went home.', zh: '我回家了。' },
        { id: 'a-2', en: 'Go now.', zh: '现在去。' },
      ],
      forms,
    );
    expect(idx.get(1)?.map((l) => l.id)).toEqual(['a-1', 'a-2']);
    expect(idx.get(2)?.map((l) => l.id)).toEqual(['a-1']);
  });
});

describe('phrase cards', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  it('我会了之后建卡,之后才会到期', () => {
    const c = learnPhrase('greet-1', now);
    expect(c.pid).toBe('greet-1');
    expect(c.wordId).toBe(0);
    const map = new Map<string, PhraseCard>([[c.pid, c]]);
    expect(duePhrases(map, now)).toHaveLength(0);
    const later = new Date(now.getTime() + 3 * 86400000);
    expect(duePhrases(map, later)).toHaveLength(1);
  });
  it('评分后保留 pid', () => {
    const c = learnPhrase('greet-2', now);
    expect(ratePhrase(c, Rating.Easy, new Date(now.getTime() + 3600_000)).pid).toBe('greet-2');
  });
});
