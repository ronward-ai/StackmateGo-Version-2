import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * October audit, H5: while the console's game is recording into the selected
 * league, Manage League must not offer to switch it. Not mounted, not disabled.
 */
vi.mock('@/hooks/useLeague', () => ({
  useLeague: () => ({
    league: { id: 'A', name: 'Thursday' },
    userLeagues: [{ id: 'A', name: 'Thursday' }, { id: 'B', name: 'Sunday' }],
    switchLeague: vi.fn(), createLeague: vi.fn(), renameLeague: vi.fn(),
  }),
}));

import LeagueScopeBar from './LeagueScopeBar';

describe('LeagueScopeBar', () => {
  it('offers the league picker and New when nothing is being recorded', () => {
    render(<LeagueScopeBar />);
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByRole('button', { name: /new/i })).toBeTruthy();
  });

  it('takes both away while a game is recording, and says why', () => {
    render(<LeagueScopeBar lockReason="Tonight's game is recording results into Thursday." />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /new/i })).toBeNull();
    expect(screen.getByText(/recording results into Thursday/)).toBeTruthy();
    // Renaming changes no results, so it stays.
    expect(screen.getByRole('button', { name: /rename/i })).toBeTruthy();
  });
});
