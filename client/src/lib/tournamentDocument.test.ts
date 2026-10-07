import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));

import { buildTournamentDocument } from './tournamentDocument';
import { eventNameOf, eventNameOfTournament } from './eventName';

/**
 * October audit, M18: creation must write the director's own branding and
 * never a resolved name. It froze the league's name at creation into
 * `branding.leagueName`, which reads back as an EXPLICIT event name — so the
 * console's Event Name field showed it, and a league rename never reached the
 * app bar or any player's phone.
 */
function state(branding: Record<string, unknown>) {
  return {
    currentLevel: 0, secondsLeft: 900, isRunning: false, players: [], levels: [],
    details: { localGameId: 'g1' },
    prizeStructure: { buyIn: 10, manualPayouts: [] },
    settings: { isSeasonTournament: true, leagueId: 'L1', branding },
  } as any;
}

describe('buildTournamentDocument branding', () => {
  it('writes no name the director did not type', () => {
    const doc = buildTournamentDocument(state({ leagueName: '', isVisible: true }), 'u1');
    expect(doc.settings.branding.eventName).toBeUndefined();
    expect(doc.settings.branding.leagueName || '').toBe('');
    // What the console's Event Name field would show after the snapshot merges back.
    expect(eventNameOf(doc.settings, null)).toBe('');
  });

  it('lets a league rename reach players', () => {
    const doc = buildTournamentDocument(state({}), 'u1');
    expect(eventNameOfTournament(doc as any, 'Renamed League')).toBe('Renamed League');
  });

  it('keeps an event name the director did type, and the logo', () => {
    const doc = buildTournamentDocument(state({ eventName: 'Friday Night', logoUrl: 'data:x' }), 'u1');
    expect(eventNameOfTournament(doc as any, 'Renamed League')).toBe('Friday Night');
    expect(doc.settings.branding.logoUrl).toBe('data:x');
    expect(doc.settings.branding.isVisible).toBe(true);
  });
});
