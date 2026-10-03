import { describe, it, expect } from 'vitest';
import {
  addRecent, removeRecent, sanitiseRecent, resolveRecent, RECENT_PLAYER_LIMIT, type RecentPlayer,
} from './recentPlayers';

const list = (...names: string[]): RecentPlayer[] =>
  names.map((name, i) => ({ name, lastUsed: 1000 - i }));

describe('addRecent', () => {
  it('puts the newest name first', () => {
    expect(addRecent(list('Amy', 'Dan'), 'Cass').map(p => p.name)).toEqual(['Cass', 'Amy', 'Dan']);
  });

  // THE MUTANT: a case-SENSITIVE de-dupe. `dave` after `Dave` is the same
  // person, and two rows for one player is the clutter this list is complained
  // about for.
  it('keeps one entry per person, whatever the case', () => {
    expect(addRecent(list('Dave', 'Amy'), 'dave').map(p => p.name)).toEqual(['dave', 'Amy']);
    expect(addRecent(list('Dave', 'Amy'), '  DAVE  ').map(p => p.name)).toEqual(['DAVE', 'Amy']);
  });

  // THE MUTANT: drop the cap. A picker that grows without bound is the thing
  // being scrolled through.
  it('keeps only the most recent, up to the cap', () => {
    const many = list(...Array.from({ length: RECENT_PLAYER_LIMIT }, (_, i) => `P${i}`));
    const next = addRecent(many, 'New');
    expect(next).toHaveLength(RECENT_PLAYER_LIMIT);
    expect(next[0].name).toBe('New');
    expect(next.map(p => p.name)).not.toContain(`P${RECENT_PLAYER_LIMIT - 1}`);
  });

  it('ignores an empty name rather than storing a blank row', () => {
    expect(addRecent(list('Amy'), '   ').map(p => p.name)).toEqual(['Amy']);
    expect(addRecent(list('Amy'), '').map(p => p.name)).toEqual(['Amy']);
  });

  it('does not mutate the list it was given', () => {
    const before = list('Amy');
    addRecent(before, 'Dan');
    expect(before.map(p => p.name)).toEqual(['Amy']);
  });
});

describe('removeRecent', () => {
  // THE REPORTED FAULT: a name typed wrong once stayed in the picker for good.
  it('drops the name and leaves the order of the rest', () => {
    expect(removeRecent(list('Amy', 'Jonh', 'Dan'), 'Jonh').map(p => p.name)).toEqual(['Amy', 'Dan']);
  });

  // THE MUTANT: case-sensitive again, which would leave the very row the
  // director just pressed the cross on.
  it('matches however the name was capitalised or spaced', () => {
    expect(removeRecent(list('Amy', 'Dave'), '  dave ').map(p => p.name)).toEqual(['Amy']);
  });

  it('leaves a list alone when the name is not in it', () => {
    expect(removeRecent(list('Amy', 'Dan'), 'Cass').map(p => p.name)).toEqual(['Amy', 'Dan']);
    expect(removeRecent(list('Amy'), '').map(p => p.name)).toEqual(['Amy']);
  });
});

describe('RECENT_PLAYER_LIMIT', () => {
  // Pinned, because the number is a decision: twenty was right for one device,
  // and a list that follows the account has to hold a whole league.
  it('is fifty', () => {
    expect(RECENT_PLAYER_LIMIT).toBe(50);
  });
});

describe('sanitiseRecent', () => {
  it('reads a well-formed list, newest first', () => {
    expect(sanitiseRecent([{ name: 'Amy', lastUsed: 1 }, { name: 'Dan', lastUsed: 5 }])!.map(p => p.name))
      .toEqual(['Dan', 'Amy']);
  });

  /**
   * THE MUTANT: trust the document. A field written by hand in the console or by
   * a newer build reaches every device, and one bad entry must not take the Add
   * Player box down with it.
   */
  it('drops entries that are not a name and a time', () => {
    const raw = [
      { name: 'Amy', lastUsed: 3 },
      { name: '   ', lastUsed: 2 },
      { name: 42, lastUsed: 2 },
      { name: 'Dan' },
      { name: 'Cass', lastUsed: Number.NaN },
      null,
      'Pat',
    ];
    expect(sanitiseRecent(raw)!.map(p => p.name)).toEqual(['Amy']);
  });

  it('keeps one entry per person, the newest', () => {
    expect(sanitiseRecent([{ name: 'dave', lastUsed: 1 }, { name: 'Dave', lastUsed: 9 }]))
      .toEqual([{ name: 'Dave', lastUsed: 9 }]);
  });

  it('caps what it reads', () => {
    const raw = Array.from({ length: RECENT_PLAYER_LIMIT + 10 }, (_, i) => ({ name: `P${i}`, lastUsed: i }));
    expect(sanitiseRecent(raw)).toHaveLength(RECENT_PLAYER_LIMIT);
  });

  // Not a list at all reads as "the cloud has none", which is what lets a
  // device adopt rather than crash.
  it('answers null when there is no list', () => {
    expect(sanitiseRecent(undefined)).toBeNull();
    expect(sanitiseRecent(null)).toBeNull();
    expect(sanitiseRecent({ name: 'Amy' })).toBeNull();
  });

  it('keeps an empty list as an empty list, not as absent', () => {
    expect(sanitiseRecent([])).toEqual([]);
  });
});

describe('resolveRecent', () => {
  const cloud = list('Amy', 'Dan');
  const device = list('Old Name', 'Amy');

  // THE POINT: the account's list is the list, on every device.
  it('uses the cloud list when there is one, and pushes nothing', () => {
    expect(resolveRecent(cloud, device)).toEqual({ list: cloud, pushLocal: false });
  });

  /**
   * THE MUTANT, and the one that would quietly undo the × button: a union.
   * Merging would bring back every name removed on another device whenever an
   * older device signed in. "Old Name" here is exactly that name.
   */
  it('never merges the device list into the cloud one', () => {
    expect(resolveRecent(cloud, device).list.map(p => p.name)).not.toContain('Old Name');
  });

  // First sign-in after this shipped: the cloud has nothing, the device has a
  // list built up over months. Losing it there would be losing it.
  it('adopts this device list when the cloud has none, and pushes it up', () => {
    expect(resolveRecent(null, device)).toEqual({ list: device, pushLocal: true });
  });

  it('pushes nothing when neither side has a name', () => {
    expect(resolveRecent(null, [])).toEqual({ list: [], pushLocal: false });
  });

  /**
   * THE MUTANT: treat an empty cloud list as absent. A director who removed
   * every name has said so, and a stale device must not push its old ones back
   * up over that.
   */
  it('respects an EMPTY cloud list rather than adopting over it', () => {
    expect(resolveRecent([], device)).toEqual({ list: [], pushLocal: false });
  });
});
