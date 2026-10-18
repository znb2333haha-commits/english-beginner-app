import { describe, expect, it } from 'vitest';
import data from '../data/phrases.json';

const scenes = data.scenes;
const phrases = scenes.flatMap((s) => s.phrases);

describe('phrases.json', () => {
  it('每个场景有标题、介绍和 8 句', () => {
    expect(scenes.length).toBeGreaterThanOrEqual(12);
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
});
