import { describe, it, expect } from 'vitest';
import {
  rosterNameConflict,
  isHidden,
  offerableRoster,
  rosterForStandings,
  deleteBlockedReason,
} from './leagueRoster';

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

  /**
   * THE MUTANT: skip hidden players in the conflict check, on the reasoning
   * that a hidden name is "free". It is not. `recordResultByName` matches by
   * name over every document regardless of the flag, so the hidden namesake
   * would quietly capture future nights — and being hidden, it would do so
   * where nobody can see it. Hiding takes a name out of the pickers; it does
   * not release the name.
   */
  it('still refuses a name a HIDDEN player holds', () => {
    const withHidden = [...roster, { id: '9', name: 'Pat Shaw', archived: true }];
    expect(rosterNameConflict(withHidden, 'Pat Shaw', '3')).toBe('Pat Shaw is already in this league.');
  });
});

describe('isHidden', () => {
  /**
   * THE MUTANT: truthiness. Every player written before this shipped carries no
   * flag at all, and the whole roster reading as hidden would empty the Add
   * Player picker for every existing league.
   */
  it('is only true for the flag set explicitly', () => {
    expect(isHidden({ id: '1', name: 'A', archived: true })).toBe(true);
    expect(isHidden({ id: '1', name: 'A', archived: false })).toBe(false);
    expect(isHidden({ id: '1', name: 'A' })).toBe(false);
    expect(isHidden({ id: '1', name: 'A', archived: 'yes' } as any)).toBe(false);
    expect(isHidden(null)).toBe(false);
    expect(isHidden(undefined)).toBe(false);
  });
});

describe('offerableRoster', () => {
  it('sorts by name and offers everybody by default', () => {
    expect(offerableRoster(roster).map(p => p.name)).toEqual(['Amy Fletcher', 'Dan Mercer', 'Jonh Smith']);
  });

  // THE POINT OF THE FEATURE: a name a director has hidden stops being offered.
  it('leaves out a hidden player', () => {
    const list = [{ id: '1', name: 'Dan Mercer', archived: true }, { id: '2', name: 'Amy Fletcher' }];
    expect(offerableRoster(list).map(p => p.name)).toEqual(['Amy Fletcher']);
  });

  // THE MUTANT: drop the seated exclusion, and the picker offers to add
  // somebody who is already sitting at a table.
  it('leaves out anybody already in tonight game, whatever the case', () => {
    expect(offerableRoster(roster, ['amy FLETCHER']).map(p => p.name))
      .toEqual(['Dan Mercer', 'Jonh Smith']);
  });

  /**
   * THE MUTANT: drop the de-dupe. This predates the hide — its original comment
   * reads "Firestore may have stale duplicate docs" — and without it the picker
   * shows one person twice.
   */
  it('offers one entry per name', () => {
    const list = [
      { id: '1', name: 'Dan Mercer' },
      { id: '2', name: 'dan mercer' },
      { id: '3', name: 'Amy Fletcher' },
    ];
    expect(offerableRoster(list).map(p => p.id)).toEqual(['3', '1']);
  });

  it('drops a nameless document rather than offering a blank chip', () => {
    expect(offerableRoster([{ id: '1', name: '' }, { id: '2', name: '  ' }, { id: '3', name: 'Amy' }]))
      .toHaveLength(1);
  });

  it('copes with an absent roster', () => {
    expect(offerableRoster(null)).toEqual([]);
    expect(offerableRoster(undefined, ['Amy'])).toEqual([]);
  });
});

describe('rosterForStandings', () => {
  const played = (seasonId: string, n = 1) =>
    Array.from({ length: n }, (_, i) => ({ id: `r${seasonId}${i}`, seasonId, position: i + 1 }));

  const field = [
    { id: '1', name: 'Amy Fletcher', tournamentResults: [...played('spring', 2), ...played('autumn')] },
    { id: '2', name: 'Pat Shaw', tournamentResults: played('spring') },
    { id: '3', name: 'Never Played', tournamentResults: [] },
    { id: '4', name: 'Dave Mercer', archived: true, tournamentResults: played('autumn') },
  ];

  it('narrows each player results to the season being shown', () => {
    const rows = rosterForStandings(field, 'spring');
    expect(rows.find(r => r.name === 'Amy Fletcher')!.tournamentResults).toHaveLength(2);
    expect(rows.find(r => r.name === 'Pat Shaw')!.tournamentResults).toHaveLength(1);
  });

  // THE POINT: the empty row a director is tidying away.
  it('gives a hidden player no row in a season they did not play', () => {
    expect(rosterForStandings(field, 'spring').map(r => r.name)).not.toContain('Dave Mercer');
  });

  /**
   * THE MUTANT, and the bug this whole change exists to avoid: dropping a
   * hidden player outright. Their results are real and the season has to add
   * up. Hiding is about not being offered, never about being erased.
   */
  it('still lists a hidden player in a season they DID play', () => {
    const rows = rosterForStandings(field, 'autumn');
    const dave = rows.find(r => r.name === 'Dave Mercer');
    expect(dave).toBeTruthy();
    expect(dave!.tournamentResults).toHaveLength(1);
  });

  /**
   * THE MUTANT: widen the drop to anybody with no games. A roster member who
   * has never played has always occupied a row of zeros, and changing that is
   * not what was asked for — only the HIDDEN ones go.
   */
  it('keeps the zero row of a player who is not hidden', () => {
    expect(rosterForStandings(field, 'spring').map(r => r.name)).toContain('Never Played');
  });

  /**
   * THE MUTANT: apply the drop before the season is known. The unresolved
   * branch hands everybody an empty result list, so the filter would drop every
   * hidden player for a frame and then bring back the ones who played — a
   * flicker. "No games this season" is only an answer once the season is an
   * answer.
   */
  it('drops nobody while the season is still unresolved', () => {
    for (const unresolved of [null, undefined, '']) {
      const rows = rosterForStandings(field, unresolved);
      expect(rows).toHaveLength(4);
      expect(rows.every(r => r.tournamentResults.length === 0)).toBe(true);
    }
  });

  it('does not mutate the roster it was given', () => {
    rosterForStandings(field, 'spring');
    expect(field[0].tournamentResults).toHaveLength(3);
  });

  it('copes with an absent roster', () => {
    expect(rosterForStandings(null, 'spring')).toEqual([]);
    expect(rosterForStandings(undefined, null)).toEqual([]);
  });
});

describe('deleteBlockedReason', () => {
  it('allows deleting a phantom with nothing behind them', () => {
    expect(deleteBlockedReason({ id: '1', name: 'Ghost' }, 0)).toBeNull();
  });

  /**
   * THE MUTANT, and it is the reported bug: let the delete through. There is no
   * safe deletion for a player with history — losing the results loses the
   * league's history, and keeping them orphans rows that the roster-outer join
   * can never reach again.
   */
  it('refuses a player who has recorded results', () => {
    expect(deleteBlockedReason({ id: '1', name: 'Dave Mercer' }, 12))
      .toContain('Dave Mercer has 12 recorded results');
  });

  // The two things that DO work have to be in the sentence, or a disabled
  // button is just a dead control — the complaint that produced
  // `rebuyUnavailableReason` in the first place.
  it('names the actions that are not blocked', () => {
    const reason = deleteBlockedReason({ id: '1', name: 'Dave' }, 3)!;
    expect(reason).toMatch(/hide/i);
    expect(reason).toMatch(/rename/i);
  });

  it('counts one result in the singular', () => {
    expect(deleteBlockedReason({ id: '1', name: 'Dave' }, 1)).toContain('1 recorded result in');
  });

  it('copes with a nameless document', () => {
    expect(deleteBlockedReason({ id: '1', name: '  ' }, 2)).toContain('This player has 2');
  });
});
