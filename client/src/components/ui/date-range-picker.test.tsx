import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DateRangePicker } from './date-range-picker';

/**
 * Reported: no calendar when picking a season's dates on Chrome for Windows,
 * while an iPad opened one on any tap. Desktop Chrome opens it only from an
 * icon inside the box, and that icon was drawn dark on this dark-only app.
 */
const inputs = () => Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];

afterEach(() => { delete (HTMLInputElement.prototype as any).showPicker; });

describe('DateRangePicker', () => {
  it('draws both boxes in the dark scheme, so Chrome can show its calendar icon', () => {
    render(<DateRangePicker value={{ from: undefined, to: undefined }} onSelect={vi.fn()} />);
    expect(inputs()).toHaveLength(2);
    for (const i of inputs()) expect(i.style.colorScheme).toBe('dark');
  });

  it('opens the calendar from a click anywhere in either box', () => {
    const showPicker = vi.fn();
    (HTMLInputElement.prototype as any).showPicker = showPicker;
    render(<DateRangePicker value={{ from: undefined, to: undefined }} onSelect={vi.fn()} />);
    fireEvent.click(inputs()[0]);
    fireEvent.click(inputs()[1]);
    expect(showPicker).toHaveBeenCalledTimes(2);
  });

  // A browser may refuse showPicker; the box must still work by typing.
  it('survives a browser that refuses to open the picker', () => {
    (HTMLInputElement.prototype as any).showPicker = () => { throw new Error('NotAllowedError'); };
    const onSelect = vi.fn();
    render(<DateRangePicker value={{ from: undefined, to: undefined }} onSelect={onSelect} />);
    // React reports a throwing handler to the window rather than to the caller,
    // so "did not throw" is asked of the window.
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => { errors.push(e.error); e.preventDefault(); };
    window.addEventListener('error', onError);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fireEvent.click(inputs()[0]);
    } catch (err) {
      errors.push(err);
    } finally {
      window.removeEventListener('error', onError);
      quiet.mockRestore();
    }
    expect(errors).toEqual([]);
    fireEvent.change(inputs()[0], { target: { value: '2027-01-01' } });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
