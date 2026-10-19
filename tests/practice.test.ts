import { describe, expect, it } from 'vitest';
import { buildQuiz, gloss, makeCloze, pickKind, spellOk } from '../src/practice';
import type { Word } from '../src/types';

const mk = (id: number, word: string, meaning: string, pos = 'n'): Word => ({
  id, word, phonetic: '', meaning, pos, collins: 1, oxford: true, tags: [], freq_rank: id, forms: '', level: 1,
});
const pool = [
  mk(1, 'go', 'vi. 去, 走, 达到', 'v'),
  mk(2, 'book', 'n. 书, 本子'),
  mk(3, 'cat', 'n. 猫'),
  mk(4, 'dog', 'n. 狗'),
  mk(5, 'tea', 'n. 茶, 茶叶'),
  mk(6, 'eat', 'vt. 吃', 'v'),
];
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('gloss', () => {
  it('去掉词性,取前两个意思', () => expect(gloss(pool[0])).toBe('去、走'));
  it('只取第一行', () => expect(gloss(mk(9, 'x', 'n. 一(个)\npron. 一, 任何人'))).toBe('一(个)'));
});

describe('pickKind', () => {
  it('新词或关闭练习时用卡片', () => {
    expect(pickKind({ isNew: true, hasCloze: true, enabled: true, rnd: 0.1 })).toBe('card');
    expect(pickKind({ isNew: false, hasCloze: true, enabled: false, rnd: 0.1 })).toBe('card');
  });
  it('学过的词按概率分配,没有例句挖空时退回听音', () => {
    expect(pickKind({ isNew: false, hasCloze: true, enabled: true, rnd: 0.1 })).toBe('listen');
    expect(pickKind({ isNew: false, hasCloze: true, enabled: true, rnd: 0.5 })).toBe('spell');
    expect(pickKind({ isNew: false, hasCloze: true, enabled: true, rnd: 0.9 })).toBe('cloze');
    expect(pickKind({ isNew: false, hasCloze: false, enabled: true, rnd: 0.9 })).toBe('listen');
  });
});

describe('makeCloze', () => {
  it('挖掉整词匹配', () => expect(makeCloze('I go to school.', 'go')).toBe('I ____ to school.'));
  it('不挖词的一部分', () => expect(makeCloze('I forgot it.', 'go')).toBeNull());
  it('不分大小写', () => expect(makeCloze('Go home.', 'go')).toBe('____ home.'));
});

describe('buildQuiz', () => {
  it('listen:4 个选项且只有 1 个正确,中文不重复', () => {
    const q = buildQuiz('listen', pool[0], pool, undefined, seq(0.3, 0.6, 0.1))!;
    expect(q.options).toHaveLength(4);
    expect(q.options.filter((o) => o.ok)).toHaveLength(1);
    expect(new Set(q.options.map((o) => o.label)).size).toBe(4);
  });
  it('候选词不够时返回 null', () => {
    expect(buildQuiz('listen', pool[0], pool.slice(0, 2), undefined)).toBeNull();
  });
  it('cloze:选项是词,正确项是目标词', () => {
    const q = buildQuiz('cloze', pool[0], pool, { en: 'I go home.', zh: '我回家。' }, seq(0.2, 0.7, 0.4))!;
    expect(q.prompt).toBe('I ____ home.');
    expect(q.options.find((o) => o.ok)?.label).toBe('go');
  });
  it('cloze:例句里没有这个词则不出题', () => {
    expect(buildQuiz('cloze', pool[0], pool, { en: 'He went.', zh: '他去了。' })).toBeNull();
  });
  it('spell:给出中文和答案', () => {
    const q = buildQuiz('spell', pool[0], pool, undefined)!;
    expect(q.zh).toBe('去、走');
    expect(q.answer).toBe('go');
  });
});

describe('spellOk', () => {
  it('忽略大小写和空格', () => expect(spellOk('  Go ', 'go')).toBe(true));
  it('拼错算错', () => expect(spellOk('gu', 'go')).toBe(false));
});
