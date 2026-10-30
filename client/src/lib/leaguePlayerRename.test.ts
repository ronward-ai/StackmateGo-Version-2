import { describe, it, expect } from 'vitest';
import { renameRefusal } from './leaguePlayerRename';

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

  it("refuses another league player's name, whatever its case", () => {
    expect(renameRefusal('Dave', 'amy', league, [])).toMatch(/already called/);
  });

  it("refuses a player in tonight's roster, and points at Edit results", () => {
    expect(renameRefusal('Dave', 'David', league, ['DAVE', 'Cat'])).toMatch(/Edit results/);
  });
});
