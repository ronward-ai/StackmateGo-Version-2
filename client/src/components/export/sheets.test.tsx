import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResultsSheet from './ResultsSheet';
import StandingsSheet, { type StandingsSheetRow } from './StandingsSheet';
import { resultRowsFor, type ResultPlayerLike } from '@/lib/resultRows';
import { RANK_INK, SHEET, SHEET_TYPE, headCellStyle, rowStyle } from './exportStyle';

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
    expect(screen.getByText('Hits')).toBeTruthy();
    expect(screen.getByText('Rebuys')).toBeTruthy();
    expect(screen.getByText('Won')).toBeTruthy();
    expect(screen.getByText('£30')).toBeTruthy();
    // The header says KO once; it is not repeated against every player the way
    // a chip was.
    expect(screen.getAllByText('Hits')).toHaveLength(1);
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

/**
 * REPORTED: the text at the top of the columns had no impact — and it did not.
 * 11px at weight 600 in `inkDim`, SMALLER and DIMMER than the 13px figures
 * underneath, so the row naming the columns was the quietest thing in a picture
 * people post to a group chat.
 */
describe('the column headers', () => {
  const headsIn = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('th')) as HTMLElement[];

  const resultsRows = rowsFor([
    { id: '1', name: 'Dan', isActive: false, position: 1, knockouts: 3 },
    { id: '2', name: 'Amy', isActive: false, position: 2 },
  ]);
  const standingsRows: StandingsSheetRow[] = [
    { key: 'a', rank: 1, name: 'Dan', cells: ['120', '8', '£240'], movement: 'up' },
  ];

  // THE MUTANTS: put the size or the weight back under the figures.
  it('leads the table rather than hiding under it', () => {
    expect(SHEET_TYPE.head).toBeGreaterThan(11);
    expect(SHEET_TYPE.head).toBeLessThan(SHEET_TYPE.cell + 1);
    expect(headCellStyle().fontWeight).toBe(700);
    // THE MUTANT: back to inkDim, which is what made it recede.
    expect(headCellStyle().color).toBe(SHEET.inkHead);
    expect(headCellStyle().color).not.toBe(SHEET.inkDim);
    // Uppercase at this size needs the air, and it is most of what makes the
    // row read as a header rather than as shouting.
    expect(headCellStyle().letterSpacing).toBe('0.08em');
  });

  it('aligns where it is told and nowhere else by default', () => {
    expect(headCellStyle('right').textAlign).toBe('right');
    expect(headCellStyle().textAlign).toBe('left');
  });

  /**
   * THE MUTANT THIS EXISTS FOR: a sixth inline copy. The style was spelled FIVE
   * times — once in ResultsSheet and FOUR times inline in StandingsSheet — so a
   * change to one header was four edits in the other, in two images that exist
   * to look like one product.
   */
  it('is the SAME header in both sheets, down to the pixel', () => {
    const resultsSheet = render(results({ title: 'Thursday Night', rows: resultsRows })).container;
    const standingsSheet = render(
      <StandingsSheet title="Fish & Chips League" columns={['Points', 'Games']} rows={standingsRows} />,
    ).container;

    const all = [...headsIn(resultsSheet), ...headsIn(standingsSheet)];
    expect(all.length).toBeGreaterThan(6);
    all.forEach(th => {
      expect(th.style.fontSize).toBe(`${SHEET_TYPE.head}px`);
      expect(th.style.fontWeight).toBe('700');
      expect(th.style.letterSpacing).toBe('0.08em');
      expect(th.style.textTransform).toBe('uppercase');
    });
    // The colour too, read back as the rgb() the browser resolves it to.
    const colours = new Set(all.map(th => th.style.color));
    expect(colours.size).toBe(1);
  });

  /**
   * THE ORDERING IS THE CONTRACT: page < rowAlt < row < band.
   *
   * Each end of it is a bug this codebase has already met. Below the page and
   * the striped rows dissolve into the backdrop — the old standings export set
   * its canvas colour to the literal its even rows were striped with, and that
   * is exactly what happened. Above the row and the stripe starts reading as a
   * second header band, which is why the stripe goes DOWN rather than up.
   */
  it('keeps the four surfaces in the one order that works', () => {
    const lum = (hex: string) => parseInt(hex.slice(1), 16);
    expect(lum(SHEET.page)).toBeLessThan(lum(SHEET.rowAlt));
    expect(lum(SHEET.rowAlt)).toBeLessThan(lum(SHEET.row));
    expect(lum(SHEET.row)).toBeLessThan(lum(SHEET.band));
  });
});

/**
 * REPORTED: the console's tables alternate row shades — "great for legibility" —
 * and the exported images did not. Both sheets painted one `SHEET.row` behind
 * the whole table and separated rows with a hairline alone.
 */
describe('striped rows', () => {
  const bodyRows = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('tbody tr')) as HTMLElement[];

  /** jsdom resolves an inline hex to `rgb()`, so the expectation is DERIVED
   *  from the token rather than written out — changing `rowAlt` must not be
   *  able to pass by changing a literal in the test beside it. */
  const asRgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };

  const sixResults = rowsFor([
    { id: '1', name: 'Dan', isActive: false, position: 1, knockouts: 3 },
    { id: '2', name: 'Amy', isActive: false, position: 2 },
    { id: '3', name: 'Cass', isActive: false, position: 3 },
    { id: '4', name: 'Eve', isActive: false, position: 4 },
  ]);
  const sixStandings: StandingsSheetRow[] = [1, 2, 3, 4].map(n => ({
    key: `k${n}`, rank: n, name: `P${n}`, cells: [`${n}`, '8', '£0'], movement: 'same' as const,
  }));

  // THE MUTANT: stripe every row, or none — either way the striping is gone.
  it('stripes every other row in BOTH sheets', () => {
    const resultsSheet = render(results({ title: 'Thursday Night', rows: sixResults })).container;
    const standingsSheet = render(
      <StandingsSheet title="Fish & Chips League" columns={['Points', 'Games', 'Cash']} rows={sixStandings} />,
    ).container;

    [resultsSheet, standingsSheet].forEach(container => {
      const stripes = bodyRows(container).map(tr => tr.style.background);
      expect(stripes).toHaveLength(4);
      // THE MUTANT: stripe the FIRST row. The header band sits directly above
      // it, so darkening the row under a header reads as a gap, not a stripe.
      expect(stripes[0]).toBe('');
      expect(stripes[1]).toBe(asRgb(SHEET.rowAlt));
      expect(stripes[2]).toBe('');
      expect(stripes[3]).toBe(asRgb(SHEET.rowAlt));
    });
  });

  // One helper, not two copies — the argument `headCellStyle` was extracted on.
  it('is the same stripe in both sheets, from one function', () => {
    expect(rowStyle(0)).toEqual({});
    expect(rowStyle(1)).toEqual({ background: SHEET.rowAlt });
    expect(rowStyle(2)).toEqual({});
  });
});
