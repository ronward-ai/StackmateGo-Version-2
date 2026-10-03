import { describe, it, expect } from 'vitest';
import { rosterNameConflict } from './leagueRoster';

const roster = [
  { id: '1', name: 'Dan Mercer' },
  { id: '2', name: 'Amy Fletcher' },
  { id: '3', name: 'Jonh Smith' },
];

describe('rosterNameConflict', () => {
  it('allows a name nobody in the league holds', () => {
    expect(rosterNameConflict(roster, 'John Smith', '3')).toBeNull();
  });

  /**
   * THE MUTANT, and the one that would break the commonest rename: dropping
   * `exceptId`. A player must be allowed to keep their own name — correcting
   * `dave` to `Dave` is a capitalisation fix and nothing else, and without this
   * arm the feature refuses the very edit it exists for.
   */
  it('lets a player keep their own name, including a change of case', () => {
    expect(rosterNameConflict(roster, 'Jonh Smith', '3')).toBeNull();
    expect(rosterNameConflict(roster, 'JONH SMITH', '3')).toBeNull();
  });

  /**
   * THE REASON THIS EXISTS. `recordResultByName` matches by NAME, so two
   * players sharing one would send future nights to whichever `find` reaches
   * first — and the League Roster picker de-dupes by name, so the duplicate
   * would be invisible while splitting the league's history.
   */
  it('refuses a name another player already holds, whatever the case', () => {
    expect(rosterNameConflict(roster, 'Amy Fletcher', '3')).toContain('already in this league');
    expect(rosterNameConflict(roster, '  amy fletcher ', '3')).toContain('already in this league');
  });

  it('names the player it clashed with, so the message is actionable', () => {
    expect(rosterNameConflict(roster, 'amy fletcher', '3')).toBe('Amy Fletcher is already in this league.');
  });

  it('refuses an empty name rather than storing a blank row', () => {
    expect(rosterNameConflict(roster, '   ', '3')).toBe('Enter a name.');
    expect(rosterNameConflict(roster, '', '3')).toBe('Enter a name.');
  });

  it('copes with an empty or absent roster', () => {
    expect(rosterNameConflict([], 'Anyone')).toBeNull();
    expect(rosterNameConflict(null, 'Anyone')).toBeNull();
    expect(rosterNameConflict(undefined, 'Anyone')).toBeNull();
  });
});
