import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import DirectorOnly from './DirectorOnly';

/**
 * The contract that matters is NOT MOUNTED, not "disabled".
 *
 * A read-only console used to render the whole editor and let the writes be
 * skipped downstream, so the screen responded to every press and nothing
 * happened. Disabling the controls would put the rule at every button — the
 * "three places out of twelve is not a rule" trap this codebase has paid for
 * twice. A control that is not in the tree cannot be pressed, so these tests
 * assert ABSENCE from the DOM rather than a `disabled` attribute.
 */
describe('DirectorOnly', () => {
  it('renders the controls for the device that is driving', () => {
    const { getByText, container } = render(
      <DirectorOnly readOnly={false}><button>Bust out</button></DirectorOnly>,
    );
    expect(getByText('Bust out')).toBeTruthy();
    expect(container.querySelectorAll('button').length).toBe(1);
  });

  it('does not render the controls AT ALL when read-only', () => {
    const { queryByText, container } = render(
      <DirectorOnly readOnly><button>Bust out</button></DirectorOnly>,
    );
    expect(queryByText('Bust out')).toBeNull();
    // Absent, not disabled. A greyed button would still be in the tree.
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('says why, rather than leaving a hole', () => {
    const { container } = render(
      <DirectorOnly readOnly><button>Bust out</button></DirectorOnly>,
    );
    expect(container.textContent).toContain('has control of this game');
  });

  it('takes a sharper sentence when a region needs one', () => {
    const { container } = render(
      <DirectorOnly readOnly notice="Seating is set on the other device."><button>Seat</button></DirectorOnly>,
    );
    expect(container.textContent).toContain('Seating is set on the other device.');
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  /**
   * `instead` is how the Players and Seating tabs keep working: a real read-only
   * VIEW of the same thing, which is what a second screen is good for. The
   * editor must still be gone.
   */
  it('prefers a read-only view over the notice, and still drops the editor', () => {
    const { getByText, queryByText, container } = render(
      <DirectorOnly readOnly instead={<div>Roster (read-only)</div>}>
        <button>Bust out</button>
      </DirectorOnly>,
    );
    expect(getByText('Roster (read-only)')).toBeTruthy();
    expect(queryByText('Bust out')).toBeNull();
    expect(container.textContent).not.toContain('has control of this game');
  });

  it('ignores `instead` while this device is driving', () => {
    const { getByText, queryByText } = render(
      <DirectorOnly readOnly={false} instead={<div>Roster (read-only)</div>}>
        <button>Bust out</button>
      </DirectorOnly>,
    );
    expect(getByText('Bust out')).toBeTruthy();
    expect(queryByText('Roster (read-only)')).toBeNull();
  });
});
