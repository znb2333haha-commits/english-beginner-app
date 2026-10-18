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

let sequenceToken = 0;

/** 播完一句再返回(用于小对话连播);没有音频文件时用系统语音,系统语音也不可用就等一小会儿 */
export function playPhraseAsync(id: string, text: string): Promise<void> {
  return new Promise((resolve) => {
    if (current) current.pause();
    const a = new Audio(`audio/phrases/${id}.mp3`);
    current = a;
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const speak = () => {
      if (!('speechSynthesis' in window)) return void setTimeout(done, 1500);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.85;
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    };
    a.addEventListener('ended', done, { once: true });
    a.addEventListener('error', speak, { once: true });
    a.play().catch(speak);
  });
}

/** 依次播放一段对话。再次调用或 stopSequence 会让上一段停下 */
export async function playSequence(lines: { id: string; en: string }[], onLine?: (i: number) => void): Promise<void> {
  const my = ++sequenceToken;
  for (let i = 0; i < lines.length; i++) {
    if (my !== sequenceToken) return;
    onLine?.(i);
    await playPhraseAsync(lines[i].id, lines[i].en);
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
