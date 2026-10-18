import { createEmptyCard, Rating, State, type Grade } from 'ts-fsrs';
import { rate, toStored } from './scheduler';
import type { PhraseCard } from './types';

/** 会话句子的复习卡:沿用单词的 FSRS,只是用字符串 pid 做主键(wordId 固定为 0) */
export function newPhraseCard(pid: string, now: Date): PhraseCard {
  return { ...toStored(0, createEmptyCard(now)), pid };
}

export function ratePhrase(card: PhraseCard, grade: Grade, now: Date): PhraseCard {
  return { ...rate(card, grade, now), pid: card.pid };
}

/** 点"我会了"时建卡:相当于答了一次"认识",之后按遗忘曲线安排复习 */
export function learnPhrase(pid: string, now: Date): PhraseCard {
  return ratePhrase(newPhraseCard(pid, now), Rating.Good, now);
}

export function duePhrases(cards: Map<string, PhraseCard>, now: Date): PhraseCard[] {
  return [...cards.values()]
    .filter((c) => c.state !== State.New && new Date(c.due) <= now)
    .sort((a, b) => a.due.localeCompare(b.due));
}
