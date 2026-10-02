import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ResultsTable from './ResultsTable';
import { resultRowsFor, type ResultPlayerLike } from '@/lib/resultRows';

/**
 * The screen table's own assertions are in `PlayerSectionReadOnly.test.tsx` and
 * `resultColumns.test.ts`. What is pinned here is the one thing that was
 * REPORTED about it: the rank treatment, which was the only solid colour block
 * in an app of 10% fills.
 */
const rows = (players: ResultPlayerLike[]) =>
  resultRowsFor(players, {
    prizeStructure: { buyIn: 10, manualPayouts: [{ position: 1, percentage: 100 }] } as any,
  });

const ranks = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-rank-label]')) as HTMLElement[];

describe('ResultsTable', () => {
  const finished: ResultPlayerLike[] = [
    { id: '1', name: 'Dan', isActive: false, position: 1 },
    { id: '2', name: 'Amy', isActive: false, position: 2 },
    { id: '3', name: 'Cass', isActive: false, position: 3 },
    { id: '4', name: 'Eve', isActive: false, position: 21 },
  ];

  /**
   * THE MUTANT THAT PUTS THE BADGE BACK: `bg-yellow-500 text-black` and
   * friends. A filled block was the loudest thing on the page, attached to the
   * least interesting fact in the row, in a vocabulary that is otherwise a 10%
   * fill and a 30% border everywhere else.
   */
  it('marks a place with ink, never with a fill', () => {
    const { container } = render(<ResultsTable rows={rows(finished)} />);
    const cells = ranks(container);
    expect(cells).toHaveLength(4);
    cells.forEach(el => {
      expect(el.className).not.toMatch(/\bbg-/);
      expect(el.style.background).toBe('');
      expect(el.className).toContain('font-mono');
    });
  });

  // The Payouts panel's own three colours, so one screen cannot say two things
  // about first place. Everything below the podium is the muted ink.
  it('uses the podium colours the Payouts panel already uses', () => {
    const { container } = render(<ResultsTable rows={rows(finished)} />);
    const [first, second, third, fourth] = ranks(container);
    expect(first.className).toContain('text-yellow-400');
    expect(second.className).toContain('text-gray-300');
    expect(third.className).toContain('text-amber-600');
    expect(fourth.className).toContain('text-muted-foreground');
  });

  // Weight is the second half of the marking, which is what lets the colours be
  // this quiet. 500 and 700 are the only weights the mono face is loaded at.
  it('marks the podium by weight as well, and nobody else', () => {
    const { container } = render(<ResultsTable rows={rows(finished)} />);
    expect(ranks(container).map(el => el.style.fontWeight)).toEqual(['700', '700', '700', '500']);
  });

  // `Active` is the one label that is a word rather than a place, and it takes
  // the app's single accent rather than a sixth green.
  it('gives somebody still in the accent rather than a green block', () => {
    const { container } = render(
      <ResultsTable rows={rows([{ id: '1', name: 'Zoe', isActive: true }])} />,
    );
    const [live] = ranks(container);
    expect(live.textContent).toBe('Active');
    expect(live.className).toContain('text-primary');
    expect(live.style.fontWeight).toBe('500');
  });
});
