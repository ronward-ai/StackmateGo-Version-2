import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const reads: string[] = [];
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _c: string, id: string) => id,
  getDoc: async (id: string) => {
    reads.push(id);
    return { exists: () => id === 'L1', data: () => ({ name: 'Fish & Chips League' }) };
  },
}));

import { useLeagueName } from './useLeagueName';

describe('useLeagueName (Oct M18)', () => {
  it("reads the league's current name", async () => {
    const { result } = renderHook(() => useLeagueName('L1'));
    await waitFor(() => expect(result.current).toBe('Fish & Chips League'));
  });

  it('reads nothing for a standalone game or the loading placeholder', () => {
    reads.length = 0;
    renderHook(() => useLeagueName(undefined));
    renderHook(() => useLeagueName('pending'));
    expect(reads).toEqual([]);
  });
});
