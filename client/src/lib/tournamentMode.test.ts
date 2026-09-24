import { describe, it, expect } from 'vitest';
import { isLeagueTournament, gameTypeIsLocked } from './tournamentMode';

describe('isLeagueTournament', () => {
  it('is a league game when the flag is set on the document', () => {
    expect(isLeagueTournament({ isSeasonTournament: true })).toBe(true);
  });

  it('is a league game when the flag is set in settings', () => {
    expect(isLeagueTournament({ settings: { isSeasonTournament: true } })).toBe(true);
  });

  it('REGRESSION: standalone wins over a leftover leagueId', () => {
    // The reported bug. The Standalone toggle set isSeasonTournament: false but
    // left leagueId behind, and the old `|| !!leagueId` clause let that stale id
    // override the explicit choice — so spectators saw a league standings table
    // on a standalone tournament.
    expect(isLeagueTournament({
      settings: { isSeasonTournament: false, leagueId: 'league-1' },
    })).toBe(false);
  });

  it('respects an explicit false on the document over settings and leagueId', () => {
    expect(isLeagueTournament({
      isSeasonTournament: false,
      settings: { isSeasonTournament: true, leagueId: 'league-1' },
    })).toBe(false);
  });

  it('infers a league game from leagueId when no flag has arrived yet', () => {
    // Preserves the race this fallback was added for: a participant can scan the
    // QR before isSeasonTournament is written to the Firestore document.
    expect(isLeagueTournament({ settings: { leagueId: 'league-1' } })).toBe(true);
  });

  it('is standalone when there is no flag and no league', () => {
    expect(isLeagueTournament({ settings: {} })).toBe(false);
    expect(isLeagueTournament({})).toBe(false);
    expect(isLeagueTournament(null)).toBe(false);
    expect(isLeagueTournament(undefined)).toBe(false);
  });

  it('treats a cleared leagueId as standalone', () => {
    expect(isLeagueTournament({ settings: { leagueId: null } })).toBe(false);
    expect(isLeagueTournament({ settings: { leagueId: '' } })).toBe(false);
  });
});

describe('gameTypeIsLocked', () => {
  it('is unlocked before anyone has busted', () => {
    // Nothing to back-fill yet, and flipping here is a legitimate correction —
    // a director realising this should be tonight's league game.
    expect(gameTypeIsLocked([{}, {}, {}])).toBe(false);
  });

  it('locks the moment a player has a finishing position', () => {
    // The moment results become recordable is the moment the decision stops
    // being free: syncLeagueResults back-fills EVERY eliminated player.
    expect(gameTypeIsLocked([{ position: 9 }, {}])).toBe(true);
  });

  it('is unlocked for an empty or missing roster', () => {
    expect(gameTypeIsLocked([])).toBe(false);
    expect(gameTypeIsLocked(null)).toBe(false);
    expect(gameTypeIsLocked(undefined)).toBe(false);
  });

  it('ignores a zero or negative position rather than reading it as a bust', () => {
    // resetTournament and the seeding paths leave position unset or 0; treating
    // that as "someone busted" would lock a game that has not started.
    expect(gameTypeIsLocked([{ position: 0 }, { position: -1 }])).toBe(false);
  });
});
