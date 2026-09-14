import { describe, it, expect } from 'vitest';
import { defaultSettingsDocId } from './leagueSettingsId';

describe('defaultSettingsDocId', () => {
  it('combines the owner and league', () => {
    expect(defaultSettingsDocId('director-1', 'league-9')).toBe('director-1_league-9');
  });

  it('uses a stable sentinel for a standalone (no-league) game', () => {
    expect(defaultSettingsDocId('director-1', null)).toBe('director-1_standalone');
    expect(defaultSettingsDocId('director-1', undefined)).toBe('director-1_standalone');
  });

  it('treats an empty-string leagueId the same as absent', () => {
    // A falsy-but-present leagueId must not produce a different id from a
    // genuinely absent one, or a director's default settings could split
    // across two ids depending on which falsy shape happened to be passed.
    expect(defaultSettingsDocId('director-1', '')).toBe(defaultSettingsDocId('director-1', null));
  });

  it('is stable and deterministic — same inputs, same id, every time', () => {
    const a = defaultSettingsDocId('director-1', 'league-9');
    const b = defaultSettingsDocId('director-1', 'league-9');
    expect(a).toBe(b);
  });

  it('different leagues for the same director get different ids', () => {
    expect(defaultSettingsDocId('director-1', 'league-9'))
      .not.toBe(defaultSettingsDocId('director-1', 'league-10'));
  });

  it('the same league for different directors gets different ids', () => {
    expect(defaultSettingsDocId('director-1', 'league-9'))
      .not.toBe(defaultSettingsDocId('director-2', 'league-9'));
  });
});
