import { describe, it, expect } from 'vitest';
import {
  DELETION_ORDER,
  MAX_BATCH,
  chunk,
  describeWipe,
  leagueScopedStagesComeFirst,
  type WipeStage,
} from './accountWipe';

describe('DELETION_ORDER', () => {
  it('deletes every league-scoped collection before the leagues themselves', () => {
    // The one that matters. seasons/leaguePlayers/tournamentResults delete
    // under ownsLeague(), which reads the league document — so deleting
    // leagues first leaves those rows undeletable by any client, forever.
    expect(leagueScopedStagesComeFirst()).toBe(true);
  });

  it('catches an order that would strand the children', () => {
    const wrong: WipeStage[] = [
      { collection: 'leagues', scope: 'owner', label: 'leagues' },
      { collection: 'seasons', scope: 'league', label: 'seasons' },
    ];
    expect(leagueScopedStagesComeFirst(wrong)).toBe(false);
  });

  it('refuses an order that never deletes the leagues at all', () => {
    const noLeagues: WipeStage[] = [
      { collection: 'seasons', scope: 'league', label: 'seasons' },
    ];
    expect(leagueScopedStagesComeFirst(noLeagues)).toBe(false);
  });

  it('covers every collection a director owns', () => {
    expect(DELETION_ORDER.map(s => s.collection).sort()).toEqual([
      'activeTournaments',
      'completedTournaments',
      'leaguePlayers',
      'leagueSettings',
      'leagues',
      'seasons',
      'tournamentResults',
      'tournamentTemplates',
    ]);
  });

  it('never touches users, which holds the subscription', () => {
    // Read-only to clients by rule, and written only by the Stripe webhook.
    // Clearing tournament history must not clear what someone has paid for.
    expect(DELETION_ORDER.some(s => s.collection === 'users')).toBe(false);
  });
});

describe('chunk', () => {
  it('splits at Firestore\'s batch limit', () => {
    expect(MAX_BATCH).toBe(500);
    const chunks = chunk(Array.from({ length: 1201 }, (_, i) => i));
    expect(chunks.map(c => c.length)).toEqual([500, 500, 201]);
  });

  it('leaves a short list in one piece', () => {
    expect(chunk([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it('returns nothing for nothing, rather than one empty batch', () => {
    expect(chunk([])).toEqual([]);
  });

  it('refuses a zero size instead of looping forever', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('describeWipe', () => {
  it('reads as a sentence', () => {
    expect(describeWipe({ leagues: 3, tournamentResults: 41, activeTournaments: 18 }))
      .toBe('41 results, 3 leagues and 18 saved games');
  });

  it('says one of a thing in the singular', () => {
    expect(describeWipe({ leagues: 1 })).toBe('1 league');
  });

  it('leaves out what is not there, so the real numbers stand out', () => {
    expect(describeWipe({ leagues: 2, seasons: 0 })).toBe('2 leagues');
  });

  it('says so plainly when there is nothing to delete', () => {
    expect(describeWipe({})).toBe('nothing — this account has no saved data');
  });
});
