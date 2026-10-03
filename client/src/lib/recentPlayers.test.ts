import { describe, it, expect } from 'vitest';
import { addRecent, removeRecent, RECENT_PLAYER_LIMIT, type RecentPlayer } from './recentPlayers';

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
  it('keeps only the twenty most recent', () => {
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
