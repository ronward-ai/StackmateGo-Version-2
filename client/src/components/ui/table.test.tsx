import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Table, TableBody, TableCell, TableRow } from './table';

/**
 * The `Table` primitive wraps its `<table>` in a scroll container, and which of
 * the two elements a class lands on is not cosmetic: a `sticky` header resolves
 * against the WRAPPER, so a height cap on the wrong one leaves the header
 * pinned to a box that never scrolls and therefore not pinned at all. The
 * league standings shipped that way for months.
 */
const renderTable = (props: any = {}) =>
  render(
    <Table {...props}>
      <TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody>
    </Table>,
  );

describe('Table', () => {
  const wrapperOf = (c: HTMLElement) => c.querySelector('table')!.parentElement!;

  // The export relies on this too — it finds the scroll container as the
  // table's parent rather than by utility class, which is what moved last time.
  it('wraps the table in exactly one element', () => {
    const { container } = renderTable();
    expect(wrapperOf(container).tagName).toBe('DIV');
  });

  it('keeps the wrapper a scroll container by default', () => {
    const { container } = renderTable();
    expect(wrapperOf(container).className).toContain('overflow-auto');
  });

  it('puts wrapperClassName on the WRAPPER, not the table', () => {
    const { container } = renderTable({ wrapperClassName: 'max-h-[400px]' });
    expect(wrapperOf(container).className).toContain('max-h-[400px]');
    expect(container.querySelector('table')!.className).not.toContain('max-h-[400px]');
  });

  // The mirror of the above, and the one that catches them being swapped.
  it('puts className on the TABLE, not the wrapper', () => {
    const { container } = renderTable({ className: 'w-full' });
    expect(container.querySelector('table')!.className).toContain('w-full');
  });

  it('is unchanged for a caller that passes no wrapperClassName', () => {
    const { container } = renderTable();
    expect(wrapperOf(container).className).toBe('relative w-full overflow-auto');
  });
});
