/** "今天的 10 分钟":把复习、新词、会话、听力排成固定顺序,不用自己选 */
export type PathStep = 'words' | 'phrases' | 'listen';

export const STEP_LABEL: Record<PathStep, string> = {
  words: '单词',
  phrases: '句子',
  listen: '听力',
};

export function planSteps(o: { wordsAvailable: boolean }): PathStep[] {
  return o.wordsAvailable ? ['words', 'phrases', 'listen'] : ['phrases', 'listen'];
}

/** 今天已经做完的步骤不再重复 */
export function remaining(steps: PathStep[], done: PathStep[]): PathStep[] {
  return steps.filter((s) => !done.includes(s));
}
