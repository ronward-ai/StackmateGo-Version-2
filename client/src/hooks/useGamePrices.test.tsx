import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  getDoc: vi.fn(),
  docs: {} as Record<string, any>,
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _c: string, id: string) => id,
  getDoc: h.getDoc,
}));

import { useGamePrices, __resetGamePricesForTests } from './useGamePrices';

beforeEach(() => {
  __resetGamePricesForTests();
  h.docs = {
    g1: { prizeStructure: { buyIn: 10, rakeType: 'fixed', rakeAmount: 2, enableBounties: true, bountyAmount: 3 } },
  };
  h.getDoc.mockReset().mockImplementation(async (id: string) => {
    if (id === 'boom') throw new Error('offline');
    return { exists: () => !!h.docs[id], data: () => h.docs[id] };
  });
});

describe('useGamePrices', () => {
  it("reads each game's prices once, and shares them", async () => {
    const a = renderHook(() => useGamePrices(['g1', 'g1']));
    await waitFor(() => expect(a.result.current.g1?.entryRake).toBe(2));
    expect(a.result.current.g1?.entryBounty).toBe(3);

    const b = renderHook(() => useGamePrices(['g1']));
    expect(b.result.current.g1?.entryRake).toBe(2); // from the cache, at once
    expect(h.getDoc).toHaveBeenCalledTimes(1);
  });

  it('a missing game or a failed read answers null — pool money only', async () => {
    const { result } = renderHook(() => useGamePrices(['gone', 'boom']));
    await waitFor(() => expect('gone' in result.current && 'boom' in result.current).toBe(true));
    expect(result.current.gone).toBeNull();
    expect(result.current.boom).toBeNull();
  });

  it('asks nothing for results with no game id', () => {
    renderHook(() => useGamePrices([undefined, null, '']));
    expect(h.getDoc).not.toHaveBeenCalled();
  });
});
