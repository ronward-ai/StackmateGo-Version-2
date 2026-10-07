import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FinalTablePrompt from './FinalTablePrompt';

/**
 * The prompt's read-only behaviour (October audit, coverage): it stays mounted
 * on a console that is not driving so it can WATCH, latching the question as
 * already seen — so taking control does not ambush the director with a dialog
 * about a bust-out that happened on the other device — and it asks again the
 * moment the field changes.
 */
const roster = (active: number, busted: number) => [
  ...Array.from({ length: active }, (_, i) => ({ id: `a${i}`, name: `A${i}`, isActive: true })),
  ...Array.from({ length: busted }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isActive: false, position: active + busted - i })),
];

function tournament(players: any[], due = true) {
  return {
    state: { players, settings: { tables: { numberOfTables: 2, seatsPerTable: 8 } } },
    shouldPromptForFinalTable: () => due,
    goToFinalTable: vi.fn(),
    tableBreakDue: () => null,
    tableToBreak: () => null,
    breakTable: vi.fn(),
  } as any;
}

const dialogUp = () => screen.queryByRole('dialog') !== null;

describe('FinalTablePrompt', () => {
  it('asks when the final table is due on the driving console', () => {
    render(<FinalTablePrompt tournament={tournament(roster(8, 1))} />);
    expect(dialogUp()).toBe(true);
  });

  it('says nothing while read-only', () => {
    render(<FinalTablePrompt tournament={tournament(roster(8, 1))} readOnly />);
    expect(dialogUp()).toBe(false);
  });

  it('does not open the instant control is taken, about a question it only watched', () => {
    const t = tournament(roster(8, 1));
    const r = render(<FinalTablePrompt tournament={t} readOnly />);
    r.rerender(<FinalTablePrompt tournament={t} readOnly={false} />);
    expect(dialogUp()).toBe(false);
  });

  it('asks again once the field changes after the takeover', () => {
    const r = render(<FinalTablePrompt tournament={tournament(roster(8, 1))} readOnly />);
    r.rerender(<FinalTablePrompt tournament={tournament(roster(8, 1))} readOnly={false} />);
    r.rerender(<FinalTablePrompt tournament={tournament(roster(7, 2))} readOnly={false} />);
    expect(dialogUp()).toBe(true);
  });

  it('stands down while the rebuy offer is up', () => {
    render(<FinalTablePrompt tournament={tournament(roster(8, 1))} standDown />);
    expect(dialogUp()).toBe(false);
  });
});
