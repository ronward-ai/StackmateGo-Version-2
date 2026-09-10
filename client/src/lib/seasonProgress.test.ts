import { describe, it, expect } from 'vitest';
import {
  gameNumberFor,
  countGamesPlayed,
  isRealSeasonId,
  isSeasonComplete,
  clampedGameNumber,
  nextSeasonDates,
  suggestNextName,
  seasonSubtitle,
  gamesInRange,
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

describe('isSeasonComplete', () => {
  const future = new Date(Date.now() + 90 * 864e5).toISOString().split('T')[0];
  const past = new Date(Date.now() - 5 * 864e5).toISOString().split('T')[0];

  it('is false part-way through the schedule', () => {
    expect(isSeasonComplete({ numberOfGames: 13, endDate: future }, 5)).toBe(false);
    expect(isSeasonComplete({ numberOfGames: 13, endDate: future }, 12)).toBe(false);
  });

  it('is true on the final scheduled game', () => {
    // 13 Wednesdays in the quarter; once the 13th is played the season is done
    // even though the end date has not arrived.
    expect(isSeasonComplete({ numberOfGames: 13, endDate: future }, 13)).toBe(true);
  });

  it('is true past the game count', () => {
    expect(isSeasonComplete({ numberOfGames: 13, endDate: future }, 14)).toBe(true);
  });

  it('is true once the end date has passed, even short of the game count', () => {
    // A cancelled week means the schedule can run out of calendar first.
    expect(isSeasonComplete({ numberOfGames: 13, endDate: past }, 11)).toBe(true);
  });

  it('is not complete during its own final day', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(isSeasonComplete({ numberOfGames: 13, endDate: today }, 5)).toBe(false);
  });

  it('falls back to whichever signal exists', () => {
    expect(isSeasonComplete({ numberOfGames: 3 }, 3)).toBe(true);
    expect(isSeasonComplete({ endDate: past }, 0)).toBe(true);
    expect(isSeasonComplete({ endDate: future }, 999)).toBe(false);
  });

  it('is false with nothing to go on', () => {
    expect(isSeasonComplete({}, 50)).toBe(false);
    expect(isSeasonComplete(null, 50)).toBe(false);
    expect(isSeasonComplete({ numberOfGames: 0, endDate: null }, 50)).toBe(false);
  });

  it('ignores an unparseable end date rather than throwing', () => {
    expect(isSeasonComplete({ endDate: 'not-a-date' }, 1)).toBe(false);
  });
});

describe('clampedGameNumber', () => {
  it('never exceeds the season total', () => {
    // The bug this prevents: "Game 14 of 13".
    expect(clampedGameNumber(14, { numberOfGames: 13 })).toBe(13);
  });

  it('passes through while inside the schedule', () => {
    expect(clampedGameNumber(3, { numberOfGames: 13 })).toBe(3);
    expect(clampedGameNumber(13, { numberOfGames: 13 })).toBe(13);
  });

  it('leaves the number alone when no total is set', () => {
    expect(clampedGameNumber(14, {})).toBe(14);
    expect(clampedGameNumber(14, null)).toBe(14);
    expect(clampedGameNumber(14, { numberOfGames: 0 })).toBe(14);
  });
});

describe('nextSeasonDates', () => {
  it('starts the day after and keeps the same length', () => {
    const next = nextSeasonDates({ startDate: '2026-01-01', endDate: '2026-03-31' });
    expect(next).toEqual({ startDate: '2026-04-01', endDate: '2026-06-30' });
  });

  it('handles a quarter that spans a year end', () => {
    const next = nextSeasonDates({ startDate: '2026-10-01', endDate: '2026-12-31' });
    expect(next?.startDate).toBe('2027-01-01');
  });

  it('returns null when dates are missing or nonsensical', () => {
    expect(nextSeasonDates({ startDate: '2026-01-01' })).toBeNull();
    expect(nextSeasonDates({ endDate: '2026-03-31' })).toBeNull();
    expect(nextSeasonDates({ startDate: 'x', endDate: 'y' })).toBeNull();
    expect(nextSeasonDates({ startDate: '2026-03-31', endDate: '2026-01-01' })).toBeNull();
  });
});

describe('nextSeasonDates — calendar quarters', () => {
  it('advances whole-month seasons by month count, not by duration', () => {
    // Q1 is 90 days and Q2 is 91, so duration arithmetic lands on 29 Jun.
    // Quarterly leagues want the next calendar quarter.
    expect(nextSeasonDates({ startDate: '2026-01-01', endDate: '2026-03-31' }))
      .toEqual({ startDate: '2026-04-01', endDate: '2026-06-30' });
    expect(nextSeasonDates({ startDate: '2026-04-01', endDate: '2026-06-30' }))
      .toEqual({ startDate: '2026-07-01', endDate: '2026-09-30' });
    expect(nextSeasonDates({ startDate: '2026-07-01', endDate: '2026-09-30' }))
      .toEqual({ startDate: '2026-10-01', endDate: '2026-12-31' });
  });

  it('rolls a Q4 season into Q1 of the next year', () => {
    expect(nextSeasonDates({ startDate: '2026-10-01', endDate: '2026-12-31' }))
      .toEqual({ startDate: '2027-01-01', endDate: '2027-03-31' });
  });

  it('handles February and leap years', () => {
    expect(nextSeasonDates({ startDate: '2027-11-01', endDate: '2028-01-31' }))
      .toEqual({ startDate: '2028-02-01', endDate: '2028-04-30' });
    // 2028 is a leap year — Feb has 29 days.
    expect(nextSeasonDates({ startDate: '2027-12-01', endDate: '2027-12-31' }))
      .toEqual({ startDate: '2028-01-01', endDate: '2028-01-31' });
  });

  it('handles a half-year season', () => {
    expect(nextSeasonDates({ startDate: '2026-01-01', endDate: '2026-06-30' }))
      .toEqual({ startDate: '2026-07-01', endDate: '2026-12-31' });
  });

  it('falls back to equal duration for seasons not on month boundaries', () => {
    // Mid-month start, so calendar-month logic does not apply.
    const next = nextSeasonDates({ startDate: '2026-01-15', endDate: '2026-02-14' });
    expect(next?.startDate).toBe('2026-02-15');
  });
});

describe('suggestNextName', () => {
  it('increments a trailing sequence number', () => {
    expect(suggestNextName('Season 3', '2026-04-01')).toBe('Season 4');
    expect(suggestNextName('Season 12', '2026-04-01')).toBe('Season 13');
  });

  it('does NOT treat a trailing year as a sequence number', () => {
    // "Spring 2026" -> "Spring 2027" would be wrong when the next season is
    // simply the following quarter of the same year.
    expect(suggestNextName('Spring 2026', '2026-04-01')).toBe('Q2 2026');
  });

  it('falls back to quarter and year', () => {
    expect(suggestNextName('Winter League', '2026-04-01')).toBe('Q2 2026');
    expect(suggestNextName(undefined, '2026-07-01')).toBe('Q3 2026');
    expect(suggestNextName('', '2026-10-01')).toBe('Q4 2026');
    expect(suggestNextName('Anything', '2027-01-01')).toBe('Q1 2027');
  });

  it('tolerates an unparseable date', () => {
    expect(suggestNextName('Winter League', 'nonsense')).toMatch(/^Q[1-4] \d{4}$/);
  });
});

describe('a season with no dates', () => {
  // Not every league runs on a calendar: a 12-game season runs until the
  // twelfth game is played, whenever that falls.
  it('completes on its game count alone', () => {
    const season = { numberOfGames: 12 };
    expect(isSeasonComplete(season, 11)).toBe(false);
    expect(isSeasonComplete(season, 12)).toBe(true);
    expect(isSeasonComplete(season, 13)).toBe(true);
  });

  it('never completes on time, having none', () => {
    expect(isSeasonComplete({ numberOfGames: 12, endDate: null }, 3)).toBe(false);
  });

  it('never completes at all with neither dates nor a game count', () => {
    expect(isSeasonComplete({}, 50)).toBe(false);
    expect(isSeasonComplete({ numberOfGames: 0 }, 50)).toBe(false);
  });

  it('still numbers its games', () => {
    expect(clampedGameNumber(4, { numberOfGames: 12 })).toBe(4);
    expect(clampedGameNumber(13, { numberOfGames: 12 })).toBe(12);
  });

  it('has no next dates to offer', () => {
    expect(nextSeasonDates({ numberOfGames: 12 })).toBeNull();
  });

  it('names the next one by bumping the trailing number, with no date to go on', () => {
    expect(suggestNextName('Season 3')).toBe('Season 4');
  });
});

describe('seasonSubtitle', () => {
  it('joins the range and the length when both are there', () => {
    expect(seasonSubtitle('1 Jan - 31 Mar', 12)).toBe('1 Jan - 31 Mar · 12 games');
  });

  it('gives the length alone, with no leading separator', () => {
    // The bug this exists to prevent: " · 12 games".
    expect(seasonSubtitle('', 12)).toBe('12 games');
    expect(seasonSubtitle(null, 12)).toBe('12 games');
  });

  it('gives the range alone', () => {
    expect(seasonSubtitle('1 Jan - 31 Mar', null)).toBe('1 Jan - 31 Mar');
    expect(seasonSubtitle('1 Jan - 31 Mar', 0)).toBe('1 Jan - 31 Mar');
  });

  it('is empty when there is nothing to say', () => {
    expect(seasonSubtitle('', null)).toBe('');
  });
});

describe('gamesInRange', () => {
  const WED = 3;
  const TUE = 2;
  const THU = 4;

  it('counts the Wednesdays in a quarter', () => {
    // 1 Jan 2026 is a Thursday, so the Wednesdays are 7/14/21/28 Jan,
    // 4/11/18/25 Feb and 4/11/18/25 Mar — twelve, not the thirteen a director
    // would guess from "thirteen weeks".
    expect(gamesInRange('2026-01-01', '2026-03-31', { weekdays: [WED] })).toBe(12);
  });

  it('includes a matching day on the first and last date of the range', () => {
    // 7 Jan 2026 is a Wednesday.
    expect(gamesInRange('2026-01-07', '2026-01-07', { weekdays: [WED] })).toBe(1);
    expect(gamesInRange('2026-01-07', '2026-01-13', { weekdays: [WED] })).toBe(1);
    expect(gamesInRange('2026-01-01', '2026-01-07', { weekdays: [WED] })).toBe(1);
  });

  it('counts two nights a week', () => {
    expect(gamesInRange('2026-01-01', '2026-01-31', { weekdays: [TUE, THU] })).toBe(9);
  });

  it('halves it for a fortnightly league', () => {
    expect(gamesInRange('2026-01-01', '2026-03-31', { weekdays: [WED], everyNWeeks: 2 })).toBe(6);
  });

  it('keeps a fortnightly pair on the SAME week, not alternating ones', () => {
    // Tue 6th and Thu 8th are one playing week; the 13th and 15th are skipped;
    // the 20th and 22nd play again. Anchoring each weekday separately would
    // scatter them.
    expect(gamesInRange('2026-01-01', '2026-01-31', { weekdays: [TUE, THU], everyNWeeks: 2 })).toBe(5);
  });

  it('is zero when there is nothing to count', () => {
    expect(gamesInRange('2026-01-01', '2026-03-31', { weekdays: [] })).toBe(0);
    expect(gamesInRange(null, '2026-03-31', { weekdays: [WED] })).toBe(0);
    expect(gamesInRange('2026-01-01', null, { weekdays: [WED] })).toBe(0);
    expect(gamesInRange('not a date', '2026-03-31', { weekdays: [WED] })).toBe(0);
    expect(gamesInRange('2026-03-31', '2026-01-01', { weekdays: [WED] })).toBe(0);
  });

  it('ignores weekdays that are not days', () => {
    expect(gamesInRange('2026-01-01', '2026-03-31', { weekdays: [WED, 9, -1, 3] })).toBe(12);
  });

  it('does not lose a week to a timezone', () => {
    // A date-only string parsed as local time can land on the previous day west
    // of Greenwich; both ends are read as UTC midnight.
    expect(gamesInRange('2026-01-07T00:00:00Z', '2026-01-07T23:59:59Z', { weekdays: [WED] })).toBe(1);
  });
});
