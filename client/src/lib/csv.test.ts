import { describe, it, expect } from 'vitest';
import { csvCell, csvFilename, csvRow, neutraliseFormula, toCsv } from './csv';

describe('neutraliseFormula', () => {
  it('defuses a cell a spreadsheet would execute', () => {
    // Player names are typed in by whoever runs the game and land in the file
    // unmodified, so this would otherwise run on the opener's machine.
    expect(neutraliseFormula('=HYPERLINK("http://x","click")')).toBe("'=HYPERLINK(\"http://x\",\"click\")");
    expect(neutraliseFormula('+1')).toBe("'+1");
    expect(neutraliseFormula('-cmd')).toBe("'-cmd");
    expect(neutraliseFormula('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('defuses the whitespace smuggling variants', () => {
    expect(neutraliseFormula('\t=1+1')).toBe("'\t=1+1");
    expect(neutraliseFormula('\r=1+1')).toBe("'\r=1+1");
  });

  it('leaves an ordinary name alone', () => {
    expect(neutraliseFormula('Dave Smith')).toBe('Dave Smith');
    expect(neutraliseFormula('')).toBe('');
    expect(neutraliseFormula("O'Brien")).toBe("O'Brien");
  });
});

describe('csvCell', () => {
  it('quotes a field containing a comma', () => {
    expect(csvCell('Smith, Dave')).toBe('"Smith, Dave"');
  });

  it('doubles embedded quotes', () => {
    expect(csvCell('Dave "The Rock" Smith')).toBe('"Dave ""The Rock"" Smith"');
  });

  it('quotes a field containing a line break', () => {
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('leaves a plain field unquoted, so the file stays readable', () => {
    expect(csvCell('Dave')).toBe('Dave');
    expect(csvCell(42)).toBe('42');
  });

  it('writes an empty cell for null and undefined rather than the words', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('still quotes a defused formula that also contains a comma', () => {
    expect(csvCell('=A1,B1')).toBe('"\'=A1,B1"');
  });
});

describe('toCsv', () => {
  it('writes a header and CRLF-separated rows, ending with a newline', () => {
    const csv = toCsv(['Player', 'Points'], [['Dave', 38], ['Ann', 41]]);
    expect(csv).toBe('Player,Points\r\nDave,38\r\nAnn,41\r\n');
  });

  it('writes just a header for an empty table', () => {
    expect(toCsv(['Player'], [])).toBe('Player\r\n');
  });

  it('keeps the money symbols the table shows', () => {
    // Fidelity to the screen: the export uses the same accessor the table
    // renders with, so a column can never disagree with what the director saw.
    // Excel and Sheets both parse a leading currency symbol, so SUM still works.
    expect(csvRow(['£20', '-£5'])).toBe("£20,'-£5");
  });
});

describe('csvFilename', () => {
  it('builds a name from the league and season', () => {
    expect(csvFilename(['Thursday League', 'Spring 2026'], new Date('2026-09-24T12:00:00Z')))
      .toBe('Thursday-League-Spring-2026-2026-09-24.csv');
  });

  it('strips characters a filesystem would reject', () => {
    // "Thursday @ The Crown: Spring/Summer" is a perfectly ordinary thing for a
    // director to have typed.
    expect(csvFilename(['Thursday @ The Crown: Spring/Summer'], new Date('2026-09-24T12:00:00Z')))
      .toBe('Thursday-The-Crown-SpringSummer-2026-09-24.csv');
  });

  it('falls back to a usable name when there is nothing to use', () => {
    expect(csvFilename([null, undefined, '  '], new Date('2026-09-24T12:00:00Z')))
      .toBe('standings-2026-09-24.csv');
  });
});
