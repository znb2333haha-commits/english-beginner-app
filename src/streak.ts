function shiftDay(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/**
 * 连续打卡天数。今天还没学时,从昨天往前算,所以早上打开 App 不会显示"断了"。
 * studied 是"当天至少学过一张卡"的日期集合。
 */
export function calcStreak(studied: Set<string>, today: string): number {
  let day = studied.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (studied.has(day)) {
    n += 1;
    day = shiftDay(day, -1);
  }
  return n;
}
