import { describe, it, expect } from 'vitest';
import { ordinal } from './ordinal';

describe('ordinal', () => {
  it('handles the first three', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
  });

  // The bug: three call sites rendered "21th" for a 21-player game.
  it('gets the twenties right', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(24)).toBe('24th');
  });

  // The opposite error, which a naive n % 10 check produces.
  it('keeps the teens on "th"', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(14)).toBe('14th');
  });

  it('repeats the teen exception every hundred', () => {
    expect(ordinal(111)).toBe('111th');
    expect(ordinal(112)).toBe('112th');
    expect(ordinal(113)).toBe('113th');
    expect(ordinal(101)).toBe('101st');
    expect(ordinal(102)).toBe('102nd');
  });

  it('does not throw on nonsense', () => {
    expect(ordinal(0)).toBe('0th');
    expect(ordinal(NaN)).toBe('NaN');
  });
});
