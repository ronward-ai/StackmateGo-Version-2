import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ResultColumnsPicker from './ResultColumnsPicker';
import type { ColumnContext } from '@/lib/resultColumns';

/**
 * The reported bug was that the arrows "aren't working", and they were — the
 * stored order changed and the table reordered. **What never moved was this
 * list**, because its rows were rendered in canonical order whatever the
 * director had chosen. So there was no feedback at all and the control read as
 * dead.
 *
 * Which is why these tests assert the RENDERED ROW ORDER rather than the value
 * handed to `onChange`. A test on `onChange` alone passes against the exact bug
 * that was shipped.
 */

const ALL: ColumnContext = {
  prizeStructure: {
    enableBounties: true, allowRebuys: true, allowReEntry: true, allowAddons: true,
  },
  isLeagueMode: true,
};

/** Controlled, because the fault was in what re-rendering did (or did not) show. */
function Harness({ initial, context = ALL, onChange }: {
  initial?: string[]; context?: ColumnContext; onChange?: (v: string[]) => void;
}) {
  const [value, setValue] = useState<string[] | undefined>(initial);
  return (
    <ResultColumnsPicker
      value={value}
      context={context}
      onChange={next => { setValue(next); onChange?.(next); }}
    />
  );
}

/** The keys as the list actually draws them, top to bottom. */
const renderedOrder = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid^="col-row-"]'))
    .map(el => el.getAttribute('data-testid')!.replace('col-row-', ''));

const up = (label: string) => screen.getByLabelText(`Move ${label} up`);
const down = (label: string) => screen.getByLabelText(`Move ${label} down`);

describe('ResultColumnsPicker', () => {
  // THE REPORTED BUG. Rows were rendered from the canonical list, so the order
  // the director had chosen was never on screen at all.
  it('lists the chosen columns in the order the table will use them', () => {
    const { container } = render(<Harness initial={['won', 'knockouts', 'invested']} />);
    expect(renderedOrder(container).slice(0, 3)).toEqual(['won', 'knockouts', 'invested']);
  });

  // THE MUTANT: render from canonical order again. Only an assertion on the DOM
  // catches it — `onChange` was always given the right array.
  it('MOVES THE ROW when the up arrow is pressed', () => {
    const { container } = render(<Harness initial={['won', 'knockouts', 'invested']} />);
    fireEvent.click(up('Hits'));
    expect(renderedOrder(container).slice(0, 3)).toEqual(['knockouts', 'won', 'invested']);
  });

  it('moves the row back down again', () => {
    const { container } = render(<Harness initial={['won', 'knockouts', 'invested']} />);
    fireEvent.click(down('Won'));
    expect(renderedOrder(container).slice(0, 3)).toEqual(['knockouts', 'won', 'invested']);
  });

  it('still reports the new order to its caller', () => {
    const onChange = vi.fn();
    render(<Harness initial={['won', 'knockouts']} onChange={onChange} />);
    fireEvent.click(up('Hits'));
    expect(onChange).toHaveBeenCalledWith(['knockouts', 'won']);
  });

  // The disabled states used to be computed off an index into the director's
  // order while the row sat in canonical order, so the top row's arrow could
  // work and a lower row's be dead.
  it('disables the arrows at the ends, and only at the ends', () => {
    render(<Harness initial={['won', 'knockouts', 'invested']} />);
    expect((up('Won') as HTMLButtonElement).disabled).toBe(true);
    expect((down('Won') as HTMLButtonElement).disabled).toBe(false);
    expect((up('Invested') as HTMLButtonElement).disabled).toBe(false);
    expect((down('Invested') as HTMLButtonElement).disabled).toBe(true);
    expect((up('Hits') as HTMLButtonElement).disabled).toBe(false);
    expect((down('Hits') as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers no arrows on a column that is not shown', () => {
    render(<Harness initial={['won']} />);
    expect(screen.queryByLabelText('Move Profit up')).toBeNull();
    expect(screen.getByText('Not shown')).toBeTruthy();
  });

  it('switches a column on and off', () => {
    const { container } = render(<Harness initial={['won']} />);
    fireEvent.click(screen.getByLabelText('Move Won up')); // no-op at the end
    fireEvent.click(container.querySelector('#col-profit')!);
    expect(renderedOrder(container).slice(0, 2)).toEqual(['won', 'profit']);
    fireEvent.click(container.querySelector('#col-won')!);
    expect(renderedOrder(container)[0]).toBe('profit');
  });

  /**
   * THE SILENT ONE. The picker used to write back the FEATURE-FILTERED list, so
   * pressing an arrow in a game with bounties switched off removed the bounty
   * keys from the stored order for good — turn bounties back on later and the
   * columns were gone, with nothing having said so.
   */
  it('keeps a column whose feature is off through a reorder', () => {
    const onChange = vi.fn();
    const noBounties: ColumnContext = { prizeStructure: { allowRebuys: true }, isLeagueMode: true };
    render(
      <Harness initial={['bounties', 'knockouts', 'rebuys']} context={noBounties} onChange={onChange} />,
    );
    // Bounties cannot be drawn in this game, so it is not even a row.
    expect(screen.queryByLabelText('Move Bounties up')).toBeNull();
    fireEvent.click(down('Hits'));
    expect(onChange).toHaveBeenCalledWith(['bounties', 'rebuys', 'knockouts']);
  });

  /**
   * And the hazard that preserving them creates: a swap must not trade places
   * with a key nobody can see, or the press does nothing visible — the league
   * picker's own fault, which steps through its hidden keys.
   */
  it('skips past a hidden key rather than swapping with it', () => {
    const { container } = render(
      <Harness
        initial={['knockouts', 'bounties', 'rebuys']}
        context={{ prizeStructure: { allowRebuys: true }, isLeagueMode: true }}
      />,
    );
    expect(renderedOrder(container).slice(0, 2)).toEqual(['knockouts', 'rebuys']);
    fireEvent.click(up('Rebuys'));
    // One press, one visible move — not a press that lands on the invisible
    // bounty key and appears to do nothing.
    expect(renderedOrder(container).slice(0, 2)).toEqual(['rebuys', 'knockouts']);
  });

  it('starts from the default set when nothing is stored', () => {
    const { container } = render(<Harness />);
    expect(renderedOrder(container).length).toBeGreaterThan(0);
    expect(renderedOrder(container)[0]).toBe('knockouts');
  });
});
