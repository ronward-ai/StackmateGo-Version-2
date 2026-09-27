import { describe, it, expect, vi } from 'vitest';
import { initialDetails, needsLocalGameId } from './localGameId';

describe('initialDetails', () => {
  // THE regression. A standalone game had no localGameId, so
  // createTournamentDocument passed undefined, createDocViaRest auto-generated
  // an id, and its 409-adopt arm — which requires a docId — could never fire.
  // Two devices on one standalone night made two documents with nothing to
  // collide on. A mutant that drops this goes red.
  it('gives a STANDALONE game a localGameId', () => {
    const d = initialDetails(undefined, false, () => 'game_1');
    expect(d.type).toBe('standalone');
    expect(d.localGameId).toBe('game_1');
  });

  it('gives a league game one too, as it always did', () => {
    const d = initialDetails(undefined, true, () => 'game_1');
    expect(d.type).toBe('season');
    expect(d.localGameId).toBe('game_1');
  });

  // A database game already has an identity, and a second one that may not
  // match the document it is driving is the "two answers to one question" fault
  // consoleTournamentId() exists to have fixed.
  it('gives a DATABASE game none, and its document id instead', () => {
    const d = initialDetails('abc123', false, () => 'game_1');
    expect(d).toEqual({ type: 'database', id: 'abc123' });
    expect(d.localGameId).toBeUndefined();
  });

  // Minting stores the id. Minting one for a game that will never use it would
  // leave it in scoped storage for the NEXT local game to inherit.
  it('does not mint for a database game', () => {
    const mint = vi.fn(() => 'game_1');
    initialDetails('abc123', true, mint);
    expect(mint).not.toHaveBeenCalled();
  });

  it('mints exactly once for a local game', () => {
    const mint = vi.fn(() => 'game_1');
    initialDetails(undefined, false, mint);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('treats an empty tournament id as no id', () => {
    expect(initialDetails('', false, () => 'game_1').type).toBe('standalone');
  });
});

describe('needsLocalGameId', () => {
  it('is true for a local game that has none', () => {
    expect(needsLocalGameId({ type: 'standalone' })).toBe(true);
    expect(needsLocalGameId({ type: 'season' })).toBe(true);
  });

  it('is false once it has one', () => {
    expect(needsLocalGameId({ type: 'standalone', localGameId: 'g' })).toBe(false);
    expect(needsLocalGameId({ type: 'season', localGameId: 'g' })).toBe(false);
  });

  it('is false for a database game, with or without one', () => {
    expect(needsLocalGameId({ type: 'database' })).toBe(false);
    expect(needsLocalGameId({ type: 'database', localGameId: 'g' })).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(needsLocalGameId(null)).toBe(false);
    expect(needsLocalGameId(undefined)).toBe(false);
  });
});
