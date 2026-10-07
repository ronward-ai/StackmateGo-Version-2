import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { speak } from './speak';

/** One place builds an utterance, at one rate, volume and language (Oct coverage). */
describe('speak', () => {
  const spoken: any[] = [];
  beforeEach(() => {
    spoken.length = 0;
    (globalThis as any).SpeechSynthesisUtterance = class { text: string; rate = 0; volume = 0; lang = ''; pitch = 0; constructor(t: string) { this.text = t; } };
    (window as any).speechSynthesis = { speaking: true, pending: false, cancel: vi.fn(), speak: (u: any) => spoken.push(u) };
    (globalThis as any).speechSynthesis = (window as any).speechSynthesis;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('speaks every line with the same settings', () => {
    speak('Level 2');
    speak('Thirty seconds');
    expect(spoken.map(u => [u.rate, u.volume, u.lang])).toEqual([[0.8, 1, 'en-US'], [0.8, 1, 'en-US']]);
  });

  it('cancels what is in progress only when asked', () => {
    speak('a');
    expect((window as any).speechSynthesis.cancel).not.toHaveBeenCalled();
    speak('b', { cancel: true });
    expect((window as any).speechSynthesis.cancel).toHaveBeenCalledTimes(1);
  });

  it('waits when told to, and says nothing for an empty line', () => {
    vi.useFakeTimers();
    speak('later', { delayMs: 1200 });
    speak('');
    expect(spoken).toHaveLength(0);
    vi.advanceTimersByTime(1200);
    expect(spoken.map(u => u.text)).toEqual(['later']);
  });
});
