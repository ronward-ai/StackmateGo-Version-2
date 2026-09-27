import { describe, it, expect } from 'vitest';
import { statusChipFor } from './statusChip';

describe('statusChipFor', () => {
  it('says nothing about a game that is neither live nor in trouble', () => {
    expect(statusChipFor({})).toBeNull();
    expect(statusChipFor({ isLive: false, syncBlocked: false })).toBeNull();
  });

  it('reports a published game', () => {
    expect(statusChipFor({ isLive: true })).toBe('broadcasting');
  });

  it('reports a browser that cannot reach the database', () => {
    expect(statusChipFor({ syncBlocked: true })).toBe('not-syncing');
  });

  it('reports a console another device is driving', () => {
    expect(statusChipFor({ readOnly: true })).toBe('read-only');
  });

  // Same argument as the blocked browser: a console whose writes are going
  // nowhere must not fly a green flag.
  it('lets read-only WIN over a live game', () => {
    expect(statusChipFor({ isLive: true, readOnly: true })).toBe('read-only');
  });

  // But WHY the writes are going nowhere matters, and a blocked browser is the
  // one the director can fix from this device. Being read-only is not a fault.
  it('lets a blocked browser WIN over read-only', () => {
    expect(statusChipFor({ isLive: true, readOnly: true, syncBlocked: true })).toBe('not-syncing');
  });

  it('lets a blocked browser WIN over a live game', () => {
    // The one the director can act on, and the one that makes the other a lie:
    // a published game that is not syncing is showing participants a document
    // that has stopped moving.
    expect(statusChipFor({ isLive: true, syncBlocked: true })).toBe('not-syncing');
  });
});
