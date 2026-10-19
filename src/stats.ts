import type { ReviewLogRow } from './types';

/** 词频加权的粗略覆盖率:认识的词占"词库内全部词出现机会"的比例(权重 1/排名)。只是估计,不是考试分数。 */
export function coverage(knownRanks: number[], allRanks: number[]): number {
  const w = (r: number) => 1 / Math.max(r, 1);
  const total = allRanks.reduce((a, r) => a + w(r), 0);
  if (total === 0) return 0;
  const got = knownRanks.reduce((a, r) => a + w(r), 0);
  return Math.min(100, (got / total) * 100);
}

export interface WeekSummary {
  days: number;
  reviews: number;
  accuracy: number | null;
  minutes: number;
  newWords: number;
}

const DAY = 86400000;
/** 最近 7 天(含今天)的学习概况;日志里 rating>=3 算答对 */
export function weekSummary(logs: ReviewLogRow[], newByDate: { date: string; newCount: number }[], now: Date, localDate: (d: Date) => string): WeekSummary {
  const dates = new Set<string>();
  for (let i = 0; i < 7; i++) dates.add(localDate(new Date(now.getTime() - i * DAY)));
  const recent = logs.filter((l) => dates.has(localDate(new Date(l.ts))));
  const studied = new Set(recent.map((l) => localDate(new Date(l.ts))));
  const good = recent.filter((l) => l.rating >= 3).length;
  return {
    days: studied.size,
    reviews: recent.length,
    accuracy: recent.length ? Math.round((good / recent.length) * 100) : null,
    minutes: Math.round(recent.reduce((a, l) => a + l.ms, 0) / 60000),
    newWords: newByDate.filter((d) => dates.has(d.date)).reduce((a, d) => a + d.newCount, 0),
  };
}
