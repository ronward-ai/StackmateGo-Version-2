import { describe, it, expect } from 'vitest';
import { standingsFromDocs } from './leagueStandings';

describe('standingsFromDocs (Oct coverage)', () => {
  it('merges duplicate-named players into one row, one result per game', () => {
    const rows = standingsFromDocs(
      [{ id: 'p1', name: 'Amy' }, { id: 'p2', name: ' amy' }, { id: 'p3', name: 'Bob' }],
      [
        { id: 'r1', leaguePlayerId: 'p1', tournamentId: 'G1', points: 10 },
        { id: 'r2', leaguePlayerId: 'p2', tournamentId: 'G1', points: 10 }, // same game, twice
        { id: 'r3', leaguePlayerId: 'p2', tournamentId: 'G2', points: 5 },
        { id: 'r4', leaguePlayerId: 'p3', tournamentId: 'G1', points: 7 },
      ],
    );
    expect(rows).toHaveLength(2);
    const amy = rows.find(r => r.name === 'Amy')!;
    expect(amy.id).toBe('p1');
    expect(amy.tournamentResults.map((r: any) => r.tournamentId).sort()).toEqual(['G1', 'G2']);
    expect(amy.totalPoints).toBe(15);
  });

  // A field must be on this list to reach a column — how Rebuys, Re-entries,
  // Add-ons and Bounties read 0 for every player in every league.
  it('carries every whitelisted field, renaming knockouts and prizeMoney', () => {
    const [row] = standingsFromDocs([{ id: 'p', name: 'Amy' }], [{
      id: 'r', leaguePlayerId: 'p', tournamentId: 'G', seasonId: 'S', position: 2, totalPlayers: 9, points: 30,
      knockouts: 3, prizeMoney: 45, buyIn: 20, rebuys: 1, rebuyAmount: 10, addons: 1, addonAmount: 5,
      reEntries: 2, bountyWinnings: 15, createdAt: '2026-10-07T20:00:00Z',
    }]);
    expect(row.tournamentResults[0]).toMatchObject({
      tournamentId: 'G', seasonId: 'S', position: 2, totalPlayers: 9, points: 30,
      playersEliminatedCount: 3, cashWon: 45, buyIn: 20, rebuys: 1, rebuyAmount: 10,
      addons: 1, addonAmount: 5, reEntries: 2, bountyWinnings: 15, date: '2026-10-07T20:00:00Z',
    });
  });

  it('gives a player with no results an empty row, not a missing one', () => {
    expect(standingsFromDocs([{ id: 'p', name: 'New' }], [])[0]).toMatchObject({ name: 'New', totalPoints: 0, tournamentResults: [] });
  });
});
