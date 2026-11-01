import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BlindGeneratorDialog from './BlindGeneratorDialog';
import type { Chip } from '@/lib/chipSet';

const props = {
  open: true, onOpenChange: () => {}, startingStack: 10000, players: 12,
  chipSet: undefined as Chip[] | undefined, bigBlindAnte: false,
};

describe('BlindGeneratorDialog', () => {
  it('previews a structure and hands exactly that to Use', () => {
    const onApply = vi.fn();
    render(<BlindGeneratorDialog {...props} onApply={onApply} />);
    expect(screen.getByTestId('finish-estimate').textContent).toMatch(/h/);
    const preview = screen.getByTestId('generated-levels');
    expect(within(preview).getByText('50/100')).toBeTruthy();
    fireEvent.click(screen.getByText('Use this structure'));
    const levels = onApply.mock.calls[0][0];
    expect(levels[0]).toMatchObject({ small: 50, big: 100 });
    expect(levels.some((l: any) => l.isBreak)).toBe(true);
  });

  it('builds from the smallest chip in the set', () => {
    const onApply = vi.fn();
    const chips: Chip[] = [{ colour: 'White', value: 100 }, { colour: 'Green', value: 500 }];
    render(<BlindGeneratorDialog {...props} chipSet={chips} onApply={onApply} />);
    fireEvent.click(screen.getByText('Use this structure'));
    for (const l of onApply.mock.calls[0][0]) expect(l.small % 100).toBe(0);
  });

  it('shows colour-ups in the preview when there is a chip set', () => {
    const chips: Chip[] = [{ colour: 'Red', value: 25 }, { colour: 'White', value: 100 }, { colour: 'Black', value: 1000 }];
    render(<BlindGeneratorDialog {...props} chipSet={chips} onApply={() => {}} />);
    expect(screen.getByTestId('generated-levels').textContent).toContain('Colour up the 25s (Red)');
  });
});
