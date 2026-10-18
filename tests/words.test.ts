import { describe, expect, it } from 'vitest';
import words from '../data/words.json';
import legacy from '../data/legacy-word-order.json';
import legacyV1 from '../data/legacy-word-order-v1.json';
import { migrateWordRow } from '../src/word-migration';

describe('T1 词库', () => {
  it('3000 词不重不漏，编号与六级对应，音标释义非空', () => {
    expect(words).toHaveLength(3000);
    expect(new Set(words.map(w => w.word)).size).toBe(3000);
    expect(words.map(w => w.word).sort()).toEqual([...legacy].sort());
    words.forEach((w, i) => {
      expect(w.id).toBe(i + 1);
      expect(w.level).toBe(Math.floor(i / 500) + 1);
      expect(w.phonetic.trim()).not.toBe('');
      expect(w.meaning.trim()).not.toBe('');
      expect(w.phonetic).not.toMatch(/[ɒɜːәє:'0-9]|əʊ/);
    });
  });
  it('前 50 词至少 80% 是实词，冠词和助动词靠后', () => {
    const content = words.slice(0, 50).filter(w => ['n', 'v', 'j', 'r', 'adj', 'adv'].includes(w.pos));
    expect(content.length).toBeGreaterThanOrEqual(40);
    for (const word of ['the', 'be', 'have', 'do', 'and', 'can']) {
      expect(words.find(w => w.word === word)!.id).toBeGreaterThan(400);
    }
  });
  it.each([1, 2] as const)('v%s 旧进度逐词映射，保留其他字段并拒绝未知 ID', (version) => {
    const order = version === 1 ? legacyV1 : legacy;
    order.forEach((word, i) => {
      const row = { wordId: i + 1, reps: 7, due: '2030-01-01' };
      const migrated = migrateWordRow(row, version);
      expect(words[migrated.wordId - 1].word).toBe(word);
      expect(migrated.reps).toBe(7);
      expect(migrated.due).toBe(row.due);
      expect(row.wordId).toBe(i + 1);
    });
    for (const wordId of [0, -1, 0.5, 3001, NaN]) {
      expect(() => migrateWordRow({ wordId }, version)).toThrow();
    }
  });
  it('生活常用词跨级提升且音标和释义保留', () => {
    for (const word of ['apple', 'cat', 'dog', 'red', 'eat']) {
      expect(words.find(w => w.word === word)!.level).toBe(1);
    }
    expect(words.find(w => w.word === 'apple')!.phonetic).toBe('ˈæpəl');
    expect(words.find(w => w.word === 'apple')!.meaning).toContain('苹果');
  });
});
