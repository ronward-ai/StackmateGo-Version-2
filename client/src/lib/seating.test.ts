import { describe, it, expect } from 'vitest';
import { seatToReclaim, seatablePlayers, allSeated } from './seating';
import type { Player } from '@/types';

const player = (over: Partial<Player> = {}): Player => ({
  id: 'p1',
  name: 'Dave',
  knockouts: 0,
  isActive: true,
  ...over,
} as Player);

const at = (tableIndex: number, seatIndex: number) => ({ tableIndex, seatIndex });

describe('seatToReclaim', () => {
  it('gives the seat back when nobody has taken it', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(0, 3), totalSeatedPlayers: 7 } });
    expect(seatToReclaim(dave, [dave])).toEqual(at(0, 3));
  });

  it('refuses when an active player is sitting there', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(0, 3), totalSeatedPlayers: 7 } });
    const sam = player({ id: 'p2', name: 'Sam', seated: true, tableAssignment: at(0, 3) });
    expect(seatToReclaim(dave, [dave, sam])).toBeNull();
  });

  it('does not count an ELIMINATED player as holding the seat', () => {
    // They may still carry a stale assignment; they are not at the table.
    const dave = player({ isActive: false, seatInfo: { ...at(0, 3), totalSeatedPlayers: 7 } });
    const out = player({ id: 'p2', name: 'Sam', isActive: false, seated: true, tableAssignment: at(0, 3) });
    expect(seatToReclaim(dave, [dave, out])).toEqual(at(0, 3));
  });

  it('does not count an unseated player as holding the seat', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(0, 3), totalSeatedPlayers: 7 } });
    const waiting = player({ id: 'p2', name: 'Sam', seated: false, tableAssignment: at(0, 3) });
    expect(seatToReclaim(dave, [dave, waiting])).toEqual(at(0, 3));
  });

  it('is not confused by the same seat number on another table', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(1, 3), totalSeatedPlayers: 7 } });
    const sam = player({ id: 'p2', name: 'Sam', seated: true, tableAssignment: at(0, 3) });
    expect(seatToReclaim(dave, [dave, sam])).toEqual(at(1, 3));
  });

  it('has nothing to give back without a recorded seat', () => {
    expect(seatToReclaim(player({ isActive: false }), [])).toBeNull();
  });

  it('handles seat zero, which is falsy', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(0, 0), totalSeatedPlayers: 7 } });
    expect(seatToReclaim(dave, [dave])).toEqual(at(0, 0));
  });
});

describe('seatablePlayers', () => {
  it('refuses a chair to anyone who is out', () => {
    const players = [
      { id: 'a', name: 'Active' },
      { id: 'b', name: 'Busted', isActive: false },
      { id: 'c', name: 'Explicitly active', isActive: true },
    ] as any[];
    expect(seatablePlayers(players).map(p => p.id)).toEqual(['a', 'c']);
  });

  it('treats absent isActive as still in, the way the rest of the app does', () => {
    expect(seatablePlayers([{ id: 'a' }] as any[])).toHaveLength(1);
  });

  it('is empty rather than throwing when nobody is left', () => {
    expect(seatablePlayers([])).toEqual([]);
    expect(seatablePlayers([{ id: 'a', isActive: false }] as any[])).toEqual([]);
  });
});

describe('allSeated', () => {
  it('is true when every player still in has a chair', () => {
    expect(allSeated([
      { id: 'a', seated: true },
      { id: 'b', seated: true },
    ] as any[])).toBe(true);
  });

  it('is false while anyone still in is waiting for a chair', () => {
    expect(allSeated([
      { id: 'a', seated: true },
      { id: 'b', seated: false },
    ] as any[])).toBe(false);
    expect(allSeated([{ id: 'a', seated: true }, { id: 'b' }] as any[])).toBe(false);
  });

  it('ignores busted players, who hold no chair', () => {
    // Otherwise one knockout would keep the button saying "Seat" all night.
    expect(allSeated([
      { id: 'a', seated: true },
      { id: 'out', isActive: false, seated: false },
    ] as any[])).toBe(true);
  });

  it('is false for an empty field, where "Randomize" would mean nothing', () => {
    expect(allSeated([])).toBe(false);
    expect(allSeated([{ id: 'out', isActive: false }] as any[])).toBe(false);
  });
});
