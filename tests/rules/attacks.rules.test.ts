import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where,

} from 'firebase/firestore';

/**
 * THE ATTACK MATRIX.
 *
 * `firestore.rules.test.ts` is organised by FEATURE, which is how its gaps hide:
 * a rule is tested where the feature that needed it was built, and nothing asks
 * "what can THIS attacker do to EVERY collection". This file asks exactly that,
 * one attacker at a time, and every move must fail.
 *
 * Each attacker also gets a POSITIVE CONTROL — the legitimate version of the
 * same action, which must succeed — so that a block of `assertFails` cannot pass
 * merely because the emulator, the seed or the harness is broken and everything
 * is refused.
 *
 * Overlap with the feature suite is deliberate: the point is one place where
 * every attacker's every move is visible.
 */

const VICTIM = 'victim-uid';
const ATTACKER = 'attacker-uid';
const LEAGUE = 'victim-league';
const ATTACKER_LEAGUE = 'attacker-league';
const GAME = 'victim-game';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // Its own project, so clearing it never touches the feature suite's data.
    projectId: 'stackmate-attacks',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', VICTIM), { subscriptionStatus: 'free' });
    await setDoc(doc(db, 'users', ATTACKER), { subscriptionStatus: 'free' });
    await setDoc(doc(db, 'userSettings', VICTIM), { setup: { x: 1 }, recentPlayers: ['Alice'] });
    await setDoc(doc(db, 'leagues', LEAGUE), { name: 'Victim League', ownerId: VICTIM });
    await setDoc(doc(db, 'leagues', ATTACKER_LEAGUE), { name: 'Attacker League', ownerId: ATTACKER });
    await setDoc(doc(db, 'seasons', 's1'), { name: 'Spring', leagueId: LEAGUE, status: 'active' });
    await setDoc(doc(db, 'leaguePlayers', 'lp1'), { name: 'Alice', leagueId: LEAGUE });
    await setDoc(doc(db, 'tournamentResults', 'r1'), { leagueId: LEAGUE, position: 1, points: 10 });
    await setDoc(doc(db, 'tournamentResults', 'attacker-r1'), { leagueId: ATTACKER_LEAGUE, position: 1, points: 10 });
    await setDoc(doc(db, 'leagueSettings', `${VICTIM}_${LEAGUE}`), {
      userId: VICTIM, leagueId: LEAGUE, isDefault: true, settings: {},
    });
    await setDoc(doc(db, 'completedTournaments', `${VICTIM}_${GAME}`), { ownerId: VICTIM, summary: [] });
    await setDoc(doc(db, 'tournamentTemplates', 't1'), { ownerId: VICTIM, name: 'Turbo' });
    await setDoc(doc(db, 'activeTournaments', GAME), {
      ownerId: VICTIM,
      isPublished: true,
      isRunning: true,
      currentLevel: 2,
      players: [
        { id: 'p1', name: 'Alice', isActive: true },
        { id: 'p2', name: 'Bob', isActive: true },
      ],
      playerIds: ['p1', 'p2'],
      claims: {},
      settings: { leagueId: LEAGUE },
      rebuysAnswered: [],
      summary: [],
    });
  });
});

const signedOut = () => env.unauthenticatedContext().firestore();
const qrVisitor = () =>
  env.authenticatedContext('qr-visitor', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const stranger = () =>
  env.authenticatedContext(ATTACKER, { firebase: { sign_in_provider: 'password' } }).firestore();
const victim = () =>
  env.authenticatedContext(VICTIM, { firebase: { sign_in_provider: 'password' } }).firestore();

const COLLECTIONS = [
  'users', 'userSettings', 'leagues', 'seasons', 'leaguePlayers', 'tournamentResults',
  'activeTournaments', 'leagueSettings', 'completedTournaments', 'tournamentTemplates',
];

/** Everything a non-owner might try to do to someone else's data. */
// rules-unit-testing hands back the compat type; the modular calls accept it at runtime.
function deniedToAnyNonOwner(db: () => any) {
  it('cannot read anybody\'s subscription, settings, history or templates', async () => {
    await assertFails(getDoc(doc(db(), 'users', VICTIM)));
    await assertFails(getDoc(doc(db(), 'userSettings', VICTIM)));
    await assertFails(getDoc(doc(db(), 'completedTournaments', `${VICTIM}_${GAME}`)));
    await assertFails(getDoc(doc(db(), 'tournamentTemplates', 't1')));
  });

  it('cannot grant anybody Pro', async () => {
    await assertFails(setDoc(doc(db(), 'users', VICTIM), { subscriptionStatus: 'pro' }));
    await assertFails(setDoc(doc(db(), 'users', ATTACKER), { subscriptionStatus: 'pro' }, { merge: true }));
    await assertFails(setDoc(doc(db(), 'users', 'qr-visitor'), { subscriptionStatus: 'pro' }));
  });

  it('cannot overwrite or wipe a director\'s account settings', async () => {
    await assertFails(setDoc(doc(db(), 'userSettings', VICTIM), { setup: null, recentPlayers: [] }));
    await assertFails(deleteDoc(doc(db(), 'userSettings', VICTIM)));
  });

  it('cannot change anything about a live game', async () => {
    const g = () => doc(db(), 'activeTournaments', GAME);
    await assertFails(updateDoc(g(), { players: [{ id: 'p1', name: 'Alice', isActive: false, position: 2 }] }));
    await assertFails(updateDoc(g(), { isRunning: false }));
    await assertFails(updateDoc(g(), { currentLevel: 9 }));
    await assertFails(updateDoc(g(), { levels: [] }));
    await assertFails(updateDoc(g(), { settings: { leagueId: ATTACKER_LEAGUE } }));
    await assertFails(updateDoc(g(), { ownerId: ATTACKER }));
    await assertFails(updateDoc(g(), { isPublished: false }));
    await assertFails(updateDoc(g(), { controllingDeviceId: 'attacker#tab' }));
    await assertFails(updateDoc(g(), { rebuysAnswered: ['p1:0'] }));
    await assertFails(updateDoc(g(), { summary: [{ id: 'x:0', at: 1, kind: 'bust' }] }));
    await assertFails(updateDoc(g(), { playerIds: ['p1', 'p2', 'ghost'] }));
    await assertFails(deleteDoc(g()));
  });

  it('cannot smuggle a game change in beside a check-in', async () => {
    await assertFails(updateDoc(doc(db(), 'activeTournaments', GAME), {
      'claims.p1': 'device-a', lastClaim: 'p1', isRunning: false,
    }));
    await assertFails(updateDoc(doc(db(), 'activeTournaments', GAME), {
      'claims.p1': 'device-a', lastClaim: 'p1', players: [],
    }));
  });

  it('cannot bloat or junk the claims map', async () => {
    const g = () => doc(db(), 'activeTournaments', GAME);
    await assertFails(updateDoc(g(), { 'claims.ghost': 'device-a', lastClaim: 'ghost' }));
    await assertFails(updateDoc(g(), { 'claims.p1': 'x'.repeat(10_000), lastClaim: 'p1' }));
    await assertFails(updateDoc(g(), { 'claims.p1': { nested: 'x'.repeat(1000) }, lastClaim: 'p1' }));
    await assertFails(updateDoc(g(), { 'claims.p1': 42, lastClaim: 'p1' }));
    // Two seats in one write, naming only one.
    await assertFails(updateDoc(g(), { 'claims.p1': 'a', 'claims.p2': 'a', lastClaim: 'p1' }));
    // Replacing the map wholesale.
    await assertFails(updateDoc(g(), { claims: { p1: 'a', p2: 'a' }, lastClaim: 'p1' }));
    // An oversized lastClaim.
    await assertFails(updateDoc(g(), { [`claims.${'k'.repeat(100)}`]: 'a', lastClaim: 'k'.repeat(100) }));
  });

  it('cannot create a tournament owned by somebody else', async () => {
    await assertFails(setDoc(doc(db(), 'activeTournaments', 'forged'), { ownerId: VICTIM, players: [] }));
  });

  it('cannot write anything into the victim\'s league', async () => {
    await assertFails(addDoc(collection(db(), 'tournamentResults'), { leagueId: LEAGUE, position: 1, points: 999 }));
    await assertFails(addDoc(collection(db(), 'leaguePlayers'), { leagueId: LEAGUE, name: 'Mallory' }));
    await assertFails(addDoc(collection(db(), 'seasons'), { leagueId: LEAGUE, name: 'Fake' }));
    await assertFails(updateDoc(doc(db(), 'tournamentResults', 'r1'), { points: 0 }));
    await assertFails(updateDoc(doc(db(), 'leaguePlayers', 'lp1'), { name: 'Renamed' }));
    await assertFails(updateDoc(doc(db(), 'seasons', 's1'), { status: 'completed' }));
    await assertFails(deleteDoc(doc(db(), 'tournamentResults', 'r1')));
    await assertFails(deleteDoc(doc(db(), 'leaguePlayers', 'lp1')));
    await assertFails(deleteDoc(doc(db(), 'seasons', 's1')));
  });

  it('cannot rename, re-own or delete the victim\'s league', async () => {
    await assertFails(updateDoc(doc(db(), 'leagues', LEAGUE), { name: 'Pwned' }));
    await assertFails(updateDoc(doc(db(), 'leagues', LEAGUE), { ownerId: ATTACKER }));
    await assertFails(deleteDoc(doc(db(), 'leagues', LEAGUE)));
  });

  it('cannot change or squat the victim\'s points settings', async () => {
    await assertFails(updateDoc(doc(db(), 'leagueSettings', `${VICTIM}_${LEAGUE}`), { settings: { evil: true } }));
    await assertFails(deleteDoc(doc(db(), 'leagueSettings', `${VICTIM}_${LEAGUE}`)));
    await assertFails(setDoc(doc(db(), 'leagueSettings', `${VICTIM}_other-league`), {
      userId: ATTACKER, leagueId: 'other-league', isDefault: true,
    }));
    await assertFails(setDoc(doc(db(), 'leagueSettings', `${VICTIM}_other-league`), {
      userId: VICTIM, leagueId: 'other-league', isDefault: true,
    }));
  });

  it('cannot squat or rewrite the victim\'s history', async () => {
    await assertFails(setDoc(doc(db(), 'completedTournaments', `${VICTIM}_next-game`), { ownerId: ATTACKER }));
    await assertFails(setDoc(doc(db(), 'completedTournaments', `${VICTIM}_next-game`), { ownerId: VICTIM }));
    await assertFails(updateDoc(doc(db(), 'completedTournaments', `${VICTIM}_${GAME}`), { summary: ['forged'] }));
    await assertFails(deleteDoc(doc(db(), 'completedTournaments', `${VICTIM}_${GAME}`)));
  });

  it('cannot touch the victim\'s templates', async () => {
    await assertFails(updateDoc(doc(db(), 'tournamentTemplates', 't1'), { name: 'x' }));
    await assertFails(deleteDoc(doc(db(), 'tournamentTemplates', 't1')));
  });

  it('cannot write to a collection the app does not have', async () => {
    await assertFails(setDoc(doc(db(), 'admin', 'config'), { open: true }));
    await assertFails(getDoc(doc(db(), 'admin', 'config')));
  });
}

describe('attacker: signed out (a script with no account at all)', () => {
  it('CONTROL: can still read the one game and league the QR code names', async () => {
    await assertSucceeds(getDoc(doc(signedOut(), 'activeTournaments', GAME)));
    await assertSucceeds(getDoc(doc(signedOut(), 'leagues', LEAGUE)));
  });

  it('cannot list ANY collection', async () => {
    for (const c of COLLECTIONS) await assertFails(getDocs(collection(signedOut(), c)));
  });

  it('cannot list a league\'s standings either, even filtered', async () => {
    await assertFails(getDocs(query(collection(signedOut(), 'tournamentResults'), where('leagueId', '==', LEAGUE))));
    await assertFails(getDocs(query(collection(signedOut(), 'leaguePlayers'), where('leagueId', '==', LEAGUE))));
  });

  it('cannot check in (needs a session)', async () => {
    await assertFails(updateDoc(doc(signedOut(), 'activeTournaments', GAME), { 'claims.p1': 'device-a', lastClaim: 'p1' }));
  });

  it('cannot create a league, game or settings document', async () => {
    await assertFails(addDoc(collection(signedOut(), 'leagues'), { name: 'Spam', ownerId: 'nobody' }));
    await assertFails(setDoc(doc(signedOut(), 'activeTournaments', 'spam'), { ownerId: 'nobody' }));
  });

  deniedToAnyNonOwner(signedOut);
});

describe('attacker: anonymous QR visitor (anyone holding the code)', () => {
  it('CONTROL: can check in to a real seat, and read the standings', async () => {
    await assertSucceeds(updateDoc(doc(qrVisitor(), 'activeTournaments', GAME), { 'claims.p1': 'device-a', lastClaim: 'p1' }));
    await assertSucceeds(getDocs(query(collection(qrVisitor(), 'tournamentResults'), where('leagueId', '==', LEAGUE))));
  });

  it('cannot list games, leagues, settings, history or templates', async () => {
    for (const c of ['activeTournaments', 'leagues', 'leagueSettings', 'completedTournaments', 'tournamentTemplates', 'users', 'userSettings']) {
      await assertFails(getDocs(collection(qrVisitor(), c)));
    }
  });

  it('cannot create a league, a game, or league data of its own', async () => {
    await assertFails(addDoc(collection(qrVisitor(), 'leagues'), { name: 'Spam', ownerId: 'qr-visitor' }));
    await assertFails(setDoc(doc(qrVisitor(), 'activeTournaments', 'spam'), { ownerId: 'qr-visitor' }));
    await assertFails(addDoc(collection(qrVisitor(), 'leagueSettings'), { userId: 'qr-visitor' }));
    await assertFails(addDoc(collection(qrVisitor(), 'tournamentTemplates'), { ownerId: 'qr-visitor' }));
    await assertFails(setDoc(doc(qrVisitor(), 'userSettings', 'qr-visitor'), { setup: {} }));
  });

  deniedToAnyNonOwner(qrVisitor);
});

describe('attacker: another director (a real account, not the owner)', () => {
  it('CONTROL: runs their own league and game freely', async () => {
    await assertSucceeds(addDoc(collection(stranger(), 'tournamentResults'), { leagueId: ATTACKER_LEAGUE, position: 2, points: 5 }));
    await assertSucceeds(setDoc(doc(stranger(), 'activeTournaments', 'mine'), { ownerId: ATTACKER, players: [] }));
    await assertSucceeds(updateDoc(doc(stranger(), 'activeTournaments', 'mine'), { isRunning: true }));
  });

  it('cannot see the victim\'s games, leagues or settings in a list', async () => {
    await assertFails(getDocs(query(collection(stranger(), 'activeTournaments'), where('ownerId', '==', VICTIM))));
    await assertFails(getDocs(query(collection(stranger(), 'leagues'), where('ownerId', '==', VICTIM))));
    await assertFails(getDocs(query(collection(stranger(), 'leagueSettings'), where('userId', '==', VICTIM))));
    await assertFails(getDocs(query(collection(stranger(), 'completedTournaments'), where('ownerId', '==', VICTIM))));
    await assertFails(getDocs(query(collection(stranger(), 'tournamentTemplates'), where('ownerId', '==', VICTIM))));
  });

  it('cannot move its own result INTO the victim\'s league', async () => {
    await assertFails(updateDoc(doc(stranger(), 'tournamentResults', 'attacker-r1'), { leagueId: LEAGUE, points: 999 }));
  });

  it('cannot hand its own game or league to the victim (or anyone)', async () => {
    await assertSucceeds(setDoc(doc(stranger(), 'activeTournaments', 'mine'), { ownerId: ATTACKER, players: [] }));
    await assertFails(updateDoc(doc(stranger(), 'activeTournaments', 'mine'), { ownerId: VICTIM }));
    await assertFails(updateDoc(doc(stranger(), 'leagues', ATTACKER_LEAGUE), { name: 'x', ownerId: VICTIM }));
  });

  it('cannot create a league or template in the victim\'s name', async () => {
    await assertFails(addDoc(collection(stranger(), 'leagues'), { name: 'Fake', ownerId: VICTIM }));
    await assertFails(addDoc(collection(stranger(), 'tournamentTemplates'), { ownerId: VICTIM, name: 'x' }));
  });

  deniedToAnyNonOwner(stranger);
});

describe('attacker: the owner, overreaching', () => {
  it('CONTROL: changes their own game and league', async () => {
    await assertSucceeds(updateDoc(doc(victim(), 'activeTournaments', GAME), { isRunning: false, players: [] }));
    await assertSucceeds(updateDoc(doc(victim(), 'leagues', LEAGUE), { name: 'Renamed' }));
  });

  it('cannot grant themselves Pro', async () => {
    await assertFails(setDoc(doc(victim(), 'users', VICTIM), { subscriptionStatus: 'pro' }, { merge: true }));
    await assertFails(updateDoc(doc(victim(), 'users', VICTIM), { subscriptionStatus: 'pro' }));
  });

  it('cannot give away or orphan their game, league, history or templates', async () => {
    await assertFails(updateDoc(doc(victim(), 'activeTournaments', GAME), { ownerId: ATTACKER }));
    await assertFails(updateDoc(doc(victim(), 'leagues', LEAGUE), { name: 'x', ownerId: ATTACKER }));
    await assertFails(updateDoc(doc(victim(), 'completedTournaments', `${VICTIM}_${GAME}`), { ownerId: ATTACKER }));
    await assertFails(updateDoc(doc(victim(), 'tournamentTemplates', 't1'), { ownerId: ATTACKER }));
    await assertFails(updateDoc(doc(victim(), 'leagueSettings', `${VICTIM}_${LEAGUE}`), { userId: ATTACKER }));
  });

  it('cannot write results into ANOTHER director\'s league', async () => {
    await assertFails(addDoc(collection(victim(), 'tournamentResults'), { leagueId: ATTACKER_LEAGUE, points: 1 }));
  });

  it('cannot reach collections the app does not have', async () => {
    await assertFails(setDoc(doc(victim(), 'admin', 'config'), { open: true }));
  });
});
