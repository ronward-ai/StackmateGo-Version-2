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

// The transaction is exercised for real against a stub `tx`, so the read-then-
// decide logic is tested rather than mocked away.
let held: string | null = null;
const txUpdate = vi.fn((_ref: unknown, _fields: Record<string, unknown>) => undefined);
const runTransaction = vi.fn(async (_db: unknown, fn: (tx: any) => Promise<unknown>) =>
  fn({
    get: async () => ({ exists: () => true, data: () => ({ controllingDeviceId: held }) }),
    update: txUpdate,
  }));

vi.mock('firebase/firestore', () => ({
  get updateDoc() { return updateDoc; },
  get doc() { return doc; },
  get runTransaction() { return runTransaction; },
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));

import { writeLiveGame, setLiveGameControl, liveGameControl, claimLiveGameControl } from './liveGameWrite';

beforeEach(() => {
  updateDoc.mockClear();
  doc.mockClear();
  txUpdate.mockClear();
  held = null;
  setLiveGameControl(null);
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

describe('the control gate', () => {
  it('writes when this device holds control', async () => {
    setLiveGameControl({ tournamentId: 'g1', holder: 'd_me', myDeviceId: 'd_me' });
    expect(await writeLiveGame('g1', { players: [] })).toBe('written');
  });

  // The whole point of the door. A second console writing its own copy of the
  // roster is how the first removed lock silently reverted a director's rebuys.
  it('stands down when another device holds control', async () => {
    setLiveGameControl({ tournamentId: 'g1', holder: 'd_them', myDeviceId: 'd_me' });
    expect(await writeLiveGame('g1', { players: [] })).toBe('skipped');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  // Every game written before this shipped carries no holder, and a lone
  // director must go on working without pressing anything.
  it('writes when nobody holds control', async () => {
    setLiveGameControl({ tournamentId: 'g1', holder: null, myDeviceId: 'd_me' });
    expect(await writeLiveGame('g1', { players: [] })).toBe('written');
  });

  // A control fact left over from the previous game must not gate the next one —
  // the same fault consoleTournamentId() exists to stop.
  it('does not apply another game\'s control fact', async () => {
    setLiveGameControl({ tournamentId: 'g1', holder: 'd_them', myDeviceId: 'd_me' });
    expect(liveGameControl('g2')).toBe('unclaimed');
    expect(await writeLiveGame('g2', { players: [] })).toBe('written');
  });

  it('forgets the fact when passed null', async () => {
    setLiveGameControl({ tournamentId: 'g1', holder: 'd_them', myDeviceId: 'd_me' });
    setLiveGameControl(null);
    expect(await writeLiveGame('g1', { players: [] })).toBe('written');
  });
});

describe('claimLiveGameControl', () => {
  it('claims a game nobody holds', async () => {
    held = null;
    expect(await claimLiveGameControl('g1', 'd_me')).toBe('claimed');
    expect(txUpdate.mock.calls[0][1]).toMatchObject({ controllingDeviceId: 'd_me' });
  });

  it('is a no-op when this device already holds it', async () => {
    held = 'd_me';
    expect(await claimLiveGameControl('g1', 'd_me')).toBe('already-mine');
    expect(txUpdate).not.toHaveBeenCalled();
  });

  // Not automatic. A console that grabbed control on sight would recreate the
  // removed lock's worst property: whichever device loaded last won.
  it('refuses a game another device holds', async () => {
    held = 'd_them';
    expect(await claimLiveGameControl('g1', 'd_me')).toBe('held');
    expect(txUpdate).not.toHaveBeenCalled();
  });

  // Take control must ALWAYS win, or a dead phone locks a director out of their
  // own tournament — worse than the problem the lock solves.
  it('takes control when forced', async () => {
    held = 'd_them';
    expect(await claimLiveGameControl('g1', 'd_me', { force: true })).toBe('claimed');
    expect(txUpdate.mock.calls[0][1]).toMatchObject({ controllingDeviceId: 'd_me' });
  });

  it('records when control was taken', async () => {
    held = null;
    await claimLiveGameControl('g1', 'd_me');
    expect(typeof txUpdate.mock.calls[0][1].controlClaimedAt).toBe('string');
  });
});
