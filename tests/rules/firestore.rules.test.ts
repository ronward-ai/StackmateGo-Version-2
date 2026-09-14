import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Rules tests for firestore.rules.
 *
 * Focused on the guarantees a live tournament depends on:
 *  - participants can read what the QR flow needs, unauthenticated
 *  - participants cannot destroy or forge tournament and league data
 *  - one director cannot write into another director's league
 *
 * Run with: npm run test:rules
 */

const DIRECTOR = 'director-uid';
const OTHER_DIRECTOR = 'other-director-uid';
const LEAGUE = 'league-1';
const OTHER_LEAGUE = 'league-2';
const TOURNAMENT = 'tournament-1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'stackmate-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed baseline data with rules disabled.
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'leagues', LEAGUE), { name: 'Test League', ownerId: DIRECTOR });
    await setDoc(doc(db, 'leagues', OTHER_LEAGUE), { name: 'Other League', ownerId: OTHER_DIRECTOR });
    await setDoc(doc(db, 'seasons', 'season-1'), { name: 'Season 1', leagueId: LEAGUE, status: 'active' });
    await setDoc(doc(db, 'leaguePlayers', 'player-1'), { name: 'Alice', leagueId: LEAGUE, totalPoints: 10 });
    await setDoc(doc(db, 'tournamentResults', 'result-1'), { leagueId: LEAGUE, position: 1, points: 10 });
    await setDoc(doc(db, 'leagueSettings', 'settings-1'), { userId: DIRECTOR, leagueId: LEAGUE, isDefault: true, settings: {} });
    await setDoc(doc(db, 'activeTournaments', TOURNAMENT), {
      name: 'Friday Game',
      ownerId: DIRECTOR,
      isRunning: false,
      currentLevel: 0,
      players: [
        { id: 'p1', name: 'Alice', isActive: true },
        { id: 'p2', name: 'Bob', isActive: true },
      ],
    });
  });
});

/** Unauthenticated context — a QR participant before/without any sign-in. */
const anon = () => testEnv.unauthenticatedContext().firestore();
/** Signed-in-anonymously participant. */
const anonAuth = () =>
  testEnv.authenticatedContext('anon-uid', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
/** The league's registered owner. */
const director = () =>
  testEnv.authenticatedContext(DIRECTOR, { firebase: { sign_in_provider: 'password' } }).firestore();
/** A different registered user. */
const stranger = () =>
  testEnv.authenticatedContext(OTHER_DIRECTOR, { firebase: { sign_in_provider: 'password' } }).firestore();

describe('participant reads (QR flow)', () => {
  it('lets an unauthenticated participant read the tournament', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'activeTournaments', TOURNAMENT)));
  });

  it('lets an unauthenticated participant read standings data', async () => {
    const db = anon();
    await assertSucceeds(getDoc(doc(db, 'seasons', 'season-1')));
    await assertSucceeds(getDoc(doc(db, 'leaguePlayers', 'player-1')));
    await assertSucceeds(getDoc(doc(db, 'tournamentResults', 'result-1')));
  });

  it("lets a participant read the director's league settings", async () => {
    // Regression: this was owner-only, so the participant view silently fell
    // back to DEFAULT_LEAGUE_SETTINGS and could show different points totals
    // than the director's screen.
    await assertSucceeds(getDoc(doc(anonAuth(), 'leagueSettings', 'settings-1')));
    await assertSucceeds(getDoc(doc(anon(), 'leagueSettings', 'settings-1')));
  });
});

describe('enumeration is closed off (H2)', () => {
  // read: if true used to cover BOTH get and list on seasons, leaguePlayers,
  // tournamentResults and leagueSettings — so one unauthenticated REST call
  // could paginate out every player's real name, every result, every season
  // structure and every director's Firebase uid across the WHOLE app, not
  // just a league a caller has any connection to. get is deliberately
  // unaffected throughout this block; only list changes.

  it('still lets anyone get a document by id, unauthenticated', async () => {
    const db = anon();
    await assertSucceeds(getDoc(doc(db, 'seasons', 'season-1')));
    await assertSucceeds(getDoc(doc(db, 'leaguePlayers', 'player-1')));
    await assertSucceeds(getDoc(doc(db, 'tournamentResults', 'result-1')));
  });

  it('stops listing seasons, leaguePlayers and tournamentResults with no session at all', async () => {
    await assertFails(getDocs(query(collection(anon(), 'seasons'), where('leagueId', '==', LEAGUE))));
    await assertFails(getDocs(query(collection(anon(), 'leaguePlayers'), where('leagueId', '==', LEAGUE))));
    await assertFails(getDocs(query(collection(anon(), 'tournamentResults'), where('leagueId', '==', LEAGUE))));
  });

  it('an anonymous SESSION is enough to list them — costs a real participant nothing', async () => {
    // The participant view signs every visitor in anonymously on arrival, so
    // this is the bar that actually matters: it must not break the app.
    await assertSucceeds(getDocs(query(collection(anonAuth(), 'seasons'), where('leagueId', '==', LEAGUE))));
    await assertSucceeds(getDocs(query(collection(anonAuth(), 'leaguePlayers'), where('leagueId', '==', LEAGUE))));
    await assertSucceeds(getDocs(query(collection(anonAuth(), 'tournamentResults'), where('leagueId', '==', LEAGUE))));
  });

  it('leagueSettings list is OWNER-ONLY, not merely "some session" — it carries a Firebase uid', async () => {
    const notOwner = query(collection(anonAuth(), 'leagueSettings'), where('userId', '==', DIRECTOR));
    await assertFails(getDocs(notOwner));
    await assertFails(getDocs(query(collection(stranger(), 'leagueSettings'), where('userId', '==', DIRECTOR))));
    await assertFails(getDocs(query(collection(anon(), 'leagueSettings'), where('userId', '==', DIRECTOR))));
    await assertSucceeds(getDocs(query(collection(director(), 'leagueSettings'), where('userId', '==', DIRECTOR))));
  });

  it("a participant reaches a director's CURRENT settings by get(), never by listing", async () => {
    // The deterministic id lib/leagueSettingsId.ts computes — a participant
    // who knows the tournament's ownerId and leagueId (both public) can reach
    // this document with a single unauthenticated get(), no list required.
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'leagueSettings', `${DIRECTOR}_${LEAGUE}`), {
        userId: DIRECTOR, leagueId: LEAGUE, isDefault: true, settings: { pointsSystem: {} },
      });
    });
    await assertSucceeds(getDoc(doc(anon(), 'leagueSettings', `${DIRECTOR}_${LEAGUE}`)));
  });
});

describe('only the director may change a live game', () => {
  // A branch used to allow any isAuthenticated() caller to write the timer,
  // blinds and player list. isAuthenticated() includes anonymous sessions, and
  // the participant view signs every QR visitor in anonymously — so any player
  // could have paused the clock. It also meant handover shared control rather
  // than transferring it.

  it('lets the owner change the timer, blinds and players', async () => {
    const db = director();
    await assertSucceeds(updateDoc(doc(db, 'activeTournaments', TOURNAMENT), { isRunning: true }));
    await assertSucceeds(updateDoc(doc(db, 'activeTournaments', TOURNAMENT), { secondsLeft: 300 }));
    await assertSucceeds(updateDoc(doc(db, 'activeTournaments', TOURNAMENT), { smallBlind: 50, bigBlind: 100 }));
  });

  it('stops an anonymous participant running the clock', async () => {
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), { isRunning: true }));
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), { secondsLeft: 1 }));
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), { currentLevel: 5 }));
  });

  it('stops an anonymous participant changing the blinds or structure', async () => {
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), { smallBlind: 1, bigBlind: 2 }));
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), { blindLevels: [] }));
  });

  it('stops a registered non-owner — the previous director after a handover', async () => {
    // Values that genuinely differ from the seed. Writing a field its existing
    // value produces an EMPTY diff, and hasOnly([...]) is trivially true for an
    // empty set, so a no-op write slips through the check-in branch. Harmless —
    // nothing changes — but it makes for a test that proves nothing.
    await assertFails(updateDoc(doc(stranger(), 'activeTournaments', TOURNAMENT), { isRunning: true }));
    await assertFails(updateDoc(doc(stranger(), 'activeTournaments', TOURNAMENT), { currentLevel: 9 }));
  });

  it('still lets a participant check in, which is a different branch', async () => {
    // Guards against tightening this so far that the QR flow breaks. Check-in
    // writes `claims` now, never `players` — see the 'player check-in'
    // describe block below for the full behaviour of that branch.
    await assertSucceeds(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      claims: { p1: 'device-abc' },
    }));
  });

  it('stops an anonymous participant editing claims alongside anything else', async () => {
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      claims: { p1: 'device-abc' },
      isRunning: true,
    }));
  });

  // THE regression test for this branch's redesign. Before, check-in wrote
  // `players` directly (array length preserved, contents unconstrained) — so
  // any anonymous session could rename a player, change their chips, or flip
  // isActive to fake an elimination, and the director's own client treated an
  // incoming isActive:false as real. `players` is not reachable from this
  // branch at all any more, under any shape of write.
  it('stops an anonymous participant writing to players at all, even just to set a claim', async () => {
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      players: [
        { id: 'p1', name: 'Alice', isActive: true, claimedBy: 'device-abc' },
        { id: 'p2', name: 'Bob', isActive: true },
      ],
    }));
    // Not by renaming someone.
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      players: [
        { id: 'p1', name: 'Mallory', isActive: true },
        { id: 'p2', name: 'Bob', isActive: true },
      ],
    }));
    // Not by faking an elimination.
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      players: [
        { id: 'p1', name: 'Alice', isActive: false },
        { id: 'p2', name: 'Bob', isActive: true },
      ],
    }));
  });
});

describe('listing tournaments', () => {
  // `read: if true` covered list as well as get, so any client could enumerate
  // every tournament in the database. Participants only ever need one by id.
  it('lets an owner list their own tournaments, which is how resume works', async () => {
    await assertSucceeds(getDocs(query(
      collection(director(), 'activeTournaments'),
      where('ownerId', '==', DIRECTOR),
    )));
  });

  it('stops anyone enumerating tournaments', async () => {
    await assertFails(getDocs(query(collection(anon(), 'activeTournaments'))));
    await assertFails(getDocs(query(collection(anonAuth(), 'activeTournaments'))));
    await assertFails(getDocs(query(collection(director(), 'activeTournaments'))));
  });

  it("stops a stranger listing someone else's tournaments", async () => {
    await assertFails(getDocs(query(
      collection(stranger(), 'activeTournaments'),
      where('ownerId', '==', DIRECTOR),
    )));
  });

  it('still lets a QR participant read one tournament by id', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'activeTournaments', TOURNAMENT)));
  });
});

describe('player check-in', () => {
  // `claims` is a top-level map, playerId -> deviceId — see lib/seatClaims.ts.
  // It replaced a `claimedBy` field living INSIDE each players-array entry,
  // which meant a check-in write had the same shape as every other
  // players-array write and the rule could not tell "set my claim" apart from
  // "rename this player" or "eliminate this player". See the regression test
  // in the describe block above ('stops an anonymous participant writing to
  // players at all, even just to set a claim') for the attack this closed.

  it('allows a signed-in-anonymously claim', async () => {
    await assertSucceeds(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      claims: { p1: 'device-abc' },
    }));
  });

  // PlayerClaimView writes a single dotted field path — claims.<playerId> —
  // rather than the whole map, so that two people checking in at once touch
  // different keys and cannot clobber each other. Firestore treats that as a
  // merge into the existing map; affectedKeys() still reports only the
  // top-level `claims` key, so hasOnly(['claims']) is unaffected by which
  // shape of write hits the map.
  it('allows the single-key dotted-path write PlayerClaimView actually sends', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'activeTournaments', TOURNAMENT), {
        claims: { p2: 'device-existing' },
      }, { merge: true });
    });
    await assertSucceeds(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      'claims.p1': 'device-abc',
    }));
    let data: any;
    await testEnv.withSecurityRulesDisabled(async ctx => {
      const snap = await getDoc(doc(ctx.firestore(), 'activeTournaments', TOURNAMENT));
      data = snap.data();
    });
    // The sibling key set outside the rules check must survive untouched —
    // proof this is a merge, not a whole-map replace.
    expect(data.claims).toEqual({ p1: 'device-abc', p2: 'device-existing' });
  });

  // The write used to go out with no token at all, so anyone who could see the
  // QR code could PATCH a live game's players array from anywhere, with nothing
  // tying the write to a session. PlayerClaimView now signs in anonymously
  // before writing, which costs the participant nothing.
  it('rejects a check-in with no session at all', async () => {
    await assertFails(updateDoc(doc(anon(), 'activeTournaments', TOURNAMENT), {
      claims: { p1: 'device-abc' },
    }));
  });

  it('rejects a claims value that is not a map', async () => {
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      claims: 'device-abc',
    }));
  });

  // Bounded to at most one entry per seat in the game — there is no
  // legitimate reason for more, and it stops a claims map being padded with
  // junk keys.
  it('rejects a claims map larger than the player count', async () => {
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      claims: { p1: 'device-a', p2: 'device-b', p3: 'device-c' }, // only 2 players seeded
    }));
  });

  it('rejects a check-in write that touches any other field', async () => {
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), {
      claims: { p1: 'device-abc' },
      isRunning: true,
    }));
  });

  it('rejects ownership takeover', async () => {
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), { ownerId: 'anon-uid' }));
    await assertFails(updateDoc(doc(stranger(), 'activeTournaments', TOURNAMENT), { ownerId: OTHER_DIRECTOR }));
  });

  // The case the test above misses, and the one the rule missed with it.
  // isExistingDocOwner() validates the STORED ownerId and said nothing about
  // the incoming one, so the OWNER could give the game away — reinstating the
  // transfer-code handover that was removed because it cost a live game.
  it('stops the owner giving the game away, or orphaning it', async () => {
    await assertFails(updateDoc(doc(director(), 'activeTournaments', TOURNAMENT), { ownerId: OTHER_DIRECTOR }));
    await assertFails(updateDoc(doc(director(), 'activeTournaments', TOURNAMENT), { ownerId: 'nobody-at-all' }));
    // Everything else about the game is still theirs to change.
    await assertSucceeds(updateDoc(doc(director(), 'activeTournaments', TOURNAMENT), { isRunning: false }));
  });

  it('rejects deletion by anyone but the owner', async () => {
    await assertFails(deleteDoc(doc(anon(), 'activeTournaments', TOURNAMENT)));
    await assertFails(deleteDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT)));
    await assertFails(deleteDoc(doc(stranger(), 'activeTournaments', TOURNAMENT)));
    await assertSucceeds(deleteDoc(doc(director(), 'activeTournaments', TOURNAMENT)));
  });
});

describe('league data integrity', () => {
  it('lets the owning director create league documents', async () => {
    const db = director();
    await assertSucceeds(setDoc(doc(db, 'seasons', 'new-season'), { name: 'S2', leagueId: LEAGUE }));
    await assertSucceeds(setDoc(doc(db, 'leaguePlayers', 'new-player'), { name: 'Carol', leagueId: LEAGUE }));
    await assertSucceeds(setDoc(doc(db, 'tournamentResults', 'new-result'), { leagueId: LEAGUE, points: 5 }));
  });

  it('stops a registered stranger creating documents in a league they do not own', async () => {
    // This was an accepted gap while a handover director could be signed in as
    // another account and still need to record results. Handover between
    // accounts no longer exists, so creates are owner-scoped like every other
    // write: learning a leagueId no longer lets an account inject standings.
    const db = stranger();
    await assertFails(setDoc(doc(db, 'seasons', 'forged-season'), { name: 'Fake', leagueId: LEAGUE }));
    await assertFails(setDoc(doc(db, 'leaguePlayers', 'forged-player'), { name: 'Fake', leagueId: LEAGUE }));
    await assertFails(setDoc(doc(db, 'tournamentResults', 'forged-result'), { leagueId: LEAGUE, points: 999 }));
  });

  it('still lets that stranger write into their OWN league', async () => {
    // The rule is ownership, not identity — the check must not simply pin
    // writes to whoever seeded the test data.
    await assertSucceeds(setDoc(doc(stranger(), 'tournamentResults', 'own-result'), {
      leagueId: OTHER_LEAGUE, position: 1, points: 10,
    }));
  });

  it('rejects a create naming a league that does not exist', async () => {
    // ownsLeague() reads the league document, so a made-up id must fail closed
    // rather than erroring open.
    await assertFails(setDoc(doc(director(), 'tournamentResults', 'orphan-result'), {
      leagueId: 'no-such-league', points: 1,
    }));
  });

  it('rejects a create with no leagueId at all', async () => {
    await assertFails(setDoc(doc(director(), 'tournamentResults', 'unscoped-result'), { points: 1 }));
  });

  it('still stops a stranger MODIFYING existing league documents', async () => {
    // update/delete remain owner-scoped, so existing standings cannot be
    // rewritten or destroyed — only new documents can be added.
    const db = stranger();
    await assertFails(updateDoc(doc(db, 'leaguePlayers', 'player-1'), { totalPoints: 9999 }));
    await assertFails(updateDoc(doc(db, 'tournamentResults', 'result-1'), { points: 9999 }));
    await assertFails(deleteDoc(doc(db, 'tournamentResults', 'result-1')));
  });

  it('stops anonymous users creating league documents', async () => {
    await assertFails(setDoc(doc(anonAuth(), 'leaguePlayers', 'anon-player'), { name: 'X', leagueId: LEAGUE }));
  });

  it('stops a stranger updating or deleting league documents', async () => {
    const db = stranger();
    await assertFails(updateDoc(doc(db, 'leaguePlayers', 'player-1'), { totalPoints: 9999 }));
    await assertFails(deleteDoc(doc(db, 'tournamentResults', 'result-1')));
  });
});

describe('moving documents between leagues', () => {
  // ownsLeague(resource.data.leagueId) asks who owns the league a document is
  // in NOW. It said nothing about the league it was being moved TO — so a
  // registered user could create a result in their own league, which is
  // correctly allowed, then update it into a victim's league with any points
  // they liked. The create path was closed against exactly this attack and the
  // update path reopened it one write later.
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'tournamentResults', 'their-result'), {
        leagueId: OTHER_LEAGUE, position: 5, points: 1,
      });
      await setDoc(doc(db, 'leaguePlayers', 'their-player'), {
        name: 'Mallory', leagueId: OTHER_LEAGUE, totalPoints: 0,
      });
      await setDoc(doc(db, 'seasons', 'their-season'), {
        name: 'Their Season', leagueId: OTHER_LEAGUE, status: 'active',
      });
    });
  });

  it('stops a result being moved into a league the writer does not own', async () => {
    await assertFails(updateDoc(doc(stranger(), 'tournamentResults', 'their-result'), {
      leagueId: LEAGUE, points: 9999,
    }));
  });

  it('stops a player being moved into another league', async () => {
    await assertFails(updateDoc(doc(stranger(), 'leaguePlayers', 'their-player'), { leagueId: LEAGUE }));
  });

  it('stops a season being moved into another league', async () => {
    await assertFails(updateDoc(doc(stranger(), 'seasons', 'their-season'), { leagueId: LEAGUE }));
  });

  it('still lets an owner edit their own documents in place', async () => {
    await assertSucceeds(updateDoc(doc(director(), 'tournamentResults', 'result-1'), { points: 25 }));
    await assertSucceeds(updateDoc(doc(director(), 'leaguePlayers', 'player-1'), { name: 'Alicia' }));
    await assertSucceeds(updateDoc(doc(director(), 'seasons', 'season-1'), { name: 'Spring' }));
  });

  // Restating leagueId unchanged must still work: the app writes whole objects
  // in places, so a pin that only tolerated absence would break real writes.
  it('allows a write that restates the same leagueId', async () => {
    await assertSucceeds(updateDoc(doc(director(), 'tournamentResults', 'result-1'), {
      leagueId: LEAGUE, points: 30,
    }));
  });
});

describe('handing over by logging out', () => {
  // Handover between two different ACCOUNTS was removed. The next director signs
  // in with the SAME account, so they are the league owner throughout — which is
  // what let league writes be owner-scoped again.
  it('lets the account that owns the league record results, from any device', async () => {
    await assertSucceeds(setDoc(doc(director(), 'tournamentResults', 'handover-result'), {
      leagueId: LEAGUE, position: 3, points: 5, leaguePlayerId: 'player-1',
    }));
  });

  it('denies another account writing into this league at all', async () => {
    await assertFails(setDoc(doc(stranger(), 'tournamentResults', 'other-account-result'), {
      leagueId: LEAGUE, position: 3, points: 5, leaguePlayerId: 'player-1',
    }));
    await assertFails(updateDoc(doc(stranger(), 'leaguePlayers', 'player-1'), { totalPoints: 1 }));
  });
});

describe('users (subscription status)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users', DIRECTOR), { subscriptionStatus: 'free' });
    });
  });

  it('lets an account read its own document', async () => {
    await assertSucceeds(getDoc(doc(director(), 'users', DIRECTOR)));
  });

  it('stops an account reading somebody else\'s', async () => {
    await assertFails(getDoc(doc(stranger(), 'users', DIRECTOR)));
  });

  // The point of the collection being read-only to clients: subscriptionStatus
  // is written by the Stripe webhook through the Admin SDK, which bypasses
  // rules. Allowing the owner to write meant any account could grant itself pro
  // from the browser console.
  it('stops an account granting itself pro', async () => {
    await assertFails(updateDoc(doc(director(), 'users', DIRECTOR), { subscriptionStatus: 'pro' }));
    await assertFails(setDoc(doc(director(), 'users', DIRECTOR), { subscriptionStatus: 'pro' }));
  });

  it('stops an account creating a user document for itself', async () => {
    await assertFails(setDoc(doc(stranger(), 'users', OTHER_DIRECTOR), { subscriptionStatus: 'pro' }));
  });
});

describe('completed tournaments (history)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'completedTournaments', 'history-1'), {
        ownerId: DIRECTOR, type: 'standalone', playerCount: 8, endTime: new Date().toISOString(),
      });
    });
  });

  it('lets the owner read, write and delete their own history', async () => {
    const db = director();
    await assertSucceeds(getDoc(doc(db, 'completedTournaments', 'history-1')));
    await assertSucceeds(setDoc(doc(db, 'completedTournaments', 'history-2'), {
      ownerId: DIRECTOR, type: 'standalone', playerCount: 6, endTime: new Date().toISOString(),
    }));
    await assertSucceeds(deleteDoc(doc(db, 'completedTournaments', 'history-1')));
  });

  it("stops anyone else reading a director's history", async () => {
    // Deliberately stricter than the standings collections: this is a private
    // record, and participants have no reason to see it.
    await assertFails(getDoc(doc(stranger(), 'completedTournaments', 'history-1')));
    await assertFails(getDoc(doc(anonAuth(), 'completedTournaments', 'history-1')));
    await assertFails(getDoc(doc(anon(), 'completedTournaments', 'history-1')));
  });

  it('stops anyone else modifying or deleting it', async () => {
    await assertFails(updateDoc(doc(stranger(), 'completedTournaments', 'history-1'), { playerCount: 99 }));
    await assertFails(deleteDoc(doc(stranger(), 'completedTournaments', 'history-1')));
  });

  it('stops a record being created under someone else’s ownerId', async () => {
    await assertFails(setDoc(doc(stranger(), 'completedTournaments', 'forged'), {
      ownerId: DIRECTOR, type: 'standalone', playerCount: 2, endTime: new Date().toISOString(),
    }));
  });

  it('stops anonymous users creating history', async () => {
    await assertFails(setDoc(doc(anonAuth(), 'completedTournaments', 'anon-history'), {
      ownerId: 'anon-uid', type: 'standalone', playerCount: 2, endTime: new Date().toISOString(),
    }));
  });
});

describe('league privacy', () => {
  it('lets a director list their own leagues', async () => {
    const q = query(collection(director(), 'leagues'), where('ownerId', '==', DIRECTOR));
    await assertSucceeds(getDocs(q));
  });

  it('lets anyone GET a league by id (QR participants resolve activeSeasonId)', async () => {
    // get and list are deliberately split: a participant knows the leagueId from
    // the tournament doc and needs the league's activeSeasonId to know which
    // season the standings belong to.
    await assertSucceeds(getDoc(doc(anon(), 'leagues', LEAGUE)));
    await assertSucceeds(getDoc(doc(anonAuth(), 'leagues', LEAGUE)));
    await assertSucceeds(getDoc(doc(stranger(), 'leagues', LEAGUE)));
  });

  it('stops anyone enumerating leagues they do not own', async () => {
    await assertFails(getDocs(collection(anonAuth(), 'leagues')));
    await assertFails(getDocs(collection(anon(), 'leagues')));
    await assertFails(getDocs(query(collection(stranger(), 'leagues'), where('ownerId', '==', DIRECTOR))));
  });

  it('lets the owner set activeSeasonId, and no one else', async () => {
    // The season pointer moved onto the league doc. The update rule also asserts
    // name is still a valid string, so confirm a pointer-only update passes it.
    await assertSucceeds(updateDoc(doc(director(), 'leagues', LEAGUE), { activeSeasonId: 'season-1' }));
    await assertFails(updateDoc(doc(stranger(), 'leagues', LEAGUE), { activeSeasonId: 'season-1' }));
    await assertFails(updateDoc(doc(anonAuth(), 'leagues', LEAGUE), { activeSeasonId: 'season-1' }));
  });

  it("stops a stranger writing another director's league settings", async () => {
    await assertFails(updateDoc(doc(stranger(), 'leagueSettings', 'settings-1'), { isDefault: false }));
    await assertFails(updateDoc(doc(anonAuth(), 'leagueSettings', 'settings-1'), { isDefault: false }));
  });
});
