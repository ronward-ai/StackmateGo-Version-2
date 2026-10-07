import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true }),
}));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }), onSnapshot: () => () => {} }));

import { useTournament } from '@/hooks/useTournament';

/**
 * October audit, Low: the toast's Undo of a rebuy put the players back and
 * left the TABLES as the rebuy had unwound them.
 */
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
});

describe('undo of a rebuy that unwound the final table', () => {
  it('puts the final table back as well as the players', () => {
    const h = renderHook(() => useTournament(undefined));
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    act(() => {
      h.result.current.updatePrizeStructure({ buyIn: 10, allowRebuys: true, manualPayouts: [] } as any);
      h.result.current.updateSettings({ tables: { numberOfTables: 2, seatsPerTable: 8, tableNames: ['Table 1', 'Table 2'] } } as any);
      for (const n of names) h.result.current.addPlayer(n);
    });
    const id = (n: string) => h.result.current.state.players.find(p => p.name === n)!.id;
    act(() => { h.result.current.eliminatePlayer(id('I'), id('A')); });
    act(() => { h.result.current.goToFinalTable(); });
    const s = () => h.result.current.state;
    expect(s().isFinalTable).toBe(true);
    expect(s().settings.tables?.numberOfTables).toBe(1);

    act(() => { h.result.current.processRebuy(id('I')); });
    expect(s().isFinalTable).toBe(false);
    expect(s().settings.tables?.numberOfTables).toBe(2);

    act(() => { h.result.current.undoPlayerReturn(); });
    expect(s().players.find(p => p.name === 'I')!.isActive).toBe(false);
    expect(s().isFinalTable).toBe(true);
    expect(s().settings.tables?.numberOfTables).toBe(1);
    expect(s().preConsolidation).toBeTruthy();
  });
});
