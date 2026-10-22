import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ExportButtons from './ExportButtons';

describe('ExportButtons', () => {
  it('is Image then CSV, wired to their own handlers', () => {
    const onImage = vi.fn(); const onCsv = vi.fn();
    render(<ExportButtons onImage={onImage} onCsv={onCsv} imageTitle="i" csvTitle="c" />);
    const labels = screen.getAllByRole('button').map(b => b.textContent);
    expect(labels).toEqual(['Image', 'CSV']);
    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    expect(onImage).toHaveBeenCalledTimes(1);
    expect(onCsv).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(onCsv).toHaveBeenCalledTimes(1);
  });

  it('shows Saving… and refuses a second image while one is being made', () => {
    const onImage = vi.fn();
    render(<ExportButtons onImage={onImage} onCsv={() => {}} busy imageTitle="i" csvTitle="c" />);
    const image = screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement;
    expect(image.disabled).toBe(true);
  });

  it('both buttons share one style, so the pair cannot look like two features', () => {
    render(<ExportButtons onImage={() => {}} onCsv={() => {}} imageTitle="i" csvTitle="c" />);
    const [a, b] = screen.getAllByRole('button');
    expect(a.className).toBe(b.className);
  });
});
