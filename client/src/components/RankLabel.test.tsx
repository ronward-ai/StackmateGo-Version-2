import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RankLabel from './RankLabel';

/**
 * The complaint was visual, so most of the proof is a captured PNG (see the
 * commit). What a unit test CAN pin is the two things that would bring the old
 * badge back: an inline box, and a line-height.
 */
const label = (text: string | number, props = {}) =>
  render(<RankLabel label={text} {...props} />).container.firstElementChild as HTMLElement;

describe('RankLabel', () => {
  /**
   * THE MUTANT THAT PUTS THE BOX BACK. The filled badge was the only solid
   * colour block in an app of 10% fills, which is what was reported — and its
   * geometry carried the html2canvas fault as well: any explicit line-height, or
   * either inline-flex centring, draws the label low and half out of the fill.
   * A browser gets all of them right, so this can only ever be caught in the
   * canvas or here.
   */
  it('draws no box and sets no line box', () => {
    const el = label('1st');
    expect(el.style.background).toBe('');
    expect(el.style.backgroundColor).toBe('');
    expect(el.style.padding).toBe('');
    expect(el.style.height).toBe('');
    expect(el.style.lineHeight).toBe('');
    expect(el.style.minWidth).toBe('');
    expect(el.style.display).toBe('');
  });

  // The column is kept straight by the typeface, not by a width: `.font-mono`
  // carries `tabular-nums` app-wide, which is why `1st` and `21st` line up with
  // nothing else done to them.
  it('is always in the mono face, whatever else it is given', () => {
    expect(label('21st').className).toContain('font-mono');
    expect(label('21st', { className: 'text-muted-foreground' }).className).toContain('font-mono');
  });

  /**
   * THE FAULT THE BADGE SHIPPED WITH, in its surviving form: the console passes
   * its colours as a Tailwind className and nothing else. Anything written
   * inline here beats a class, so when no `color` is given nothing may be set.
   */
  it('leaves the colour alone when the screen owns it', () => {
    const el = label('1st', { className: 'text-yellow-400' });
    expect(el.style.color).toBe('');
    expect(el.className).toContain('text-yellow-400');
  });

  it('paints the print colour it is handed', () => {
    expect(label('1st', { color: '#E8B33C' }).style.color).toBe('rgb(232, 179, 60)');
  });

  // Weight is the second half of marking the podium, and 500/700 are the only
  // two weights JetBrains Mono is loaded at — so these are the only two values
  // this may ever produce.
  it('marks the podium by weight as well as by hue', () => {
    expect(label('1st', { emphasis: true }).style.fontWeight).toBe('700');
    expect(label('4th').style.fontWeight).toBe('500');
  });

  it('renders a number as readily as a string', () => {
    render(<RankLabel label={4} />);
    expect(screen.getByText('4')).toBeTruthy();
  });
});
