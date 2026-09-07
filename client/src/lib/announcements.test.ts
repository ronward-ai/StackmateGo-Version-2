import { describe, it, expect } from 'vitest';
import { blindLevelNumber, levelAnnouncement } from './announcements';
import type { BlindLevel } from '@/types';

const level = (small: number, big: number, extra: Partial<BlindLevel> = {}): BlindLevel => ({
  small,
  big,
  duration: 20 * 60,
  ...extra,
});

const brk = (minutes: number): BlindLevel => ({
  small: 0,
  big: 0,
  duration: minutes * 60,
  isBreak: true,
});

describe('blindLevelNumber', () => {
  it('numbers the first level 1', () => {
    expect(blindLevelNumber([level(25, 50)], 0)).toBe(1);
  });

  it('does not let breaks take a number', () => {
    const levels = [level(25, 50), brk(10), level(50, 100), brk(10), level(100, 200)];
    expect(blindLevelNumber(levels, 2)).toBe(2);
    expect(blindLevelNumber(levels, 4)).toBe(3);
  });
});

describe('levelAnnouncement', () => {
  it('says the blinds', () => {
    expect(levelAnnouncement([level(25, 50)], 0)).toBe(
      'Level 1. Small blind 25, big blind 50'
    );
  });

  it('adds the ante only when there is one', () => {
    expect(levelAnnouncement([level(25, 50, { ante: 5 })], 0)).toContain(', ante 5');
    expect(levelAnnouncement([level(25, 50, { ante: 0 })], 0)).not.toContain('ante');
    expect(levelAnnouncement([level(25, 50)], 0)).not.toContain('ante');
  });

  it('gives a break its duration in minutes', () => {
    expect(levelAnnouncement([brk(15)], 0)).toBe('Break time. Duration: 15 minutes');
  });

  it('counts past breaks, so level 3 is still level 3', () => {
    const levels = [level(25, 50), brk(10), level(50, 100), brk(10), level(100, 200)];
    expect(levelAnnouncement(levels, 4)).toBe('Level 3. Small blind 100, big blind 200');
  });

  it('takes the skip prefix, and drops the capital on a break', () => {
    const levels = [level(25, 50), brk(10)];
    expect(levelAnnouncement(levels, 0, 'Skipped back to')).toBe(
      'Skipped back to Level 1. Small blind 25, big blind 50'
    );
    expect(levelAnnouncement(levels, 1, 'Skipped to')).toBe(
      'Skipped to break time. Duration: 10 minutes'
    );
  });

  it('says nothing for a level that is not there', () => {
    expect(levelAnnouncement([], 0)).toBe('');
  });
});
