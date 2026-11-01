import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TimerFace from './TimerFace';

const base = { clock: '12:00', secondsLeft: 720, progress: 20, isRunning: true, isBreak: false, isFinished: false, headline: '100/200' };

describe('TimerFace stats strip', () => {
  it('draws each figure under the blinds', () => {
    render(<TimerFace {...base} stats={[{ label: 'Players left', value: '7/12' }, { label: 'Avg stack', value: '17k' }]} />);
    const strip = screen.getByTestId('clock-stats');
    expect(strip.textContent).toContain('7/12');
    expect(strip.textContent).toContain('Players left');
    expect(strip.textContent).toContain('17k');
  });

  it('draws no strip when there is nothing to say', () => {
    render(<TimerFace {...base} />);
    expect(screen.queryByTestId('clock-stats')).toBeNull();
  });

  it('draws each paid place, and no row when nothing is paid', () => {
    const { rerender } = render(<TimerFace {...base} payouts={[{ label: '1st', value: '£60' }, { label: '2nd', value: '£30' }]} />);
    expect(screen.getByTestId('clock-payouts').textContent).toBe('1st£602nd£30');
    rerender(<TimerFace {...base} />);
    expect(screen.queryByTestId('clock-payouts')).toBeNull();
  });
});
