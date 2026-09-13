import { describe, it, expect, vi, afterEach } from 'vitest';
import { playThirtySecondWarning, playLevelComplete } from './chimes';

/**
 * jsdom has no Web Audio, so what is testable here is the guarantee that
 * matters: a device that cannot play a sound must not take the clock down with
 * it. These are called from inside the one-second tick, so anything that throws
 * stops the timer advancing — which is the whole tournament.
 *
 * That the sounds are actually audible was verified in real Chromium with an
 * OfflineAudioContext: the warning renders at peak 0.249 over ~1.18s and the
 * level-complete chord at peak 0.485 over ~1.39s, matching their gains and
 * timings.
 */

afterEach(() => {
  delete (window as any).AudioContext;
  delete (window as any).webkitAudioContext;
});

describe('chimes', () => {
  it('do not throw when the browser has no Web Audio at all', () => {
    expect(() => playThirtySecondWarning()).not.toThrow();
    expect(() => playLevelComplete()).not.toThrow();
  });

  it('do not throw when constructing an AudioContext is refused', () => {
    // What an autoplay policy looks like from here.
    (window as any).AudioContext = vi.fn(() => { throw new Error('not allowed'); });
    expect(() => playThirtySecondWarning()).not.toThrow();
    expect(() => playLevelComplete()).not.toThrow();
  });

  it('schedules one oscillator per note', () => {
    const oscillators: any[] = [];
    const make = () => {
      const osc = { connect: vi.fn(), frequency: { value: 0 }, type: '', start: vi.fn(), stop: vi.fn() };
      oscillators.push(osc);
      return osc;
    };
    const gain = () => ({
      connect: vi.fn(),
      gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    });
    (window as any).AudioContext = vi.fn(() => ({
      currentTime: 0, destination: {}, createOscillator: make, createGain: gain,
    }));

    playLevelComplete();
    expect(oscillators).toHaveLength(3);              // C5, E5, G5
    expect(oscillators.map(o => o.frequency.value)).toEqual([523, 659, 784]);

    oscillators.length = 0;
    playThirtySecondWarning();
    expect(oscillators).toHaveLength(2);              // E5 twice
    expect(oscillators.map(o => o.frequency.value)).toEqual([659, 659]);
  });

  it('uses the webkit-prefixed constructor when that is all there is', () => {
    const ctor = vi.fn(() => { throw new Error('reached'); });
    (window as any).webkitAudioContext = ctor;
    expect(() => playLevelComplete()).not.toThrow();
    expect(ctor).toHaveBeenCalled();
  });
});
