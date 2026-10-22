import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/components/export/captureSheet', () => ({ captureSheet: vi.fn(), sheetFilename: () => 'x.png' }));
vi.mock('@/hooks/useLeagueSettings', () => ({ useLeagueSettings: () => ({ calculatePoints: () => 0 }) }));

import { FinishedGameExports } from './ResultsExport';

/**
 * Reported after game 3: on the phone, watching, the night's pictures could only
 * be had by pressing Take control — the read-only Players tab had no exports.
 */
const game = (over: boolean) => ({
  players: [
    { id: 'a', name: 'Amy', isActive: !over, position: over ? 1 : 0 },
    { id: 'b', name: 'Bob', isActive: false, position: 2 },
  ],
  prizeStructure: { buyIn: 10, manualPayouts: [] },
  settings: {},
  details: { type: 'database' },
});

describe('a watching device can export a finished game', () => {
  it('offers Image and CSV once the game is over', () => {
    render(<FinishedGameExports game={game(true)} />);
    expect(screen.getByRole('button', { name: 'Image' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeTruthy();
  });

  it('offers nothing while it is still being played, as the console itself does', () => {
    render(<FinishedGameExports game={game(false)} />);
    expect(screen.queryByRole('button', { name: 'Image' })).toBeNull();
  });
});
