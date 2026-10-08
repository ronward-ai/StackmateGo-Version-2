import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ResultsEditor from './ResultsEditor';

/**
 * The results editor's screen: a draft that touches nothing until Save, a Save
 * that refuses an impossible night, and knockouts that are counted, not typed.
 */
const players = [
  { id: 'a', name: 'Amy', knockouts: 0 },
  { id: 'b', name: 'Bob', knockouts: 0 },
  { id: 'c', name: 'Cat', rebuys: 1, knockouts: 0 },
  { id: 'd', name: 'Dan', knockouts: 1 }, // the stray hit from Cat's pre-rebuy bust
];

const open = (props: Partial<Parameters<typeof ResultsEditor>[0]> = {}) => {
  const onSave = vi.fn();
  render(<ResultsEditor players={players} onSave={onSave} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Edit results/ }));
  return onSave;
};
const place = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(`${name}'s place`), { target: { value } });
const hitman = (name: string, bust: number, id: string) =>
  fireEvent.change(screen.getByLabelText(`${name} bust ${bust} hitman`), { target: { value: id } });

describe('the results editor', () => {
  it('counts the stray hit out: KOs come from the busts, not the stored count', () => {
    open();
    const dan = document.querySelector('[data-row="Dan"]') as HTMLElement;
    expect(within(dan).getByText('0 KO')).toBeTruthy();
  });

  it('will not save two players in one place, and saves the night once it is right', () => {
    const onSave = open();
    const save = screen.getByRole('button', { name: 'Save results' }) as HTMLButtonElement;
    place('Dan', '4'); place('Cat', '4');
    expect(save.disabled).toBe(true);
    expect(screen.getByText('Two players have the same place.')).toBeTruthy();

    place('Cat', '3'); place('Bob', '2'); place('Amy', '1');
    hitman('Dan', 1, 'a');
    hitman('Cat', 1, 'b'); // the bust before the rebuy
    hitman('Cat', 2, 'b'); // the bust that put her out
    hitman('Bob', 1, 'a');
    expect(save.disabled).toBe(false);
    expect(within(document.querySelector('[data-row="Bob"]') as HTMLElement).getByText('2 KO')).toBeTruthy();

    fireEvent.click(save);
    const rows = onSave.mock.calls[0][0];
    expect(rows.find((r: any) => r.id === 'c').busts).toEqual([{ by: 'b', then: 'rebuy' }, { by: 'b', then: 'out' }]);
  });

  it('adds a missed rebuy before the final bust, and can take it away again', () => {
    open();
    const cat = document.querySelector('[data-row="Cat"]') as HTMLElement;
    fireEvent.click(within(cat).getByRole('button', { name: /Rebuy/ }));
    expect(within(cat).getAllByLabelText(/Cat bust \d hitman/)).toHaveLength(2);
    fireEvent.click(within(cat).getAllByRole('button', { name: "Remove Cat's rebuy" })[0]);
    expect(within(cat).getAllByLabelText(/Cat bust \d hitman/)).toHaveLength(1);
  });

  it('warns while the clock runs, and about busts with no hitman', () => {
    open({ isRunning: true });
    expect(screen.getByText(/clock is running/)).toBeTruthy();
    expect(screen.getByText(/1 bust has no hitman/)).toBeTruthy();
  });
});
