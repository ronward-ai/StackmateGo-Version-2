import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const firestore = vi.hoisted(() => ({ updateDoc: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(), setDoc: vi.fn() }));
vi.mock('firebase/firestore', () => firestore);

import LeagueCheckDialog from './LeagueCheckDialog';

describe('LeagueCheckDialog — read-only', () => {
  it('shows a row per placed player, what the league holds, and writes nothing', () => {
    render(
      <LeagueCheckDialog
        open
        onClose={() => {}}
        players={[{ name: 'Amy', position: 1 }, { name: 'Bob', position: 2 }]}
        playerDocs={[{ id: 'a', name: 'Amy' }, { id: 'b', name: 'Bob' }]}
        results={[{ id: 'r1', leaguePlayerId: 'a', tournamentId: 'G', seasonId: null, position: 1 }]}
        gameId="G"
        seasonName={id => (id ? `season ${id}` : 'no season')}
        facts={[{ label: 'Game', value: 'G' }]}
      />,
    );
    const rows = screen.getAllByTestId('league-check-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/no season/);
    expect(rows[1].textContent).toMatch(/No league result for this game/);
    for (const fn of Object.values(firestore)) expect(fn).not.toHaveBeenCalled();
  });
});
