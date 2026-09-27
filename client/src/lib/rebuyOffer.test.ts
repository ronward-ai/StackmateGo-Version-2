import { describe, it, expect } from 'vitest';
import { rebuyToOffer, offerKey, bustedKeys, rebuyStillOpenFor } from './rebuyOffer';

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

describe('rebuyStillOpenFor — the misclick failsafe', () => {
  const older = busted({ id: 'older', position: 9 });
  const newer = busted({ id: 'newer', position: 8 });

  it('is open for the player who busted most recently', () => {
    expect(rebuyStillOpenFor([older, newer], on, 0, 'newer')).toBe(true);
  });

  // The whole point: exactly one player carries the button.
  it('is CLOSED for anyone who busted before them', () => {
    expect(rebuyStillOpenFor([older, newer], on, 0, 'older')).toBe(false);
  });

  it('closes the moment somebody else busts', () => {
    expect(rebuyStillOpenFor([older], on, 0, 'older')).toBe(true);
    expect(rebuyStillOpenFor([older, newer], on, 0, 'older')).toBe(false);
  });

  it('closes when the rebuy period ends', () => {
    const s = { ...on, rebuyPeriodLevels: 3 };
    expect(rebuyStillOpenFor([newer], s, 2, 'newer')).toBe(true);  // level 3
    expect(rebuyStillOpenFor([newer], s, 3, 'newer')).toBe(false); // level 4
  });

  it('closes when the cap is used, or rebuys are off', () => {
    expect(rebuyStillOpenFor([busted({ rebuys: 2 })], { ...on, maxRebuys: 2 }, 0, 'a')).toBe(false);
    expect(rebuyStillOpenFor([busted()], { allowRebuys: false }, 0, 'a')).toBe(false);
  });

  // Independent of the answered-set on purpose. Answering the dialog must not
  // take the failsafe away, or it is not a failsafe.
  it('stays open after the offer has been declined', () => {
    // The dialog is done with this bust-out...
    expect(rebuyToOffer([newer], on, 0, seen(offerKey(newer)))).toBeNull();
    // ...and the button is still there.
    expect(rebuyStillOpenFor([newer], on, 0, 'newer')).toBe(true);
  });

  it('is closed for an active player, or no player at all', () => {
    expect(rebuyStillOpenFor([active()], on, 0, 'b')).toBe(false);
    expect(rebuyStillOpenFor([newer], on, 0, null)).toBe(false);
    expect(rebuyStillOpenFor([], on, 0, 'newer')).toBe(false);
  });
});
