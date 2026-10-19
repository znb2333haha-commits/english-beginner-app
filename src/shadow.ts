/** 跟读:录下自己的声音,再和标准发音对比播放。录音只留在内存里,不上传、不保存。 */
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let url: string | null = null;
let playing: HTMLAudioElement | null = null;

export type ShadowState = 'idle' | 'rec' | 'ready' | 'error';
let state: ShadowState = 'idle';
let errorMsg = '';

export function shadowState(): ShadowState {
  return state;
}
export function shadowError(): string {
  return errorMsg;
}
export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}
export function resetShadow(): void {
  stopPlayback();
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  releaseStream();
  if (url) URL.revokeObjectURL(url);
  url = null;
  state = 'idle';
  errorMsg = '';
}
function releaseStream(): void {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export async function startRecording(): Promise<boolean> {
  resetShadow();
  if (!canRecord()) {
    state = 'error';
    errorMsg = '这台设备暂时不能录音';
    return false;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      releaseStream();
      if (chunks.length > 0) {
        url = URL.createObjectURL(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
        state = 'ready';
      } else {
        state = 'idle';
      }
      window.dispatchEvent(new Event('shadow-change'));
    };
    recorder.start();
    state = 'rec';
    return true;
  } catch {
    state = 'error';
    errorMsg = '没有录音权限,请在系统设置里允许"拾语"使用麦克风';
    return false;
  }
}

export function stopRecording(): void {
  if (recorder && recorder.state === 'recording') recorder.stop();
}

function stopPlayback(): void {
  if (playing) {
    playing.pause();
    playing = null;
  }
}

function playUrl(src: string): Promise<void> {
  return new Promise((resolve) => {
    stopPlayback();
    const a = new Audio(src);
    playing = a;
    const done = () => resolve();
    a.addEventListener('ended', done, { once: true });
    a.addEventListener('error', done, { once: true });
    a.play().catch(done);
  });
}

/** 先播标准发音,再播自己的录音 */
export async function comparePlay(nativeSrc: string): Promise<void> {
  if (state !== 'ready' || !url) return;
  const mine = url;
  await playUrl(nativeSrc);
  await new Promise((r) => setTimeout(r, 250));
  await playUrl(mine);
}

export async function playMine(): Promise<void> {
  if (state === 'ready' && url) await playUrl(url);
}
