export interface Word {
  id: number;
  word: string;
  phonetic: string;
  meaning: string;
  pos: string;
  collins: number;
  oxford: boolean;
  tags: string[];
  freq_rank: number;
  forms: string;
  level: number;
}

/** 存进 IndexedDB 的卡片,日期用 ISO 字符串,可直接交给 ts-fsrs 的 repeat */
export interface StoredCard {
  wordId: number;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface Settings {
  /** 每天新词上限 */
  newPerDay: number;
  /** 每一组的卡片数 */
  sessionSize: number;
  /** 每天复习上限 */
  reviewLimit: number;
  /** 混合练习:学过的词用听音选义、拼写、完形填空来复习(false 则只看卡片) */
  practice: boolean;
}

export interface DayStats {
  date: string;
  newCount: number;
  reviewCount: number;
}

export interface ReviewLogRow {
  id?: number;
  wordId: number;
  ts: string;
  rating: number;
  ms: number;
}

/** 音标入门:每个音素一条,做过一次听音选词就有记录 */
export interface PhonemeProgress {
  symbol: string;
  /** 听音选词答对至少 2 题即为已掌握 */
  done: boolean;
  best: number;
  ts: string;
}

/** 日常会话:每句一条,点了"我会了"才有记录;scene 通关记录用 id = scene:<场景id> */
export interface PhraseProgress {
  id: string;
  learned: boolean;
  ts: string;
}

/** 会话句子的复习卡:字段同单词卡,wordId 固定为 0,用 pid 区分 */
export interface PhraseCard extends StoredCard {
  pid: string;
}

export interface DialogLine extends Phrase {
  who: 'A' | 'B';
}

export interface Phrase {
  id: string;
  en: string;
  zh: string;
}

export interface Scene {
  id: string;
  title: string;
  intro: string;
  phrases: Phrase[];
  dialog: DialogLine[];
}

export interface Phoneme {
  symbol: string;
  type: 'vowel' | 'consonant';
  examples: string[];
  contrast: string;
  hint: string;
}

export interface BackupFile {
  app: 'english-beginner-app';
  version: 1 | 2 | 3 | 4 | 5 | 6;
  exportedAt: string;
  settings: Settings;
  cards: StoredCard[];
  stats: DayStats[];
  logs: ReviewLogRow[];
  /** 音标入门进度,v4 起才有 */
  phonetics?: PhonemeProgress[];
  /** 日常会话进度,v5 起才有 */
  phrases?: PhraseProgress[];
  /** 会话句子的复习卡,v6 起才有 */
  phraseCards?: PhraseCard[];
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  sessionSize: 5,
  reviewLimit: 100,
  practice: true,
};
