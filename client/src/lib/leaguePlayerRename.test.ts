import { describe, it, expect } from 'vitest';
import { renameRefusal, renameMerges, duplicateResultsOnMerge } from './leaguePlayerRename';

const league = ['Dave', 'Amy', 'Bob'];

describe('renameRefusal', () => {
  it('allows a new name nobody has', () => {
    expect(renameRefusal('Dave', 'David', league, [])).toBeNull();
  });

  it('allows a change of case or spacing to the same name', () => {
    expect(renameRefusal('dave', ' Dave ', league, [])).toBeNull();
  });

  it('refuses a blank name', () => {
    expect(renameRefusal('Dave', '   ', league, [])).toMatch(/empty/);
  });

  it("does not refuse another league player's name — that is a merge, confirmed on screen", () => {
    expect(renameRefusal('Dave', 'amy', league, [])).toBeNull();
  });

  it("refuses a player in tonight's roster, and points at Edit results", () => {
    expect(renameRefusal('Dave', 'David', league, ['DAVE', 'Cat'])).toMatch(/Edit results/);
  });
});

describe('renameMerges — onto a name another player has', () => {
  it('is a merge for another player\'s name, whatever its case', () => {
    expect(renameMerges('Dave Smyth', 'amy', league)).toBe(true);
  });
  it('is not a merge for a new name, the same name, or a blank', () => {
    expect(renameMerges('Dave', 'David', league)).toBe(false);
    expect(renameMerges('dave', ' Dave ', league)).toBe(false);
    expect(renameMerges('Dave', '  ', league)).toBe(false);
  });
});

describe('duplicateResultsOnMerge — a night both spellings carry is counted once', () => {
  const results = [
    { id: 't5', leaguePlayerId: 'T', tournamentId: 'g5' },
    { id: 't4', leaguePlayerId: 'T', tournamentId: 'g4' },
    { id: 's5', leaguePlayerId: 'S', tournamentId: 'g5' },
    { id: 's6', leaguePlayerId: 'S', tournamentId: 'g6' },
    { id: 'x5', leaguePlayerId: 'X', tournamentId: 'g5' },
  ];
  it('drops only the SOURCE\'s results for games the target already has', () => {
    expect(duplicateResultsOnMerge(results, ['S'], ['T']).map(r => r.id)).toEqual(['s5']);
  });
  it('drops nothing when the two never shared a game', () => {
    expect(duplicateResultsOnMerge(results, ['S'], ['nobody'])).toEqual([]);
  });
});
