import { describe, it, expect, vi } from 'vitest';
import { withDeadline } from './deadline';

describe('withDeadline (Oct Low)', () => {
  it('rejects a write that never settles', async () => {
    vi.useFakeTimers();
    const p = withDeadline(new Promise(() => {}), 8000, 'release');
    const check = expect(p).rejects.toThrow('release');
    await vi.advanceTimersByTimeAsync(8000);
    await check;
    vi.useRealTimers();
  });

  it('passes a settled value straight through', async () => {
    await expect(withDeadline(Promise.resolve(7), 8000)).resolves.toBe(7);
  });

  it('passes a rejection straight through', async () => {
    await expect(withDeadline(Promise.reject(new Error('denied')), 8000)).rejects.toThrow('denied');
  });
});
