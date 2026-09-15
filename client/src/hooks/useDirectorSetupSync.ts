import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { readScoped, writeScoped } from '@/lib/scopedStorage';
import {
  canApplyRemoteSetup,
  isRemoteSetupNewer,
  setupFingerprint,
  type DirectorSetup,
} from '@/lib/setupSync';
import type { BlindLevel, PrizeStructure, Settings } from '@/types';

/**
 * Keep a director's setup — settings, blind structure, buy-in and payouts — on
 * their ACCOUNT rather than on one browser.
 *
 * Everything else a director owns already follows the account: the running game
 * and its roster, the history, the league, its points system, saved structures.
 * The setup a new game starts from was the one thing that did not, which is an
 * odd gap in an app whose whole premise is running a game from whatever device
 * is to hand — and it is what a club sharing a director login needs most, since
 * whoever is running tonight should sign in and find the league's structure
 * already there.
 *
 * lib/setupSync.ts owns the decisions; this owns the Firestore.
 *
 * `userSettings/{uid}` already existed for the ad-blocker preflight's
 * lastSeenAt, and its rules already say owner-only read and write, so this adds
 * a field rather than a collection.
 *
 * COST is a fair question and the answer is that this is not the expensive
 * part. One document per account: one read when a director signs in, one
 * debounced write when they change something. The live-game sync that runs
 * while a tournament is actually being played dwarfs it.
 */
const DEBOUNCE_MS = 2500;

interface SetupTarget {
  settings: Settings;
  levels: BlindLevel[];
  prizeStructure: PrizeStructure;
  playerCount: number;
  isDatabaseTournament: boolean;
  applySettings: (updates: Partial<Settings>) => void;
  applyLevels: (levels: BlindLevel[]) => void;
  applyPrizeStructure: (prizeStructure: Partial<PrizeStructure>) => void;
}

export function useDirectorSetupSync(target: SetupTarget) {
  const { user, isAnonymous, isLoading: authLoading } = useAuth();
  const uid = !authLoading && user && !isAnonymous ? user.id : null;

  // Everything the effects need without listing it as a dependency. The push
  // effect must react to the setup CHANGING and to nothing else; depending on
  // the callbacks or the whole target object would re-run it on every render,
  // which in this app has previously meant writing to Firestore twice a second.
  const targetRef = useRef(target);
  targetRef.current = target;

  /** The uid whose pull has been STARTED, so it runs once. */
  const pullStartedForRef = useRef<string | null>(null);
  /**
   * The uid whose pull has SETTLED. Separate from the one above, and the
   * distinction is the whole safety of the push direction: a ref set when the
   * read begins is already set while the read is still in flight, so the push
   * effect would happily send this device's defaults up over the account's real
   * setup in the window before the answer came back. Set only on a successful
   * read — including one that found nothing, which is an answer.
   */
  const pullSettledForRef = useRef<string | null>(null);

  /**
   * Bumped when a pull settles, purely to re-run the push effect.
   *
   * Without it the push only reconsiders when the setup CHANGES, so a director
   * who signs in on a new device and changes nothing would never seed their
   * account — and the next device would find nothing to pull. The refs above
   * cannot do this job: writing to a ref does not re-render.
   */
  const [pullsSettled, setPullsSettled] = useState(0);
  /**
   * What the account is believed to hold, as a fingerprint — so an unchanged
   * setup is never written twice. null means the pull has not settled and the
   * push direction is closed; it is given a value exactly once per sign-in,
   * when the answer arrives, and that value decides which way the first sync
   * goes.
   */
  const lastPushedRef = useRef<string | null>(null);

  /** The setup as it stands right now, fingerprinted. */
  const currentFingerprint = () => setupFingerprint({
    settings: targetRef.current.settings,
    blindLevels: targetRef.current.levels,
    prizeStructure: targetRef.current.prizeStructure,
  });

  // PULL — once per account, at sign-in.
  useEffect(() => {
    if (!uid || pullStartedForRef.current === uid) return;
    pullStartedForRef.current = uid;
    lastPushedRef.current = null;

    let cancelled = false;
    (async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const snap = await getDoc(doc(db, 'userSettings', uid));
        if (cancelled) return;
        pullSettledForRef.current = uid;
        const settled = () => { if (!cancelled) setPullsSettled(n => n + 1); };

        const remote = snap.exists() ? (snap.data()?.setup as DirectorSetup | undefined) : undefined;
        if (!remote) {
          // The account has nothing yet. An empty baseline means this device's
          // setup differs from it and is therefore pushed up — which is how a
          // director's first sign-in seeds their account.
          lastPushedRef.current = '';
          settled();
          return;
        }
        const local: DirectorSetup = {
          settings: targetRef.current.settings,
          blindLevels: targetRef.current.levels,
          prizeStructure: targetRef.current.prizeStructure,
          updatedAt: readScoped('setupUpdatedAt', uid) ?? undefined,
        };
        if (!isRemoteSetupNewer(local, remote)) {
          // This device is ahead. Record what the account holds so the push
          // effect sees a difference and sends the newer setup up.
          lastPushedRef.current = setupFingerprint(remote);
          settled();
          return;
        }

        // Only ever onto an empty table — see canApplyRemoteSetup. A director
        // who signed in mid-game keeps the game they are running; their setup
        // is not lost, it simply arrives the next time they start fresh.
        if (!canApplyRemoteSetup({
          playerCount: targetRef.current.playerCount,
          isDatabaseTournament: targetRef.current.isDatabaseTournament,
        })) {
          // The account is ahead but the table is busy, so neither direction
          // may run: applying would rewrite a game in progress, and pushing
          // would overwrite the newer copy with this device's older one.
          // Pretending the account already holds what is on screen closes both.
          lastPushedRef.current = currentFingerprint();
          settled();
          return;
        }

        if (remote.settings) targetRef.current.applySettings(remote.settings as Partial<Settings>);
        if (Array.isArray(remote.blindLevels) && remote.blindLevels.length) {
          targetRef.current.applyLevels(remote.blindLevels as BlindLevel[]);
        }
        if (remote.prizeStructure) {
          targetRef.current.applyPrizeStructure(remote.prizeStructure as Partial<PrizeStructure>);
        }

        // Adopt the account's timestamp and treat this as already pushed, or
        // the push effect below would immediately send back what just arrived.
        writeScoped('setupUpdatedAt', remote.updatedAt ?? new Date().toISOString(), uid);
        lastPushedRef.current = setupFingerprint(remote);
        settled();
      } catch (err) {
        // Offline or blocked. The device's own setup is already on screen and is
        // not touched — this is a convenience, and it must never be the reason a
        // director cannot run a game.
        //
        // Deliberately does NOT mark the pull settled. Not knowing what the
        // account holds is exactly when pushing is dangerous, so this session
        // stays read-only upward and the setup syncs on the next sign-in. Losing
        // a night's worth of settings changes is recoverable; overwriting a
        // league's structure with a device's defaults is the thing that is not.
        console.error('Could not read the saved setup for this account:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [uid]);

  // PUSH — debounced, and never before the account has been consulted.
  const fingerprint = setupFingerprint({
    settings: target.settings,
    blindLevels: target.levels,
    prizeStructure: target.prizeStructure,
  });

  useEffect(() => {
    if (!uid) return;
    // Pushing before the pull has SETTLED would send this device's defaults up
    // over the account's real setup — the exact direction that loses work.
    if (pullSettledForRef.current !== uid || lastPushedRef.current === null) return;
    if (lastPushedRef.current === fingerprint) return;

    const timer = setTimeout(async () => {
      const updatedAt = new Date().toISOString();
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const { sanitizeForFirestore } = await import('@/lib/utils');
        await setDoc(
          doc(db, 'userSettings', uid),
          sanitizeForFirestore({
            setup: {
              settings: targetRef.current.settings,
              blindLevels: targetRef.current.levels,
              prizeStructure: targetRef.current.prizeStructure,
              updatedAt,
            },
          }),
          { merge: true },
        );
        // Recorded only AFTER the write resolves, so a failure is retried on
        // the next change rather than looking saved.
        lastPushedRef.current = fingerprint;
        writeScoped('setupUpdatedAt', updatedAt, uid);
      } catch (err) {
        console.error('Could not save the setup to this account:', err);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [uid, fingerprint, pullsSettled]);
}
