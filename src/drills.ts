/** 句型替换、连读弱读、角色扮演的纯逻辑(界面在 main.ts) */

export interface FrameFill { id: string; fill: string; zh: string; en: string; zhFull: string }
export interface Frame { id: string; title: string; en: string; zh: string; fills: FrameFill[] }
export interface LinkItem { id: string; en: string; fast: string; sounds: string; zh: string; note: string }

export interface ChoiceQ {
  /** 题面:中文或要听的音频 id */
  prompt: string;
  audioId?: string;
  options: string[];
  answer: string;
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** 句型小测:给中文整句,从 3 个只换了填空的英文句子里选;题目数 = min(n, 填空数) */
export function frameQuiz(frame: Frame, n = 5, rnd: () => number = Math.random): ChoiceQ[] {
  const picks = shuffle(frame.fills, rnd).slice(0, n);
  return picks.map((f) => {
    const others = shuffle(frame.fills.filter((x) => x.id !== f.id), rnd).slice(0, 2).map((x) => x.en);
    return { prompt: f.zhFull, options: shuffle([f.en, ...others], rnd), answer: f.en };
  });
}

/** 连读小测:听一段自然语速的音频,选出完整写法 */
export function linkQuiz(items: LinkItem[], n = 5, rnd: () => number = Math.random): ChoiceQ[] {
  const picks = shuffle(items, rnd).slice(0, n);
  return picks.map((it) => {
    const others = shuffle(items.filter((x) => x.id !== it.id), rnd).slice(0, 2).map((x) => x.en);
    return { prompt: '听,这句话是?', audioId: it.id, options: shuffle([it.en, ...others], rnd), answer: it.en };
  });
}

export interface RoleLine { id: string; who: string; en: string; zh: string }
export interface RoleState { lines: RoleLine[]; me: string; idx: number; revealed: boolean }

export function startRole(lines: RoleLine[], me: string): RoleState {
  return { lines, me, idx: 0, revealed: false };
}

/** 当前该做什么:对方的话自动播放;我的话要自己说;全部结束 */
export function roleTurn(s: RoleState): 'other' | 'me' | 'end' {
  if (s.idx >= s.lines.length) return 'end';
  return s.lines[s.idx].who === s.me ? 'me' : 'other';
}

export function roleAdvance(s: RoleState): RoleState {
  return { ...s, idx: s.idx + 1, revealed: false };
}

/** 我要说的句子数,用来显示进度 */
export function myLineCount(s: RoleState): number {
  return s.lines.filter((l) => l.who === s.me).length;
}
