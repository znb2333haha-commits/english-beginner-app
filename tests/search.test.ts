import { describe, expect, it } from 'vitest';
import { meaningItems, search } from '../src/search';
import type { Word } from '../src/types';

const mk = (id: number, word: string, meaning: string): Word => ({
  id, word, phonetic: '', meaning, pos: 'n', collins: 1, oxford: true, tags: [], freq_rank: id, forms: '', level: 1,
});
const words = [
  mk(1, 'water', 'n. 水, 水域, 水面'),
  mk(2, 'hot', 'a. 热的, 辣的'),
  mk(3, 'waterfall', 'n. 瀑布'),
  mk(4, 'tea', 'n. 茶, 茶叶'),
];
const lines = [
  { id: 'a-1', en: 'I would like some water, please.', zh: '请给我一些水。' },
  { id: 'a-2', en: 'Do you have tea?', zh: '你们有茶吗?' },
  { id: 'a-3', en: 'It is very hot.', zh: '天气很热。' },
];

describe('meaningItems', () => {
  it('去掉词性和括号补充', () => expect(meaningItems('vt. 以...打赌, 为被捕者出(保释金)')).toContain('为被捕者出'));
});

describe('search', () => {
  it('中文:搜到句子和单词,完全相同的释义排前面', () => {
    const r = search('水', words, lines);
    expect(r.phrases.map((p) => p.id)).toEqual(['a-1']);
    expect(r.words[0].word.word).toBe('water');
  });
  it('英文:单词前缀匹配,句子包含匹配', () => {
    const r = search('wat', words, lines);
    expect(r.words.map((w) => w.word.word)).toEqual(['water', 'waterfall']);
    expect(r.phrases.map((p) => p.id)).toEqual(['a-1']);
  });
  it('空查询没有结果', () => expect(search('  ', words, lines)).toEqual({ phrases: [], words: [] }));
  it('没有结果时返回空', () => expect(search('火星', words, lines).words).toEqual([]));
  it('每类结果有数量上限', () => {
    const many = Array.from({ length: 30 }, (_, i) => mk(100 + i, 'w' + i, 'n. 水果' + i));
    expect(search('水果', many, []).words).toHaveLength(8);
  });
});
