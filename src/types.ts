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

export interface BackupFile {
  app: 'english-beginner-app';
  version: 1;
  exportedAt: string;
  settings: Settings;
  cards: StoredCard[];
  stats: DayStats[];
  logs: ReviewLogRow[];
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  sessionSize: 5,
  reviewLimit: 100,
};
