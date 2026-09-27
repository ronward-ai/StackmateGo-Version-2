import { describe, it, expect } from 'vitest';
import { rebuyToOffer, offerKey } from './rebuyOffer';

const on = { allowRebuys: true } as const;
const busted = (over: any = {}) => ({ id: 'a', name: 'Dave', isActive: false, position: 7, ...over });
const active = (over: any = {}) => ({ id: 'b', name: 'Sam', isActive: true, ...over });

describe('offerKey', () => {
  // NOT the id alone. A player who busts, rebuys and busts again is a new
  // question — the "a count recurs; a question does not" lesson from the
  // final-table prompt, which was swallowed by a latch that could not tell two
  // occurrences apart.
  it('changes once the rebuy is taken, so the next bust-out asks again', () => {
    expect(offerKey(busted({ rebuys: 0 }))).not.toBe(offerKey(busted({ rebuys: 1 })));
  });

  it('is stable for one bust-out', () => {
    expect(offerKey(busted({ rebuys: 2 }))).toBe(offerKey(busted({ rebuys: 2 })));
  });

  it('treats an absent count as zero', () => {
    expect(offerKey(busted())).toBe(offerKey(busted({ rebuys: 0 })));
  });

  it('is null without a player', () => {
    expect(offerKey(null)).toBeNull();
    expect(offerKey(undefined)).toBeNull();
  });
});

describe('rebuyToOffer', () => {
  it('offers to the player who just busted', () => {
    expect(rebuyToOffer([busted(), active()], on, 0, null)?.id).toBe('a');
  });

  it('offers nothing when nobody has busted', () => {
    expect(rebuyToOffer([active()], on, 0, null)).toBeNull();
    expect(rebuyToOffer([], on, 0, null)).toBeNull();
    expect(rebuyToOffer(null, on, 0, null)).toBeNull();
  });

  // entryLimits still owns whether a rebuy is ALLOWED. This only decides when
  // it is asked, so every one of its rules still bites.
  it('offers nothing when rebuys are off', () => {
    expect(rebuyToOffer([busted()], { allowRebuys: false }, 0, null)).toBeNull();
    expect(rebuyToOffer([busted()], undefined, 0, null)).toBeNull();
  });

  it('offers nothing once the cap is used', () => {
    expect(rebuyToOffer([busted({ rebuys: 2 })], { ...on, maxRebuys: 2 }, 0, null)).toBeNull();
    expect(rebuyToOffer([busted({ rebuys: 1 })], { ...on, maxRebuys: 2 }, 0, null)?.id).toBe('a');
  });

  // Levels are zero-indexed in state, one-indexed on screen — entryLimits does
  // the +1 internally, and this must not do its own.
  it('offers nothing once the rebuy period has ended', () => {
    const s = { ...on, rebuyPeriodLevels: 3 };
    expect(rebuyToOffer([busted()], s, 2, null)?.id).toBe('a');  // level 3
    expect(rebuyToOffer([busted()], s, 3, null)).toBeNull();     // level 4
  });

  // Asking twice about one bust-out is the nagging the final-table prompt caps.
  it('offers nothing once THIS bust-out has been answered', () => {
    const p = busted({ rebuys: 0 });
    expect(rebuyToOffer([p], on, 0, offerKey(p))).toBeNull();
  });

  // But a second bust-out by the same player is a new question.
  it('offers again after the player rebought and busted again', () => {
    const first = busted({ rebuys: 0 });
    const second = busted({ rebuys: 1 });
    expect(rebuyToOffer([second], on, 0, offerKey(first))?.id).toBe('a');
  });

  // Answering about one player must not silence the question about another.
  it('offers to a different player despite an answered key', () => {
    const other = busted({ id: 'z', position: 6 });
    expect(rebuyToOffer([other], on, 0, offerKey(busted({ id: 'a' })))?.id).toBe('z');
  });

  it('offers to the MOST RECENT bust-out when several are out', () => {
    // Positions count DOWN — the first player out of nine takes 9th — so the
    // smaller number is the fresher bust-out. This assertion was written the
    // other way round first, matching a real bug in mostRecentlyBusted that
    // had both prompts naming the first player eliminated all night.
    const out = rebuyToOffer([busted({ id: 'early', position: 9 }), busted({ id: 'late', position: 4 })], on, 0, null);
    expect(out?.id).toBe('late');
  });
});
