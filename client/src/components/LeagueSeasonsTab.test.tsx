import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Start Next Season leads here — the season set-up that already exists — with
 * the New Season form open, rather than creating a copy of the last season. The
 * form itself is untouched; this pins only that it can be opened straight onto.
 */
const h = vi.hoisted(() => ({ isPro: true }));

vi.mock('@/hooks/useLeague', () => ({
  useLeague: () => ({ league: { id: 'L1' }, setActiveSeason: vi.fn() }),
}));
vi.mock('@/hooks/useSeasons', () => ({
  useSeasons: () => ({
    seasons: [{ id: 's1', name: 'Spring 2026', numberOfGames: 12, status: 'completed' }],
    currentSeason: { id: 's1' },
    addSeason: vi.fn(), updateSeason: vi.fn(), deleteSeason: vi.fn(),
    formatSeasonDateRange: () => '',
  }),
}));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ isPro: h.isPro }) }));

import LeagueSeasonsTab from './LeagueSeasonsTab';

describe('LeagueSeasonsTab', () => {
  it('opens on the New Season form when Start Next Season sent the director here', () => {
    render(<LeagueSeasonsTab startNew />);
    expect(screen.getByText('Create Season')).toBeTruthy();
    expect(screen.queryByText('New Season')).toBeNull();
  });

  it('opens on the season list as it always has otherwise', () => {
    render(<LeagueSeasonsTab />);
    expect(screen.getByText('New Season')).toBeTruthy();
    expect(screen.queryByText('Create Season')).toBeNull();
  });

  // Gated exactly as the New Season button is.
  it('does not open the form for an account that cannot create seasons', () => {
    h.isPro = false;
    render(<LeagueSeasonsTab startNew />);
    expect(screen.queryByText('Create Season')).toBeNull();
    h.isPro = true;
  });
});
