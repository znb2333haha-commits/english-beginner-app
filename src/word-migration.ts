import legacyOrder from '../data/legacy-word-order.json';
import legacyV1Order from '../data/legacy-word-order-v1.json';
import words from '../data/words.json';

const currentIds = new Map(words.map((w) => [w.word, w.id]));

/** v1 是原词频顺序，v2 是 T1 顺序；均按单词直达 v3，不能覆盖历史映射。 */
export function migrateWordRow<T extends { wordId: number }>(row: T, version: 1 | 2): T {
  const order = version === 1 ? legacyV1Order : legacyOrder;
  const word = order[row.wordId - 1];
  const wordId = currentIds.get(word);
  if (!wordId) throw new Error('旧进度包含无法识别的单词，请保留原备份');
  return { ...row, wordId };
}
