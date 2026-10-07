import { describe, it, expect } from 'vitest';
import { recordedForGame, recordedPosition, removalsDue, recordsDue, nameKey, findPlayerByName, alreadyRecorded } from './leagueRecorder';

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
