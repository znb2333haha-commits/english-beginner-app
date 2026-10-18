import legacyOrder from '../data/legacy-word-order.json';
import words from '../data/words.json';

const currentIds = new Map(words.map((w) => [w.word, w.id]));

/** v1 的 wordId 是旧词频顺序；查单词再找新 ID，未知值拒绝迁移以免丢进度。 */
export function migrateWordRow<T extends { wordId: number }>(row: T): T {
  const word = legacyOrder[row.wordId - 1];
  const wordId = currentIds.get(word);
  if (!wordId) throw new Error('旧进度包含无法识别的单词，请保留原备份');
  return { ...row, wordId };
}
