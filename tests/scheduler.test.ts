import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { buildSession, formatInterval, newStoredCard, rate, shouldRequeue } from '../src/scheduler';
import { calcStreak } from '../src/streak';
import { DEFAULT_SETTINGS, type StoredCard, type Word } from '../src/types';

const mkWord = (id: number): Word => ({
  id,
  word: `w${id}`,
  phonetic: 'x',
  meaning: 'n. 测试',
  pos: 'n',
  collins: 0,
  oxford: false,
  tags: [],
  freq_rank: id,
  forms: '',
  level: 1,
});
const words = Array.from({ length: 30 }, (_, i) => mkWord(i + 1));
const now = new Date('2026-10-18T10:00:00');

describe('buildSession', () => {
  it('没有进度时,按词频顺序给 5 个新词', () => {
    const ids = buildSession({ words, cards: new Map(), now, newToday: 0, reviewsToday: 0, settings: DEFAULT_SETTINGS });
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('到期的复习卡排在新词前面', () => {
    const cards = new Map<number, StoredCard>();
    const c = rate(newStoredCard(1, now), Rating.Good, now);
    cards.set(1, { ...c, due: '2026-10-18T09:00:00.000Z' });
    const ids = buildSession({ words, cards, now: new Date('2026-10-18T12:00:00Z'), newToday: 1, reviewsToday: 1, settings: DEFAULT_SETTINGS });
    expect(ids[0]).toBe(1);
    expect(ids).toHaveLength(5);
    expect(ids.slice(1)).toEqual([2, 3, 4, 5]);
  });

  it('今天新词额度用完后不再给新词,除非选择"再多学一组"', () => {
    const input = { words, cards: new Map<number, StoredCard>(), now, newToday: 10, reviewsToday: 10, settings: DEFAULT_SETTINGS };
    expect(buildSession(input)).toEqual([]);
    expect(buildSession({ ...input, bonus: true })).toHaveLength(5);
  });

  it('新词额度只剩 3 个时,这一组只补 3 个新词', () => {
    const ids = buildSession({ words, cards: new Map(), now, newToday: 7, reviewsToday: 7, settings: DEFAULT_SETTINGS });
    expect(ids).toEqual([1, 2, 3]);
  });
});

describe('rate', () => {
  it('新词答"认识"后进入学习状态,并在几分钟内再次出现', () => {
    const after = rate(newStoredCard(1, now), Rating.Good, now);
    expect(after.state).toBe(State.Learning);
    expect(new Date(after.due).getTime() - now.getTime()).toBeLessThanOrEqual(10 * 60 * 1000);
    expect(shouldRequeue(after, now)).toBe(true);
  });

  it('答"不认识"后马上进入同组重学', () => {
    const after = rate(newStoredCard(1, now), Rating.Again, now);
    expect(shouldRequeue(after, now)).toBe(true);
  });

  it('评分结果的日期是可序列化的字符串', () => {
    const after = rate(newStoredCard(1, now), Rating.Easy, now);
    expect(typeof after.due).toBe('string');
    expect(() => JSON.stringify(after)).not.toThrow();
  });
});

describe('formatInterval', () => {
  it('把时间间隔转成中文', () => {
    expect(formatInterval(20 * 1000)).toBe('马上');
    expect(formatInterval(60 * 1000)).toBe('1 分钟');
    expect(formatInterval(10 * 60 * 1000)).toBe('10 分钟');
    expect(formatInterval(3 * 3600 * 1000)).toBe('3 小时');
    expect(formatInterval(3 * 86400 * 1000)).toBe('3 天');
  });
});

describe('calcStreak', () => {
  it('今天学了就算今天', () => {
    expect(calcStreak(new Set(['2026-10-16', '2026-10-17', '2026-10-18']), '2026-10-18')).toBe(3);
  });
  it('今天还没学,从昨天往前算', () => {
    expect(calcStreak(new Set(['2026-10-16', '2026-10-17']), '2026-10-18')).toBe(2);
  });
  it('中间断了就重新数', () => {
    expect(calcStreak(new Set(['2026-10-14', '2026-10-17', '2026-10-18']), '2026-10-18')).toBe(2);
  });
  it('跨月也能连起来', () => {
    expect(calcStreak(new Set(['2026-09-30', '2026-10-01']), '2026-10-01')).toBe(2);
  });
  it('一天都没学过是 0', () => {
    expect(calcStreak(new Set(), '2026-10-18')).toBe(0);
  });
});
