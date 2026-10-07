import { useEffect, useState } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Router, Route, Switch, useParams, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

/**
 * October audit, H4: moving from one game's director route to another's must
 * give the console a fresh mount. Driven through wouter's real router, because
 * the fault was wouter reusing the component — nothing a unit test of the
 * console could see.
 */

const seen: string[] = [];
let navigate: (to: string) => void = () => {};

vi.mock('./TournamentDirector', () => ({
  default: function FakeDirector() {
    // One identity per MOUNT: a remount gets a new one, a reuse keeps the old.
    const [instance] = useState(() => Math.random().toString(36).slice(2, 8));
    const { tournamentId } = useParams<{ tournamentId: string }>();
    const [, setLocation] = useLocation();
    navigate = setLocation;
    useEffect(() => { seen.push(`${instance}:${tournamentId}`); }, [tournamentId]);
    return <div data-testid="console">{instance}</div>;
  },
}));

import DirectorRoute from './DirectorRoute';

describe('DirectorRoute', () => {
  it('remounts the console when the game changes, and only then', () => {
    const { hook } = memoryLocation({ path: '/tournament/A/director' });
    const r = render(
      <Router hook={hook}>
        <Switch>
          <Route path="/tournament/:tournamentId/director" component={DirectorRoute} />
        </Switch>
      </Router>,
    );
    const onA = r.getByTestId('console').textContent;

    act(() => navigate('/tournament/B/director'));
    const onB = r.getByTestId('console').textContent;
    expect(onB).not.toBe(onA);

    // A re-render on the SAME game must not remount it — that would throw away
    // a live console on every navigation that does not change the game.
    r.rerender(
      <Router hook={hook}>
        <Switch>
          <Route path="/tournament/:tournamentId/director" component={DirectorRoute} />
        </Switch>
      </Router>,
    );
    expect(r.getByTestId('console').textContent).toBe(onB);
    expect(seen.map(s => s.split(':')[1])).toEqual(['A', 'B']);
  });
});
