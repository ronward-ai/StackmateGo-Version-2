import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDeviceId } from './deviceId';

describe('getDeviceId (Oct coverage)', () => {
  beforeEach(() => localStorage.clear());

  it('is stable for this browser, under the key seat claims depend on', () => {
    const id = getDeviceId();
    expect(id).toMatch(/^d_/);
    expect(getDeviceId()).toBe(id);
    expect(localStorage.getItem('playerDeviceId')).toBe(id);
  });

  // The control lock compares this on every render: a fresh id per call would
  // lose control on every render.
  it('stays stable when storage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const a = getDeviceId();
    expect(getDeviceId()).toBe(a);
    get.mockRestore();
  });
});
