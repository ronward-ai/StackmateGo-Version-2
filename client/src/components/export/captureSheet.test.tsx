import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Driving the capture, because the predicate is trivial and the leak is not.
 *
 * Neither export had a test of any kind, and the thing most likely to be wrong
 * here is not the picture — it is what happens to the off-screen tree when the
 * picture fails to arrive.
 */
const html2canvas = vi.fn(async (_el: HTMLElement, _opts: any) => ({
  toDataURL: () => 'data:image/png;base64,AAA',
}));

vi.mock('html2canvas', () => ({
  get default() { return html2canvas; },
}));

import { captureSheet, sheetFilename } from './captureSheet';
import { SHEET } from './exportStyle';

const Sheet = () => <div data-testid="sheet" style={{ width: 400 }}>Dan 1st</div>;

/** Anything this capture parked in the document and did not clear up. */
const strays = () =>
  Array.from(document.body.children).filter(
    el => (el as HTMLElement).style.left === '-10000px',
  );

let clicks: string[];

beforeEach(() => {
  clicks = [];
  html2canvas.mockClear();
  html2canvas.mockImplementation(async () => ({ toDataURL: () => 'data:image/png;base64,AAA' }));
  // jsdom will not navigate, and an unmocked click logs "Not implemented".
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('captureSheet', () => {
  it('renders the sheet, captures it and hands over a named file', async () => {
    await captureSheet(<Sheet />, { filename: 'results.png', settleMs: 0 });
    expect(html2canvas).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual(['results.png']);
  });

  // It must capture the SHEET, not the host wrapper — the host has no background
  // of its own, so capturing it would put a transparent margin round every image.
  it('captures the sheet itself rather than its off-screen host', async () => {
    await captureSheet(<Sheet />, { filename: 'results.png', settleMs: 0 });
    const captured = html2canvas.mock.calls[0][0] as HTMLElement;
    expect(captured.getAttribute('data-testid')).toBe('sheet');
  });

  // THE STRIPE BUG, pinned. The standings export passed `#1e1e1e` as the canvas
  // colour — the very literal its own even rows were striped with — so in the
  // image every other row dissolved into the backdrop. One file owning both is
  // what makes that impossible, and this asserts the capture asks it.
  it('fills the canvas with the sheet page colour, so no row can match it', async () => {
    await captureSheet(<Sheet />, { filename: 'results.png', settleMs: 0 });
    const opts = html2canvas.mock.calls[0][1] as any;
    expect(opts.backgroundColor).toBe(SHEET.page);
    expect(opts.backgroundColor).not.toBe(SHEET.row);
    expect(opts.scale).toBe(2);
  });

  it('leaves nothing behind in the document', async () => {
    await captureSheet(<Sheet />, { filename: 'results.png', settleMs: 0 });
    expect(strays()).toHaveLength(0);
  });

  // THE MUTANT THAT COSTS A RELOAD: teardown outside the `finally`. The builder
  // this replaces removed its off-screen node on the happy path only, so a thrown
  // html2canvas — out of memory on a long roster, a tainted canvas — parked a
  // whole DOM tree in the document for the life of the page, invisible, with no
  // way for a director to clear it short of reloading mid-tournament.
  it('still clears up when the capture throws', async () => {
    html2canvas.mockRejectedValueOnce(new Error('canvas is tainted'));
    await expect(
      captureSheet(<Sheet />, { filename: 'results.png', settleMs: 0 }),
    ).rejects.toThrow('canvas is tainted');
    expect(strays()).toHaveLength(0);
    expect(clicks).toEqual([]);
  });

  // The caller owns the toast — it is the one that knows which export failed —
  // so the failure has to reach it rather than being swallowed here.
  it('lets the failure reach the caller', async () => {
    html2canvas.mockRejectedValueOnce(new Error('nope'));
    await expect(
      captureSheet(<Sheet />, { filename: 'x.png', settleMs: 0 }),
    ).rejects.toThrow('nope');
  });
});

describe('sheetFilename', () => {
  it('joins the parts and dates the file', () => {
    const name = sheetFilename(['league-standings', 'Spring 2026']);
    expect(name).toMatch(/^league-standings-Spring-2026-\d{4}-\d{2}-\d{2}\.png$/);
  });

  it('drops the parts that are not there', () => {
    expect(sheetFilename(['tournament-results', null, undefined, '  ']))
      .toMatch(/^tournament-results-\d{4}-\d{2}-\d{2}\.png$/);
  });

  // A season called "Winter 25/26" is completely ordinary, and a slash in a
  // download name is how a file silently fails to save.
  it('cannot produce a path separator from a season name', () => {
    const name = sheetFilename(['league-standings', 'Winter 25/26']);
    expect(name).not.toContain('/');
    expect(name).toContain('Winter-25-26');
  });

  it('still names something when given nothing', () => {
    expect(sheetFilename([])).toMatch(/^stackmate-\d{4}-\d{2}-\d{2}\.png$/);
  });
});
