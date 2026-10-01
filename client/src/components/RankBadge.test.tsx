import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RankBadge from './RankBadge';

/**
 * The complaint was visual, so most of the proof is a measurement taken in a real
 * browser (see the commit). What a unit test CAN pin is the geometry that made
 * the column ragged: a box sized by a minimum rather than by its own text, and a
 * line-height equal to the height, which is the only reason the label sits in the
 * middle of the pill rather than near the top of it.
 */
const badge = (label: string, props = {}) =>
  render(<RankBadge label={label} {...props} />).container.firstElementChild as HTMLElement;

describe('RankBadge', () => {
  // THE REPORTED FAULT. The old badge had horizontal padding and no width, so
  // `1st` and `21st` came out different widths down the one column a reader runs
  // their eye along.
  it('gives every label the same minimum, whatever its length', () => {
    for (const label of ['1st', '2nd', '11th', '21st']) {
      expect(badge(label).style.minWidth).toBe('48px');
    }
  });

  // A MINIMUM rather than a width, and this is the fixture that says why: a game
  // exported while it is still running labels its live players `Active`, which is
  // longer than any ordinal. A fixed width sized for it would make `1st` enormous.
  it('lets a label longer than an ordinal grow past the minimum', () => {
    const el = badge('Active');
    expect(el.style.minWidth).toBe('48px');
    expect(el.style.whiteSpace).toBe('nowrap');
  });

  // THE SECOND FAULT, and a different one. Vertical padding on an INLINE element
  // does not grow the line box, so the old badge's background spilled past the
  // line and the text sat wherever the font metrics left it.
  it('is an inline-block with symmetric padding and no line-box centring', () => {
    const el = badge('1st');
    expect(el.style.display).toBe('inline-block');
    expect(el.style.boxSizing).toBe('border-box');
    expect(el.style.textAlign).toBe('center');
    expect(el.style.padding).toBe('4px 8px');
    // THE EXPORT MUTANT, settled by capturing six variants through the real
    // html2canvas: ANY explicit line-height, and both inline-flex centrings, draw
    // the label low and half out of the fill. Only line-height `normal` centres.
    // A browser gets all six right, so this can only ever be caught in the canvas.
    expect(el.style.lineHeight).toBe('');
    expect(el.style.height).toBe('');
    expect(el.style.display).not.toBe('inline-flex');
  });

  it('takes a smaller box when the screen asks for one', () => {
    const el = badge('1st', { minWidth: 38, padY: 3 });
    expect(el.style.minWidth).toBe('38px');
    expect(el.style.padding).toBe('3px 8px');
  });

  /**
   * THE FAULT THIS SHIPPED WITH, and the reason `undefined` and `null` are not
   * the same thing.
   *
   * The console passes its medal colours as a Tailwind className and NO tone. A
   * truthiness check treated that as "no tone" and set `background: transparent`
   * as an INLINE style, which beats a class — so every fill on screen vanished,
   * and gold and silver are the only two tones carrying `text-black`, so first
   * and second place turned black on a dark row.
   */
  it('does not touch the colours when no tone is given, so a className survives', () => {
    const el = badge('1st', { className: 'bg-yellow-500 text-black' });
    expect(el.style.background).toBe('');
    expect(el.style.backgroundColor).toBe('');
    expect(el.style.color).toBe('');
    expect(el.className).toContain('bg-yellow-500');
  });

  it('paints the print colours it is handed', () => {
    const el = badge('1st', { tone: { bg: '#E0A106', fg: '#11130F' } });
    expect(el.style.background).toBe('rgb(224, 161, 6)');
    expect(el.style.color).toBe('rgb(17, 19, 15)');
  });

  // The screen keeps its Tailwind tones; this owns the box and not the palette,
  // which is what `rankTone` returning a NAME rather than a colour buys.
  it('carries a screen tone as a class rather than a colour', () => {
    const el = badge('1st', { className: 'bg-yellow-500 text-black' });
    expect(el.className).toContain('bg-yellow-500');
    expect(el.className).toContain('font-mono');
  });

  /**
   * THE STANDINGS FIX. Only the top three used to be badged, so that column
   * changed shape halfway down. A null tone still has to produce a BOX — same
   * size, no fill — or the uniformity is lost again.
   */
  it('still draws a box for an EXPLICIT null tone, so a column keeps one shape', () => {
    const el = badge('9', { tone: null, mutedColor: '#A3ADBA', minWidth: 34 });
    expect(el.style.display).toBe('inline-block');
    expect(el.style.minWidth).toBe('34px');
    expect(el.style.padding).toBe('4px 8px');
    expect(el.style.background).toBe('transparent');
    expect(el.style.color).toBe('rgb(163, 173, 186)');
  });

  it('renders a number as readily as a string', () => {
    render(<RankBadge label={4} />);
    expect(screen.getByText('4')).toBeTruthy();
  });
});
