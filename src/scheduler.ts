import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type CardInput,
  type Grade,
} from 'ts-fsrs';
import type { Settings, StoredCard, Word } from './types';

/** FSRS 引擎:目标记忆率 0.9,开启短期学习步骤(新词当天会再见两次) */
export const engine = fsrs(
  generatorParameters({ request_retention: 0.9, enable_fuzz: true, enable_short_term: true }),
);

export const GRADES: { grade: Grade; label: string }[] = [
  { grade: Rating.Again, label: '不认识' },
  { grade: Rating.Hard, label: '模糊' },
  { grade: Rating.Good, label: '认识' },
  { grade: Rating.Easy, label: '太简单' },
];

export function toStored(wordId: number, c: Card): StoredCard {
  return {
    wordId,
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : undefined,
  };
}

export function newStoredCard(wordId: number, now: Date): StoredCard {
  return toStored(wordId, createEmptyCard(now));
}

/** 评分后返回新的卡片状态 */
export function rate(card: StoredCard, grade: Grade, now: Date): StoredCard {
  const result = engine.repeat(card as CardInput, now)[grade];
  return toStored(card.wordId, result.card);
}

/** 四个评分按钮下面显示的"下次出现时间" */
export function previewLabels(card: StoredCard, now: Date): Record<number, string> {
  const preview = engine.repeat(card as CardInput, now);
  const out: Record<number, string> = {};
  for (const { grade } of GRADES) {
    out[grade] = formatInterval(preview[grade].card.due.getTime() - now.getTime());
  }
  return out;
}

export function formatInterval(ms: number): string {
  if (ms < 30000) return '马上';
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} 分钟`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天`;
  const months = Math.round(days / 30);
  return `${months} 个月`;
}

/** 评分后如果 10 分钟内又要出现,就放回本组队尾,同一组里再见一次 */
export function shouldRequeue(card: StoredCard, now: Date): boolean {
  return new Date(card.due).getTime() - now.getTime() <= 10 * 60 * 1000;
}

export interface SessionInput {
  words: Word[];
  cards: Map<number, StoredCard>;
  now: Date;
  /** 今天已经学过的新词数 */
  newToday: number;
  /** 今天已经复习的次数 */
  reviewsToday: number;
  settings: Settings;
  /** 为 true 时忽略每天新词上限("再多学一组") */
  bonus?: boolean;
}

export function dueCards(cards: Map<number, StoredCard>, now: Date): StoredCard[] {
  return [...cards.values()]
    .filter((c) => c.state !== State.New && new Date(c.due) <= now)
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** 构建一组要学的单词 id:先放到期的复习卡,剩余名额补新词 */
export function buildSession(input: SessionInput): number[] {
  const { words, cards, now, newToday, reviewsToday, settings, bonus } = input;
  const size = settings.sessionSize;
  const reviewRoom = Math.max(0, settings.reviewLimit - reviewsToday);
  const ids = dueCards(cards, now)
    .slice(0, Math.min(size, reviewRoom))
    .map((c) => c.wordId);

  const room = size - ids.length;
  const newAllowed = bonus ? room : Math.max(0, settings.newPerDay - newToday);
  const nNew = Math.min(room, newAllowed);
  const fresh: number[] = [];
  for (const w of words) {
    if (fresh.length >= nNew) break;
    if (!cards.has(w.id)) fresh.push(w.id);
  }
  return [...ids, ...fresh];
}
