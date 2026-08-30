import { describe, it, expect } from 'vitest';
import { eventNameOf } from './eventName';

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
