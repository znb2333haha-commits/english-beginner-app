/** 轻量的本机小记录(今天的路径进度、摸底是否做过),丢了也不影响学习进度 */
export function loadMeta<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem('shiyu:' + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveMeta(key: string, value: unknown): void {
  try {
    localStorage.setItem('shiyu:' + key, JSON.stringify(value));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}
