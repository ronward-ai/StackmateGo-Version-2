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

describe('player check-in', () => {
  it('allows an unauthenticated claim that only marks claimedBy', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'activeTournaments', TOURNAMENT), {
      players: [
        { id: 'p1', name: 'Alice', isActive: true, claimedBy: 'device-abc' },
        { id: 'p2', name: 'Bob', isActive: true },
      ],
    }));
  });

  it('rejects deleting players from the tournament', async () => {
    // The destructive case: anyone with the QR link wiping the field mid-game.
    await assertFails(updateDoc(doc(anon(), 'activeTournaments', TOURNAMENT), { players: [] }));
    await assertFails(updateDoc(doc(anon(), 'activeTournaments', TOURNAMENT), {
      players: [{ id: 'p1', name: 'Alice', isActive: true }],
    }));
  });

  it('rejects injecting extra players', async () => {
    await assertFails(updateDoc(doc(anon(), 'activeTournaments', TOURNAMENT), {
      players: [
        { id: 'p1', name: 'Alice', isActive: true },
        { id: 'p2', name: 'Bob', isActive: true },
        { id: 'p3', name: 'Mallory', isActive: true },
      ],
    }));
  });

  it('rejects an unauthenticated write that touches any other field', async () => {
    await assertFails(updateDoc(doc(anon(), 'activeTournaments', TOURNAMENT), {
      players: [
        { id: 'p1', name: 'Alice', isActive: true },
        { id: 'p2', name: 'Bob', isActive: true },
      ],
      isRunning: true,
    }));
  });

  it('rejects ownership takeover', async () => {
    await assertFails(updateDoc(doc(anonAuth(), 'activeTournaments', TOURNAMENT), { ownerId: 'anon-uid' }));
    await assertFails(updateDoc(doc(stranger(), 'activeTournaments', TOURNAMENT), { ownerId: OTHER_DIRECTOR }));
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

  it('KNOWN GAP: a registered stranger can still create league documents', async () => {
    // Documents the accepted trade-off rather than the desired end state.
    // Scoping create to ownsLeague() closes this, but also denies handover
    // directors — silently losing results mid-game. See the director-handover
    // test below. The real fix is to authorise by tournament, not by league.
    const db = stranger();
    await assertSucceeds(setDoc(doc(db, 'seasons', 'forged-season'), { name: 'Fake', leagueId: LEAGUE }));
    await assertSucceeds(setDoc(doc(db, 'tournamentResults', 'forged-result'), { leagueId: LEAGUE, points: 999 }));
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

describe('director handover', () => {
  it('lets a handover director record results into the original league', async () => {
    // After a transfer-code handover the new director is a registered user who
    // is NOT the league owner. useLeague still resolves currentLeagueId from the
    // tournament's stored leagueId, so addResultMutation writes results tagged
    // with the ORIGINAL director's leagueId while authenticated as someone else.
    //
    // This is the flow that ownsLeague()-on-create broke. The denial surfaced
    // only as a console permission error, so a full night's results would go
    // unrecorded with nothing shown to the director. Guards the revert.
    await assertSucceeds(setDoc(doc(stranger(), 'tournamentResults', 'handover-result'), {
      leagueId: LEAGUE, position: 3, points: 5, leaguePlayerId: 'player-1',
    }));
  });

  it('still denies a handover director rewriting existing league standings', async () => {
    await assertFails(updateDoc(doc(stranger(), 'leaguePlayers', 'player-1'), { totalPoints: 1 }));
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

  it("stops a stranger reading another director's league", async () => {
    await assertFails(getDoc(doc(stranger(), 'leagues', LEAGUE)));
  });

  it('stops an anonymous participant enumerating all leagues', async () => {
    await assertFails(getDocs(collection(anonAuth(), 'leagues')));
  });

  it("stops a stranger writing another director's league settings", async () => {
    await assertFails(updateDoc(doc(stranger(), 'leagueSettings', 'settings-1'), { isDefault: false }));
    await assertFails(updateDoc(doc(anonAuth(), 'leagueSettings', 'settings-1'), { isDefault: false }));
  });
});
