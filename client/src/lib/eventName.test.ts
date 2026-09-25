import { describe, it, expect } from 'vitest';
import { eventNameOf, eventNameOfTournament } from './eventName';

describe('eventNameOf', () => {
  it('uses the event name when set', () => {
    expect(eventNameOf({ branding: { eventName: 'Friday Night Poker' } } as any)).toBe('Friday Night Poker');
  });

  it('reads the old leagueName key for existing tournaments', () => {
    // Back-compat: tournaments saved before the rename still have this key.
    expect(eventNameOf({ branding: { leagueName: 'Old Event' } } as any)).toBe('Old Event');
  });

  it('prefers the new key when both are present', () => {
    expect(eventNameOf({ branding: { eventName: 'New', leagueName: 'Old' } } as any)).toBe('New');
  });

  it('falls back to the league name in league mode when no event name is set', () => {
    // This is what makes renaming the league visibly change the header.
    expect(eventNameOf({ isSeasonTournament: true, branding: {} } as any, 'Kings Head League'))
      .toBe('Kings Head League');
  });

  it('does NOT fall back to the league name for a standalone tournament', () => {
    // A standalone game is not part of the league, so borrowing its name would
    // be wrong.
    expect(eventNameOf({ isSeasonTournament: false, branding: {} } as any, 'Kings Head League')).toBe('');
  });

  it('an explicit event name still wins in league mode', () => {
    expect(eventNameOf(
      { isSeasonTournament: true, branding: { eventName: 'Xmas Special' } } as any,
      'Kings Head League',
    )).toBe('Xmas Special');
  });

  it('treats whitespace as unset', () => {
    expect(eventNameOf({ isSeasonTournament: true, branding: { eventName: '   ' } } as any, 'League')).toBe('League');
    expect(eventNameOf({ branding: { eventName: '   ' } } as any)).toBe('');
  });

  it('handles missing settings entirely', () => {
    expect(eventNameOf(null)).toBe('');
    expect(eventNameOf(undefined, 'League')).toBe('');
    expect(eventNameOf({} as any)).toBe('');
  });
});

describe('eventNameOfTournament', () => {
  it('prefers the event name the director set over the stored document name', () => {
    // The whole bug: `name` is written once at creation and never again, so a
    // rename on the console reached nobody.
    expect(
      eventNameOfTournament({
        settings: { branding: { eventName: 'Kings Head Thursday' } } as any,
        name: 'Tournament 25/09/2026',
      }),
    ).toBe('Kings Head Thursday');
  });

  it('honours the legacy leagueName key on older documents', () => {
    expect(
      eventNameOfTournament({
        settings: { branding: { leagueName: 'Old Key League' } } as any,
        name: 'Tournament 01/01/2026',
      }),
    ).toBe('Old Key League');
  });

  it('falls back to the league in league mode', () => {
    expect(
      eventNameOfTournament(
        { settings: { isSeasonTournament: true } as any, name: 'Tournament 01/01/2026' },
        'Thursday League',
      ),
    ).toBe('Thursday League');
  });

  it('falls back to the stored name rather than nothing', () => {
    expect(eventNameOfTournament({ name: 'Tournament 25/09/2026' })).toBe('Tournament 25/09/2026');
    expect(eventNameOfTournament({ details: { name: 'From details' } })).toBe('From details');
  });

  it('returns empty so the caller owns the placeholder', () => {
    expect(eventNameOfTournament({})).toBe('');
    expect(eventNameOfTournament(null)).toBe('');
    expect(eventNameOfTournament(undefined)).toBe('');
  });
});
