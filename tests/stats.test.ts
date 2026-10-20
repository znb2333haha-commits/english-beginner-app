import { describe, expect, it } from 'vitest';
import { coverage, weekSummary } from '../src/stats';

const ld = (d: Date) => d.toISOString().slice(0, 10);

describe('coverage', () => {
  it('全不会 0,全会 100', () => {
    expect(coverage([], [1, 2, 3])).toBe(0);
    expect(coverage([1, 2, 3], [1, 2, 3])).toBeCloseTo(100);
  });
  it('高频词权重更大', () => {
    expect(coverage([1], [1, 2, 3, 4])).toBeGreaterThan(coverage([4], [1, 2, 3, 4]));
  });
  it('空词库不除零', () => {
    expect(coverage([], [])).toBe(0);
  });
});

describe('weekSummary', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  it('只统计最近 7 天', () => {
    const logs = [
      { wordId: 1, ts: '2026-10-20T01:00:00Z', rating: 3, ms: 60000 },
      { wordId: 2, ts: '2026-10-19T01:00:00Z', rating: 1, ms: 60000 },
      { wordId: 3, ts: '2026-10-01T01:00:00Z', rating: 3, ms: 60000 },
    ];
    const s = weekSummary(logs, [{ date: '2026-10-20', newCount: 5 }, { date: '2026-09-01', newCount: 9 }], now, ld);
    expect(s.days).toBe(2);
    expect(s.reviews).toBe(2);
    expect(s.accuracy).toBe(50);
    expect(s.minutes).toBe(2);
    expect(s.newWords).toBe(5);
  });
  it('没有记录时正确率为 null', () => {
    expect(weekSummary([], [], now, ld).accuracy).toBeNull();
  });
});
