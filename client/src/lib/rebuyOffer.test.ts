import { describe, it, expect } from 'vitest';
import {
  rebuyToOffer, offerKey, bustedKeys, failsafeRebuyId, failsafeMemory, rememberedFailsafeKey,
  answeredKeys,
} from './rebuyOffer';

const none = new Set<string>();
const seen = (...keys: (string | null)[]) => new Set(keys.filter((k): k is string => !!k));

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
    expect(rebuyToOffer([busted(), active()], on, 0, none)?.id).toBe('a');
  });

  it('offers nothing when nobody has busted', () => {
    expect(rebuyToOffer([active()], on, 0, none)).toBeNull();
    expect(rebuyToOffer([], on, 0, none)).toBeNull();
    expect(rebuyToOffer(null, on, 0, none)).toBeNull();
  });

  // entryLimits still owns whether a rebuy is ALLOWED. This only decides when
  // it is asked, so every one of its rules still bites.
  it('offers nothing when rebuys are off', () => {
    expect(rebuyToOffer([busted()], { allowRebuys: false }, 0, none)).toBeNull();
    expect(rebuyToOffer([busted()], undefined, 0, none)).toBeNull();
  });

  it('offers nothing once the cap is used', () => {
    expect(rebuyToOffer([busted({ rebuys: 2 })], { ...on, maxRebuys: 2 }, 0, none)).toBeNull();
    expect(rebuyToOffer([busted({ rebuys: 1 })], { ...on, maxRebuys: 2 }, 0, none)?.id).toBe('a');
  });

  // Levels are zero-indexed in state, one-indexed on screen — entryLimits does
  // the +1 internally, and this must not do its own.
  it('offers nothing once the rebuy period has ended', () => {
    const s = { ...on, rebuyPeriodLevels: 3 };
    expect(rebuyToOffer([busted()], s, 2, none)?.id).toBe('a');  // level 3
    expect(rebuyToOffer([busted()], s, 3, none)).toBeNull();     // level 4
  });

  // Asking twice about one bust-out is the nagging the final-table prompt caps.
  it('offers nothing once THIS bust-out has been answered', () => {
    const p = busted({ rebuys: 0 });
    expect(rebuyToOffer([p], on, 0, seen(offerKey(p)))).toBeNull();
  });

  // But a second bust-out by the same player is a new question.
  it('offers again after the player rebought and busted again', () => {
    const first = busted({ rebuys: 0 });
    const second = busted({ rebuys: 1 });
    expect(rebuyToOffer([second], on, 0, seen(offerKey(first)))?.id).toBe('a');
  });

  // Answering about one player must not silence the question about another.
  it('offers to a different player despite an answered key', () => {
    const other = busted({ id: 'z', position: 6 });
    expect(rebuyToOffer([other], on, 0, seen(offerKey(busted({ id: 'a' }))))?.id).toBe('z');
  });

  it('offers to the MOST RECENT bust-out when several are out', () => {
    // Positions count DOWN — the first player out of nine takes 9th — so the
    // smaller number is the fresher bust-out. This assertion was written the
    // other way round first, matching a real bug in mostRecentlyBusted that
    // had both prompts naming the first player eliminated all night.
    const out = rebuyToOffer([busted({ id: 'early', position: 9 }), busted({ id: 'late', position: 4 })], on, 0, none);
    expect(out?.id).toBe('late');
  });
});

describe('bustedKeys — what a console seeds itself with', () => {
  // A refresh mid-game must not re-offer a rebuy for a bust-out from an hour
  // ago. The console seeds `seen` with whatever is already out.
  it('lists every busted player', () => {
    const keys = bustedKeys([busted({ id: 'a', position: 9 }), busted({ id: 'b', position: 8, rebuys: 1 }), active()]);
    expect(keys.sort()).toEqual(['a:0', 'b:1']);
  });

  it('ignores players still in the game', () => {
    expect(bustedKeys([active(), active({ id: 'c' })])).toEqual([]);
  });

  // Same reason mostRecentlyBusted filters on isFinished: a busted player with
  // no finishing position is not a bust-out anyone can reason about.
  it('ignores a busted player with no finishing position', () => {
    expect(bustedKeys([{ id: 'x', isActive: false }])).toEqual([]);
  });

  it('survives an empty or absent roster', () => {
    expect(bustedKeys([])).toEqual([]);
    expect(bustedKeys(null)).toEqual([]);
  });
});

describe('the reopen trap', () => {
  // Accepting an offer makes that player ACTIVE, so mostRecentlyBusted returns
  // the next most recent bust-out — an older one. A single "last answered" key
  // would not match it and the dialog would reopen, offering a rebuy for a
  // player who busted long before: the lingering offer rebuilt as a popup.
  it('does not fall through to an older bust-out once both are seen', () => {
    const older = busted({ id: 'older', position: 9 });
    const newer = busted({ id: 'newer', position: 8 });
    const answered = seen(offerKey(newer), offerKey(older));
    expect(rebuyToOffer([older, newer], on, 0, answered)).toBeNull();
  });

  // And it does NOT fall through to an older bust-out when the most recent one
  // has been answered. Falling through would offer a rebuy for a player who
  // busted earlier in the night, which is the lingering offer wearing a hat.
  // Only the freshest bust-out is ever on the table.
  it('does not fall through to an older bust-out at all', () => {
    const older = busted({ id: 'older', position: 9 });
    const newer = busted({ id: 'newer', position: 8 });
    expect(rebuyToOffer([older, newer], on, 0, seen(offerKey(newer)))).toBeNull();
  });
});

describe('failsafeRebuyId — the misclick failsafe', () => {
  const older = busted({ id: 'older', position: 9 });
  const newer = busted({ id: 'newer', position: 8 });
  const key = (p: any) => offerKey(p)!;

  it('is held by the bust-out that was last witnessed', () => {
    expect(failsafeRebuyId([older, newer], on, 0, key(newer))).toBe('newer');
  });

  // THE REPORTED BUG. Using the failsafe on Amy made her active, so the roster's
  // "most recently busted" became Dave — who busted BEFORE her — and he
  // inherited the button. The key carries the rebuy count, so once she rebuys
  // nothing matches and nobody inherits anything.
  it('is held by NOBODY once that player takes the rebuy', () => {
    const rebought = { id: 'newer', isActive: true, rebuys: 1 };
    expect(failsafeRebuyId([older, rebought], on, 0, key(newer))).toBeNull();
  });

  // The same thing said from the other side: an earlier bust-out can never
  // match, because the key names a player.
  it('is never held by an earlier bust-out', () => {
    expect(failsafeRebuyId([older, newer], on, 0, key(older))).toBe('older');
    expect(failsafeRebuyId([older, newer], on, 0, key(newer))).not.toBe('older');
  });

  it('moves to the newest bust-out, never two at once', () => {
    expect(failsafeRebuyId([older], on, 0, key(older))).toBe('older');
    // The console witnesses a newer one and tracks that key instead.
    expect(failsafeRebuyId([older, newer], on, 0, key(newer))).toBe('newer');
  });

  it('closes when the rebuy period ends', () => {
    const s = { ...on, rebuyPeriodLevels: 3 };
    expect(failsafeRebuyId([newer], s, 2, key(newer))).toBe('newer'); // level 3
    expect(failsafeRebuyId([newer], s, 3, key(newer))).toBeNull();    // level 4
  });

  it('closes when the cap is used, or rebuys are off', () => {
    const capped = busted({ id: 'c', rebuys: 2 });
    expect(failsafeRebuyId([capped], { ...on, maxRebuys: 2 }, 0, key(capped))).toBeNull();
    expect(failsafeRebuyId([newer], { allowRebuys: false }, 0, key(newer))).toBeNull();
  });

  // Independent of the answered-set on purpose. Declining the dialog must not
  // take the failsafe away, or it is not a failsafe.
  it('stays open after the offer has been declined', () => {
    expect(rebuyToOffer([newer], on, 0, seen(offerKey(newer)))).toBeNull();
    expect(failsafeRebuyId([newer], on, 0, key(newer))).toBe('newer');
  });

  // Same reason mostRecentlyBusted filters on isFinished.
  it('ignores a busted player carrying no finishing position', () => {
    const noPosition = { id: 'x', isActive: false, rebuys: 0 };
    expect(failsafeRebuyId([noPosition], on, 0, 'x:0')).toBeNull();
  });

  it('is null with no tracked bust-out, or an empty roster', () => {
    expect(failsafeRebuyId([newer], on, 0, null)).toBeNull();
    expect(failsafeRebuyId([newer], on, 0, undefined)).toBeNull();
    expect(failsafeRebuyId([], on, 0, key(newer))).toBeNull();
    expect(failsafeRebuyId(null, on, 0, key(newer))).toBeNull();
  });
});

describe('the failsafe across a refresh', () => {
  const stored = (gameId: string, key: string) => failsafeMemory(gameId, key)!;

  it('restores the key for THIS game', () => {
    expect(rememberedFailsafeKey(stored('g1', 'a:0'), 'g1')).toBe('a:0');
  });

  // The guard that matters. A key from last night must not be matched against
  // tonight's roster — failsafeRebuyId would almost certainly reject it, but
  // that rests on player ids never colliding, which is a coincidence.
  it('ignores a key stored against a DIFFERENT game', () => {
    expect(rememberedFailsafeKey(stored('g1', 'a:0'), 'g2')).toBeNull();
  });

  // Storage is read back from somewhere the app does not control, so every one
  // of these is an ordinary outcome rather than an error.
  it('restores nothing from anything unusable', () => {
    expect(rememberedFailsafeKey(null, 'g1')).toBeNull();
    expect(rememberedFailsafeKey(undefined, 'g1')).toBeNull();
    expect(rememberedFailsafeKey('', 'g1')).toBeNull();
    expect(rememberedFailsafeKey('not json', 'g1')).toBeNull();
    expect(rememberedFailsafeKey('null', 'g1')).toBeNull();
    expect(rememberedFailsafeKey('"a string"', 'g1')).toBeNull();
    expect(rememberedFailsafeKey('{"gameId":"g1"}', 'g1')).toBeNull();
    expect(rememberedFailsafeKey('{"gameId":"g1","key":""}', 'g1')).toBeNull();
    expect(rememberedFailsafeKey('{"gameId":"g1","key":7}', 'g1')).toBeNull();
  });

  it('restores nothing when this console has no game', () => {
    expect(rememberedFailsafeKey(stored('g1', 'a:0'), null)).toBeNull();
  });

  it('writes nothing without both halves', () => {
    expect(failsafeMemory(null, 'a:0')).toBeNull();
    expect(failsafeMemory('g1', null)).toBeNull();
    expect(failsafeMemory('g1', '')).toBeNull();
  });

  // The round trip is what the console actually does, so assert it end to end
  // rather than asserting a JSON shape somebody wrote down.
  it('round-trips, and hands the key straight to failsafeRebuyId', () => {
    const p = busted({ id: 'a', position: 8, rebuys: 0 });
    const raw = failsafeMemory('g1', offerKey(p)!)!;
    expect(failsafeRebuyId([p], on, 0, rememberedFailsafeKey(raw, 'g1'))).toBe('a');
  });

  // The self-closing property, across the reload: they rebought before it, so
  // their key moved and nobody holds the button.
  it('hands back nothing when that player rebought before the reload', () => {
    const before = busted({ id: 'a', position: 8, rebuys: 0 });
    const raw = failsafeMemory('g1', offerKey(before)!)!;
    const after = { id: 'a', isActive: true, rebuys: 1 };
    expect(failsafeRebuyId([after], on, 0, rememberedFailsafeKey(raw, 'g1'))).toBeNull();
  });
});

/**
 * THE REPORTED BUG: bust a player out on the laptop, press "No — they are out",
 * take control on the phone, and the same dialog opens again. The answer lived
 * only in a ref on the laptop.
 */
describe('answeredKeys', () => {
  it('unions the game record with this console', () => {
    expect([...answeredKeys(['a:0'], new Set(['b:0']))].sort()).toEqual(['a:0', 'b:0']);
  });

  it('takes the record alone — the reported bug, reduced to one assertion', () => {
    // The phone answered nothing; the laptop's "No" arrives in the record.
    const seen = answeredKeys(['amy:0'], new Set());
    const players = [{ id: 'amy', isActive: false, position: 4, rebuys: 0 }];
    expect(rebuyToOffer(players, { allowRebuys: true } as any, 0, seen)).toBeNull();
  });

  it('takes this console alone, for a game whose record has none yet', () => {
    expect([...answeredKeys(undefined, new Set(['a:0']))]).toEqual(['a:0']);
    expect([...answeredKeys(null, new Set(['a:0']))]).toEqual(['a:0']);
  });

  it('is empty when neither side has anything', () => {
    expect(answeredKeys(undefined, undefined).size).toBe(0);
    expect(answeredKeys([], new Set()).size).toBe(0);
  });

  it('de-duplicates rather than double-counting the same answer', () => {
    expect(answeredKeys(['a:0'], new Set(['a:0'])).size).toBe(1);
  });

  it('ignores junk in the record, which is read back from a place we do not control', () => {
    expect([...answeredKeys(['a:0', '', null as any, 7 as any], new Set())]).toEqual(['a:0']);
  });

  /**
   * The property the whole design rests on: it only grows, so a stale snapshot
   * can only be a SUBSET and the union heals it. No echo guard needed.
   */
  it('is monotonic — a subset from the record cannot unanswer anything', () => {
    const local = new Set(['a:0', 'b:0']);
    expect(answeredKeys([], local).size).toBe(2);
    expect(answeredKeys(['a:0'], local).size).toBe(2);
  });
});
