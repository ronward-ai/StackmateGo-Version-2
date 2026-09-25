import { describe, it, expect } from 'vitest';
import { commitNumber, isDraftNumber } from './numberField';

const TABLES = { min: 1, max: 20, fallback: 3 };

describe('commitNumber', () => {
  it('keeps a value that is already in range', () => {
    expect(commitNumber('12', TABLES)).toBe(12);
    expect(commitNumber('1', TABLES)).toBe(1);
    expect(commitNumber('20', TABLES)).toBe(20);
  });

  it('CLAMPS out of range rather than rejecting', () => {
    // Rejecting is what made the field feel broken: type 30 and nothing at all
    // happened, so the control looked dead.
    expect(commitNumber('30', TABLES)).toBe(20);
    expect(commitNumber('0', TABLES)).toBe(1);
  });

  it('leaves an emptied field as it was', () => {
    expect(commitNumber('', TABLES)).toBe(3);
  });

  it('leaves an unparseable field as it was', () => {
    expect(commitNumber('abc', TABLES)).toBe(3);
    expect(commitNumber('   ', TABLES)).toBe(3);
  });

  it('honours a different fallback, because it is the CURRENT value', () => {
    expect(commitNumber('', { ...TABLES, fallback: 7 })).toBe(7);
  });

  it('supports a zero floor, which is how the blinds editor spells "none"', () => {
    expect(commitNumber('', { min: 0, max: 100000, fallback: 0 })).toBe(0);
    expect(commitNumber('0', { min: 0, max: 100000, fallback: 0 })).toBe(0);
  });
});

describe('isDraftNumber', () => {
  it('allows the states typing passes through', () => {
    // An empty field is the one that mattered: without it there is no way to
    // clear a value and start again.
    expect(isDraftNumber('')).toBe(true);
    expect(isDraftNumber('1')).toBe(true);
    expect(isDraftNumber('123')).toBe(true);
  });

  it('refuses what is not a number being typed', () => {
    expect(isDraftNumber('1a')).toBe(false);
    expect(isDraftNumber('-1')).toBe(false);
    expect(isDraftNumber('1.5')).toBe(false);
  });
});
