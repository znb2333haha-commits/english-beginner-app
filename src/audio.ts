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

/** 例句暂时没有内置音频,用系统语音朗读(没有系统语音时无声,不影响学习) */
export function playSentence(text: string): void {
  speakFallback(text);
}

/** 日常会话句子:优先播放 audio/phrases/<id>.mp3,没有文件时用系统语音 */
export function playPhrase(id: string, text: string, slow = false): void {
  if (current) current.pause();
  const a = new Audio(`audio/phrases/${id}.mp3`);
  a.playbackRate = slow ? 0.7 : 1;
  current = a;
  const fallback = () => speakFallback(text, slow ? 0.55 : 0.85);
  a.addEventListener('error', fallback, { once: true });
  a.play().catch(fallback);
}
