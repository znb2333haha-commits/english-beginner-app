import { describe, expect, it } from 'vitest';
import { meaningItems, normalizeZh, search } from '../src/search';
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
  { id: 'a-4', en: 'Here you are. What would you like?', zh: '给您。您想吃点什么?' },
  { id: 'a-5', en: 'Let us have dinner together.', zh: '我们一起吃晚饭吧。' },
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
  it('口语说法也能搜到:你想吃点啥 ↔ 您想吃点什么', () => {
    const r = search('你想吃点啥', words, lines);
    expect(r.phrases.map((p) => p.id)).toEqual(['a-4']);
    expect(r.fuzzy).toBeUndefined();
  });
  it('没有完全一样时,给意思接近的句子并标记 fuzzy', () => {
    const r = search('你想吃点啥好呢', words, lines);
    expect(r.phrases.map((p) => p.id)).toEqual(['a-4']);
    expect(r.fuzzy).toBe(true);
  });
  it('太短的中文不做模糊匹配', () => {
    expect(search('火星', words, lines).phrases).toEqual([]);
    expect(search('吃啥', [], lines).fuzzy).toBeUndefined();
  });
  it('完全无关的长句不会硬凑', () => {
    expect(search('今天火星上有风暴', words, lines).phrases).toEqual([]);
  });
});

describe('normalizeZh', () => {
  it('统一口语并去标点', () => expect(normalizeZh('您想吃点啥?')).toBe('你想吃点什么'));
});
