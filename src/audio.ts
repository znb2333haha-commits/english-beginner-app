/**
 * 发音:优先播放内置音频文件 audio/<单词>.mp3,
 * 没有文件(或播放失败)时退回系统语音合成。
 * 第一级已内置 Jenny 美式音频；其他级别暂无文件，仍使用兜底。
 */
let current: HTMLAudioElement | null = null;

function speakFallback(word: string, rate = 0.85): void {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = rate;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function playWord(word: string, slow = false): void {
  if (current) current.pause();
  const a = new Audio(`audio/${word}.mp3`);
  a.playbackRate = slow ? 0.6 : 1;
  current = a;
  a.addEventListener('error', () => speakFallback(word, slow ? 0.5 : 0.85), { once: true });
  a.play().catch(() => speakFallback(word, slow ? 0.5 : 0.85));
}

/** 单词的例句:优先播放 audio/examples/<单词>.mp3,没有文件时用系统语音 */
export function playSentence(word: string, text: string, slow = false): void {
  if (current) current.pause();
  const a = new Audio(`audio/examples/${word}.mp3`);
  a.playbackRate = slow ? 0.7 : 1;
  current = a;
  const fallback = () => speakFallback(text, slow ? 0.55 : 0.85);
  a.addEventListener('error', fallback, { once: true });
  a.play().catch(fallback);
}

export type Voice = 'jenny' | 'guy' | 'aria';
const VOICE_DIR: Record<Voice, string> = { jenny: 'phrases', guy: 'phrases-guy', aria: 'phrases-aria' };
let multiVoice = true;

export function setMultiVoice(on: boolean): void {
  multiVoice = on;
}
/** 单句点读:多声音打开时随机一个声音(没有这个声音的文件就退回 Jenny) */
export function pickVoice(rnd: () => number = Math.random): Voice {
  if (!multiVoice) return 'jenny';
  const all: Voice[] = ['jenny', 'guy', 'aria'];
  return all[Math.floor(rnd() * all.length)];
}
/** 对话里 A 用 Jenny、B 用男声,听起来像两个人 */
export function voiceForRole(who: string): Voice {
  return multiVoice && who === 'B' ? 'guy' : 'jenny';
}
export function phraseUrls(id: string, voice: Voice = 'jenny'): string[] {
  const first = `audio/${VOICE_DIR[voice]}/${id}.mp3`;
  const base = `audio/${VOICE_DIR.jenny}/${id}.mp3`;
  return first === base ? [base] : [first, base];
}

/** 依次尝试几个音频地址,都没有就用系统语音;播完(或失败)后调用 onEnd */
function playChain(urls: string[], text: string, slow: boolean, onEnd?: () => void): void {
  if (current) current.pause();
  let i = 0;
  const speak = () => {
    if (!onEnd) return speakFallback(text, slow ? 0.55 : 0.85);
    if (!('speechSynthesis' in window)) return void setTimeout(onEnd, 1500);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85;
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };
  const next = () => {
    if (i >= urls.length) return speak();
    const a = new Audio(urls[i++]);
    a.playbackRate = slow ? 0.7 : 1;
    current = a;
    if (onEnd) a.addEventListener('ended', onEnd, { once: true });
    a.addEventListener('error', next, { once: true });
    a.play().catch(next);
  };
  next();
}

/** 日常会话句子:优先播放 audio/phrases 系列目录里的 <id>.mp3,没有文件时用系统语音 */
export function playPhrase(id: string, text: string, slow = false, voice: Voice = pickVoice()): void {
  playChain(phraseUrls(id, voice), text, slow);
}

/** 播完一句再返回(用于小对话连播) */
export function playPhraseAsync(id: string, text: string, voice: Voice = 'jenny'): Promise<void> {
  return new Promise((resolve) => playChain(phraseUrls(id, voice), text, false, resolve));
}

let sequenceToken = 0;

/** 依次播放一段对话。再次调用或 stopSequence 会让上一段停下 */
export async function playSequence(lines: { id: string; en: string; who?: string }[], onLine?: (i: number) => void): Promise<void> {
  const my = ++sequenceToken;
  for (let i = 0; i < lines.length; i++) {
    if (my !== sequenceToken) return;
    onLine?.(i);
    await playPhraseAsync(lines[i].id, lines[i].en, voiceForRole(lines[i].who ?? 'A'));
    if (my !== sequenceToken) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  onLine?.(-1);
}

export function stopSequence(): void {
  sequenceToken++;
  if (current) current.pause();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** 儿童模式:先找 audio/kids/<file>.mp3,再找单词音频 audio/<word>.mp3,最后系统语音 */
export function playKid(file: string, word: string): void {
  if (current) current.pause();
  const a = new Audio(`audio/kids/${file}.mp3`);
  current = a;
  let moved = false;
  const second = () => {
    if (moved) return;
    moved = true;
    const b = new Audio(`audio/${word}.mp3`);
    current = b;
    b.addEventListener('error', () => speakFallback(word, 0.8), { once: true });
    b.play().catch(() => speakFallback(word, 0.8));
  };
  a.addEventListener('error', second, { once: true });
  a.play().catch(second);
}

/** 播放任意内置音频文件,没有文件时用系统语音读 text */
export function playFile(url: string, text: string, slow = false): void {
  if (current) current.pause();
  const a = new Audio(url);
  a.playbackRate = slow ? 0.7 : 1;
  current = a;
  const fallback = () => speakFallback(text, slow ? 0.55 : 0.85);
  a.addEventListener('error', fallback, { once: true });
  a.play().catch(fallback);
}
