import { describe, expect, it } from 'vitest';
import { levelProgress, shortMeaning } from '../src/format';

describe('shortMeaning', () => {
  it('长释义被截短并标记 truncated', () => {
    const r = shortMeaning('vi. 去, 走, 达到, 运转, 查阅, 消失, 结束\nvt. 以...打赌, 对付\nn. 去, 尝试\na. 一\n');
    expect(r.truncated).toBe(true);
    expect(r.text.split('\n')).toHaveLength(3);
    expect(r.text.split('\n')[0]).toBe('vi. 去, 走, 达到, 运转, 查阅');
  });
  it('短释义原样保留', () => {
    const r = shortMeaning('n. 书, 书籍');
    expect(r).toEqual({ text: 'n. 书, 书籍', truncated: false });
  });
});

describe('levelProgress', () => {
  it('只统计第一级范围内的词', () => {
    expect(levelProgress([1, 2, 500, 501, 900])).toEqual({ learned: 3, size: 500, done: false });
  });
  it('全部学完时 done 为 true', () => {
    const ids = Array.from({ length: 500 }, (_, i) => i + 1);
    expect(levelProgress(ids).done).toBe(true);
  });
});
