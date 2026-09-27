import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * This module is not pure — it writes to Firestore — so unlike its neighbours in
 * `lib/` it needs mocks. It is tested anyway because it is the one door, and the
 * control lock lands inside it: a guard that silently returns `written` when it
 * has not written is the exact fault CLAUDE.md records under "the device lock
 * was only half-enforced".
 */

const updateDoc = vi.fn(async (_ref: unknown, _fields: Record<string, unknown>) => undefined);
const doc = vi.fn((_db: unknown, coll: string, id: string) => ({ coll, id }));

vi.mock('firebase/firestore', () => ({
  get updateDoc() { return updateDoc; },
  get doc() { return doc; },
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));

import { writeLiveGame } from './liveGameWrite';

beforeEach(() => {
  updateDoc.mockClear();
  doc.mockClear();
});

describe('writeLiveGame', () => {
  it('writes to the named tournament and reports that it did', async () => {
    const result = await writeLiveGame('abc123', { players: [] });
    expect(result).toBe('written');
    expect(doc).toHaveBeenCalledWith({}, 'activeTournaments', 'abc123');
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  // details.id is typed `string | number`, and every call site this replaced
  // spelled its own String()/.toString(). One coercion, in one place.
  it('coerces a numeric id', async () => {
    await writeLiveGame(4321, { players: [] });
    expect(doc).toHaveBeenCalledWith({}, 'activeTournaments', '4321');
  });

  it.each([null, undefined, ''] as const)('skips without an id (%p)', async (id) => {
    expect(await writeLiveGame(id, { players: [] })).toBe('skipped');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  // The sanitiser is applied here rather than at each call site, which is what
  // let BuyInSection drop its own import of it.
  it('sanitises the payload', async () => {
    await writeLiveGame('abc123', { a: 1, b: undefined });
    expect(updateDoc.mock.calls[0][1]).toEqual({ a: 1, b: null });
  });

  // A failure must reach the caller: they differ in how they report it (the
  // sync toast, or a console line), and that judgement is deliberately theirs.
  it('throws rather than reporting a failed write as written', async () => {
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(writeLiveGame('abc123', { players: [] })).rejects.toThrow('permission-denied');
  });
});
