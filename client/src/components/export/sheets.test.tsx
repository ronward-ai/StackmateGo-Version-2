import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResultsSheet from './ResultsSheet';
import StandingsSheet, { type StandingsSheetRow } from './StandingsSheet';
import { resultRowsFor, type ResultPlayerLike } from '@/lib/resultRows';
import { RANK_INK, SHEET } from './exportStyle';

/**
 * What the two exported images actually say.
 *
 * Neither export had a test of any kind, which is how the results PNG came to be
 * the only place in the app spelling an ordinal correctly while the screen beside
 * it said "21th" — and how the standings PNG came to stripe its rows in the very
 * colour it filled its own canvas with.
 */

const PRIZE = { buyIn: 10, allowRebuys: true, manualPayouts: [{ position: 1, percentage: 100 }] };

const rowsFor = (players: ResultPlayerLike[]) => resultRowsFor(players, { prizeStructure: PRIZE });

/** The sheet under test, with the columns a game would actually show. */
const results = (props: any) => (
  <ResultsSheet
    settings={{ resultColumns: ['knockouts', 'rebuys', 'won'], currency: '£' }}
    columnContext={{ prizeStructure: PRIZE }}
    currencySymbol="£"
    {...props}
  />
);

describe('ResultsSheet', () => {
  const rows = rowsFor([
    { id: '1', name: 'Dan', isActive: false, position: 1, knockouts: 3 },
    { id: '2', name: 'Amy', isActive: false, position: 2 },
    { id: '3', name: 'Cass', isActive: false, position: 21 },
  ]);

  it('names every place with a real ordinal', () => {
    render(results({ title: 'Thursday Night', rows }));
    expect(screen.getByText('1st')).toBeTruthy();
    expect(screen.getByText('2nd')).toBeTruthy();
    // The one the screen got wrong for as long as this export got it right.
    expect(screen.getByText('21st')).toBeTruthy();
    expect(screen.queryByText('21th')).toBeNull();
  });

  it('inks the print medals, which are not the screen medals', () => {
    const { container } = render(results({ title: 'Thursday Night', rows }));
    const first = screen.getByText('1st') as HTMLElement;
    expect(first.style.color).toBe('rgb(232, 179, 60)');
    // THE MUTANT THAT PUTS THE BOX BACK. A filled block was the only solid
    // colour surface in either image, and the one thing reported about these.
    expect(first.style.background).toBe('');
    // A lookup on a named tone, so an active player's position of 0 can never
    // fall in with the medals the way `position <= 2 ? black : white` let it.
    expect(RANK_INK.active).not.toBe(RANK_INK.gold);
    expect(container.textContent).toContain('Dan');
  });

  // COLUMNS, not chips. Every row has the same shape, which is the whole reason
  // the standings read better than the strip this replaced.
  it('prints the chosen columns as a header, once, with figures under them', () => {
    render(results({ title: 'Thursday Night', rows }));
    expect(screen.getByText("KO's")).toBeTruthy();
    expect(screen.getByText('Rebuys')).toBeTruthy();
    expect(screen.getByText('Won')).toBeTruthy();
    expect(screen.getByText('£30')).toBeTruthy();
    // The header says KO once; it is not repeated against every player the way
    // a chip was.
    expect(screen.getAllByText("KO's")).toHaveLength(1);
  });

  it('draws no column for a feature this game switched off', () => {
    render(results({
      title: 'Thursday Night',
      rows,
      settings: { resultColumns: ['knockouts', 'bounties'], currency: '£' },
    }));
    expect(screen.queryByText('Bounties')).toBeNull();
  });

  it('frames the sheet with its title, and says what made it', () => {
    render(results({ title: 'Thursday Night', subtitle: 'Game 4 · 3 players', rows }));
    expect(screen.getByText('Thursday Night')).toBeTruthy();
    expect(screen.getByText('Game 4 · 3 players')).toBeTruthy();
    expect(screen.getByText('StackMate Go')).toBeTruthy();
  });

  it('calls somebody still in Active rather than giving them a place', () => {
    const live = rowsFor([
      { id: '1', name: 'Zoe', isActive: true },
      { id: '2', name: 'Amy', isActive: false, position: 2 },
    ]);
    render(results({ title: 'Thursday Night', rows: live }));
    expect(screen.getByText('Active')).toBeTruthy();
  });
});

describe('StandingsSheet', () => {
  const columns = ['Points', 'Games', 'Cash'];
  const rows: StandingsSheetRow[] = [
    { key: 'a', rank: 1, name: 'Dan', cells: ['120', '8', '£240'], movement: 'up' },
    { key: 'b', rank: 2, name: 'Amy', cells: ['98', '8', '£110'], movement: 'down' },
    { key: 'c', rank: 4, name: 'Cass', cells: ['40', '7', '£0'], movement: 'same' },
  ];

  it('prints the columns it was handed, in order', () => {
    render(<StandingsSheet title="Fish & Chips League" columns={columns} rows={rows} />);
    columns.forEach(c => expect(screen.getByText(c)).toBeTruthy());
    expect(screen.getByText('Player')).toBeTruthy();
  });

  // What the table on screen has never done: every figure in the mono face, so a
  // column of them reads as a column. The live table is `text-xs` throughout with
  // no `font-mono` anywhere, which is why its digits do not line up.
  it('sets every figure in the mono face', () => {
    const { container } = render(
      <StandingsSheet title="Fish & Chips League" columns={columns} rows={rows} />,
    );
    const points = screen.getByText('120');
    expect(points.className).toContain('font-mono');
    expect(container.querySelectorAll('td.font-mono').length).toBeGreaterThanOrEqual(rows.length * columns.length);
  });

  // Arrows are TEXT because this markup is ours. On the live table they are Lucide
  // SVGs, and the old export had to delete each one and reveal a hidden text twin
  // that existed in the DOM for no other purpose.
  it('draws movement as text rather than an icon to be stripped', () => {
    const { container } = render(
      <StandingsSheet title="Fish & Chips League" columns={columns} rows={rows} />,
    );
    expect(container.textContent).toContain('▲');
    expect(container.textContent).toContain('▼');
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('leaves the movement column out entirely when a league has it switched off', () => {
    const flat = rows.map(r => ({ ...r, movement: null }));
    const { container } = render(
      <StandingsSheet title="Fish & Chips League" columns={columns} rows={flat} />,
    );
    expect(container.textContent).not.toContain('▲');
    expect(container.textContent).not.toContain('–');
  });

  it('gives the top three the same medal ink the results sheet uses', () => {
    const { container } = render(
      <StandingsSheet title="Fish & Chips League" columns={columns} rows={rows} />,
    );
    const first = screen.getByText('1') as HTMLElement;
    expect(first.style.color).toBe('rgb(232, 179, 60)');
    expect(first.style.fontWeight).toBe('700');
    // Fourth is not a medal, so it takes the dim ink and the ordinary weight —
    // and the column keeps one shape regardless, because a tabular numeral does.
    const fourth = screen.getByText('4') as HTMLElement;
    expect(fourth.style.color).not.toBe(first.style.color);
    expect(fourth.style.fontWeight).toBe('500');
    // No rank cell carries a fill, in either sheet.
    container.querySelectorAll('[data-rank-label]').forEach(el => {
      expect((el as HTMLElement).style.background).toBe('');
    });
  });
});

describe('the print style', () => {
  // THE BUG THIS FILE EXISTS TO PIN. The standings capture passed `#1e1e1e` as
  // its canvas colour, which was the exact literal its own even rows were
  // striped with — so in the finished image every other row dissolved into the
  // backdrop. Striping, inverted. One module owning both is what makes it
  // impossible rather than unlikely.
  it('never paints a row the same colour as the page', () => {
    expect(SHEET.row).not.toBe(SHEET.page);
    expect(SHEET.band).not.toBe(SHEET.page);
    expect(SHEET.rule).not.toBe(SHEET.row);
  });

  // html2canvas does not render `backdrop-filter`, so a glass panel captures as a
  // nearly transparent one. Every print colour therefore has to be opaque.
  it('is opaque throughout, because a captured blur is not a blur', () => {
    const colours = [SHEET.page, SHEET.row, SHEET.band, SHEET.rule, SHEET.ink, SHEET.inkDim];
    colours.forEach(c => {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('gives every rank tone an ink, by lookup rather than arithmetic', () => {
    (['gold', 'silver', 'bronze', 'out', 'active'] as const).forEach(tone => {
      expect(RANK_INK[tone]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
    // It is ink on a row now, so each one has to be distinguishable FROM the
    // row rather than legible on top of its own fill.
    Object.values(RANK_INK).forEach(ink => {
      expect(ink.toLowerCase()).not.toBe(SHEET.row.toLowerCase());
    });
  });
});
