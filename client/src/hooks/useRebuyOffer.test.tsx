import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useRebuyOffer } from './useRebuyOffer';

/**
 * THE REPORTED BUG, and it needs a hook test because the fault was never in the
 * predicate: bust a player out on the laptop, press "No — they are out", take
 * control on the phone, and the same dialog opens immediately.
 *
 * `lib/rebuyOffer.ts` was right the whole time. What was wrong was WHEN the seen
 * set was built — once, at the first render with a roster, which on a watching
 * device is before the bust-out it is about to be shown — and the fact that the
 * answer lived in a ref on the other device. Neither is reachable from a pure
 * test, so this drives the hook across a control change.
 */
const busted = (id: string, position: number, rebuys = 0) =>
  ({ id, name: id, isActive: false, position, rebuys });
const active = (id: string) => ({ id, name: id, isActive: true, rebuys: 0 });

type Harness = {
  players: any[];
  rebuysAnswered?: string[];
  readOnly: boolean;
};

let rebought: string[] = [];

/** Only what the hook touches. */
const fakeTournament = (h: Harness & { gameId?: string }) => ({
  state: {
    players: h.players,
    prizeStructure: { allowRebuys: true, rebuyAmount: 10 },
    currentLevel: 0,
    details: { localGameId: h.gameId ?? 'g1' },
    rebuysAnswered: h.rebuysAnswered,
  },
  processRebuy: (id: string) => rebought.push(id),
}) as any;

let latest: ReturnType<typeof useRebuyOffer>;
function Probe({ h }: { h: Harness & { gameId?: string } }) {
  latest = useRebuyOffer(fakeTournament(h), h.readOnly);
  return null;
}

const drive = (h: Harness & { gameId?: string }) => {
  const r = render(<Probe h={h} />);
  return {
    rerender: (next: Harness & { gameId?: string }) => act(() => { r.rerender(<Probe h={next} />); }),
  };
};

describe('useRebuyOffer across a takeover', () => {
  beforeEach(() => {
    rebought = [];
    try { localStorage.clear(); } catch { /* jsdom without storage */ }
  });

  it('offers the rebuy for a bust-out this device witnessed', () => {
    const h: Harness = { players: [active('amy'), active('dave')], readOnly: false };
    const d = drive(h);
    d.rerender({ ...h, players: [busted('amy', 2), active('dave')] });
    expect(latest.player?.id).toBe('amy');
  });

  /**
   * The bug. While read-only the hook keeps the seen set level with the roster, so
   * the bust-out it merely WATCHED is already accounted for and taking control
   * cannot open the dialog.
   */
  it('does NOT offer a rebuy for a bust-out it only watched', () => {
    const h: Harness = { players: [active('amy'), active('dave')], readOnly: true };
    const d = drive(h);
    d.rerender({ ...h, players: [busted('amy', 2), active('dave')] });
    expect(latest.player).toBeNull();
    // Take control. Still silent.
    d.rerender({ players: [busted('amy', 2), active('dave')], readOnly: false });
    expect(latest.player).toBeNull();
  });

  /**
   * ...but it is still REACHABLE, as the failsafe button, because nobody answered
   * it. This is the dead-other-device case.
   */
  it('hands the failsafe button to an unanswered bust-out on takeover', () => {
    const h: Harness = { players: [active('amy'), active('dave')], readOnly: true };
    const d = drive(h);
    d.rerender({ ...h, players: [busted('amy', 2), active('dave')] });
    d.rerender({ players: [busted('amy', 2), active('dave')], readOnly: false });
    expect(latest.failsafeFor).toBe('amy');
  });

  /**
   * THE DAVE GUARD. The other device took Amy's rebuy, so she is active again and
   * `mostRecentlyBusted` moves BACKWARDS to Dave — whose bust-out was answered
   * long ago. Without the shared answered set a fresh device with an empty memory
   * would hand Dave a button he must never have again.
   */
  it('gives the failsafe to nobody when the record says the roster is answered', () => {
    const h: Harness = {
      players: [busted('dave', 3), active('amy')],
      rebuysAnswered: ['dave:0', 'amy:0'],
      readOnly: true,
    };
    const d = drive(h);
    d.rerender({ ...h, readOnly: false });
    expect(latest.player).toBeNull();
    expect(latest.failsafeFor).toBeNull();
  });

  /**
   * The mistake this nearly shipped as. Suppressing the dialog by marking the
   * watched bust-out ANSWERED would sync that claim, telling the other device — and
   * every later one — that a question nobody answered is closed. Watched and
   * answered have to be two sets.
   */
  it('never reports a merely WATCHED bust-out as answered', () => {
    const h: Harness = { players: [active('amy'), active('dave')], readOnly: true };
    const d = drive(h);
    d.rerender({ ...h, players: [busted('amy', 2), active('dave')] });
    d.rerender({ players: [busted('amy', 2), active('dave')], readOnly: false });
    expect(latest.answered).toEqual([]);
  });

  it('reports the answers it knows, for the page to sync', () => {
    const h: Harness = { players: [active('amy')], rebuysAnswered: ['zz:0'], readOnly: false };
    const d = drive(h);
    d.rerender({ ...h, players: [busted('amy', 2)] });
    act(() => { latest.answer(false); });
    expect(latest.answered).toEqual(['amy:0', 'zz:0']);
  });

  it('records a taken rebuy as answered too, and rebuys the player', () => {
    const h: Harness = { players: [active('amy')], readOnly: false };
    const d = drive(h);
    d.rerender({ ...h, players: [busted('amy', 2)] });
    act(() => { latest.answer(true); });
    expect(rebought).toEqual(['amy']);
    expect(latest.answered).toContain('amy:0');
  });
});

/**
 * The final hand, driven rather than reasoned about.
 *
 * `eliminatePlayer` marks the last player standing `position: 1` AND
 * `isActive: false`, so the roster the hook sees at the end of a game has no
 * active players and a champion who looks, to every "has this player busted"
 * test, exactly like a bust-out. The dialog opened on them.
 */
describe('useRebuyOffer at the end of the game', () => {
  beforeEach(() => {
    rebought = [];
    try { localStorage.clear(); } catch { /* jsdom without storage */ }
  });

  it('opens no offer and hands out no failsafe on the final hand', () => {
    const h: Harness = { players: [active('amy'), active('dave')], readOnly: false };
    const { rerender } = drive(h);
    // Dave busts: an ordinary bust-out, the offer is due.
    rerender({ ...h, players: [busted('dave', 2), active('amy')] });
    expect(latest.player?.id).toBe('dave');
    // Amy wins. Nobody is active and she holds position 1.
    rerender({ ...h, players: [busted('dave', 2), busted('amy', 1)] });
    expect(latest.player).toBeNull();
    expect(latest.failsafeFor).toBeNull();
  });

  // The persisted leg: a refresh restores the key from localStorage and
  // failsafeRebuyId resolves it WITHOUT going through mostRecentlyBusted, so
  // this is the only thing that catches the inline copy coming back.
  it('restores no failsafe for the champion across a refresh', () => {
    const finishedGame = [busted('dave', 2), busted('amy', 1)];
    // Whatever the reload restores, a finished game hands it to nobody.
    drive({ players: finishedGame, readOnly: false });
    expect(latest.failsafeFor).toBeNull();
    expect(latest.player).toBeNull();
  });
});

// October audit, M13.
describe('what a console found at load is not an answer', () => {
  beforeEach(() => {
    rebought = [];
    try { localStorage.clear(); } catch { /* jsdom without storage */ }
  });

  // The dead-other-device case: the laptop died holding Amy's question. The
  // phone opened afresh must not write "answered" for her — and must offer the
  // failsafe, because the shared record says nobody answered.
  it('does not sync a bust-out it merely found, and hands it the failsafe', () => {
    drive({ players: [busted('amy', 2), active('dave'), active('cat')], rebuysAnswered: [], readOnly: false });
    expect(latest.answered).toEqual([]);
    expect(latest.player).toBeNull();          // no dialog popped about it
    expect(latest.failsafeFor).toBe('amy');    // but the button is there
  });

  it('syncs a real answer', () => {
    const h: Harness = { players: [active('amy'), active('dave'), active('cat')], rebuysAnswered: [], readOnly: false };
    const d = drive(h);
    d.rerender({ ...h, players: [busted('amy', 3), active('dave'), active('cat')] });
    act(() => { latest.answer(false); });
    expect(latest.answered).toEqual(['amy:0']);
  });

  it('starts every new game with nothing seen and nothing answered', () => {
    const d = drive({ players: [active('amy'), busted('dave', 2)], readOnly: false, gameId: 'g1' });
    d.rerender({ players: [active('amy'), active('dave')], readOnly: false, gameId: 'g2' });
    d.rerender({ players: [active('amy'), busted('dave', 2)], readOnly: false, gameId: 'g2' });
    // Dave busting in game 2 is a new question, not game 1's old key.
    expect(latest.player?.id).toBe('dave');
  });
});
