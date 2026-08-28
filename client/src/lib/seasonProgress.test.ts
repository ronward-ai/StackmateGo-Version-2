import { describe, it, expect } from 'vitest';
import {
  gameNumberFor,
  countGamesPlayed,
  isRealSeasonId,
  SYNTHETIC_SEASON_ID,
  type PlayerLike,
} from './seasonProgress';

/** Two players who both played tournaments t1 and t2 in season s1. */
const players: PlayerLike[] = [
  {
    tournamentResults: [
      { seasonId: 's1', tournamentId: 't1' },
      { seasonId: 's1', tournamentId: 't2' },
      { seasonId: 's2', tournamentId: 't9' },
    ],
  },
  {
    tournamentResults: [
      { seasonId: 's1', tournamentId: 't1' },
      { seasonId: 's1', tournamentId: 't2' },
    ],
  },
];

describe('isRealSeasonId', () => {
  it('rejects the synthetic pre-Firestore season', () => {
    // Results tagged with this match no real season and disappear from every
    // season-filtered view, so nothing may be recorded against it.
    expect(isRealSeasonId(SYNTHETIC_SEASON_ID)).toBe(false);
  });

  it('rejects empty values', () => {
    expect(isRealSeasonId(null)).toBe(false);
    expect(isRealSeasonId(undefined)).toBe(false);
    expect(isRealSeasonId('')).toBe(false);
  });

  it('accepts real ids, including numeric ones', () => {
    expect(isRealSeasonId('s1')).toBe(true);
    expect(isRealSeasonId(7)).toBe(true);
  });
});

describe('countGamesPlayed', () => {
  it('counts distinct tournaments, not results', () => {
    // Four results across two players, but only two tournaments.
    expect(countGamesPlayed('s1', players)).toBe(2);
  });

  it('counts only the requested season', () => {
    expect(countGamesPlayed('s2', players)).toBe(1);
  });

  it('is zero for an unknown season', () => {
    expect(countGamesPlayed('nope', players)).toBe(0);
  });

  it('is zero for the synthetic season and for empty input', () => {
    expect(countGamesPlayed(SYNTHETIC_SEASON_ID, players)).toBe(0);
    expect(countGamesPlayed('s1', [])).toBe(0);
    expect(countGamesPlayed('s1', null)).toBe(0);
  });

  it('falls back to a result id for legacy rows without tournamentId', () => {
    expect(countGamesPlayed('s1', [{ tournamentResults: [{ seasonId: 's1', id: 'legacy-1' }] }])).toBe(1);
  });

  it('matches numeric and string season ids interchangeably', () => {
    expect(countGamesPlayed(1, [{ tournamentResults: [{ seasonId: '1', tournamentId: 't1' }] }])).toBe(1);
  });
});

describe('gameNumberFor', () => {
  it('is the next game when none is in progress', () => {
    expect(gameNumberFor('s1', players)).toBe(3);
  });

  it('is the next game when the in-progress game has no results yet', () => {
    expect(gameNumberFor('s1', players, 't-new')).toBe(3);
  });

  it('does NOT advance once the in-progress game has recorded results', () => {
    // The regression this guards: during a live game, results land under the
    // current localGameId. Counting them and adding one would make the header
    // jump to "Game 4 of 12" mid-way through game 3.
    expect(gameNumberFor('s1', players, 't2')).toBe(2);
  });

  it('is game 1 for a season with no results', () => {
    expect(gameNumberFor('brand-new', players)).toBe(1);
  });

  it('is game 1 for the synthetic season rather than counting', () => {
    expect(gameNumberFor(SYNTHETIC_SEASON_ID, players)).toBe(1);
  });

  it('is game 1 with no players at all', () => {
    expect(gameNumberFor('s1', [])).toBe(1);
    expect(gameNumberFor('s1', null)).toBe(1);
  });

  it('ignores other seasons when numbering', () => {
    // s2 has one game; the two s1 games must not inflate it.
    expect(gameNumberFor('s2', players)).toBe(2);
  });

  it('tolerates players with missing or null result arrays', () => {
    expect(gameNumberFor('s1', [{}, { tournamentResults: null }, ...players])).toBe(3);
  });

  it('agrees with countGamesPlayed + 1 when no game is in progress', () => {
    for (const season of ['s1', 's2', 'unknown']) {
      expect(gameNumberFor(season, players)).toBe(countGamesPlayed(season, players) + 1);
    }
  });
});
