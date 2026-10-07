import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/liveGameWrite', () => ({ writeLiveGame: vi.fn(async () => 'written') }));

import TablesSection from './TablesSection';

/**
 * October audit, Low: the Seating tab drew at most six tables while the
 * Tables field allows twenty, and lowering Tables or Seats/Table mid-game
 * stranded whoever was sitting in a chair it removed.
 */
const seated = (id: string, t: number, s: number) =>
  ({ id, name: id.toUpperCase(), isActive: true, seated: true, knockouts: 0, tableAssignment: { tableIndex: t, seatIndex: s } });

function harness(players: any[], tables: { numberOfTables: number; seatsPerTable: number }) {
  const updatePlayers = vi.fn();
  const updateSettings = vi.fn();
  const tournament: any = {
    state: {
      players, levels: [{ small: 1, big: 2, duration: 600 }], currentLevel: 0,
      settings: { tables: { ...tables, tableNames: Array.from({ length: tables.numberOfTables }, (_, i) => `Table ${i + 1}`) } },
      prizeStructure: { buyIn: 10, manualPayouts: [] },
      details: {},
    },
    updatePlayers, updateSettings,
    addKnockout: vi.fn(), eliminatePlayer: vi.fn(), undoBustOut: vi.fn(),
    processRebuy: vi.fn(), processReEntry: vi.fn(),
    shouldPromptForFinalTable: () => false, goToFinalTable: vi.fn(), breakTable: vi.fn(), tableBreakDue: () => null,
  };
  render(<TablesSection tournament={tournament} />);
  return { updatePlayers, updateSettings };
}

describe('TablesSection', () => {
  it('draws every table, not the first six', () => {
    harness([seated('a', 7, 0)], { numberOfTables: 8, seatsPerTable: 6 });
    expect(screen.getByText('Table 8')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.queryByText(/more tables/)).toBeNull();
  });

  it('asks before lowering Tables strands somebody, and moves only them', () => {
    const h = harness([seated('a', 0, 0), seated('b', 1, 0)], { numberOfTables: 2, seatsPerTable: 4 });
    const field = screen.getByLabelText('Tables');
    fireEvent.change(field, { target: { value: '1' } });
    fireEvent.blur(field);
    expect(h.updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/1 player is sitting where this removes a seat/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Change and move them' }));
    const moved = h.updatePlayers.mock.calls.at(-1)![0];
    expect(moved.find((p: any) => p.id === 'a').tableAssignment).toEqual({ tableIndex: 0, seatIndex: 0 });
    expect(moved.find((p: any) => p.id === 'b').tableAssignment.tableIndex).toBe(0);
    expect(h.updateSettings.mock.calls.at(-1)![0].tables.numberOfTables).toBe(1);
  });

  it('changes nothing on Cancel', () => {
    const h = harness([seated('a', 0, 5)], { numberOfTables: 1, seatsPerTable: 8 });
    const field = screen.getByLabelText('Seats / Table');
    fireEvent.change(field, { target: { value: '4' } });
    fireEvent.blur(field);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.updatePlayers).not.toHaveBeenCalled();
    expect(h.updateSettings).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe('8');
  });

  it('saves straight away when nobody is stranded', () => {
    const h = harness([seated('a', 0, 0)], { numberOfTables: 3, seatsPerTable: 6 });
    const field = screen.getByLabelText('Tables');
    fireEvent.change(field, { target: { value: '2' } });
    fireEvent.blur(field);
    expect(h.updateSettings.mock.calls.at(-1)![0].tables.numberOfTables).toBe(2);
  });
});
