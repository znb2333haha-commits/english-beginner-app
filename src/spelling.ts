/**
 * 拼写样本:把单词按"拼读块"切开(th、sh、ee、ou 这类固定搭配算一块),
 * 让小白看到字母是怎么组合成声音的,而不是一个个字母死记。
 */
export interface Chunk {
  text: string;
  /** multi:多字母拼读块;plain:单个字母;final-e:词尾不发音的 e */
  kind: 'multi' | 'plain' | 'final-e';
}

const MULTI = [
  'tch', 'dge', 'igh', 'sch', 'augh', 'ough', 'eigh',
  'th', 'sh', 'ch', 'ph', 'wh', 'ck', 'ng', 'qu', 'kn', 'wr', 'gh',
  'ee', 'oo', 'ea', 'ai', 'ay', 'oa', 'ou', 'ow', 'oi', 'oy',
  'ar', 'er', 'ir', 'or', 'ur', 'au', 'aw', 'ie', 'ue', 'ey', 'ew',
].sort((a, b) => b.length - a.length);

const VOWELS = 'aeiou';

export function spellingChunks(word: string): Chunk[] {
  const w = word.toLowerCase();
  const out: Chunk[] = [];
  const hasFinalE =
    w.length >= 4 && w.endsWith('e') && !VOWELS.includes(w[w.length - 2]) && [...w.slice(0, -2)].some((c) => VOWELS.includes(c));
  const end = hasFinalE ? w.length - 1 : w.length;
  let i = 0;
  while (i < end) {
    const hit = MULTI.find((m) => w.startsWith(m, i) && i + m.length <= end);
    if (hit) {
      out.push({ text: hit, kind: 'multi' });
      i += hit.length;
    } else {
      out.push({ text: w[i], kind: 'plain' });
      i += 1;
    }
  }
  if (hasFinalE) out.push({ text: 'e', kind: 'final-e' });
  return out;
}

/** 从音标里数音节(元音连成一段算一拍),例如 təˈɡɛðɚ → 3 */
export function countBeats(phonetic: string): number {
  const runs = phonetic.match(/[aeiouɑæɛɪʊʌəɚɝɔɒɜ]+/gi);
  return Math.max(1, runs?.length ?? 1);
}

export type SpellHint = 'copy' | 'first' | 'none';

/** 拼写练习的支架:学得少就照着抄,学得多逐步撤掉提示 */
export function hintLevel(reps: number): SpellHint {
  return reps < 3 ? 'copy' : reps < 6 ? 'first' : 'none';
}

export function skeleton(word: string): string {
  return word[0] + ' _'.repeat(Math.max(0, word.length - 1));
}

export function chunksHtml(word: string): string {
  return spellingChunks(word)
    .map((c) => `<span class="g g-${c.kind}">${c.text}</span>`)
    .join('');
}
