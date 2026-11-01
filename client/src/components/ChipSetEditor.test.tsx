import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChipSetEditor from './ChipSetEditor';
import type { Chip } from '@/lib/chipSet';

const set: Chip[] = [
  { colour: 'Red', value: 25, count: 100 },
  { colour: 'White', value: 100, count: 200 },
  { colour: 'Green', value: 500, count: 100 },
  { colour: 'Black', value: 1000, count: 100 },
];

describe('ChipSetEditor', () => {
  it('shows how a starting stack is made, and how many stacks the chips make', () => {
    render(<ChipSetEditor chipSet={set} onChange={() => {}} startingStack={10000} defaultPlayers={10} />);
    const box = screen.getByTestId('stack-breakdown');
    expect(box.textContent).toContain('8 × 25');
    expect(box.textContent).toContain('6 × 1,000');
    expect(box.textContent).toContain('Enough for 12 stacks');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns when the field needs more stacks than the chips make', () => {
    render(<ChipSetEditor chipSet={set} onChange={() => {}} startingStack={10000} defaultPlayers={14} />);
    expect(screen.getByRole('alert').textContent).toContain('12 starting stacks — 14 needed');
  });

  it('says so when the stack cannot be made from these chips', () => {
    render(<ChipSetEditor chipSet={set} onChange={() => {}} startingStack={10010} defaultPlayers={10} />);
    expect(screen.getByTestId('stack-breakdown').textContent).toContain("can't be made exactly");
  });

  it('adds the next chip up, and removes one', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ChipSetEditor chipSet={set} onChange={onChange} startingStack={10000} defaultPlayers={10} />);
    fireEvent.click(screen.getByText('Add chip'));
    expect(onChange.mock.calls[0][0][4]).toMatchObject({ value: 5000 });
    fireEvent.click(screen.getByLabelText('Remove Red chip'));
    expect(onChange.mock.calls[1][0].map((c: Chip) => c.value)).toEqual([100, 500, 1000]);
    rerender(<ChipSetEditor chipSet={[]} onChange={onChange} startingStack={10000} defaultPlayers={10} />);
    expect(screen.queryByTestId('stack-breakdown')).toBeNull();
  });

  it('a blank count means "not counted", not zero', () => {
    const onChange = vi.fn();
    render(<ChipSetEditor chipSet={set} onChange={onChange} startingStack={10000} defaultPlayers={10} />);
    const counts = screen.getAllByLabelText('How many you own');
    fireEvent.change(counts[0], { target: { value: '' } });
    fireEvent.blur(counts[0]);
    expect(onChange.mock.calls[0][0][0].count).toBeUndefined();
  });
});
