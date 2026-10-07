import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BustOutDialog from './BustOutDialog';

/**
 * October audit, Low: the Seating tab's bust-out offered only the player's own
 * table, so a lone player there could never be knocked out.
 */
const p = (id: string, name: string, table: number, over: Record<string, unknown> = {}) =>
  ({ id, name, isActive: true, seated: true, knockouts: 0, tableAssignment: { tableIndex: table, seatIndex: 0 }, ...over }) as any;

describe('BustOutDialog', () => {
  it('knocks out a lone player at a table, credited to somebody at another', () => {
    const onConfirm = vi.fn();
    const lone = p('lone', 'Lone', 1);
    render(<BustOutDialog open onOpenChange={() => {}} player={lone}
      players={[lone, p('a', 'Amy', 0), p('b', 'Bob', 0)]} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Bob'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm KO' }));
    expect(onConfirm).toHaveBeenCalledWith('b');
  });

  it('picks the only possible hitman heads-up across two tables', () => {
    const onConfirm = vi.fn();
    const amy = p('a', 'Amy', 0);
    render(<BustOutDialog open onOpenChange={() => {}} player={amy}
      players={[amy, p('b', 'Bob', 1)]} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm KO' }));
    expect(onConfirm).toHaveBeenCalledWith('b');
  });

  it('finishes the tournament for the last player standing', () => {
    const onConfirm = vi.fn();
    const amy = p('a', 'Amy', 0);
    render(<BustOutDialog open onOpenChange={() => {}} player={amy}
      players={[amy, p('b', 'Bob', 0, { isActive: false, position: 2 })]} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Finish Tournament' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
