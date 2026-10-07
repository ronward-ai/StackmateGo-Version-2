import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Stable values: a fresh array per render re-runs PlayerSection's effects for
// ever, which is a fault of the mock, not of the component.
const recent = { recentPlayers: [], add: () => {}, remove: () => {} };
const scoring = { calculatePoints: () => 0 };
vi.mock('@/hooks/useRecentPlayers', () => ({ useRecentPlayers: () => recent }));
vi.mock('@/hooks/useLeagueSettings', () => ({ useLeagueSettings: () => scoring }));
vi.mock('@/components/export/captureSheet', () => ({ captureSheet: vi.fn(), sheetFilename: () => 'x.png' }));

import PlayerSection from './PlayerSection';

/**
 * The Players tab's add and seat paths (October audit, coverage): one gate for
 * adding a player, a finished game that takes no entries, and a seating that
 * asks rather than inventing chairs.
 */
const p = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), isActive: true, knockouts: 0, ...over });

function harness(players: any[], prizeStructure: any = { buyIn: 10, manualPayouts: [] }, currentLevel = 0) {
  const addPlayer = vi.fn();
  const updatePlayers = vi.fn();
  const updateSettings = vi.fn();
  const tournament: any = {
    state: {
      players, prizeStructure, currentLevel,
      levels: Array.from({ length: 10 }, () => ({ small: 1, big: 2, duration: 600 })),
      settings: { tables: { numberOfTables: 1, seatsPerTable: 2, tableNames: ['Table 1'] } },
      details: {},
    },
    addPlayer, updatePlayers, updateSettings,
    removePlayer: vi.fn(), eliminatePlayer: vi.fn(), processRebuy: vi.fn(), processReEntry: vi.fn(),
    processAddon: vi.fn(), undoBustOut: vi.fn(), undoPlayerReturn: vi.fn(),
  };
  render(<PlayerSection tournament={tournament} />);
  return { addPlayer, updatePlayers, updateSettings };
}

const typeAndAdd = (name: string) => {
  fireEvent.change(screen.getByPlaceholderText('Enter player name...'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
};

describe('PlayerSection', () => {
  it('adds a player, and ignores a name already in the game', () => {
    const h = harness([p('amy')]);
    typeAndAdd('Bob');
    typeAndAdd('  amy ');
    expect(h.addPlayer).toHaveBeenCalledTimes(1);
    expect(h.addPlayer.mock.calls[0][0]).toBe('Bob');
  });

  it('warns once late entry has closed, and adds only on confirm', () => {
    const h = harness([p('amy')], { buyIn: 10, lateEntryLevels: 2, manualPayouts: [] }, 5);
    typeAndAdd('Late');
    expect(h.addPlayer).not.toHaveBeenCalled();
    expect(screen.getByText('Late entry has closed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /add anyway|add them|add/i, hidden: false }));
    expect(h.addPlayer).toHaveBeenCalledWith('Late');
  });

  it('offers no way to add a player to a finished game', () => {
    harness([p('amy', { isActive: false, position: 1 }), p('bob', { isActive: false, position: 2 })]);
    expect(screen.queryByPlaceholderText('Enter player name...')).toBeNull();
    expect(screen.getByText(/This game is over/)).toBeTruthy();
  });

  it('asks rather than seating more players than there are chairs', () => {
    const h = harness([p('a'), p('b'), p('c')]);
    fireEvent.click(screen.getByRole('button', { name: 'Seat Players' }));
    expect(screen.getByText('More players than seats')).toBeTruthy();
    expect(h.updatePlayers).not.toHaveBeenCalled();
  });
});
