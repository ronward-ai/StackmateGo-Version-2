import { describe, it, expect } from 'vitest';
import { recordedForGame, recordedPosition, removalsDue, recordsDue, nameKey, findPlayerByName, alreadyRecorded, renamesDue, renameKey } from './leagueRecorder';

const league = (rows: Array<[string, string, number]>) => {
  const byName = new Map<string, any>();
  for (const [name, tournamentId, position] of rows) {
    const lp = byName.get(name) ?? { name, tournamentResults: [] };
    lp.tournamentResults.push({ tournamentId, position });
    byName.set(name, lp);
  }
  return [...byName.values()];
};

describe('recordedForGame', () => {
  it('reads each player\'s place for THIS game only, by lower-cased name', () => {
    const cloud = recordedForGame(league([['Dave', 'G', 12], ['Dave', 'OTHER', 3], ['Amy', 'G', 11]]), 'G');
    expect(cloud.get('dave')).toBe(12);
    expect(cloud.get('amy')).toBe(11);
    expect(cloud.size).toBe(2);
  });

  it('is empty without a game id', () => {
    expect(recordedForGame(league([['Dave', 'G', 12]]), null).size).toBe(0);
  });
});

describe('recordedPosition — memory first, the league second', () => {
  const dave = { id: 'd', name: 'Dave' };
  it('falls back to the league when this tab knows nothing — a reload, a takeover', () => {
    expect(recordedPosition(new Map(), new Map([['dave', 12]]), dave)).toBe(12);
  });
  it('prefers what this tab just wrote over a snapshot that lags it', () => {
    expect(recordedPosition(new Map([['d', 5]]), new Map([['dave', 12]]), dave)).toBe(5);
  });
  it('treats a removal this tab made as removed, whatever the snapshot still says', () => {
    expect(recordedPosition(new Map([['d', 0]]), new Map([['dave', 12]]), dave)).toBeNull();
  });
});

describe('THE regression (Oct H6): after a reload, a re-entry clears and corrects the old result', () => {
  const cloud = new Map([['dave', 12], ['amy', 11]]);
  const memory = new Map<string, number>(); // the tab was reloaded

  it('removes the result of a player who is back in the game', () => {
    const { back } = removalsDue([{ id: 'd', name: 'Dave', isActive: true }], memory, cloud);
    expect(back.map(p => p.name)).toEqual(['Dave']);
  });

  it('corrects a finisher the re-entry renumbered', () => {
    const { moved } = removalsDue([{ id: 'a', name: 'Amy', isActive: false, position: 12 }], memory, cloud);
    expect(moved.map(p => p.name)).toEqual(['Amy']);
  });

  it('records the corrected place once the stale one is gone', () => {
    const afterRemoval = new Map([['a', 0]]);
    const due = recordsDue([{ id: 'a', name: 'Amy', isActive: false, position: 12 }], afterRemoval, cloud, false);
    expect(due.map(p => p.name)).toEqual(['Amy']);
  });

  it('does not re-record somebody already recorded at the right place', () => {
    expect(recordsDue([{ id: 'a', name: 'Amy', isActive: false, position: 11 }], memory, cloud, false)).toEqual([]);
  });
});

describe('recordsDue', () => {
  it('records the busted, and the winner only once the game is over', () => {
    const players = [
      { id: 'w', name: 'Win', isActive: true, position: 1 },
      { id: 'b', name: 'Bust', isActive: false, position: 2 },
      { id: 'p', name: 'Playing', isActive: true },
    ];
    expect(recordsDue(players, new Map(), new Map(), false).map(p => p.name)).toEqual(['Bust']);
    expect(recordsDue(players, new Map(), new Map(), true).map(p => p.name)).toEqual(['Win', 'Bust']);
  });
});

describe('the recorder\'s name match and dedupe (Oct coverage)', () => {
  it('matches a name however it is cased or padded', () => {
    const players = [{ id: '1', name: 'Amy Smith' }, { id: '2', name: 'Bob' }];
    expect(findPlayerByName(players, '  amy smith ')?.id).toBe('1');
    expect(findPlayerByName(players, 'BOB')?.id).toBe('2');
    expect(findPlayerByName(players, 'Cat')).toBeUndefined();
    expect(nameKey('  Amy ')).toBe('amy');
  });

  // The hole: the standings merge duplicate-named documents into one row, so
  // the recorder sees only the primary id. A result under the duplicate was
  // missed and the night recorded twice.
  it('finds a result recorded under a DUPLICATE document with the same name', () => {
    const docs = [{ id: 'primary', name: 'Amy' }, { id: 'dupe', name: 'amy ' }];
    const results = [{ leaguePlayerId: 'dupe', tournamentId: 'G' }];
    expect(alreadyRecorded(docs, results, 'Amy', 'G', ['primary'])).toBe(true);
  });

  it('is only about THIS game, and this person', () => {
    const docs = [{ id: 'a', name: 'Amy' }, { id: 'b', name: 'Bob' }];
    const results = [{ leaguePlayerId: 'a', tournamentId: 'OTHER' }, { leaguePlayerId: 'b', tournamentId: 'G' }];
    expect(alreadyRecorded(docs, results, 'Amy', 'G')).toBe(false);
  });

  it('counts the id it was handed even before the roster snapshot has it', () => {
    expect(alreadyRecorded([], [{ leaguePlayerId: 'new', tournamentId: 'G' }], 'Amy', 'G', ['new'])).toBe(true);
  });
});

import { recordedStatsForGame, statsDiffer } from './leagueRecorder';

describe('an edited night: same place, different counts', () => {
  const league = [{ name: 'Amy', tournamentResults: [{ tournamentId: 'g', position: 2, playersEliminatedCount: 1, rebuys: 0, reEntries: 0 }] }];
  const amy = { id: 'a', name: 'Amy', isActive: false, position: 2, knockouts: 3, rebuys: 1, reEntries: 0 };

  it('is withdrawn to be re-recorded', () => {
    const { changed, moved } = removalsDue([amy], new Map(), recordedForGame(league, 'g'),
      { memory: new Map(), cloud: recordedStatsForGame(league, 'g') });
    expect(changed.map(p => p.id)).toEqual(['a']);
    expect(moved).toEqual([]);
  });

  it('this tab\'s memory beats a lagging snapshot, so it is corrected once', () => {
    const { changed } = removalsDue([amy], new Map([['a', 2]]), recordedForGame(league, 'g'),
      { memory: new Map([['a', { knockouts: 3, rebuys: 1, reEntries: 0 }]]), cloud: recordedStatsForGame(league, 'g') });
    expect(changed).toEqual([]);
  });

  it('a field an old result never stored is unknown, not 0 — opening an old game rewrites nothing', () => {
    expect(statsDiffer({ knockouts: 3 }, { knockouts: 3, rebuys: 2, reEntries: 1 })).toBe(false);
    expect(statsDiffer({ knockouts: 2 }, { knockouts: 3, rebuys: 0, reEntries: 0 })).toBe(true);
    expect(statsDiffer(undefined, { knockouts: 3 })).toBe(false);
  });
});

describe('renamesDue — a result still filed under a name the player was renamed from', () => {
  const dave = { id: 'p2', name: 'Dave Smith', isActive: false, position: 2, formerNames: ['Dave Smyth'] };

  it('finds the old-name result for this game', () => {
    const cloud = new Map([['dave smyth', 2], ['amy', 1]]);
    expect(renamesDue([dave], cloud)).toEqual([{ player: dave, formerName: 'Dave Smyth' }]);
  });

  it('nothing once it is gone, or once this tab has withdrawn it', () => {
    expect(renamesDue([dave], new Map([['dave smith', 2]]))).toEqual([]);
    expect(renamesDue([dave], new Map([['dave smyth', 2]]), new Set([renameKey('p2', 'Dave Smyth')]))).toEqual([]);
  });

  it('never withdraws a result belonging to a player still in the game under that name', () => {
    const other = { id: 'p3', name: 'Dave Smyth', isActive: false, position: 3 };
    expect(renamesDue([dave, other], new Map([['dave smyth', 3]]))).toEqual([]);
  });
});

import { seasonForRecording, misfiledDue, pendingLeagueResults } from './leagueRecorder';

describe('seasonForRecording — the game\'s own season, else the one on screen, else wait', () => {
  it('prefers the season stored on the game', () => {
    expect(seasonForRecording('s2', 's1')).toBe('s2');
  });
  it('falls back to the season on screen', () => {
    expect(seasonForRecording(undefined, 's1')).toBe('s1');
    expect(seasonForRecording('default-season', 7)).toBe('7');
  });
  it('is null — write nothing — when neither is real', () => {
    expect(seasonForRecording(undefined, undefined)).toBeNull();
    expect(seasonForRecording('default-season', 'default-season')).toBeNull();
    expect(seasonForRecording('', null)).toBeNull();
  });
});

describe('misfiledDue — this game\'s results filed under no season', () => {
  const rows = [
    { id: 'a', tournamentId: 'G', seasonId: null },
    { id: 'b', tournamentId: 'G', seasonId: 'default-season' },
    { id: 'c', tournamentId: 'G', seasonId: 's1' },
    { id: 'd', tournamentId: 'G', seasonId: 's0' },
    { id: 'e', tournamentId: 'OTHER', seasonId: null },
    { id: 'f', tournamentId: 'G' },
  ];
  it('finds a missing or synthetic season for THIS game only', () => {
    expect(misfiledDue(rows, 'G', 's1').map(r => r.id)).toEqual(['a', 'b', 'f']);
  });
  it('never moves a result that has another REAL season', () => {
    expect(misfiledDue(rows, 'G', 's1').some(r => r.id === 'd')).toBe(false);
  });
  it('does nothing unless the game names a real season itself', () => {
    expect(misfiledDue(rows, 'G', undefined)).toEqual([]);
    expect(misfiledDue(rows, 'G', 'default-season')).toEqual([]);
    expect(misfiledDue(rows, null, 's1')).toEqual([]);
  });
});

describe('pendingLeagueResults — what the league does not hold yet', () => {
  const players = [
    { id: '1', name: 'Amy', isActive: true },
    { id: '2', name: 'Bob', isActive: false, position: 3 },
    { id: '3', name: 'Cat', isActive: false, position: 2 },
  ];
  it('counts finished players nobody has recorded', () => {
    expect(pendingLeagueResults({ players, memory: new Map(), cloud: new Map([['cat', 2]]), gameIsFinished: false })).toBe(1);
  });
  it('counts this game\'s writes the server has not acknowledged', () => {
    const results = [
      { tournamentId: 'G', pendingWrite: true },
      { tournamentId: 'G', pendingWrite: false },
      { tournamentId: 'OTHER', pendingWrite: true },
    ];
    expect(pendingLeagueResults({ players, memory: new Map(), cloud: new Map([['bob', 3], ['cat', 2]]), gameIsFinished: false, results, gameId: 'G' })).toBe(1);
  });
  it('is zero when everything is recorded and acknowledged', () => {
    expect(pendingLeagueResults({ players, memory: new Map([['2', 3]]), cloud: new Map([['cat', 2]]), gameIsFinished: false, results: [], gameId: 'G' })).toBe(0);
  });
});

import { nameKeysOf, answersTo, samePerson } from './leagueRecorder';

describe('a renamed player still answers to the old spelling (aliases)', () => {
  // Reported: renaming a misspelt player from their season card left last week's
  // game saying the old spelling, and reopening it recorded the night again as a
  // brand-new player — a row for each spelling.
  const smith = { id: 'p1', name: 'Dave Smith', aliases: ['Dave Smyth'], tournamentResults: [{ tournamentId: 'G', position: 3 }] };

  it('nameKeysOf is the name and every alias', () => {
    expect(nameKeysOf(smith)).toEqual(['dave smith', 'dave smyth']);
    expect(answersTo(smith, ' DAVE SMYTH ')).toBe(true);
  });
  it("recordedForGame files the result under the old spelling too", () => {
    expect(recordedForGame([smith], 'G').get('dave smyth')).toBe(3);
  });
  it('findPlayerByName and playerIdsForName find the player by an old spelling', () => {
    expect(findPlayerByName([smith], 'Dave Smyth')?.id).toBe('p1');
    expect(alreadyRecorded([smith], [{ leaguePlayerId: 'p1', tournamentId: 'G' }], 'Dave Smyth', 'G')).toBe(true);
  });
  it('a CURRENT name beats an alias when both exist', () => {
    const other = { id: 'p2', name: 'Dave Smyth' };
    expect(findPlayerByName([smith, other], 'Dave Smyth')?.id).toBe('p2');
  });
  it('samePerson, and renamesDue leaves a former name alone when it is the same player', () => {
    expect(samePerson([smith], 'Dave Smyth', 'Dave Smith')).toBe(true);
    const roster = [{ id: 'x', name: 'Dave Smith', isActive: false, position: 3, formerNames: ['Dave Smyth'] }];
    const cloud = recordedForGame([smith], 'G');
    expect(renamesDue(roster, cloud, new Set(), (a, b) => samePerson([smith], a, b))).toEqual([]);
  });
});

import { seasonSplitOfGame, resultsToMoveInto } from './leagueRecorder';

describe('seasonSplitOfGame — one game, more than one season', () => {
  const rs = [
    { id: '1', tournamentId: 'G', seasonId: 'autumn' },
    { id: '2', tournamentId: 'G', seasonId: 'autumn' },
    { id: '3', tournamentId: 'G', seasonId: 'spring' },
    { id: '4', tournamentId: 'G', seasonId: null },
    { id: '5', tournamentId: 'OTHER', seasonId: 'winter' },
  ];
  it('counts this game\'s results per real season and calls two a split', () => {
    const s = seasonSplitOfGame(rs, 'G', 'spring');
    expect(s.isSplit).toBe(true);
    expect(s.seasons).toEqual([{ seasonId: 'autumn', count: 2 }, { seasonId: 'spring', count: 1 }]);
  });
  it('one season that is not the game\'s own is a split too, and offers the game\'s', () => {
    const s = seasonSplitOfGame(rs.filter(r => r.seasonId !== 'spring'), 'G', 'spring');
    expect(s.isSplit).toBe(true);
    expect(s.seasons.map(x => x.seasonId)).toEqual(['autumn', 'spring']);
  });
  it('all in the game\'s season is no split; seasonless results are left to misfiledDue', () => {
    expect(seasonSplitOfGame([rs[0], rs[1], rs[3]], 'G', 'autumn').isSplit).toBe(false);
  });
  it('resultsToMoveInto takes this game\'s results outside the chosen season, nobody else\'s', () => {
    expect(resultsToMoveInto(rs, 'G', 'autumn').map(r => r.id)).toEqual(['3', '4']);
  });
});

import { leagueCheck } from './leagueRecorder';

describe('leagueCheck — what the league holds for the game on screen', () => {
  const docs = [
    { id: 'a', name: 'Amy' },
    { id: 's', name: 'Dave Smith', aliases: ['Dave Smyth'] },
    { id: 'b', name: 'Bob' },
    { id: 'x', name: 'Stranger' },
  ];
  const results = [
    { id: 'r1', leaguePlayerId: 'a', tournamentId: 'G', seasonId: 'S1', position: 1, t: 5 },
    { id: 'r2', leaguePlayerId: 's', tournamentId: 'G', seasonId: null, position: 2, pendingWrite: true, t: 5 },
    { id: 'r3', leaguePlayerId: 'b', tournamentId: 'OLD', seasonId: 'S1', position: 4, t: 1 },
    { id: 'r4', leaguePlayerId: 'b', tournamentId: 'G2', seasonId: 'S1', position: 3, t: 6 },
    { id: 'r5', leaguePlayerId: 'x', tournamentId: 'G', seasonId: 'S1', position: 3, t: 5 },
  ];
  const players = [
    { name: 'Bob', position: 3 }, { name: 'Amy', position: 1 }, { name: 'Dave Smyth', position: 2 }, { name: 'Cat', position: 0 },
  ];
  const c = leagueCheck({ players, playerDocs: docs, results, gameId: 'G', timeOf: r => r.t });

  it('one row per placed player, in finishing order', () => {
    expect(c.rows.map(r => r.name)).toEqual(['Amy', 'Dave Smyth', 'Bob']);
  });
  it('finds this game\'s result under the name or an alias, with its season and pending state', () => {
    expect(c.rows[0].thisGame.map(r => r.seasonId)).toEqual(['S1']);
    expect(c.rows[1].thisGame[0]).toMatchObject({ id: 'r2', seasonId: null, pendingWrite: true, playerName: 'Dave Smith' });
  });
  it('a player with no result for this game shows none, and their latest other games', () => {
    expect(c.rows[2].thisGame).toEqual([]);
    expect(c.rows[2].recentOther.map(r => r.tournamentId)).toEqual(['G2', 'OLD']);
  });
  it('results for this game under nobody on the roster are strays', () => {
    expect(c.strays.map(r => r.playerName)).toEqual(['Stranger']);
  });
  it('counts this game\'s results by season, "no season" included', () => {
    expect(c.total).toBe(3);
    expect(c.bySeason).toEqual(expect.arrayContaining([{ seasonId: 'S1', count: 2 }, { seasonId: null, count: 1 }]));
  });
});
