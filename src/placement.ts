/**
 * 摸底测试:把前 500 个高频词分成 5 段(每段 100 个),每段抽 4 个让你自己说"认识/不认识"。
 * 某一段 4 个里认识至少 3 个,就把这一段整体先标成"已会"(用最简单的评分,几天后会在复习里再确认一次);
 * 其余段只标你明确认识的那几个。
 */
import type { Word } from './types';

export const BAND = 100;
export const PER_BAND = 4;
export const SKIP_AT = 3;

export function bandOf(id: number): number {
  return Math.floor((id - 1) / BAND);
}

function shuffled<T>(a: T[], rnd: () => number): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** 从前 500 词里按段抽样,由易到难排列(同一段的词挨在一起) */
export function pickSample(words: Word[], rnd: () => number = Math.random): Word[] {
  const pool = words.filter((w) => w.id >= 1 && w.id <= BAND * 5);
  const out: Word[] = [];
  for (let b = 0; b < 5; b++) {
    const inBand = pool.filter((w) => bandOf(w.id) === b);
    out.push(...shuffled(inBand, rnd).slice(0, PER_BAND));
  }
  return out;
}

export interface PlacementPlan {
  knownTested: number[];
  skipBands: number[];
  /** 最终要标为已会的词 id(含整段跳过的词) */
  markIds: number[];
}

export function decide(results: Map<number, boolean>, words: Word[]): PlacementPlan {
  const perBand = new Map<number, { known: number; total: number }>();
  const knownTested: number[] = [];
  for (const [id, known] of results) {
    const b = bandOf(id);
    const e = perBand.get(b) ?? { known: 0, total: 0 };
    e.total += 1;
    if (known) {
      e.known += 1;
      knownTested.push(id);
    }
    perBand.set(b, e);
  }
  const skipBands = [...perBand].filter(([, e]) => e.known >= SKIP_AT).map(([b]) => b).sort((a, b) => a - b);
  const mark = new Set<number>(knownTested);
  for (const w of words) if (w.id <= BAND * 5 && skipBands.includes(bandOf(w.id))) mark.add(w.id);
  return { knownTested, skipBands, markIds: [...mark].sort((a, b) => a - b) };
}
