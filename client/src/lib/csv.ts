/**
 * Turning a table on screen into a file a director can open in a spreadsheet.
 *
 * The asked-for feature is "let me do my own sums at the end of a season"
 * — which is the whole complaint about the software this replaces: stats exist,
 * but getting at them means walking back through every game by hand.
 */

/**
 * Cells that a spreadsheet would execute rather than display.
 *
 * Excel, Google Sheets and Numbers all treat a cell beginning `=`, `+`, `-` or
 * `@` as a formula, and a leading tab or carriage return can smuggle one past a
 * naive check. Player names are typed in by whoever is running the game and
 * land in this file unmodified, so a name like `=HYPERLINK(...)` would run on
 * the machine of whoever opened the export.
 *
 * The fix is the standard one: prefix a single quote, which spreadsheets strip
 * on display. A negative NUMBER is untouched because it is written by the app,
 * never typed — only a leading `-` on text reaches here.
 */
const FORMULA_STARTERS = ['=', '+', '-', '@', '\t', '\r'];

export function neutraliseFormula(value: string): string {
  if (value.length === 0) return value;
  return FORMULA_STARTERS.includes(value[0]) ? `'${value}` : value;
}

/**
 * One cell, quoted only where it has to be.
 *
 * RFC 4180: a field containing a comma, a double quote or a line break is
 * wrapped in double quotes, and each embedded quote is doubled. Quoting
 * everything unconditionally would also be valid but makes the file unreadable
 * in a text editor, which is where someone looks when an import goes wrong.
 */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = neutraliseFormula(raw);
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

/**
 * A complete CSV document.
 *
 * CRLF line endings, per the spec and because Excel on Windows is the most
 * likely destination. A trailing newline is included: some parsers treat its
 * absence as a truncated file.
 */
export function toCsv(headers: unknown[], rows: unknown[][]): string {
  return [csvRow(headers), ...rows.map(csvRow)].join('\r\n') + '\r\n';
}

/**
 * A filename that will not be rejected or silently mangled.
 *
 * League and season names are free text — "Thursday @ The Crown: Spring/Summer"
 * is a perfectly reasonable thing for a director to have typed, and most of
 * those characters are illegal in a filename on at least one platform.
 */
export function csvFilename(parts: (string | null | undefined)[], date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  const name = parts
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map(p => p.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'))
    .filter(p => p.length > 0)
    .join('-');
  return `${name || 'standings'}-${stamp}.csv`;
}

/**
 * Hand the file to the browser.
 *
 * Returns false rather than throwing so the caller can say so — a download that
 * silently does nothing is the failure mode this app has been bitten by more
 * than once. The BOM is deliberate: without it Excel reads UTF-8 as its local
 * codepage and mangles any non-ASCII player name.
 */
export function downloadCsv(filename: string, csv: string): boolean {
  try {
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoked on the next tick: revoking synchronously can cancel the download
    // in some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (err) {
    console.error('Could not download the CSV:', err);
    return false;
  }
}
