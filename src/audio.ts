/**
 * 发音:优先播放内置音频文件 audio/<单词>.mp3,
 * 没有文件(或播放失败)时退回系统语音合成。
 * 国行 vivo 手机可能没有英语语音包,所以后续会批量生成内置音频。
 */
let current: HTMLAudioElement | null = null;

function speakFallback(word: string): void {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function playWord(word: string): void {
  if (current) current.pause();
  const a = new Audio(`audio/${word}.mp3`);
  current = a;
  a.addEventListener('error', () => speakFallback(word), { once: true });
  a.play().catch(() => speakFallback(word));
}
