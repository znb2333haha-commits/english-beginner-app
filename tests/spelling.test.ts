import { describe, expect, it } from 'vitest';
import { countBeats, hintLevel, skeleton, spellingChunks } from '../src/spelling';

const txt = (w: string) => spellingChunks(w).map((c) => c.text).join('|');

describe('spellingChunks', () => {
  it('把 th/sh/ee 这类搭配当作一块', () => {
    expect(txt('three')).toBe('th|r|ee');
    expect(txt('school')).toBe('sch|oo|l');
    expect(txt('fish')).toBe('f|i|sh');
  });
  it('词尾不发音的 e 单独标出', () => {
    const c = spellingChunks('make');
    expect(c.map((x) => x.text).join('')).toBe('make');
    expect(c[c.length - 1]).toEqual({ text: 'e', kind: 'final-e' });
  });
  it('短词 the/be 的 e 不当作词尾 e', () => {
    expect(spellingChunks('the').some((c) => c.kind === 'final-e')).toBe(false);
    expect(spellingChunks('be').some((c) => c.kind === 'final-e')).toBe(false);
  });
  it('拼回去总是原词', () => {
    for (const w of ['together', 'through', 'night', 'people', 'beautiful', 'knife', 'catch'])
      expect(spellingChunks(w).map((c) => c.text).join('')).toBe(w);
  });
});

describe('countBeats / hint / skeleton', () => {
  it('从音标数拍', () => {
    expect(countBeats('gɑ')).toBe(1);
    expect(countBeats('təˈɡɛðɚ')).toBe(3);
    expect(countBeats('aɪ')).toBe(1);
  });
  it('提示随熟练度撤掉', () => {
    expect(hintLevel(0)).toBe('copy');
    expect(hintLevel(4)).toBe('first');
    expect(hintLevel(8)).toBe('none');
  });
  it('骨架只给第一个字母', () => expect(skeleton('go')).toBe('g _'));
});
