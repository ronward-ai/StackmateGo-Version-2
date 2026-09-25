import { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useTournament } from '@/hooks/useTournament';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { useCompletedTournaments } from '@/hooks/useCompletedTournaments';
import { gameNumberFor, isRealSeasonId } from '@/lib/seasonProgress';
import { eventNameOf } from '@/lib/eventName';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/AuthModal';
import { User, Settings2, X, Users, LayoutGrid, Coins, Layers, ShieldAlert, History } from 'lucide-react';
import TimerCard from '@/components/TimerCard';
import TournamentInfoCard from '@/components/TournamentInfoCard';
import NextGameControl from '@/components/NextGameControl';
import TournamentTemplatesDialog from '@/components/TournamentTemplatesDialog';
import TournamentHistoryDialog from '@/components/TournamentHistoryDialog';
import PlayerSection from '@/components/PlayerSection';
import TablesSection from '@/components/TablesSection';
import BlindLevelsSection from '@/components/BlindLevelsSection';
import BuyInSection from '@/components/BuyInSection';
import QRCodeSection from '@/components/QRCodeSection';
import { reportWriteFailure, reportWriteSuccess, subscribeSyncHealth, getSyncBlocked } from '@/lib/syncReporter';
import { isStorageWritable, subscribeStorageHealth } from '@/lib/scopedStorage';
import { recoverableProgress } from '@/lib/localProgress';
import { lastSignedInUid } from '@/lib/scopedStorage';
import { useDirectorSetupSync } from '@/hooks/useDirectorSetupSync';
import { consoleTournamentId, pinIsDead } from '@/lib/liveTournament';
import ConsoleHeader from '@/components/ConsoleHeader';
import { useIsOffscreen } from '@/hooks/useIsOffscreen';
import { blindLevelNumber } from '@/lib/announcements';
import { reportToOverlay } from '@/lib/debugOverlay';
import SettingsSection from '@/components/SettingsSection';
import LeagueSection from '@/components/LeagueSection';
import TournamentOverBanner from '@/components/TournamentOverBanner';
import { LiveBanner } from '@/components/LiveBanner';
import { gameIsOver, winnerOf } from '@/lib/gameOver';

export default function PokerTimer({ params }: { params?: { tournamentId?: string } }) {
  const tournamentId = params?.tournamentId;
  const [, setLocation] = useLocation();
  const { user, isAnonymous, isLoading: authLoading } = useAuth();

  // Did the user sign in during THIS page's lifetime?
  //
  // Distinct from "is signed in": arriving already-signed-in must not count, or
  // the ?home=1 escape would be ignored on every cold load and send the director
  // straight back into the game they were trying to leave. The first resolution
  // of auth records who is there and is deliberately not treated as a sign-in.
  const authSettledRef = useRef(false);
  const previousUserRef = useRef<string | null>(null);
  const justSignedInRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    const current = (!user || isAnonymous) ? null : user.id;

    if (!authSettledRef.current) {
      authSettledRef.current = true;
      previousUserRef.current = current;
      return;
    }

    if (previousUserRef.current === null && current !== null) {
      justSignedInRef.current = true;
    }
    previousUserRef.current = current;
  }, [authLoading, user, isAnonymous]);

  // Resume the live game after signing in, on ANY device.
  //
  // This is what replaces transfer codes and the device lock: handing over means
  // logging out so the next director signs in with the same account, and their
  // device then finds the game by itself. Without this they would need the URL.
  //
  // Only fills the pin when it is empty, so it never overrides a game the
  // director is already looking at.
  useEffect(() => {
    if (tournamentId || authLoading) return;
    if (!user || isAnonymous) return;

    // ?home=1 means "do not auto-open a game on arrival" — that is how the home
    // control and New Tournament avoid reopening the one you just left. It must
    // NOT mean "never open again": logging out leaves the device sitting on
    // exactly that URL, so signing back in there would otherwise show a default
    // tournament and look like the live game had been lost.
    const justSignedIn = justSignedInRef.current;

    let cancelled = false;
    const restorePin = async () => {
      try {
        if (localStorage.getItem('activeDirectorTournamentId')) return;
        if (!justSignedIn && new URLSearchParams(window.location.search).has('home')) return;
        justSignedInRef.current = false;

        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const snap = await getDocs(
          query(collection(db, 'activeTournaments'), where('ownerId', '==', user.id)),
        );
        if (cancelled || snap.empty) return;

        // Only a game that is plausibly the one being run right now — the same
        // question the auto-save asks, answered by the same function so the two
        // cannot disagree about which game tonight's is.
        const { findCurrentLiveTournament } = await import('@/lib/liveTournament');
        const newest = findCurrentLiveTournament(
          snap.docs.map(d => ({ id: d.id, ...d.data() })),
        );
        if (newest) {
          localStorage.setItem('activeDirectorTournamentId', newest.id);
          setLocation(`/tournament/${newest.id}/director`);
        }
      } catch (err) {
        console.error('Could not restore the live tournament:', err);
      }
    };

    restorePin();
    return () => { cancelled = true; };
  }, [tournamentId, authLoading, user, isAnonymous, setLocation]);

  // Reopen the pinned live game when returning to the home page, so Firestore
  // state is restored rather than the app starting from a blank local one.
  // Only for a signed-in director: firing regardless pinned the app to a
  // tournament a signed-out user could not direct, and made the home screen —
  // the only place with a Sign In button — unreachable.
  useEffect(() => {
    if (tournamentId || authLoading) return;

    // ?home=1 is a deliberate "get me out". Every trap in this area has ended
    // with someone unable to reach the home screen, because a plain "/" is
    // redirected straight back to the pinned game. Clearing the pin makes the
    // escape permanent rather than lasting one page load.
    try {
      if (new URLSearchParams(window.location.search).has('home')) {
        localStorage.removeItem('activeDirectorTournamentId');
        return;
      }
    } catch {}

    if (!user || isAnonymous) return;
    try {
      const saved = localStorage.getItem('activeDirectorTournamentId');
      if (saved) setLocation(`/tournament/${saved}/director`);
    } catch {}
  }, [tournamentId, authLoading, user, isAnonymous, setLocation]);

  const tournament = useTournament(tournamentId);

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="flex flex-col items-center space-y-4">
          <div className="text-gray-400">Loading tournament...</div>
        </div>
      </div>
    );
  }

  // A LIVE game needs a signed-in owner to be driven.
  //
  // Belt and braces for the paths a navigation cannot cover — a refresh while
  // signed out, or state restored from localStorage. Without it the console
  // keeps working after a logout: writes are already blocked, so the other
  // director's game is safe, but the local state drifts and would be pushed
  // over theirs on the next sign-in.
  //
  // Only for database tournaments. A standalone local game must stay usable
  // signed out — the timer being offline-first is deliberate.
  const isLiveGame = tournament.state.details?.type === 'database';
  if (!authLoading && isLiveGame && (!user || isAnonymous)) {
    return <SignInToContinue tournamentId={tournament.state.details?.id} />;
  }

  return <PokerTimerInner tournament={tournament} tournamentId={tournamentId} />;
}

/** Shown when a live tournament is loaded but nobody is signed in to run it. */
function SignInToContinue({ tournamentId }: { tournamentId?: string | number }) {
  const [, setLocation] = useLocation();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center px-6">
      <div className="text-center max-w-sm w-full">
        <div className="inline-block bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 rounded-xl shadow-lg mb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">StackMate Go</h1>
        </div>
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-lg font-medium">Sign in to run this game</p>
            <p className="text-sm text-muted-foreground">
              This tournament is live. Signing in brings it back exactly where it is now — nothing
              has been lost.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button className="gap-2" onClick={() => setShowAuthModal(true)}>
              <User className="h-4 w-4" />
              Sign in
            </Button>
            {tournamentId && (
              <Button variant="outline" onClick={() => setLocation(`/tournament/${tournamentId}`)}>
                View as player
              </Button>
            )}
          </div>
        </div>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </div>
    </div>
  );
}

function PokerTimerInner({
  tournament,
  tournamentId,
}: {
  tournament: NonNullable<ReturnType<typeof useTournament>>;
  tournamentId?: string;
}) {
  // Keep the screen on while the clock runs. A tournament timer that goes dark
  // ten minutes into a level is the one thing this app must not do.
  useWakeLock(tournament.state.isRunning);

  const { recordResultByName, removeTournamentResultForPlayer, league, switchLeague, userLeagues, leaguePlayers } = useLeague();
  const { currentSeason, seasons } = useSeasons({ leagueId: league?.id });
  const currentSeasonRef = useRef(currentSeason);
  useEffect(() => { currentSeasonRef.current = currentSeason; }, [currentSeason]);
  // The season the UI displays — settings.seasonId when set, else currentSeason.
  // Held in a ref so the elimination effect reads it without re-subscribing.
  const displaySeasonRef = useRef<any>(null);
  const { user, isAnonymous, isLoading: authLoading } = useAuth();

  // Which account's local mirror this console may be offered — the same
  // resolution useTournament uses, for the same reason: `user` is null until
  // Firebase restores the session, so the last-known uid is the opening guess.
  const storageUid = isAnonymous ? null : (user?.id ?? lastSignedInUid());

  // The setup follows the ACCOUNT, so a director signing in on another device
  // finds their structure, buy-in and payouts already there — see
  // hooks/useDirectorSetupSync.ts. Pulls only onto an empty table; pushes
  // debounced and only after the account has been consulted.
  useDirectorSetupSync({
    settings: tournament.state.settings,
    levels: tournament.state.levels,
    prizeStructure: tournament.state.prizeStructure,
    playerCount: tournament.state.players.length,
    isDatabaseTournament: tournament.state.details?.type === 'database',
    applySettings: tournament.updateSettings,
    applyLevels: tournament.setBlindLevels,
    applyPrizeStructure: tournament.updatePrizeStructure,
  });

  // What an account buys you, said once where it will be read.
  //
  // Signed out, the console works fully and everything persists on this device —
  // so nothing on screen told a visitor whether the app was free, broken, or
  // about to lose their game.
  //
  // Dismissed for the session only, deliberately: it must not nag through
  // tonight's game, but persisting the dismissal would permanently hide the only
  // explanation there is.
  const [signedOutBarDismissed, setSignedOutBarDismissed] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const showSignedOutBar = !authLoading && (!user || isAnonymous) && !signedOutBarDismissed;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Compute game number once here so the info card and the mode toggle inside it always show the same value.
  const _isLeagueMode = tournament.state.details?.type === 'season' || tournament.state.settings?.isSeasonTournament === true;
  const _storedSeasonId = tournament.state.settings?.seasonId;
  const _displaySeason = _storedSeasonId
    ? ((seasons as any[]).find((s: any) => String(s.id) === String(_storedSeasonId)) ?? currentSeason)
    : currentSeason;
  const gameNumber = useMemo(
    () => (_isLeagueMode && _displaySeason
      ? gameNumberFor(_displaySeason.id, leaguePlayers, tournament.state.details?.localGameId)
      : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [_isLeagueMode, _displaySeason?.id, leaguePlayers, tournament.state.details?.localGameId]);
  useEffect(() => { displaySeasonRef.current = _displaySeason; }, [_displaySeason]);
  const totalGames = _displaySeason?.numberOfGames || 12;

  // The on-screen event name. Falls back to the league's own name in league mode
  // when no event name is set, so renaming the league is visible here — these
  // are two different fields and previously a rename changed nothing on screen.
  const displayEventName = eventNameOf(tournament.state.settings, league?.name);

  // Single writer for the season block in tournament settings, so the
  // participant (QR) view shows exactly what the director sees. Guarded against
  // redundant writes: _displaySeason is itself derived from settings.seasonId,
  // so writing unconditionally would broadcast on every render.
  useEffect(() => {
    if (!_isLeagueMode || !_displaySeason || gameNumber === null) return;
    const st = tournament.state.settings || ({} as any);
    const next = {
      seasonId: String(_displaySeason.id),
      seasonName: _displaySeason.name,
      numberOfGames: _displaySeason.numberOfGames,
      gameNumber,
    };
    const unchanged =
      st.seasonId === next.seasonId &&
      st.seasonName === next.seasonName &&
      st.numberOfGames === next.numberOfGames &&
      st.gameNumber === next.gameNumber;
    if (unchanged) return;
    tournament.updateSettings(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_isLeagueMode, _displaySeason?.id, gameNumber]);

  // playerId -> the finishing position we recorded for them. A Map rather than
  // a Set because a re-entry renumbers the players who busted after the
  // returning player, so a result already written can become stale and must
  // be rewritten — see lib/eliminationOrder.ts.
  const processedEliminationsRef = useRef(new Map<string, number>());

  // The league sync runs one at a time. It awaits Firestore writes, and the
  // effect re-fires on every players change, so overlapping runs could record a
  // player twice, or delete a result while that same result's write was still
  // in flight. A run that arrives while one is going waits and tries again.
  const syncRunningRef = useRef(false);
  const [activeTab, setActiveTab] = useState('players');

  // Save finished tournaments to history. Standalone games are the point of
  // this: results are only written to tournamentResults for league games, so a
  // standalone tournament otherwise left no record once the next one started.
  // The record id is derived from localGameId, so a repeat save overwrites
  // rather than duplicating; the ref just avoids pointless writes.
  const { saveCompletedTournament } = useCompletedTournaments();
  const savedHistoryRef = useRef<string | null>(null);

  useEffect(() => {
    const players = tournament.state.players || [];
    // eliminatePlayer marks every player inactive on completion, including the
    // winner, who is the one given position 1 — lib/gameOver.ts holds that rule
    // for this effect and for the three screens that used to get it wrong.
    if (!gameIsOver(players)) return;

    // Dedupe key. Falls back to the shape of the finished game rather than an
    // empty string: a missing id used to collide with the previous missing id
    // and silently drop every game after the first. The fallback still differs
    // between games (different winner or player count) while staying stable
    // across re-renders of the same finished game, so it cannot cause repeat
    // writes either.
    const details = tournament.state.details;
    const winnerId = winnerOf(players)?.id ?? '';
    const gameKey = String(
      details?.localGameId ?? details?.id ?? `anon:${players.length}:${winnerId}`
    );
    if (savedHistoryRef.current === gameKey) return;

    // Signed-out directors have nowhere to save history to; saveCompletedTournament
    // returns null for that case just as it does for a real failure, so guard here
    // rather than reporting a failure that is really "not applicable".
    if (!user?.id) return;

    savedHistoryRef.current = gameKey;

    // Mark the live document finished so it stops being a resume candidate.
    // Recency is a heuristic; a finished flag is a fact. Best effort — history
    // is the thing that matters here, and the recency window covers the rest.
    if (details?.id) {
      (async () => {
        try {
          const { doc, updateDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          await updateDoc(doc(db, 'activeTournaments', String(details.id)), {
            status: 'completed',
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error('Could not mark the tournament finished:', err);
        }
      })();
    }

    // Clear the dedupe key again if the save fails, so the next pass retries.
    // Setting it before the call and never unsetting it meant a failed save was
    // never retried — and the failure toast tells the director to go and check
    // Tournament History, which is exactly what would be missing.
    saveCompletedTournament(tournament.state)
      .then(saved => {
        if (saved) return;
        savedHistoryRef.current = null;
        toast({
          title: 'Tournament history not saved',
          description: 'This game could not be added to your history. It will be retried.',
          variant: 'destructive',
        });
      })
      .catch(err => {
        console.error('Error saving completed tournament:', err);
        savedHistoryRef.current = null;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.state.players, saveCompletedTournament, user?.id]);

  // Whether the league panel below the setup card is shown at all.
  // Reuses _isLeagueMode from above rather than recomputing the same expression.
  //
  // The league used to be a TAB in the setup row, which is the wrong category:
  // every other tab there sets up TONIGHT'S GAME, and that card is headed
  // "Tournament Setup". It also made the row change shape when the mode toggle
  // moved — on a phone TabsList is a four-column grid, so it was League that
  // pushed Settings and Share onto a second row.
  const isLeagueMode = _isLeagueMode;
  const [dbTournamentId, setDbTournamentId] = useState<string | null>(tournamentId || null);
  // What each sync last WROTE, so a re-run with an identical payload costs
  // nothing. Two of these effects used to write unconditionally, and every one
  // of them listed the `user` OBJECT — which useAuth rebuilt on every render, so
  // they re-ran every render, and this page re-renders every second because that
  // is how the clock advances. A live game was writing to Firestore twice a
  // second. The deps are ids now; these refs are the belt to that pair of braces.
  const lastSyncedPlayersRef = useRef<string>('');
  const lastSyncedTimerRef = useRef<string>('');
  const lastSyncedSettingsRef = useRef<string>('');

  // Save the game to the director's account as soon as there IS one.
  //
  // Creating the document used to happen only at "Go Live", which quietly made
  // publishing to players the thing that decided whether a game was saved at
  // all: a director who never showed a QR code had no cloud copy, could not
  // resume on another device, and lost the game on logging out. Saving and
  // publishing are separate concerns and are now separate actions.
  //
  // Guarded like the sync effects: signed in, has players, not already saved,
  // and once only — creatingRef stops a second attempt while the first is in
  // flight, which would otherwise write the document twice.
  const creatingRef = useRef(false);
  useEffect(() => {
    if (authLoading || !user?.id || isAnonymous) return;
    if (dbTournamentId || creatingRef.current) return;
    if (tournament.state.details?.type === 'database') return;
    if ((tournament.state.players?.length ?? 0) === 0) return;

    creatingRef.current = true;
    (async () => {
      try {
        // Join this night's game rather than minting a rival copy of it.
        //
        // The document id is the localGameId, so a device whose local roster
        // survived a page load — logging out is a full page load — would create
        // a document that ALREADY EXISTS, under the same id, from the state it
        // held before it was ever saved. That overwrote a live game mid-night.
        //
        // Deliberately matched on the id: a live game with a DIFFERENT id is a
        // different game, and adopting it would hijack a director who has
        // genuinely started a second tournament in the same evening. Nothing
        // marks a game finished, so "the account has a live game" alone is not
        // enough to conclude it is this one.
        const localGameId = tournament.state.details?.localGameId;
        if (localGameId) {
          const { collection, query, where, getDocs } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const { findCurrentLiveTournament } = await import('@/lib/liveTournament');
          const snap = await getDocs(
            query(collection(db, 'activeTournaments'), where('ownerId', '==', user.id)),
          );
          const live = findCurrentLiveTournament(
            snap.docs.map(d => ({ id: d.id, ...d.data() })),
          );
          if (live && live.id === localGameId) {
            setDbTournamentId(live.id);
            // isPublished is left to the snapshot: this device does not know
            // whether the game it is joining was published, and guessing "yes"
            // would show a QR for a game participants are refused by.
            tournament.updateTournamentDetails({ id: live.id, type: 'database' });
            try { localStorage.setItem('activeDirectorTournamentId', live.id); } catch {}
            return;
          }
        }

        const { createTournamentDocument } = await import('@/lib/tournamentDocument');
        const docId = await createTournamentDocument(tournament.state, user.id, league?.name, false);
        setDbTournamentId(docId);
        // Saved, not published: Go Live is what reveals the QR.
        tournament.updateTournamentDetails({ id: docId, type: 'database', isPublished: false });
        try { localStorage.setItem('activeDirectorTournamentId', docId); } catch {}
      } catch (err) {
        // Not fatal: the game keeps running locally and is persisted there. Let
        // it try again rather than latching the failure.
        console.error('Could not save the tournament to your account:', err);
      } finally {
        // "In flight", not "has ever created". Latching this on success made it
        // a second, invisible lock on top of dbTournamentId, and the next game
        // of the session could never be saved.
        creatingRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, isAnonymous, dbTournamentId, tournament.state.players?.length, tournament.state.details?.type, league?.name]);

  // Tournament creation is explicit — "Go Live" in QRCodeSection.
  //
  // The sync effects below also wait for tournament.hasLoadedRemoteState. Being
  // guarded on dbTournamentId alone was enough only while the sole way to hold a
  // tournament id was to have gone live on this very device, so local state was
  // necessarily correct. Signing in now resumes a live game on ANY device, and a
  // device that has not read the tournament yet holds an EMPTY players array —
  // which these effects would happily write straight over the real game.
  // Do not remove the latch.

  // How the syncs are faring. `lib/syncHealth.ts` owns the judgement; this holds
  // the streak and does the talking.
  //
  // Both extremes were tried here. Reporting every failure re-fired three
  // identical destructive toasts on every retry. Suppressing `unavailable`
  // outright — an offline blip, self-healing — meant an ad blocker cancelling
  // every write to firestore.googleapis.com was reported nowhere at all, and a
  // whole tournament was never saved without a word on screen.
  // The streak itself lives in lib/syncReporter.ts, at module scope, because it
  // used to live HERE — in a closure — and so useSeasons, useLeagueSettings and
  // the Buy-in tab had no way to reach it and logged to a console nobody has
  // open on a tablet. One database means one streak: two reporters would each
  // raise their own toast for the same outage.
  const syncBlocked = useSyncExternalStore(subscribeSyncHealth, getSyncBlocked, getSyncBlocked);
  // The OTHER place a game can vanish. The preflight checks Firestore and never
  // checked this — see the note in lib/scopedStorage.ts.
  const storageWritable = useSyncExternalStore(subscribeStorageHealth, isStorageWritable, isStorageWritable);
  const [preflightFailed, setPreflightFailed] = useState(false);
  const [recoverable, setRecoverable] = useState<ReturnType<typeof recoverableProgress>>(null);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);

  const reportSyncFailure = reportWriteFailure;
  const reportSyncSuccess = reportWriteSuccess;

  // The document the syncs read and write. Derived, not held: the QR code used
  // to work this out separately from the sync effects and the two disagreed —
  // see lib/liveTournament.ts. One answer, so they cannot.
  const activeTournamentId = useMemo(
    () => consoleTournamentId({
      urlId: tournamentId,
      detailsType: tournament.state.details?.type,
      detailsId: tournament.state.details?.id,
      heldId: dbTournamentId,
    }),
    [tournamentId, tournament.state.details?.type, tournament.state.details?.id, dbTournamentId],
  );

  // A console that holds a tournament but has never READ it is not syncing —
  // and says nothing about it, because syncHealth only hears about writes that
  // were attempted and threw. These were blocked instead: the three sync effects
  // wait on hasLoadedRemoteState, so a listener that never attaches silences
  // them with no error anywhere. That is how a roster fighting its own snapshot
  // reached a director rather than a toast.
  //
  // Ten seconds is a slow connection's worth of grace; a real read lands in
  // well under one.
  const [unreadTournament, setUnreadTournament] = useState(false);
  useEffect(() => {
    if (!activeTournamentId || tournament.hasLoadedRemoteState) {
      setUnreadTournament(false);
      return;
    }
    const timer = setTimeout(() => setUnreadTournament(true), 10000);
    return () => clearTimeout(timer);
  }, [activeTournamentId, tournament.hasLoadedRemoteState]);

  // Read for, and proven absent. Separate from `unreadTournament`, which is a
  // TIMEOUT and therefore only ever a suspicion.
  const gameIsMissing = pinIsDead(tournament.remoteLoad, activeTournamentId);

  // What the app bar shows. All of it is derived from state that already
  // exists — the bar states facts, it does not own any.
  //
  // The clock is the hook's OWN formatTime, not a second derivation: a
  // tournament document carries the clock twice and only targetEndTime is
  // trustworthy, so a second reading of it is a second chance to get that
  // wrong. It renders only while the timer card is off screen, so the two are
  // never both visible and cannot be seen to disagree.
  const { ref: timerCardRef, offscreen: timerOffscreen } = useIsOffscreen<HTMLDivElement>();
  const levelLabel = tournament.state.levels?.[tournament.state.currentLevel]?.isBreak
    ? 'Break'
    : `Level ${blindLevelNumber(tournament.state.levels || [], tournament.state.currentLevel)}`;

  // Saved is not live. Auto-save gives every signed-in director's game a
  // document id, so the id alone would light a Broadcasting chip for a game
  // participants are refused by — isPublished is what that means.
  const isLive = !!activeTournamentId && tournament.state.details?.isPublished !== false;

  // LET GO of a document this game no longer belongs to.
  //
  // dbTournamentId is this component's own state, and New Tournament navigates
  // to /?home=1 — the route the console is ALREADY on — so the component is
  // never unmounted and the id survived the reset. From the second game of a
  // session on: the auto-save below returned early (it refuses when an id is
  // held), so the new game was never saved to the account at all; the sync
  // effects were blocked too, because a reset game is local again and they wait
  // on a Firestore read that never comes for a local game; and the QR fell back
  // to the PREVIOUS game's document, showing its stale roster and paused clock
  // under a green Broadcasting badge. Nothing failed, so nothing was reported.
  //
  // Keyed on the state rather than wired into the New Tournament button: holding
  // an id for a game that is not in the database is the inconsistency itself,
  // whatever produced it.
  useEffect(() => {
    if (tournamentId) return; // the director route names its own game
    if (tournament.state.details?.type === 'database') return;
    if (!dbTournamentId && !creatingRef.current) return;

    setDbTournamentId(null);
    creatingRef.current = false;
    // These hold the PREVIOUS game's payloads. Left alone, the new game's first
    // write could be skipped as "unchanged" if it happened to match.
    lastSyncedPlayersRef.current = '';
    lastSyncedTimerRef.current = '';
    lastSyncedSettingsRef.current = '';
    setRecoverable(null);
    setRecoveryDismissed(false);
  }, [tournamentId, tournament.state.details?.type, dbTournamentId]);

  // A PIN IS A GUESS UNTIL A READ CONFIRMS IT.
  //
  // `activeDirectorTournamentId` sends the console to /tournament/{id}/director
  // on every visit, and nothing ever checked the game was still there. A pin
  // outlives the game it names — a deleted test game, an account wipe on
  // another device, a document that was never created — and the console then
  // held an id it could never read. Everything downstream stood down without a
  // word: the listener keys on `details.id`, which the failed load never set,
  // so `hasLoadedRemoteState` never closed and the three sync effects never
  // wrote; and `dbTournamentId` is SEEDED from the URL, so the auto-save — the
  // one path that would have created a real document — returned early on the
  // strength of the very id that was broken.
  //
  // A director started a game, added two players, refreshed, and they were
  // gone. The only thing on screen blamed an ad blocker.
  //
  // `pinIsDead` takes only `missing`, never `error` — see lib/liveTournament.ts.
  // /?home=1 is the established "get me out": it clears the pin and suppresses
  // the redirect, so the console lands on a fresh local game that saves
  // normally.
  useEffect(() => {
    if (!pinIsDead(tournament.remoteLoad, activeTournamentId)) return;
    try { localStorage.removeItem('activeDirectorTournamentId'); } catch {}
    // The held id is worthless too, and leaving it would keep the auto-save
    // shut on the very next game.
    setDbTournamentId(null);
    creatingRef.current = false;
    if (tournamentId) window.location.href = '/?home=1';
  }, [tournament.remoteLoad, activeTournamentId, tournamentId]);

  // PREFLIGHT: is this browser able to write to Firestore at all?
  //
  // It has to be a WRITE. The failure this exists for had reads working
  // perfectly — uBlock cancelled `Write/channel` and left `Listen/channel`
  // alone — so the game loaded, looked healthy, and saved nothing all night. A
  // read-only check would have passed and said so.
  //
  // And it needs a timeout: a request cancelled by an extension does not
  // reject, the SDK simply keeps retrying, so the promise never settles. Never
  // settling IS the answer here.
  //
  // Once per mount, behind a ref. One write per session is the whole budget —
  // an effect in this file that ran on every render is what caused the last
  // round of trouble.
  const preflightRef = useRef(false);
  useEffect(() => {
    if (preflightRef.current) return;
    if (authLoading || !user?.id || isAnonymous) return;
    preflightRef.current = true;

    (async () => {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const probe = setDoc(
          doc(db, 'userSettings', user.id),
          { lastSeenAt: new Date().toISOString() },
          { merge: true },
        );
        const timedOut = Symbol('timeout');
        const result = await Promise.race([
          probe.then(() => 'ok' as const),
          new Promise<typeof timedOut>(resolve => setTimeout(() => resolve(timedOut), 8000)),
        ]);
        if (result !== 'ok') setPreflightFailed(true);
      } catch (e) {
        console.error('Firestore preflight failed:', e);
        setPreflightFailed(true);
      }
    })();
  }, [authLoading, user?.id, isAnonymous]);

  // The mirrored roster this device holds, when the saved game has none — see
  // recoverableProgress. Offered, never applied on its own.
  useEffect(() => {
    if (!activeTournamentId || !tournament.hasLoadedRemoteState) return;
    if (recoveryDismissed) return;
    setRecoverable(recoverableProgress(activeTournamentId, tournament.state.players.length, storageUid));
  }, [activeTournamentId, tournament.hasLoadedRemoteState, tournament.state.players.length, recoveryDismissed, storageUid]);

  // Directly sync players to Firestore whenever they change.
  // This is a reliable belt-and-suspenders sync that bypasses the broadcast chain.
  useEffect(() => {
    if (!activeTournamentId || !user || isAnonymous) return;
    if (!tournament.hasLoadedRemoteState) return;
    const sync = async () => {
      const serialised = JSON.stringify(tournament.state.players);
      if (serialised === lastSyncedPlayersRef.current) return;
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const { sanitizeForFirestore } = await import('@/lib/utils');
      try {
        await updateDoc(
          doc(db, 'activeTournaments', activeTournamentId),
          // updatedAt makes "which game am I running?" answerable on another
          // device: resume picks the most recently ACTIVE tournament, not the
          // most recently created one.
          sanitizeForFirestore({
            players: tournament.state.players,
            updatedAt: new Date().toISOString(),
          })
        );
        // Marked as synced only once it is. This used to be set before the
        // await, so a failed write left the roster looking saved and the next
        // identical render skipped the retry.
        lastSyncedPlayersRef.current = serialised;
        reportSyncSuccess();
      } catch (e) {
        reportSyncFailure('Players', e);
      }
    };
    sync();
  }, [tournament.state.players, activeTournamentId, user?.id, isAnonymous, tournament.hasLoadedRemoteState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Directly sync timer state to Firestore whenever it changes.
  useEffect(() => {
    if (!activeTournamentId || !user || isAnonymous) return;
    if (!tournament.hasLoadedRemoteState) return;
    const payload = {
      currentLevel: tournament.state.currentLevel,
      secondsLeft: tournament.state.secondsLeft,
      isRunning: tournament.state.isRunning,
      targetEndTime: tournament.state.targetEndTime || null,
      smallBlind: tournament.state.levels[tournament.state.currentLevel]?.small || 0,
      bigBlind: tournament.state.levels[tournament.state.currentLevel]?.big || 0,
      ante: tournament.state.levels[tournament.state.currentLevel]?.ante || 0,
      blindLevels: tournament.state.levels,
      notes: tournament.state.notes || '',
    };
    const serialised = JSON.stringify(payload);
    if (serialised === lastSyncedTimerRef.current) return;

    const sync = async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const { sanitizeForFirestore } = await import('@/lib/utils');
      try {
        await updateDoc(doc(db, 'activeTournaments', activeTournamentId), sanitizeForFirestore(payload));
        lastSyncedTimerRef.current = serialised;
        reportSyncSuccess();
      } catch (e) {
        reportSyncFailure('The clock', e);
      }
    };
    sync();
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    tournament.state.isRunning,       // start / pause
    tournament.state.currentLevel,    // level skip
    tournament.state.targetEndTime,   // set on start, cleared on pause
    tournament.state.levels,
    tournament.state.notes,
    activeTournamentId,
    user?.id,
    isAnonymous,
    tournament.hasLoadedRemoteState,
  ]);

  // Directly sync prizeStructure and settings to Firestore whenever they change.
  useEffect(() => {
    if (!activeTournamentId || !user || isAnonymous) return;
    if (!tournament.hasLoadedRemoteState) return;
    const payload = {
      prizeStructure: tournament.state.prizeStructure,
      settings: tournament.state.settings,
      // Keep top-level league fields in sync so handover always works
      leagueId: tournament.state.settings?.leagueId || null,
      seasonId: tournament.state.settings?.seasonId || null,
      isSeasonTournament: tournament.state.settings?.isSeasonTournament || false,
    };
    const serialised = JSON.stringify(payload);
    if (serialised === lastSyncedSettingsRef.current) return;

    const sync = async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const { sanitizeForFirestore } = await import('@/lib/utils');
      try {
        await updateDoc(doc(db, 'activeTournaments', activeTournamentId), sanitizeForFirestore(payload));
        lastSyncedSettingsRef.current = serialised;
        reportSyncSuccess();
      } catch (e) {
        reportSyncFailure('Settings', e);
      }
    };
    sync();
  }, [tournament.state.prizeStructure, tournament.state.settings, activeTournamentId, user?.id, isAnonymous, tournament.hasLoadedRemoteState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Setup Socket.IO connection for real-time updates removed

  // Listen for director coordination sync events
  useEffect(() => {
    const handleTournamentSync = (event: CustomEvent) => {
      if (event.detail?.tournament) {
        // Trigger a manual re-render by dispatching additional events
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('leagueDataChanged'));
        }, 100);
      }
    };

    window.addEventListener('tournament-sync', handleTournamentSync as EventListener);
    return () => {
      window.removeEventListener('tournament-sync', handleTournamentSync as EventListener);
    };
  }, []);

  // Auto-record eliminated players to league when season mode is enabled
  useEffect(() => {
    let cancelled = false;

    const syncLeagueResults = async () => {
      try {
        const isSeasonTournament =
          tournament?.state?.details?.type === 'season' ||
          tournament?.state?.settings?.isSeasonTournament === true;

        if (!isSeasonTournament) {
          return;
        }

        const players = tournament?.state?.players || [];
        const activePlayers = players.filter(p => p.isActive !== false);
        const isFinished = activePlayers.length <= 1 && players.length > 1;
        const rawGameId = tournament.state.details?.localGameId || tournament.state.details?.id;
        const gameId = rawGameId ? String(rawGameId) : undefined;

        // 1. A player who is back in the game but already has a result: drop it.
        //    They will be recorded again when they are eliminated for good.
        for (const player of activePlayers) {
          if (!processedEliminationsRef.current.has(player.id)) continue;
          try {
            // The claim is released only AFTER the removal lands. It used to go
            // first, so a failed removal left the claim gone — and the next
            // pass, seeing the player as unprocessed, skipped straight past
            // them. The stale result was never retried and the player kept a
            // wrong finishing position in the league permanently.
            if (gameId) await removeTournamentResultForPlayer(player.name, gameId);
            processedEliminationsRef.current.delete(player.id);
          } catch (rebuyError) {
            // Claim kept, so the next pass tries again — the same shape as the
            // elimination path below.
            reportWriteFailure(`${player.name}'s rebuy`, rebuyError);
            toast({
              title: 'League result not cleared',
              description: `${player.name} bought back in, but their old result could not be removed from the league. It will be retried automatically.`,
              variant: 'destructive',
            });
          }
        }

        // 2. A player still out, but whose position has changed since we recorded
        //    it. A re-entry shifts everyone who busted after the returning player
        //    one place worse, so their stored result is now wrong. Remove it and
        //    let step 3 re-record the corrected position.
        const corrected = new Set<string>();
        for (const player of players) {
          const recorded = processedEliminationsRef.current.get(player.id);
          if (recorded === undefined || recorded === player.position) continue;
          try {
            processedEliminationsRef.current.delete(player.id);
            if (gameId) {
              await removeTournamentResultForPlayer(player.name, gameId);
              corrected.add(player.id);
            }
          } catch (shiftError) {
            console.error('Error clearing a stale league result:', player.name, shiftError);
          }
        }

        // 3. Record anyone eliminated who is not already recorded. When the
        //    tournament is over that includes the winner.
        const toRecord = players.filter(p => {
          if (!p.position || p.position <= 0) return false;
          if (processedEliminationsRef.current.has(p.id)) return false;
          return isFinished ? true : p.isActive === false;
        });

        for (const player of toRecord) {
          if (cancelled) return;
          if (!player.name || !player.position || !players.length) continue;

          // Attribute results to the season the UI is showing.
          //
          // This read currentSeasonRef (the hook's resolved season) while every
          // header labels the game from _displaySeason, which prefers the
          // tournament's stored settings.seasonId. Starting a game for Season 2
          // via the Next Game dialog therefore filed its results under Season 1
          // while the screen said Season 2.
          //
          // isRealSeasonId also blocks the synthetic 'default-season' used
          // before Firestore resolves — results tagged with it match no season
          // and vanish from every season-filtered view.
          const attributedSeason = displaySeasonRef.current?.id;
          const seasonId = isRealSeasonId(attributedSeason) ? String(attributedSeason) : undefined;

          // Claim the slot BEFORE awaiting. The effect re-runs on every players
          // change, so without a synchronous claim a second run could start
          // recording the same player while the first is still in flight.
          processedEliminationsRef.current.set(player.id, player.position);

          try {
            // Awaited deliberately. This used to be fire-and-forget inside a
            // forEach, with the player marked processed regardless — so a
            // permission or network failure lost that result silently and it
            // was never retried. The claim above is released again on failure.
            await recordResultByName(
              player.name,
              player.position,
              players.length,
              player.knockouts || 0,
              player.prizeMoney || 0,
              tournament.state.prizeStructure?.buyIn || 10,
              gameId,
              seasonId,
              // On the correction path the old result has just been deleted, and
              // recordResultByName's own duplicate check reads a snapshot that
              // lags that deletion — it would skip the write and leave the player
              // with no result at all.
              corrected.has(player.id),
              // What the player put in again. These have always been on the
              // player object right here and were simply dropped, which is why
              // the league table's Rebuys, Re-entries, Add-ons and Bounty
              // columns read 0 for every player in every league — and why
              // Invested undercounted anyone who rebought.
              {
                rebuys: player.rebuys || 0,
                reEntries: player.reEntries || 0,
                addons: player.addons || 0,
                bountyWinnings: player.bountyWinnings || 0,
                rebuyAmount: tournament.state.prizeStructure?.rebuyAmount || 0,
                addonAmount: tournament.state.prizeStructure?.addonAmount || 0,
              },
            );
          } catch (playerError) {
            console.error('Error recording individual player to league:', player.name, playerError);
            processedEliminationsRef.current.delete(player.id);
            toast({
              title: 'League result not saved',
              description: `${player.name}'s result could not be saved to the league. It will be retried automatically.`,
              variant: 'destructive',
            });
            // Claim released, so the next pass retries it.
          }
        }
      } catch (effectError) {
        console.error('Critical error in league recording effect:', effectError);
        toast({ title: 'League recording error', description: 'Some results may not have been saved to the league. Please check Tournament History.', variant: 'destructive' });
      }
    };

    // Retry from THIS closure rather than chaining a re-run off the finishing
    // one: the finishing run belongs to an older effect whose `cancelled` is
    // already set, so its re-run would be dropped on the floor.
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const runExclusively = async () => {
      if (cancelled) return;
      if (syncRunningRef.current) {
        retryTimer = setTimeout(() => { void runExclusively(); }, 250);
        return;
      }
      syncRunningRef.current = true;
      try {
        await syncLeagueResults();
      } finally {
        syncRunningRef.current = false;
      }
    };

    void runExclusively();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.state?.players, tournament?.state?.details?.type, tournament?.state?.details?.id, tournament?.state?.prizeStructure?.buyIn, recordResultByName, removeTournamentResultForPlayer]);

  // Reset processed eliminations only when it's a genuine tournament reset (all active, no positions).
  // Guarding on positions prevents mid-game Firestore snapshots during handover from wiping the set.
  useEffect(() => {
    const players = tournament?.state?.players || [];
    const allActive = players.length > 0 && players.every(p => p.isActive !== false);
    const noPositions = !players.some(p => (p.position || 0) > 0);
    if (allActive && noPositions) {
      processedEliminationsRef.current = new Map();
    }
  }, [tournament?.state?.players]);

  // Restore league context when a tournament is loaded via director handover.
  // The leagueId is stored in tournament settings and synced to Firestore, so the
  // receiving director's device always gets the right league regardless of localStorage.
  useEffect(() => {
    const leagueId = tournament.state.settings?.leagueId;
    if (leagueId && tournament.state.details?.type === 'database') {
      switchLeague(String(leagueId));
    }
  }, [tournament.state.settings?.leagueId, tournament.state.details?.type, switchLeague]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear any old test data flag
  useEffect(() => {
    localStorage.removeItem('leagueTestDataAdded');
  }, []);
  const [recentLevelChange, setRecentLevelChange] = useState(false);

  // Track level changes to trigger the flash animation
  useEffect(() => {
    if (tournament.state.isRunning) {
      setRecentLevelChange(true);
      const timeout = setTimeout(() => {
        setRecentLevelChange(false);
      }, 1000);

      return () => clearTimeout(timeout);
    }
  }, [tournament.state.currentLevel]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* The app bar. It was a wordmark, a tagline and an outline Account
          button, with the VENUE's logo and event name centred underneath in
          smaller type — two brands competing and the wrong one winning.
          See components/ConsoleHeader.tsx.

          The centred branding block went with it rather than being kept
          alongside: the event name at two sizes on one screen is exactly the
          fault the season line had, where the info card's header printed the
          identical sentence the toggle row already said. One place. */}
      <ConsoleHeader
        eventName={displayEventName}
        venueLogoUrl={tournament.state.settings.branding?.isVisible
          ? tournament.state.settings.branding?.logoUrl
          : undefined}
        brandingVisible={tournament.state.settings.branding?.isVisible}
        syncBlocked={syncBlocked || preflightFailed || unreadTournament || gameIsMissing}
        isLive={isLive}
        clock={timerOffscreen ? tournament.formatTime() : null}
        levelLabel={timerOffscreen ? levelLabel : null}
      />
      <div className="container mx-auto px-4 py-3 sm:py-6 max-w-4xl">
        {/* Header — row 1: logo + user menu | row 2: mode toggle */}
        {showSignedOutBar && (
          <div className="mb-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-blue-200">Running on this device only</p>
              <p className="text-xs text-blue-200/70">
                Sign in to share a QR code with players, track a league, and pick this game up on
                another device.
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowSignInModal(true)}
              >
                Sign in
              </Button>
              <button
                onClick={() => setSignedOutBarDismissed(true)}
                aria-label="Dismiss"
                className="p-2 text-blue-200/60 hover:text-blue-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <AuthModal isOpen={showSignInModal} onClose={() => setShowSignInModal(false)} />


        {/* Tournament Over Banner.
            This asked for exactly one player with `isActive === true`, and at
            the end of a game there are none — the winner is marked inactive in
            the same update that gives them position 1. So this banner had never
            once been seen on a finished game, on this screen or on a player's
            phone. lib/gameOver.ts answers it for both, and the winner comes from
            the position rather than from a roster that is now entirely out. */}
        {gameIsOver(tournament.state.players) && (
          <TournamentOverBanner
            winnerName={winnerOf(tournament.state.players)?.name || 'Unknown'}
          />
        )}



        {/* Main Timer Card - Always Visible.
            The ref is what tells the app bar when to take the clock over — an
            IntersectionObserver, so the two are never both on screen. */}
        <div className="mb-6" ref={timerCardRef}>
          <TimerCard
            tournament={tournament}
            recentLevelChange={recentLevelChange}
          />
        </div>

        {/* Tournament Info Card - Always Visible */}
        <div className="mb-6">
          <TournamentInfoCard tournament={tournament} league={league} leaguePlayers={leaguePlayers} currentSeason={currentSeason} seasons={seasons} gameNumber={gameNumber} totalGames={totalGames} />
        </div>

        {/* Directly beneath the card that holds the mode slider, so flipping it
            changes something you can see. LeagueSection is a self-contained card
            with its own header, Manage League button and collapse — it was never
            a tab, which is why it rendered as a card inside a card in one.

            Its OWN wrapper, like every other card on this page. Nested inside the
            info card's wrapper it had no gap above it and a doubled one below. */}
        {isLeagueMode && (
          <div className="mb-6">
            {/* Next Game rides in the panel's header. In league mode it is the
                league's business and it is not rendered in the setup card
                below, so it still exists exactly once. */}
            <LeagueSection
              tournament={tournament}
              nextGame={<NextGameControl tournament={tournament} league={league} userLeagues={userLeagues} switchLeague={switchLeague} leaguePlayers={leaguePlayers} currentSeason={currentSeason} seasons={seasons} />}
            />
          </div>
        )}

        {/* A browser that cannot write to Firestore.
            A CONDITION, not an event, so it sits on the screen rather than
            passing as a toast: the director has to change a setting in another
            program before anything will save. Named plainly, because "the sync
            failed" sends nobody anywhere useful. */}
        {(preflightFailed || syncBlocked || unreadTournament || gameIsMissing) && (
          <div className="mb-6 rounded-xl border border-red-400/30 bg-red-400/[0.08] p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-body text-foreground/90">
              {/* A blocker is only ONE of the reasons, and it used to be the
                  only one named. A console pinned to a game that had been
                  deleted showed this same paragraph and told the director to
                  check uBlock — advice that cannot work, for a document that is
                  not there. Each state says what is actually true, and the two
                  that a reload cannot fix carry a way out. */}
              {gameIsMissing && !preflightFailed && !syncBlocked ? (
                <>
                  <div className="font-semibold text-red-400 mb-1">This game no longer exists</div>
                  The saved game this device was opening has been deleted, or was never saved.
                  Nothing here is being stored. Start a new game and it will save normally.
                </>
              ) : unreadTournament && !preflightFailed && !syncBlocked ? (
                <>
                  <div className="font-semibold text-red-400 mb-1">This game is not being saved</div>
                  This device still has not been able to read the saved game, so nothing it does is
                  being stored — and players you remove may come back. Reload the page; if that does
                  not help, check for an ad or tracker blocker.
                </>
              ) : (
                <>
                  <div className="font-semibold text-red-400 mb-1">This game is not being saved</div>
                  An ad or tracker blocker in this browser is stopping StackMate reaching its
                  database. Allow this site in it (in uBlock Origin: click its icon, then the large
                  power button) and reload. The game keeps running on this device meanwhile, but
                  nothing is being stored and it will not survive a refresh.
                </>
              )}
              {(gameIsMissing || unreadTournament) && !preflightFailed && !syncBlocked && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { window.location.href = '/?home=1'; }}
                  >
                    {gameIsMissing ? 'Start a new game' : 'Go home'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* This device cannot save either.
            The local mirror is what saved a tournament when an ad blocker
            cancelled every Firestore write — so it failing is not a lesser
            problem than the banner above, it is the other half of the only
            pair that loses a game outright. Said separately because the fix is
            different: the one above is about a blocker, this one is about the
            browser's own storage. */}
        {!storageWritable && (
          <div className="mb-6 rounded-xl border border-red-400/30 bg-red-400/[0.08] p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-body text-foreground/90">
              <div className="font-semibold text-red-400 mb-1">
                {syncBlocked
                  ? 'This game exists only in this tab'
                  : 'This device cannot keep a backup'}
              </div>
              {syncBlocked
                ? 'Neither the database nor this browser\u2019s storage can be written to, so nothing about this game is saved anywhere. Do not refresh or close this tab. Write the chip counts down, then sort the blocker out.'
                : 'This browser is refusing to store anything \u2014 private browsing, a full disk, or storage turned off in its settings. The game is still being saved to your account, but this device has no backup if the connection drops.'}
            </div>
          </div>
        )}

        {/* The mirrored roster, offered back.
            Never applied on its own: an automatic restore from localStorage is
            how a live game was overwritten once already. The offer only appears
            where the saved game has NO players and this device's copy is of the
            same game. */}
        {recoverable && (
          <div className="mb-6 rounded-xl border border-primary/30 bg-primary/[0.08] p-4 flex items-start gap-3">
            <History className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-body text-foreground/90">
              <div className="font-semibold text-primary mb-1">
                This device has {recoverable.players.length} player{recoverable.players.length === 1 ? '' : 's'} the saved game does not
              </div>
              Saved here{recoverable.updatedAt ? ` at ${new Date(recoverable.updatedAt).toLocaleTimeString()}` : ''}, and
              the copy in your account is empty — which happens when a browser extension blocks the
              database. Restore them?
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    tournament.restoreLocalProgress(recoverable);
                    setRecoverable(null);
                    setRecoveryDismissed(true);
                    toast({ title: 'Players restored', description: 'The clock is paused — press play when you are ready.' });
                  }}
                >
                  Restore {recoverable.players.length} player{recoverable.players.length === 1 ? '' : 's'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setRecoverable(null); setRecoveryDismissed(true); }}>
                  Not now
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Live banner — shown when players exist but haven't gone live yet */}
        {tournament.state.players.length > 0 && !activeTournamentId && (
          <LiveBanner onGoLive={() => setActiveTab('qr')} />
        )}

        {/* Tabbed Management Sections */}
        <Card className="mb-6 card-glass rounded-xl overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Row 1: title + New button */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Tournament Setup</span>
              </div>
              <div className="flex items-center gap-2">
                <TournamentHistoryDialog />
                {/* Standalone only — a league game's copy lives in the league
                    panel above. One mount either way. */}
                {!isLeagueMode && <NextGameControl tournament={tournament} league={league} userLeagues={userLeagues} switchLeague={switchLeague} leaguePlayers={leaguePlayers} currentSeason={currentSeason} seasons={seasons} />}
              </div>
            </div>
            <div className="relative">
              <TabsList className="border-b border-border/40 rounded-none bg-transparent p-0 h-auto gap-0">
                <TabsTrigger value="players">
                  <Users className="h-4 w-4" />
                  Players
                </TabsTrigger>
                <TabsTrigger value="tables">
                  <LayoutGrid className="h-4 w-4" />
                  Seating
                </TabsTrigger>
                <TabsTrigger value="buyins">
                  <Coins className="h-4 w-4" />
                  Structure
                </TabsTrigger>
                <TabsTrigger value="levels">
                  <Layers className="h-4 w-4" />
                  Levels
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings2 className="h-4 w-4" />
                  Settings
                </TabsTrigger>
                <TabsTrigger value="qr">
                  <span className="relative flex items-center justify-center h-4 w-4 flex-shrink-0">
                    <span className="radar-ring absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-500" style={{ animationDelay: '0s' }} />
                    <span className="radar-ring absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-500" style={{ animationDelay: '0.6s' }} />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  Share
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="players" className="mt-0 p-4 pt-5">
              <PlayerSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="buyins" className="mt-0 p-4 pt-5">
              <BuyInSection
                tournament={tournament}
                templateActions={
                  <TournamentTemplatesDialog
                    currentBlindLevels={tournament.state.levels}
                    currentPrizeStructure={tournament.state.prizeStructure || { buyIn: 0 }}
                    onLoadTemplate={(blindLevels, prizeStructure) => {
                      tournament.setBlindLevels(blindLevels);
                      tournament.updatePrizeStructure(prizeStructure);
                    }}
                  />
                }
              />
            </TabsContent>

            <TabsContent value="levels" className="mt-0 p-4 pt-5">
              <BlindLevelsSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="tables" className="mt-0 p-4 pt-5">
              <TablesSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="qr" className="mt-0 p-4 pt-5">
              <QRCodeSection tournament={tournament} dbTournamentId={dbTournamentId} onGoLive={setDbTournamentId} syncBlocked={syncBlocked || preflightFailed || unreadTournament} />
            </TabsContent>

            <TabsContent value="settings" className="mt-0 p-4 pt-5">
              <SettingsSection tournament={tournament} />
            </TabsContent>
          </Tabs>
        </Card>

        <footer className="mt-8 text-center text-muted-foreground text-sm py-4">
          <p>StackMateGo &copy; {new Date().getFullYear()}</p>
          {/* Which build is live. Answers "has Railway deployed it yet?" without
              guesswork — see vite.config.ts. */}
          <p className="text-xs opacity-40 mt-1">build {__BUILD_ID__}</p>
        </footer>
      </div>
    </div>
  );
}
