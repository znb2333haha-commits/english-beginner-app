import { describe, expect, it } from 'vitest';
import frames from '../data/frames.json';
import linking from '../data/linking.json';
import phrases from '../data/phrases.json';
import { frameQuiz, linkQuiz, myLineCount, roleAdvance, roleTurn, startRole } from '../src/drills';
import type { Frame, LinkItem } from '../src/drills';

const F = (frames as unknown as { frames: Frame[] }).frames;
const L = (linking as unknown as { items: LinkItem[] }).items;
const seq = () => {
  let i = 0;
  return () => ((i++ * 0.37) % 1);
};

describe('数据', () => {
  it('句型 20 个以上,每个 8 个填空,句子拼对', () => {
    expect(F.length).toBeGreaterThanOrEqual(20);
    for (const f of F) {
      expect(f.fills.length).toBe(8);
      for (const x of f.fills) expect(x.en).toBe(f.en.replace('{}', x.fill));
    }
  });
  it('连读 20 条,字段齐全', () => {
    expect(L.length).toBeGreaterThanOrEqual(20);
    for (const it of L) {
      expect(it.id).toMatch(/^lk\d+$/);
      expect(it.en && it.fast && it.zh && it.note).toBeTruthy();
    }
  });
});

describe('小测', () => {
  it('句型题:3 个选项,含正确答案且互不相同', () => {
    for (const q of frameQuiz(F[0], 5, seq())) {
      expect(q.options.length).toBe(3);
      expect(new Set(q.options).size).toBe(3);
      expect(q.options).toContain(q.answer);
    }
  });
  it('连读题带音频 id', () => {
    const q = linkQuiz(L, 5, seq());
    expect(q.length).toBe(5);
    expect(q.every((x) => x.audioId && x.options.includes(x.answer))).toBe(true);
  });
});

describe('角色扮演', () => {
  const sc = (phrases as unknown as { scenes: { dialog?: { id: string; who: string; en: string; zh: string }[] }[] }).scenes[0];
  const lines = sc.dialog ?? [];
  it('轮流:对方→自己→结束', () => {
    let s = startRole(lines, 'B');
    expect(roleTurn(s)).toBe('other');
    s = roleAdvance(s);
    expect(roleTurn(s)).toBe('me');
    for (let i = 0; i < lines.length; i++) s = roleAdvance(s);
    expect(roleTurn(s)).toBe('end');
  });
  it('数我的句子数', () => {
    expect(myLineCount(startRole(lines, 'A')) + myLineCount(startRole(lines, 'B'))).toBe(lines.length);
  });
});
