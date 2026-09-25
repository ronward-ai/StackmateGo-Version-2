import { describe, it, expect } from 'vitest';
import { isLeagueTournament, modeLockReason } from './tournamentMode';

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

describe('modeLockReason', () => {
  const inPlay = [{ position: 9, isActive: false }, { isActive: true }];
  // What a real finished game looks like: EVERY player inactive, the winner
  // included, because eliminatePlayer marks them so in the same update that
  // gives them position 1.
  const finished = [
    { position: 1, isActive: false },
    { position: 2, isActive: false },
    { position: 3, isActive: false },
  ];

  it('is free in both directions before anyone has busted', () => {
    // Nothing to back-fill yet, and flipping here is a legitimate correction —
    // a director realising this should be tonight's league game.
    expect(modeLockReason([{}, {}, {}], 'league')).toBeNull();
    expect(modeLockReason([{}, {}, {}], 'standalone')).toBeNull();
  });

  it('locks both directions the moment a player has a finishing position', () => {
    // The moment results become recordable is the moment the decision stops
    // being free: syncLeagueResults back-fills EVERY eliminated player.
    expect(modeLockReason(inPlay, 'league')).toBeTruthy();
    expect(modeLockReason(inPlay, 'standalone')).toBeTruthy();
  });

  /**
   * THE ASYMMETRY, AND THE REASON IT IS NOT A TIDY-UP WAITING TO HAPPEN.
   *
   * A finished league game may stop being one: its results are already written
   * and stay written, so the switch takes nothing back and only says what the
   * next game is. A finished standalone game may NOT become one: that would
   * back-fill the whole night into a league as real results.
   *
   * Collapsing these two back into a single "has anybody busted" predicate —
   * which is what this replaced — fails the first of these.
   */
  it('lets a FINISHED game stop being a league game, but never become one', () => {
    expect(modeLockReason(finished, 'standalone')).toBeNull();
    expect(modeLockReason(finished, 'league')).toBeTruthy();
  });

  it('says something different for the two blocked cases', () => {
    // An unexplained dead control is what sent a director to ask what the
    // slider does. "Started" and "finished" are different facts.
    expect(modeLockReason(inPlay, 'league')).not.toBe(modeLockReason(finished, 'league'));
  });

  it('is free for an empty or missing roster', () => {
    expect(modeLockReason([], 'league')).toBeNull();
    expect(modeLockReason(null, 'league')).toBeNull();
    expect(modeLockReason(undefined, 'standalone')).toBeNull();
  });

  it('ignores a zero or negative position rather than reading it as a bust', () => {
    // resetTournament and the seeding paths leave position unset or 0; treating
    // that as "someone busted" would lock a game that has not started.
    expect(modeLockReason([{ position: 0 }, { position: -1 }], 'league')).toBeNull();
  });
});
