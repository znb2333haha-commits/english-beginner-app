import { describe, expect, it } from 'vitest';
import { phraseUrls, pickVoice, setMultiVoice, voiceForRole } from '../src/audio';

describe('多声音', () => {
  it('Jenny 只有一个地址,其他声音带 Jenny 兜底', () => {
    expect(phraseUrls('a-1', 'jenny')).toEqual(['audio/phrases/a-1.mp3']);
    expect(phraseUrls('a-1', 'guy')).toEqual(['audio/phrases-guy/a-1.mp3', 'audio/phrases/a-1.mp3']);
  });
  it('关闭多声音后始终是 Jenny', () => {
    setMultiVoice(false);
    expect(pickVoice(() => 0.99)).toBe('jenny');
    expect(voiceForRole('B')).toBe('jenny');
    setMultiVoice(true);
    expect(voiceForRole('B')).toBe('guy');
    expect(voiceForRole('A')).toBe('jenny');
  });
});
