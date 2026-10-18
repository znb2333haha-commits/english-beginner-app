import { describe, expect, it } from 'vitest';
import data from '../data/phrases.json';

const scenes = data.scenes;
const phrases = scenes.flatMap((s) => s.phrases);
const dialogs = scenes.flatMap((s) => (s as { dialog?: { id: string; who: string; en: string; zh: string }[] }).dialog ?? []);

describe('phrases.json', () => {
  it('每个场景有标题、介绍和 8 句', () => {
    expect(scenes.length).toBeGreaterThanOrEqual(30);
    for (const s of scenes) {
      expect(s.title).not.toBe('');
      expect(s.intro).not.toBe('');
      expect(s.phrases).toHaveLength(8);
    }
  });
  it('id 唯一、文件名安全,英文不超过 10 个词,中文不为空', () => {
    expect(new Set(phrases.map((p) => p.id)).size).toBe(phrases.length);
    for (const p of phrases) {
      expect(p.id).toMatch(/^[a-z]+-\d+$/);
      expect(p.en.trim().split(/\s+/).length).toBeLessThanOrEqual(10);
      expect(p.zh.trim()).not.toBe('');
    }
  });
  it('中文不重复(选择题的错误选项不会和正确答案相同)', () => {
    expect(new Set(phrases.map((p) => p.zh)).size).toBe(phrases.length);
  });

  it('每个场景有 4 到 6 句小对话,id 唯一,A 和 B 交替', () => {
    for (const s of scenes) {
      const d = (s as { dialog?: { id: string; who: string; en: string; zh: string }[] }).dialog ?? [];
      expect(d.length, s.id).toBeGreaterThanOrEqual(4);
      expect(d.length, s.id).toBeLessThanOrEqual(6);
      d.forEach((l, i) => {
        expect(l.who).toBe(i % 2 === 0 ? 'A' : 'B');
        expect(l.id).toMatch(/^[a-z]+-d\d+$/);
        expect(l.en.trim().split(/\s+/).length).toBeLessThanOrEqual(10);
        expect(l.zh.trim()).not.toBe('');
      });
    }
    expect(new Set(dialogs.map((l) => l.id)).size).toBe(dialogs.length);
  });
});
