/** 释义太长对小白不友好:默认每个词性只显示前几个意思、最多 3 行 */
export function shortMeaning(meaning: string, maxLines = 3, maxItems = 5): { text: string; truncated: boolean } {
  const lines = meaning.split('\n').filter((l) => l.trim() !== '');
  let truncated = lines.length > maxLines;
  const out = lines.slice(0, maxLines).map((line) => {
    const m = /^([a-z]+\.\s*)?(.*)$/.exec(line.trim());
    const prefix = m?.[1] ?? '';
    const items = (m?.[2] ?? line).split(/[,，;；]\s*/).filter(Boolean);
    if (items.length > maxItems) truncated = true;
    return prefix + items.slice(0, maxItems).join(', ');
  });
  return { text: out.join('\n'), truncated };
}

/** 第一级进度:ids 在 1..size 之内的已学词数 */
export function levelProgress(learnedIds: Iterable<number>, size = 500): { learned: number; size: number; done: boolean } {
  let learned = 0;
  for (const id of learnedIds) if (id >= 1 && id <= size) learned += 1;
  return { learned, size, done: learned >= size };
}
