import { useState, useEffect, useRef, useCallback } from 'react';
import { blindLevelIndex } from '@/lib/entryLimits';
import {
  BlindLevel,
  Player,
  Settings,
  TournamentState,
  TournamentDetails,
  PrizeStructure
} from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { initialDetails, needsLocalGameId, gameIdOf } from '@/lib/localGameId';
import { mergePlayersFromSnapshot } from '@/lib/snapshotMerge';
import { controlOf, mayDrive, takesDocumentRoster, type Control } from '@/lib/directorControl';
import { rosterIsPending } from '@/lib/pendingRoster';
import { breakTable as doBreakTable, consolidationDue, reindexAfterBreak, tableToBreak } from '@/lib/tableBreak';
import { getConsoleId } from '@/lib/consoleId';

import { useAuth } from './useAuth';
import { lastSignedInUid, readScoped, writeScoped } from '@/lib/scopedStorage';
import { nextEliminationPosition, positionsAfterReEntry, positionsAfterAdd, positionsAfterRemove, mostRecentlyBusted, rostersMatchForUndo } from '@/lib/eliminationOrder';
import { repricedForNewPlaces, bountyTakeFor } from '@/lib/resultStats';
import { payoutForPlace } from '@/lib/prizePool';

/**
 * Every finisher whose place a renumbering moved gets the money for the place
 * they now hold (October audit, M7) — see lib/resultStats.ts. One helper, used
 * by all four doors that renumber, so none of them can forget.
 */
function repriceMovedFinishers<T extends Player>(before: T[], after: T[], structure: any): T[] {
  return repricedForNewPlaces(before as any, after as any, payoutForPlace(after as any, structure), structure) as T[];
}
import { withNormalisedPayouts } from '@/lib/payoutTemplates';
import { levelAnnouncement } from '@/lib/announcements';
import { speak } from '@/lib/speak';
import { clearLocalProgress, loadLocalProgress, saveLocalProgress, restorableAtHome, peekLocalProgress, wouldClobberMirror } from '@/lib/localProgress';
import { secondsLeftFrom, advanceClock, formatClock } from '@/lib/tournamentClock';
import type { RemoteLoad } from '@/lib/liveTournament';
import { canRebuy, canReEnter, addOnsOpen } from '@/lib/entryLimits';
import { gameIsOver } from '@/lib/gameOver';
import { playThirtySecondWarning, playLevelComplete } from '@/lib/chimes';
import { defaultPrizeStructure } from '@/lib/prizeStructure';
import { seatToReclaim, tablesOf } from '@/lib/seating';
import {
  consolidationAfterReturn,
  shouldPromptForFinalTable as finalTableIsDue,
  snapshotSeating,
} from '@/lib/finalTable';

// Default tournament settings with 15-minute durations (no pre-scheduled breaks)
const DEFAULT_LEVELS: BlindLevel[] = [
  { small: 25, big: 50, ante: 0, duration: 15 * 60 },
  { small: 50, big: 100, ante: 0, duration: 15 * 60 },
  { small: 75, big: 150, ante: 0, duration: 15 * 60 },
  { small: 100, big: 200, ante: 0, duration: 15 * 60 },
  { small: 150, big: 300, ante: 0, duration: 15 * 60 },
  { small: 200, big: 400, ante: 0, duration: 15 * 60 },
  { small: 400, big: 800, ante: 0, duration: 15 * 60 },
  { small: 500, big: 1000, ante: 0, duration: 15 * 60 },
  { small: 1000, big: 2000, ante: 0, duration: 15 * 60 },
  { small: 2000, big: 4000, ante: 0, duration: 15 * 60 },
  { small: 4000, big: 8000, ante: 0, duration: 15 * 60 },
  { small: 8000, big: 16000, ante: 0, duration: 15 * 60 }
];

const DEFAULT_SETTINGS: Settings = {
  enableSounds: true,
  // The only treatment that shows the level progress, so it is the default.
  timerPiping: 'ring',
  // Default on: players wander off during a break, and having the next level
  // start by itself catches the table out.
  pauseAfterBreak: true,
  enableVoice: false,
  showNextLevel: true,
  tables: {
    numberOfTables: 2,
    seatsPerTable: 8,
    tableNames: ["Table 1", "Table 2"]
  },
  branding: {
    leagueName: "",
    logoUrl: undefined,
    isVisible: true
  }
};

// Load saved settings from localStorage
const loadSavedSettings = (uid: string | null): Partial<Settings> => {
  try {
    const saved = readScoped('tournamentSettings', uid);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.error('Error loading saved settings:', error);
    return {};
  }
};

// Save settings to localStorage
const saveSettings = (settings: Settings, uid: string | null) => {
  try {
    writeScoped('tournamentSettings', JSON.stringify(settings), uid);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
};

// Load saved blind levels
const loadSavedBlindLevels = (uid: string | null): BlindLevel[] => {
  try {
    const saved = readScoped('tournamentBlindLevels', uid);
    return saved ? JSON.parse(saved) : DEFAULT_LEVELS;
  } catch (error) {
    console.error('Error loading saved blind levels:', error);
    return DEFAULT_LEVELS;
  }
};

// Save blind levels
const saveBlindLevels = (levels: BlindLevel[], uid: string | null) => {
  try {
    writeScoped('tournamentBlindLevels', JSON.stringify(levels), uid);
  } catch (error) {
    console.error('Error saving blind levels:', error);
  }
};

// Load saved prize structure
const loadSavedPrizeStructure = (uid: string | null): PrizeStructure => {
  try {
    const saved = readScoped('tournamentPrizeStructure', uid);
    if (saved) {
      // Normalised on read rather than migrated: a structure saved before the
      // default was fixed keeps its payouts in `structure`, and rewriting
      // everyone's stored game to correct that would be the riskier half of the
      // trade.
      return withNormalisedPayouts(JSON.parse(saved));
    }
  } catch (error) {
    console.error('Error loading saved prize structure:', error);
  }

  // One default, shared with the Buy-in tab. There used to be two and they
  // disagreed on rebuys, the cap, the period and the payout split — see
  // lib/prizeStructure.ts.
  return defaultPrizeStructure();
};

// Save prize structure
const savePrizeStructure = (prizeStructure: PrizeStructure, uid: string | null) => {
  try {
    writeScoped('tournamentPrizeStructure', JSON.stringify(prizeStructure), uid);
  } catch (error) {
    console.error('Error saving prize structure:', error);
  }
};

// Function to broadcast tournament state to server for real-time updates
/*
 * `broadcastTournamentState` was here, and it wrote EVERY field the three sync
 * effects in PokerTimer already own — the roster, the whole clock (level,
 * secondsLeft, targetEndTime, isRunning, the blinds, the levels, the notes),
 * the settings. A complete second copy of all three, with none of their
 * guards.
 *
 * So every non-seating change went out twice: a bust-out, a rebuy, a chip
 * edit, each level change, the end of the tournament. Two writes, two
 * snapshots, and the console's snapshot handler rebuilds every active player
 * from the incoming document — which is the same race that made a hand-moved
 * player flicker between two chairs, on the paths that matter most.
 *
 * The three effects win on every count. They wait on `hasLoadedRemoteState`,
 * so they cannot write to a tournament this device has never read — this could,
 * and that is the hazard the latch exists for. They skip a payload already
 * sent; this wrote unconditionally. They record success only once the write
 * RESOLVES, so a failure is retried; this had a bare `console.error`. They are
 * reported through `lib/syncReporter.ts`; this was invisible. And they key on
 * `activeTournamentId`, while this keyed on `details.type === 'database'` — the
 * overloaded field nothing may key "is it saved" on, so the mode toggle could
 * silently switch it off.
 *
 * Its call sites also ran side effects from inside `setState` updaters, in the
 * timer tick, which React is free to invoke more than once.
 *
 * One writer per fact. Do not add a second.
 */

// Function to broadcast seating updates specifically
/*
 * `broadcastSeatingUpdate` was here, and it was the THIRD writer of the players
 * array for a single seating action.
 *
 * Moving one player by hand fired: this, on a 50ms timer, from inside
 * `updatePlayers`; then `broadcastTournamentAction('seating_updated')` on a
 * 100ms timer, which called this AGAIN; and then PokerTimer's direct players
 * sync effect. Three writes, three snapshots, and the console's snapshot
 * handler rebuilds every active player from the incoming document — so until
 * each write landed, the echo still had the player in the chair they had just
 * left. The name flickered between both seats and then settled in the right
 * one, which is exactly what three racing writes look like.
 *
 * PokerTimer's sync effect is the one to keep: it waits on
 * `hasLoadedRemoteState`, skips a write whose payload it has already sent,
 * records success only once the write RESOLVES, and reports failures through
 * `lib/syncReporter.ts`. This had a bare `console.error`, no guard against
 * writing before the first read — the hazard `hasLoadedRemoteState` exists to
 * prevent — and keyed on `details.type === 'database'`, the overloaded field
 * nothing may key "is it saved" on.
 *
 * One writer per fact. Do not add a second.
 */

/*
 * `broadcastTournamentDetails` and `broadcastParticipantUpdate` were here, and
 * both are deleted. Each was a real `updateDoc` against `activeTournaments`
 * writing nothing but `updatedAt`, and each had ZERO call sites — dead code
 * that nonetheless counted as two more writers of a live game.
 *
 * That matters beyond tidiness: `updatedAt` is what `lib/liveTournament.ts`
 * sorts on to decide which game is being run right now, so a stray toucher of
 * that field is a stray voter on that question. And they are exactly the shape
 * the removed device lock failed on — direct writes outside the one door.
 *
 * Every remaining director-side write goes through `lib/liveGameWrite.ts`.
 * Do not add a writer here.
 */

/**
 * Put the table configuration back when an unwind asks for it.
 *
 * A consolidation lowers `settings.tables.numberOfTables` and drops the broken
 * table's name and felt, so undoing one has to restore all three. Restoring the
 * chairs alone would leave the seating pointing at tables the render loop no
 * longer walks — the ghost, by another route.
 *
 * `seatsPerTable` is deliberately NOT restored: it is a setting about the game
 * that a consolidation never touched, and a director may have changed it since.
 */
/** Keep only the first table's name/felt, for the collapse to one table. */
function reindexToOne<T>(items: readonly T[] | undefined): T[] | undefined {
  return items ? items.slice(0, 1) : undefined;
}

function settingsAfterRestore(
  settings: any,
  restore: { numberOfTables: number; names?: string[]; backgrounds?: string[] } | null,
): any {
  if (!restore) return settings;
  return {
    ...settings,
    tables: {
      ...(settings?.tables || {}),
      numberOfTables: restore.numberOfTables,
      seatsPerTable: tablesOf(settings).seatsPerTable,
      ...(restore.names ? { tableNames: restore.names } : {}),
    },
    ...(restore.backgrounds ? { tableBackgrounds: restore.backgrounds } : {}),
  };
}

export function useTournament(tournamentId?: string) {
  const { user, isAnonymous } = useAuth();

  // WHICH account's stored setup this console reads — see lib/scopedStorage.ts.
  //
  // `user` is null for the first moments of every cold load, signed in or not,
  // because Firebase restores the session asynchronously and this runs in the
  // hook body. Falling back to the last-known uid means a returning director
  // reads their own setup immediately instead of being shown a default
  // tournament until auth catches up. If auth resolves to somebody ELSE, nothing
  // here re-reads — this comment used to promise an effect that never existed
  // (October audit, M4). hooks/useAccountChangeIsALogout.ts turns any account
  // change away from a confirmed account into a full page load instead, which is
  // what discards this state.
  //
  // Anonymous never reads a bucket. useTournament is the director console only
  // (the participant view has its own hook), so this is belt and braces.
  const storageUid = isAnonymous ? null : (user?.id ?? lastSignedInUid());

  // Read through a ref inside callbacks and effects, never the captured value.
  //
  // Several of the callbacks below have empty dependency arrays, so a captured
  // storageUid would be whatever it was on the FIRST render, for the life of
  // the component — and every save after an account switch would land in the
  // previous director's bucket, which is the bug this is all here to fix.
  // Widening those arrays instead would churn the callbacks, and referential
  // churn in this hook is what once had a live game writing to Firestore twice
  // a second. A ref costs nothing and is always current.
  const storageUidRef = useRef(storageUid);
  storageUidRef.current = storageUid;

  // Persist localGameId so it survives page refreshes — only generate a new one
  // when a game is explicitly reset (see resetTournament). This prevents the
  // recording effect from writing a duplicate result with a phantom new ID after
  // a browser refresh, which would inflate the games-played count.
  const getOrCreateLocalGameId = () => {
    const stored = readScoped('tournamentLocalGameId', storageUidRef.current);
    if (stored) return stored;
    const newId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    writeScoped('tournamentLocalGameId', newId, storageUidRef.current);
    return newId;
  };

  // EVERYTHING the console starts from, read ONCE (October audit, correctness
  // debt). This sat in the hook body, so the settings (a logo of up to 150 KB
  // among them), the levels, the prize structure and the roster mirror were
  // read and parsed from localStorage on every render — once a second, because
  // that is how the clock advances — and getOrCreateLocalGameId wrote storage
  // during render. useState only ever used the first answer anyway; the
  // initialiser makes that the only one computed. The getDoc transform below
  // reads mergedSettings and savedLevels from here, exactly the first-render
  // values its effect always captured.
  const [boot] = useState(() => {
    // Load saved settings and merge with defaults
    const savedSettings = loadSavedSettings(storageUid);
    const mergedSettings = { ...DEFAULT_SETTINGS, ...savedSettings };

    // Create an initial state with saved preferences
    const savedLevels = loadSavedBlindLevels(storageUid);

    // Restore a local game in progress. NEVER for a database tournament: its truth
    // is Firestore, and seeding it from localStorage is the same hazard the
    // hasLoadedRemoteState latch exists to prevent — a device writing its own idea
    // of the roster over the real game.
    //
    // And never a mirror whose ids disagree: that is a LIVE game filed under some
    // other local id, and restoring it made a new local game out of its roster,
    // which the auto-save then saved as a duplicate document. See restorableAtHome.
    const restored = tournamentId
      ? null
      : restorableAtHome(loadLocalProgress(getOrCreateLocalGameId(), storageUid));

    const initialState: TournamentState = {
      levels: savedLevels,
      players: restored?.players ?? [],
      currentLevel: restored?.currentLevel ?? 0,
      secondsLeft: restored?.secondsLeft ?? (savedLevels[0]?.duration || 900), // Default to 15 minutes if no levels
      targetEndTime: restored?.targetEndTime,
      // Never restore a running clock: the page was away for an unknown time, so
      // resuming paused is honest and the director presses play.
      isRunning: false,
      settings: mergedSettings,
      prizeStructure: loadSavedPrizeStructure(storageUid),
      isFinalTable: restored?.isFinalTable ?? false,
      // Through lib/localGameId.ts, because the standalone branch here used to
      // omit the localGameId — and the document id IS the localGameId, so
      // "a collision means JOIN" silently did not apply to standalone games.
      details: initialDetails(
        tournamentId,
        (mergedSettings as any)?.isSeasonTournament === true,
        getOrCreateLocalGameId,
      ),
    };
    return { mergedSettings, savedLevels, initialState };
  });
  const { mergedSettings, savedLevels } = boot;

  // Tournament state
  const [state, setState] = useState<TournamentState>(boot.initialState);

  // Timer interval reference
  const timerIntervalRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  /**
   * Has this tournament ever been READ from Firestore on this device?
   *
   * A latch, not a connection flag. Local state starts with an empty players
   * array, and the direct sync effects in PokerTimer write whatever they see —
   * so a device arriving at a live tournament it has never loaded would push
   * `players: []` straight over the real game. That could not happen while the
   * only way to hold a tournament id was to have gone live on that device; it
   * became reachable when signing in started resuming a game on any device.
   *
   * Deliberately not `isConnected`, which flips back to false on a listener
   * error or teardown. What the sync effects need is "have we ever read this",
   * which only ever goes one way — until the tournament id changes.
   */
  const [hasLoadedRemoteState, setHasLoadedRemoteState] = useState(false);

  /**
   * How the attempt to read THIS tournament resolved — a second, separate
   * signal, deliberately not folded into the latch above.
   *
   * `hasLoadedRemoteState` is the WRITE GATE: it means "this device has seen
   * the real document and may now write over it". "We read it and it is not
   * there" must never authorise that, so it gets its own state.
   *
   * The distinction that earns the extra state is `missing` vs `error`.
   * `missing` is an ANSWER — the document was read for and is genuinely not
   * there, so the id the console is holding is worthless and must be dropped.
   * `error` is the absence of an answer, and dropping a pin on a failed read is
   * how this codebase has lost a live game before.
   *
   * Without this, an id naming a deleted game silenced everything: no listener,
   * no latch, no writes, no error — and a director's roster lived only in the
   * tab until the next refresh threw it away.
   */
  const [remoteLoad, setRemoteLoad] = useState<RemoteLoad>('pending');

  /**
   * WHICH DEVICE is driving this game, straight off the snapshot.
   *
   * Exposed raw rather than as a verdict: `lib/directorControl.ts` turns it into
   * one, and a hook that decided for itself would be a second answer to a
   * question the door already answers. Null means the document names nobody —
   * which is every game written before the lock shipped.
   */
  const [controllingDeviceId, setControllingDeviceId] = useState<string | null>(null);
  const [controlClaimedAt, setControlClaimedAt] = useState<string | null>(null);

  /**
   * The control state the LAST snapshot reported, so a transition can be seen.
   * A ref rather than state: nothing renders from it, and it must be readable
   * and writable inside the snapshot callback without re-subscribing.
   */
  const lastControlRef = useRef<Control | null>(null);

  /** Which game's snapshot has been applied — the load must not overwrite it. */
  const snapshotAppliedForRef = useRef<string | null>(null);

  // Load tournament data from database if tournamentId is provided
  useEffect(() => {
    // A different tournament has not been resolved yet, whatever the last one
    // resolved to.
    setRemoteLoad('pending');
    if (tournamentId) {
      const loadTournamentData = async () => {
        try {
          const docRef = doc(db, 'activeTournaments', tournamentId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const tournamentData = docSnap.data();

            // Transform the database tournament data to match our state structure
            let initialSecondsLeft = tournamentData.secondsLeft || (tournamentData.blindLevels?.[0]?.duration || 900);
            
            // If the timer is running and we have a targetEndTime, calculate the actual remaining time
            if (tournamentData.isRunning && tournamentData.targetEndTime) {
              initialSecondsLeft = Math.max(0, Math.ceil((tournamentData.targetEndTime - Date.now()) / 1000));
            }

            const transformedState: TournamentState = {
              levels: tournamentData.blindLevels || savedLevels,
              players: tournamentData.players || [],
              currentLevel: tournamentData.currentLevel || 0,
              secondsLeft: initialSecondsLeft,
              targetEndTime: tournamentData.targetEndTime,
              isRunning: tournamentData.isRunning || false,
              settings: {
                ...mergedSettings,
                ...tournamentData.settings,
                // Promote top-level league fields into settings so the handover
                // restore effect in PokerTimer always finds leagueId/seasonId.
                //
                // From the GAME and nowhere else (October audit, correctness
                // debt). These fell back to THIS DEVICE's own settings, so a game
                // stored without a league picked up whichever league this device
                // last used — and the settings sync then wrote it into the game.
                // `undefined` beats the spread above, which carries the device's.
                leagueId: tournamentData.leagueId || tournamentData.settings?.leagueId || undefined,
                seasonId: tournamentData.seasonId || tournamentData.settings?.seasonId || undefined,
                // An explicit flag wins; a game with none is a league game when it
                // names a league — lib/tournamentMode.ts's rule, never the device's.
                isSeasonTournament: tournamentData.isSeasonTournament
                  ?? tournamentData.settings?.isSeasonTournament
                  ?? !!(tournamentData.leagueId || tournamentData.settings?.leagueId),
                tables: {
                  ...mergedSettings.tables,
                  ...tournamentData.settings?.tables
                }
              },
                        prizeStructure: tournamentData.prizeStructure
                          ? withNormalisedPayouts(tournamentData.prizeStructure)
                          : loadSavedPrizeStructure(storageUidRef.current),
              // READ, not hard-coded false. This line WAS `false`, and that was
              // an independent cause of a second device asking "Final table?"
              // about a final table already under way: the flag could be written
              // and arrive, and then be thrown away by the very load path a
              // device uses when it opens the game. Absent means false, so a game
              // stored before the field existed still loads correctly — the same
              // read-side normalisation payoutsOf() and bandsOf() make.
              isFinalTable: tournamentData.isFinalTable === true,
              // Read here as well as through the snapshot's spread, because THIS
              // is the transform that hard-coded isFinalTable false and threw the
              // last cross-device fix away. Absent means nothing answered yet.
              rebuysAnswered: Array.isArray(tournamentData.rebuysAnswered)
                ? tournamentData.rebuysAnswered
                : [],
              details: {
                type: 'database',
                id: tournamentId,
                name: tournamentData.name,
                status: tournamentData.status,
                createdAt: tournamentData.createdAt,
                createdBy: tournamentData.createdBy,
                ownerId: tournamentData.ownerId,
                // Read here as the snapshot reads it. It was dropped, so an
                // unpublished game showed its QR until the first snapshot.
                isPublished: tournamentData.isPublished !== false,
              }
            };

            // A snapshot of this game has already been applied: it is newer
            // than this read and may carry local changes made since, which a
            // wholesale setState would throw away (October audit).
            if (snapshotAppliedForRef.current === tournamentId) {
              setRemoteLoad('loaded');
              return;
            }
            setState(transformedState);
            setRemoteLoad('loaded');
          } else {
            // Read for, and genuinely not there. This used to log and stop,
            // which left the console holding an id it could never read: no
            // listener, no latch, no writes, and no error anywhere.
            console.error('Failed to load tournament: Document does not exist');
            setRemoteLoad('missing');
          }
        } catch (error) {
          // Not an answer. The pin stays where it is.
          console.error('Error loading tournament data:', error);
          setRemoteLoad('error');
        }
      };

      loadTournamentData();
    }
  }, [tournamentId]);

  // Clean up the timer interval on unmount.
  //
  // This used to also construct `new Audio("https://actions.google.com/...")`
  // that was never played — a third-party request on every console mount, for a
  // sound that would not have loaded at a venue with no internet anyway.
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Persist a local game as it changes, so logging out or refreshing does not
  // lose the roster. Only for games that have not gone live — a database
  // tournament lives in Firestore and must not be seeded from here.
  useEffect(() => {
    // Belt and braces. A standalone game USED to carry no localGameId on details
    // — only league games did — which is the gap lib/localGameId.ts closed, so
    // `details.localGameId` is now present for every local game. The fallback
    // stays for a game whose details have not filled in yet, but the comment
    // that used to say standalone games never have one is no longer true and
    // was misleading readers.
    //
    // Keyed on THIS game's identity (lib/localGameId.ts's gameIdOf): the local id
    // for a local game, the document id for a game opened by its document. It used
    // to fall back to the DEVICE's local id for the latter — minting and storing
    // one if there was none — so a live game was filed under an id that was not
    // its own, and the home route restored it as a brand-new game. A database game
    // never mints a local id here.
    const localGameId = gameIdOf(state.details)
      ?? (state.details?.type === 'database' ? null : getOrCreateLocalGameId());
    if (!localGameId) return;

    // One mirror slot per account: an empty new game must not throw away another
    // game's roster, which can be the only copy. See wouldClobberMirror.
    if (wouldClobberMirror(peekLocalProgress(storageUidRef.current), String(localGameId), state.players.length)) {
      return;
    }

    // Written for a LIVE game too. Nothing reads it back into one without the
    // director pressing Restore, so it costs nothing and it is the only copy
    // that survives a browser whose writes to Firestore are being blocked.
    saveLocalProgress({
      localGameId: String(localGameId),
      players: state.players,
      currentLevel: state.currentLevel,
      secondsLeft: state.secondsLeft,
      isRunning: state.isRunning,
      targetEndTime: state.targetEndTime,
      isFinalTable: state.isFinalTable,
      dbTournamentId: state.details?.id?.toString(),
      updatedAt: new Date().toISOString(),
    }, storageUidRef.current);
  }, [
    state.players,
    state.currentLevel,
    state.secondsLeft,
    state.isRunning,
    state.targetEndTime,
    state.isFinalTable,
    state.details?.type,
    state.details?.localGameId,
    state.details?.id,
  ]);

  // Set up Firestore listener for real-time tournament synchronization
  useEffect(() => {
    // Reset the latch: a different tournament has not been read yet, whatever
    // we may have read before.
    setHasLoadedRemoteState(false);

    // And forget who was driving the LAST game. A holder carried across would
    // make the banner accuse another device of running a game it has never
    // heard of — the same class of fault as a held tournament id outliving the
    // game it named.
    setControllingDeviceId(null);
    setControlClaimedAt(null);

    // And the transition this device was in, or the FIRST snapshot of the new
    // game could read as 'other' -> 'mine' and adopt — replacing a roster that
    // may legitimately be ahead of a document this device has not written yet.
    // A control fact belongs to one game, exactly like a held tournament id.
    lastControlRef.current = null;

    // A game with a document id has a document, whatever its type says. Keying
    // this on `type === 'database'` meant the mode toggle — which writes
    // 'season' or 'standalone' over it — tore the listener down on a saved game,
    // and with it hasLoadedRemoteState and every write that waits on the latch.
    if (state.details?.id) {
      const docRef = doc(db, 'activeTournaments', state.details.id.toString());
      
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsConnected(true);
          setHasLoadedRemoteState(true);
          setRemoteLoad('loaded');
          snapshotAppliedForRef.current = String(state.details?.id ?? '');

          // Who is driving. Set on EVERY snapshot, which is what makes a
          // takeover on the other device reach this one: the field changes,
          // this console sees it, and it goes read-only without being told.
          setControllingDeviceId(
            typeof data.controllingDeviceId === 'string' ? data.controllingDeviceId : null,
          );
          setControlClaimedAt(
            typeof data.controlClaimedAt === 'string' ? data.controlClaimedAt : null,
          );

          // Has this device just taken control after standing down? If so the
          // roster below is replaced rather than merged — the clean slate the
          // old handover got from a full page load on sign-out.
          //
          // Computed HERE, not inside the setState updater, because React is
          // free to call an updater more than once and this is a one-shot
          // transition: the ref must advance exactly once per snapshot.
          //
          // Through the same `controlOf` PokerTimer uses, so the two cannot
          // disagree about who is driving.
          const nextControl = controlOf(
            typeof data.controllingDeviceId === 'string' ? data.controllingDeviceId : null,
            getConsoleId(),
          );
          // A takeover, or a console that is only watching: the document's roster
          // replaces the one on screen rather than merging (October audit, M14 —
          // see takesDocumentRoster).
          const adopt = takesDocumentRoster(lastControlRef.current, nextControl);
          lastControlRef.current = nextControl;
          
          setState(currentState => {
            try {
              // The roster meets the snapshot through lib/snapshotMerge.ts,
              // which holds the rules that used to be spelled out here — all of
              // them biased toward LOCAL, which is correct for the device
              // driving the game and wrong for one that has just stopped being
              // read-only. `adopt` is that one case; see shouldAdoptRemote.
              //
              // `keepLocal` is the other half, and it closes the mirror-image
              // hazard: the rules are biased toward local for ELIMINATIONS only,
              // so a local change in the OTHER direction — a rebuy, a final-table
              // redraw — was reverted by the echo of the write that preceded it,
              // and the revert was then written back. See lib/pendingRoster.ts.
              //
              // Asked INSIDE the updater, against `currentState.players`: the
              // question is about the roster React is about to replace, not the
              // one that happened to be on screen when the snapshot arrived.
              //
              // `mayDrive` keeps a READ-ONLY console out of it. Its writes are
              // skipped by the door, so its last-written payload never advances
              // and its roster would read as pending for the rest of the night,
              // leaving it unable to track the game it is only there to watch.
              //
              // Computed once and used TWICE — for the roster and for
              // `isFinalTable` below — because the two are written in one
              // payload, so they are pending under exactly the same condition.
              // One question, one answer; a second check could only disagree.
              const keepLocal = mayDrive(nextControl) && rosterIsPending({
                players: currentState.players,
                isFinalTable: currentState.isFinalTable,
              });

              const finalPlayers = mergePlayersFromSnapshot(
                currentState.players,
                data.players,
                { adopt, keepLocal },
              );

              // Complete tournament state update with elimination protection
              const updatedState = {
                ...currentState,
                ...data,
                // Use protected players array
                players: finalPlayers,
                levels: Array.isArray(data.blindLevels) ? data.blindLevels : currentState.levels,
                settings: {
                  ...currentState.settings,
                  ...data.settings,
                  tables: {
                    ...currentState.settings.tables,
                    ...data.settings?.tables
                  }
                }
              };

              // `...data` above spreads the document over local state, so the
              // echo of this device's own write can arrive still saying
              // isFinalTable: false and undo a collapse the moment it happens —
              // the rebuy revert with a new field name. While our write is in
              // flight the local value wins.
              //
              // NOT when adopting: a takeover means local state is stale rather
              // than optimistic, which is the whole reason shouldAdoptRemote
              // exists. `preFinalTableSeating` travels with the flag, so it is
              // held on the same condition — it is not written to the document,
              // and letting an echo blank it would cost the undo.
              if (keepLocal && !adopt) {
                updatedState.isFinalTable = currentState.isFinalTable;
                updatedState.preConsolidation = currentState.preConsolidation;
              }

              // Update timer state if provided with validation
              if (typeof data.currentLevel === 'number' && data.currentLevel >= 0) {
                updatedState.currentLevel = data.currentLevel;
              }
              // The document's countdown is a snapshot taken when it was
              // written; its targetEndTime is absolute and cannot go stale.
              // Taking `secondsLeft` at face value froze the running clock and
              // let the next tick jump it back down — invisible only while the
              // app was writing twice a second to keep the stored value fresh.
              // The three fields describe one clock, so they are read together.
              updatedState.secondsLeft = secondsLeftFrom(
                {
                  isRunning: typeof data.isRunning === 'boolean' ? data.isRunning : currentState.isRunning,
                  targetEndTime: data.targetEndTime,
                  secondsLeft: typeof data.secondsLeft === 'number' ? data.secondsLeft : currentState.secondsLeft,
                },
                Date.now(),
              );
              if (typeof data.isRunning === 'boolean') {
                updatedState.isRunning = data.isRunning;
              }

              // Keep ownerId current, and only when actually present: a
              // snapshot without the field must not make a working director
              // look like the game is no longer theirs.
              if (typeof data.ownerId === 'string' && data.ownerId) {
                updatedState.details = {
                  ...updatedState.details,
                  ownerId: data.ownerId,
                } as typeof updatedState.details;
              }

              // Absent means published — the field postdates the documents that
              // Go Live created, and their QR links must keep working.
              updatedState.details = {
                ...updatedState.details,
                isPublished: data.isPublished !== false,
              } as typeof updatedState.details;

              return updatedState;
            } catch (error) {
              console.error('Error processing tournament update:', error);
              return currentState;
            }
          });
        } else {
          // A snapshot saying the document is not there is a definite answer,
          // not silence — the game was deleted, or never existed.
          setIsConnected(false);
          setRemoteLoad('missing');
        }
      }, (error) => {
        console.error('Firestore subscription error:', error);
        setIsConnected(false);
        setRemoteLoad('error');
      });

      return () => {
        unsubscribe();
        setIsConnected(false);
      };
    }
  // The id alone. `type` was a dependency too, so a mode flip re-subscribed and
  // reset the latch for no reason — the document had not changed.
  }, [state.details?.id]);


  // Handle timer interval - single comprehensive timer effect
  useEffect(() => {
    // Clean up any existing interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // If timer should be running, set up a new interval
    if (state.isRunning) {
      // Create new interval that runs every second
      const intervalId = setInterval(() => {
        setState(prevState => {
          if (!prevState.isRunning) return prevState; // discard tick racing with cleanup
          // Check if tournament is complete before processing timer tick
          // lib/gameOver.ts, the one answer (October audit, M16). "All but one
          // eliminated" disagreed with it after undoing the runner-up: the console
          // said the game was on and the clock refused to run.
          if (gameIsOver(prevState.players)) {
            return {
              ...prevState,
              isRunning: false // Stop the timer when tournament finishes
            };
          }

          let newSecondsLeft = prevState.secondsLeft - 1;
          if (prevState.targetEndTime) {
            newSecondsLeft = Math.max(0, Math.ceil((prevState.targetEndTime - Date.now()) / 1000));
          }

          // 30 second warning alert
          if (prevState.secondsLeft > 30 && newSecondsLeft <= 30 && prevState.settings.enableSounds) {
            playThirtySecondWarning();

            if (prevState.settings.enableVoice) {
              // 1.2s clears the two-tone warning chime above.
              speak('30 seconds remaining', { delayMs: 1200 });
            }
          }

          // If there's time remaining in the current level
          if (newSecondsLeft > 0) {
            // Just decrement the seconds - ensure it's a valid number
            const validSecondsLeft = Math.max(0, Math.floor(newSecondsLeft));
            const newState = {
              ...prevState,
              secondsLeft: validSecondsLeft
            };

            return newState;
          }
          // Current level is complete
          else {
            const nextLevelIndex = prevState.currentLevel + 1;

            // Level completed sound - gentle but noticeable
            if (prevState.settings.enableSounds) {
              playLevelComplete();
            }

            // If there are more levels
            if (nextLevelIndex < prevState.levels.length) {
              // Caught up from the END TIME, through every level that elapsed —
              // lib/tournamentClock.ts's advanceClock (October audit, M11). This
              // used to start the next level at `Date.now() + duration`, one per
              // tick, so a tablet that slept through the end of a level lost the
              // time it was away and two elapsed levels collapsed into one.
              // When a BREAK finishes it still holds at the start of the next
              // level until the director presses play, if they asked for that;
              // startTimer() recomputes targetEndTime from secondsLeft.
              const advanced = advanceClock(
                prevState.levels,
                prevState.currentLevel,
                prevState.targetEndTime,
                Date.now(),
                prevState.settings.pauseAfterBreak !== false,
              );

              const newState = {
                ...prevState,
                currentLevel: advanced.currentLevel,
                secondsLeft: advanced.secondsLeft,
                targetEndTime: advanced.targetEndTime,
                isRunning: advanced.isRunning,
              };

              // Schedule voice announcement - use immediate approach
              if (prevState.settings.enableVoice && advanced.finished) {
                // Caught up past the LAST level while away.
                speak('Tournament complete');
              } else if (prevState.settings.enableVoice) {
                // 2.5s lets the three level-complete chimes finish first.
                speak(levelAnnouncement(prevState.levels, advanced.currentLevel), {
                  cancel: true,
                  delayMs: 2500,
                });
              }

              // No broadcast here: currentLevel, targetEndTime and isRunning all
              // move on a level change, and each is a dependency of the clock
              // sync effect, which writes them once and reports if it cannot.

              return newState;
            }
            // Tournament is complete
            else {
              if (prevState.settings.enableVoice) {
                speak('Tournament complete');
              }

              // No more levels, stop the timer
              const finalState = {
                ...prevState,
                secondsLeft: 0,
                isRunning: false // Stop the timer
              };

              // Nor here: `isRunning` going false is a dependency of the clock
              // sync effect, and `secondsLeft: 0` rides along in its payload.

              return finalState;
            }
          }
        });
      }, 1000);

      // Store the interval ID for cleanup
      timerIntervalRef.current = intervalId;

      // Return cleanup function
      return () => {
        clearInterval(intervalId);
      };
    }

    // If timer isn't running, just return a no-op cleanup
    return () => {};
  // The ID, not the user object. `user` was referentially fresh on every render,
  // which tore this one-second interval down and rebuilt it on every render —
  // it could only fire when a whole second passed with no render at all. The
  // digits survived that, because they are recomputed from targetEndTime, but
  // the level change, the 30-second warning and the voice announcements all
  // live inside the tick. The tick does read user?.id, for the broadcast, so
  // the id stays a dependency rather than being dropped.
  }, [state.isRunning, state.settings.enableSounds, state.settings.enableVoice, user?.id]);

  // Enhanced broadcast function with proper WebSocket communication
  const broadcastTournamentAction = useCallback(async (actionName: string, newState: TournamentState) => {
    // Nothing is written from here any more, for any action: PokerTimer's
    // three sync effects own the roster, the clock and the settings. An unused
    // payload and an empty `database` branch went with the October audit; what
    // is left dispatches events CLAUDE.md lists as heard by nothing.

    // Broadcast to season tournaments (league games) via local events
    if (newState.details?.type === 'season') {
      try {
        // Trigger local events immediately for season tournaments
        window.dispatchEvent(new CustomEvent('tournamentStateChanged', { 
          detail: { action: actionName, state: newState, type: 'season' } 
        }));

        // Special handling for knockout actions in league games
        if (actionName === 'knockout_added') {
          window.dispatchEvent(new CustomEvent('leagueKnockoutAdded', {
            detail: { state: newState, players: newState.players }
          }));
          
          // Force league data refresh for participant views
          window.dispatchEvent(new CustomEvent('leagueDataChanged', {
            detail: { 
              source: 'knockout-added', 
              forceUpdate: true,
              timestamp: Date.now()
            }
          }));
        }

      } catch (error) {
        console.error('Failed to broadcast season tournament action:', error);
      }
    }
    
    // Broadcast to standalone tournaments via local events
    if (newState.details?.type === 'standalone') {
      try {
        // Trigger local events immediately for standalone tournaments
        window.dispatchEvent(new CustomEvent('tournamentStateChanged', { 
          detail: { action: actionName, state: newState } 
        }));

      } catch (error) {
        console.error('Failed to broadcast standalone tournament action:', error);
      }
    }

    // Always dispatch a generic action event immediately for components that listen to all tournament types
    window.dispatchEvent(new CustomEvent('tournamentActionBroadcast', {
      detail: { action: actionName, state: newState, type: newState.details?.type }
    }));
  }, [user?.id]);

  // Start the timer
  const startTimer = useCallback(() => {
    setState(prev => {
      const targetEndTime = Date.now() + prev.secondsLeft * 1000;
      const newState = { ...prev, isRunning: true, targetEndTime };

      // Broadcast timer start to all connected clients
      broadcastTournamentAction('timer_start', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Pause the timer
  const pauseTimer = useCallback(() => {
    setState(prev => {
      const newState = { ...prev, isRunning: false, targetEndTime: undefined };

      // Broadcast timer pause to all connected clients
      broadcastTournamentAction('timer_pause', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Reset timer
  const resetTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setState(prev => {
      const newState = {
        ...prev,
        currentLevel: 0,
        secondsLeft: prev.levels[0].duration,
        isRunning: false,
        targetEndTime: undefined
      };
      
      // Broadcast timer reset to all connected clients
      broadcastTournamentAction('timer_reset', newState);
      
      return newState;
    });
  }, [broadcastTournamentAction]);

  // Add player with comprehensive initialization
  const addPlayer = useCallback((name: string) => {
    if (name.trim() === '') return;

    setState(prev => {
      // A finished game takes no new entries — see lib/gameOver.ts's
      // `finishedGameNote`. One added player made the game read as unfinished
      // again on every screen after History was already written. Enforced HERE,
      // where every caller passes, rather than at each button; the screen also
      // stops offering it, so this is the rule and not the only defence.
      if (gameIsOver(prev.players)) return prev;

      const newPlayer = {
        id: uuidv4(),
        name: name.trim(),
        knockouts: 0,
        seated: false,
        isActive: true,
        position: undefined,
        prizeMoney: 0,
        rebuys: 0,
        addons: 0,
        currentBounty: (prev.prizeStructure?.enableBounties && prev.prizeStructure?.bountyType === 'progressive') ? (prev.prizeStructure?.bountyAmount || 0) : undefined,
        bountyWinnings: 0
      };

      // Late entry into a game with finishers: everybody already out finished
      // one place worse in the bigger field (October audit, H7), and is paid for
      // that place (M7).
      const grown = positionsAfterAdd([...prev.players, newPlayer]);
      const newState = {
        ...prev,
        players: repriceMovedFinishers(prev.players, grown, prev.prizeStructure),
      };

      // Dispatch event for real-time sync
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('playerAdded', { 
          detail: { player: newPlayer, players: newState.players } 
        }));
      }, 100);

      // Broadcast player addition to all connected clients
      broadcastTournamentAction('player_added', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Remove player
  const removePlayer = useCallback((playerId: string) => {
    setState(prev => {
      // Everybody who finished below the removed player moves up one, so the
      // places stay a run from 1 to the field (October audit, H7).
      const shrunk = positionsAfterRemove(prev.players, playerId);
      const newState = {
        ...prev,
        players: repriceMovedFinishers(prev.players, shrunk, prev.prizeStructure),
      };

      // Broadcast player removal to all connected clients
      broadcastTournamentAction('player_removed', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Add a knockout to a player
  const addKnockout = useCallback((playerId: string) => {
    setState(prev => {
      const player = prev.players.find(p => p.id === playerId);
      if (!player) {
        return prev;
      }

      const updatedPlayers = prev.players.map(player =>
        player.id === playerId
          ? { ...player, knockouts: (player.knockouts || 0) + 1 }
          : player
      );

      const newState = {
        ...prev,
        players: updatedPlayers
      };

      // Use the centralized broadcast function for all types
      broadcastTournamentAction('knockout_added', newState);

      // Always dispatch local events immediately for UI updates
      window.dispatchEvent(new CustomEvent('knockoutAdded', { 
        detail: { playerId, players: updatedPlayers, action: 'knockout_added' } 
      }));

      // Force immediate state sync for all views with multiple event types
      window.dispatchEvent(new CustomEvent('tournamentStateChanged', { 
        detail: { action: 'knockout_added', state: newState } 
      }));

      // Additional event specifically for knockout sync
      window.dispatchEvent(new CustomEvent('knockoutSync', { 
        detail: { playerId, players: updatedPlayers, tournamentType: prev.details?.type } 
      }));

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Eliminate a player and assign their final position
  const eliminatePlayer = useCallback((playerId: string, eliminatedById?: string, seatInfo?: any) => {
    setState(prev => {
      const playerToEliminate = prev.players.find(p => p.id === playerId);
      if (!playerToEliminate || playerToEliminate.isActive === false) {
        return prev;
      }

      // Where they were sitting, taken from the player when the caller does not
      // say. Only TablesSection passed it, so busting someone out from the
      // Players list lost their seat outright — and with it the rebuy's chance
      // to put them back and undo's chance to restore them. The hook has the
      // player; it never needed telling.
      const recordedSeat = seatInfo ?? (
        playerToEliminate.tableAssignment
          ? {
              tableIndex: playerToEliminate.tableAssignment.tableIndex,
              seatIndex: playerToEliminate.tableAssignment.seatIndex,
              totalSeatedPlayers: prev.players.filter(p => p.seated && p.isActive !== false).length,
            }
          : undefined
      );

      // Single derivation, shared with the re-entry renumbering — see
      // lib/eliminationOrder.ts for why counting alone was not enough.
      const newPosition = nextEliminationPosition(prev.players);

      // No points are written onto the player. The league owns scoring, and a
      // per-player copy made here is a rival source of truth by construction —
      // it cannot see the league's scheme, its bonuses or its bands. Two
      // formulas used to live here, a linear (players - position + 1) * 10 on
      // elimination and a flat players * 36 for the winner, neither agreeing
      // with any scheme a league can actually be set to. Nothing ever read
      // either. See the note on Player in types/index.ts.

      // Everything the player collected: the payout for the place, plus their
      // bounty money from bountyTakeFor — the one derivation of it, which the
      // results table, both Payouts panels and the re-pricing already read.
      //
      // It used to add `knockouts × bountyAmount` for EVERY bounty type. In a
      // progressive game a knockout pays half the victim's CURRENT bounty, not
      // the base amount, so a PKO player out of the money with one knockout
      // (worth £5) showed a phantom £5 prize and £10 won, and the league
      // recorded £10 (October audit, M6).
      const payoutAt = payoutForPlace(prev.players, prev.prizeStructure);
      const prizeMoney = payoutAt(newPosition)
        + bountyTakeFor({ ...playerToEliminate, position: newPosition }, prev.prizeStructure).money;

      // Update the eliminated player's data with comprehensive analytics
      let updatedPlayers = prev.players.map(player =>
        player.id === playerId
          ? {
              ...player,
              seated: false,
              tableAssignment: undefined,
              position: newPosition,
              eliminatedBy: eliminatedById,
              prizeMoney,
              isActive: false,
              seatInfo: recordedSeat,
              bustCount: (player.bustCount || 0) + 1,
            }
          : player.id === eliminatedById && eliminatedById
            ? {
                ...player,
                knockouts: (player.knockouts || 0) + 1,
                // A knockout of somebody carrying NO bounty pays nothing — see
                // bountyTakeFor (October audit, M6).
                ...(playerToEliminate.currentBounty === 0
                  ? { bountylessKnockouts: (player.bountylessKnockouts || 0) + 1 }
                  : {}),
              }
            : player
      );

      // Handle PKO logic if enabled
      if (eliminatedById && prev.prizeStructure?.enableBounties && prev.prizeStructure?.bountyType === 'progressive') {
        // `??`: a stored 0 means this player carries no bounty, and `0 ||` paid
        // half a bounty that was never bought (October audit, M6).
        const eliminatedBounty = playerToEliminate.currentBounty ?? prev.prizeStructure.bountyAmount ?? 0;
        const wonAmount = eliminatedBounty / 2;

        updatedPlayers = updatedPlayers.map(player => {
          if (player.id === eliminatedById) {
            return {
              ...player,
              bountyWinnings: (player.bountyWinnings || 0) + wonAmount,
              currentBounty: (player.currentBounty ?? prev.prizeStructure!.bountyAmount ?? 0) + wonAmount
            };
          }
          return player;
        });
      }

      // Check if only one player remains active and award them 1st place
      // `isActive !== false` rather than `=== true`: every other active-player
      // check in the app (TimerCard, TablesSection, the bust-out dialog) treats
      // an absent flag as active. Using `=== true` only here meant a player
      // whose isActive was undefined — from a Firestore round-trip or an older
      // saved tournament — would not be counted, so this branch never fired,
      // the winner was never given position 1, and the tournament could not be
      // closed out.
      const remainingActivePlayers = updatedPlayers.filter(p => p.isActive !== false);
      if (remainingActivePlayers.length === 1) {
        const winner = remainingActivePlayers[0];

        // 1st-place money, the same way as everybody else's: the payout plus
        // bountyTakeFor's bounty money. For a progressive game that is the
        // knockout winnings PLUS their own head — the winnings used to be left
        // out, so the league's Cash for a PKO winner was short by everything they
        // had taken (October audit, M6).
        const firstPlacePrize = payoutAt(1)
          + bountyTakeFor({ ...winner, position: 1 }, prev.prizeStructure).money;

        const finalState = {
          ...prev,
          players: updatedPlayers.map(player =>
            player.id === winner.id
              ? {
                  ...player,
                  position: 1, // First place
                  prizeMoney: firstPlacePrize,
                  isActive: false // Mark as inactive so tournament shows as complete
                }
              : player
          )
        };

        // Broadcast tournament completion immediately
        setTimeout(() => {
          broadcastTournamentAction('tournament_complete', finalState);
        }, 0);

        return finalState;
      }

      const newState = {
        ...prev,
        players: updatedPlayers
      };

      // Broadcast player elimination immediately for real-time sync
      setTimeout(() => {
        broadcastTournamentAction('player_eliminated', newState);
      }, 50); // Reduced delay for faster sync

      // Also dispatch local events for immediate UI updates
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('playerEliminated', { 
          detail: { 
            playerId, 
            eliminatedById,
            players: updatedPlayers, 
            action: 'player_eliminated',
            position: newPosition
          } 
        }));
      }, 25);

      return newState;
    });
  }, [broadcastTournamentAction]);

  /**
   * One step of undo for a rebuy or re-entry.
   *
   * Holds the players array as it was BEFORE the action, plus the array the
   * action produced. Restoring the whole array rather than reversing each field
   * is deliberate: a return to the table changes isActive, position, prizeMoney,
   * the rebuy/re-entry count, seating, table assignment and bounty on that
   * player — and position on everyone who busted after them, via
   * positionsAfterReEntry. Reversing that by hand is a bug farm.
   *
   * `resulting` is what makes a stale undo safe: any later action replaces the
   * array, so reference equality tells us whether anything has happened since.
   */
  const playerReturnUndoRef = useRef<{
    label: string;
    previous: Player[];
    resulting: Player[];
    /**
     * What the return did to the TABLES, put back with the players (October
     * audit, Low). A return can unwind a consolidation — the flag, the
     * snapshot and the table count — and undoing only the roster left the
     * players back on one table under a two-table configuration with no way to
     * undo the collapse again.
     */
    tables: { isFinalTable: boolean | undefined; preConsolidation: any; settingsTables: any };
  } | null>(null);

  // Mirrors the latest players array. undoPlayerReturn is handed to a toast
  // action button, which captures it from the render in which the rebuy was
  // confirmed — a render whose `state` still holds the PRE-rebuy array. Reading
  // that closure would make every undo look stale and refuse. A ref is always
  // current, and keeps the callback stable.
  const latestPlayersRef = useRef<Player[]>(state.players);
  latestPlayersRef.current = state.players;

  // Process a re-entry for an eliminated player
  const processReEntry = useCallback((playerId: string) => {
    setState(prev => {
      const player = prev.players.find(p => p.id === playerId);
      if (!player || player.isActive !== false) {
        return prev;
      }
      // A finished game takes no re-entry. Re-entering the runner-up runs
      // positionsAfterReEntry, which moves the winner from 1st to 2nd and leaves
      // nobody holding the title. Undo bust-out is the way back from a wrong
      // ending, and is deliberately NOT gated.
      if (gameIsOver(prev.players)) return prev;

      // maxReEntries and reEntryPeriodLevels were enforced NOWHERE before — only
      // the table view's button hid, so any other route in reached no limit.
      if (!canReEnter(prev.prizeStructure, player, blindLevelIndex(prev.levels, prev.currentLevel))) {
        return prev;
      }

      // Renumber first: a re-entry vacates this player's finishing position, so
      // everyone who busted after them moves one place worse. Without this the
      // next elimination is handed a position another player already holds.
      const renumbered = positionsAfterReEntry(prev.players, playerId);

      // Update player to active status and increment re-entry count
      const updatedPlayers = renumbered.map(p =>
        p.id === playerId
          ? {
              ...p,
              isActive: true, // Reactivate the player
              position: undefined, // Clear elimination position
              eliminatedBy: undefined, // Clear elimination data
              prizeMoney: 0, // Reset prize money
              reEntries: (p.reEntries || 0) + 1, // Increment re-entry count
              // Unseated ON PURPOSE, unlike a rebuy. A re-entry is a fresh entry
              // into the tournament rather than more chips in the same chair,
              // which is the same distinction that has a re-entry raked by
              // default and a rebuy not. The director seats them anew.
              seated: false,
              tableAssignment: undefined,
              currentBounty: prev.prizeStructure?.enableBounties
                ? ((prev.prizeStructure?.reEntryBounty !== false) ? (prev.prizeStructure?.bountyAmount || 0) : 0)
                : undefined
            }
          : p
      );

      const repricedEntry = repriceMovedFinishers(prev.players, updatedPlayers, prev.prizeStructure);

      // Same rule as the rebuy, and it needs no seat logic: a re-entry stays
      // unseated by design, so only the UNWIND branch can change anything here.
      // Nine players on an eight-seat final table is wrong however they got
      // there, and the flag drives the seating screen and the next bust-out's
      // prompt.
      const ft = consolidationAfterReturn(repricedEntry, {
        isFinalTable: prev.isFinalTable,
        preConsolidation: prev.preConsolidation,
        seatsPerTable: tablesOf(prev.settings).seatsPerTable,
        numberOfTables: tablesOf(prev.settings).numberOfTables,
        returningId: playerId,
      });

      const newState = {
        ...prev,
        players: ft.players,
        isFinalTable: ft.isFinalTable,
        preConsolidation: ft.preConsolidation,
        settings: settingsAfterRestore(prev.settings, ft.restoreTables),
      };

      playerReturnUndoRef.current = {
        label: `${player.name} — re-entry #${(player.reEntries || 0) + 1}`,
        previous: prev.players,
        resulting: ft.players,
        tables: { isFinalTable: prev.isFinalTable, preConsolidation: prev.preConsolidation, settingsTables: prev.settings.tables },
      };

      // Broadcast re-entry
      broadcastTournamentAction('player_reentry', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Process a rebuy for an eliminated player
  const processRebuy = useCallback((playerId: string) => {
    setState(prev => {
      const player = prev.players.find(p => p.id === playerId);
      if (!player || player.isActive !== false) {
        return prev;
      }
      // The offer and the failsafe already ask `gameIsOver` (lib/rebuyOffer.ts);
      // the action now does too, so no future caller can walk round them.
      if (gameIsOver(prev.players)) return prev;

      // The cap and the rebuy window, both from lib/entryLimits.ts. This used to
      // read `maxRebuys || 3`, so a cap of 0 — which is how the Buy-in tab
      // stores "unlimited" — allowed exactly three.
      if (!canRebuy(prev.prizeStructure, player, blindLevelIndex(prev.levels, prev.currentLevel))) {
        return prev;
      }

      // Same renumbering as a re-entry — a rebuy by an eliminated player
      // vacates their finishing position.
      const renumbered = positionsAfterReEntry(prev.players, playerId);

      // A rebuy is chips bought in the chair they never left, so they go back to
      // it — unless someone has taken it while they were out, in which case they
      // wait to be seated rather than double-booking a seat. lib/seating.ts
      // answers that, for this and for undo alike.
      const reclaimed = seatToReclaim(player, prev.players, prev.settings.tables);

      // Update player to active status and increment rebuy count
      const updatedPlayers = renumbered.map(p =>
        p.id === playerId
          ? {
              ...p,
              isActive: true,
              position: undefined,
              eliminatedBy: undefined,
              prizeMoney: 0,
              rebuys: (p.rebuys || 0) + 1,
              seated: !!reclaimed,
              tableAssignment: reclaimed ?? undefined,
              seatInfo: undefined,
              currentBounty: prev.prizeStructure?.enableBounties
                ? (prev.prizeStructure?.rebuyBounty ? (prev.prizeStructure?.bountyAmount || 0) : 0)
                : undefined
            }
          : p
      );

      // A player coming back has to meet the final table, and this door never
      // knew it existed. Nine players, one busted, collapse to the final table,
      // press Rebuy — and he was seated alone on table 2, because `seatToReclaim`
      // reads his pre-collapse chair as "free" precisely BECAUSE the collapse
      // emptied that table. See lib/finalTable.ts; one rule, three doors.
      //
      // seatToReclaim ran above and this goes over the top, which is the order
      // `undoBustOut` already used and the reason the unwind composes.
      const ft = consolidationAfterReturn(repriceMovedFinishers(prev.players, updatedPlayers, prev.prizeStructure), {
        isFinalTable: prev.isFinalTable,
        preConsolidation: prev.preConsolidation,
        seatsPerTable: tablesOf(prev.settings).seatsPerTable,
        numberOfTables: tablesOf(prev.settings).numberOfTables,
        returningId: playerId,
        reclaimSeat: player.seatInfo,
      });
      const seatedPlayers = ft.seatForReturner
        ? ft.players.map(p => p.id === playerId
            ? { ...p, seated: true, tableAssignment: ft.seatForReturner ?? undefined }
            : p)
        : ft.players;

      playerReturnUndoRef.current = {
        label: `${player.name} — rebuy #${(player.rebuys || 0) + 1}`,
        previous: prev.players,
        resulting: seatedPlayers,
        tables: { isFinalTable: prev.isFinalTable, preConsolidation: prev.preConsolidation, settingsTables: prev.settings.tables },
      };

      const newState = {
        ...prev,
        players: seatedPlayers,
        isFinalTable: ft.isFinalTable,
        preConsolidation: ft.preConsolidation,
        settings: settingsAfterRestore(prev.settings, ft.restoreTables),
      };
      broadcastTournamentAction('player_rebuy', newState);
      return newState;
    });
  }, [broadcastTournamentAction]);

  /**
   * Reverse the last rebuy or re-entry.
   *
   * Returns the label of what was undone, or null if there is nothing to undo or
   * the roster has moved on since. Refusing in that case is the point: the undo
   * restores a whole players array, so applying it after a later elimination
   * would silently discard that elimination too.
   *
   * The league standings need no separate repair. The sync in PokerTimer already
   * re-records a player who is eliminated again and corrects anyone whose
   * position no longer matches what was written, and restoring the array is
   * exactly that situation.
   */
  const undoPlayerReturn = useCallback((): string | null => {
    const snapshot = playerReturnUndoRef.current;
    if (!snapshot) return null;

    // Decide here, not inside the updater: a setState updater may not run before
    // this function returns, so a flag set inside it cannot be read out.
    if (!rostersMatchForUndo(latestPlayersRef.current, snapshot.resulting)) return null;

    playerReturnUndoRef.current = null;
    setState(prev => {
      // Belt and braces: the state may have advanced between the check above and
      // the updater running.
      if (!rostersMatchForUndo(prev.players, snapshot.resulting)) return prev;

      const newState = {
        ...prev,
        players: snapshot.previous,
        isFinalTable: snapshot.tables.isFinalTable,
        preConsolidation: snapshot.tables.preConsolidation,
        settings: snapshot.tables.settingsTables === undefined
          ? prev.settings
          : { ...prev.settings, tables: snapshot.tables.settingsTables },
      };
      broadcastTournamentAction('undo_player_return', newState);
      return newState;
    });

    return snapshot.label;
  }, [broadcastTournamentAction]);

  // Process addon
  const processAddon = useCallback((playerId: string) => {
    setState(prev => {
      // The rule is at the action, not only the screen (October audit, Low):
      // the add-on window, a player still in, one add-on each — the three the
      // Add-on section shows — and no entries once the game is over.
      if (!addOnsOpen(prev.prizeStructure, blindLevelIndex(prev.levels, prev.currentLevel))) return prev;
      if (gameIsOver(prev.players)) return prev;
      const target = prev.players.find(p => p.id === playerId);
      if (!target || target.isActive === false || (target.addons || 0) > 0) return prev;

      const updatedPlayers = prev.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              addons: (p.addons || 0) + 1,
            }
          : p
      );

      const newState = { ...prev, players: updatedPlayers };
      broadcastTournamentAction('player_addon', newState);
      return newState;
    });
  }, [broadcastTournamentAction]);

  // Reset entire tournament to initial state
  /**
   * Start a fresh game. `settings` is what the NEXT game should be — a league and
   * season, or standalone — applied on top of what is kept.
   *
   * **The new game's setup is written to storage HERE, synchronously, as well as
   * into state** (October audit, H3). From the director route, starting a new
   * game navigates to `/?home=1`, which is a different route: the console is
   * replaced in the same batch, so neither this `setState` nor anything a caller
   * did afterwards ever committed, and the new console rebuilt itself from
   * storage. Next Game's chosen season, the slider's "standalone" and Full
   * reset's defaults were all silently lost — and a game was filed into the
   * season the director had just ended.
   *
   * Do NOT fix that by committing first and navigating after. On the director
   * route the URL still names the old game, so the old console's players sync
   * would write `players: []` over the live game the moment the reset committed.
   * The same-batch navigation is what spares it; the storage write is what lets
   * the next console start from the right setup anyway.
   */
  const resetTournament = useCallback((options?: { keepStructure?: boolean; settings?: Partial<Settings> }) => {
    const keepStructure = options?.keepStructure ?? true;

    // Clear any running timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const levels = keepStructure ? state.levels : DEFAULT_LEVELS;
    const prizeStructure = keepStructure ? (state.prizeStructure || loadSavedPrizeStructure(storageUidRef.current)) : { buyIn: 0 };
    const settings: Settings = {
      ...(keepStructure ? state.settings : DEFAULT_SETTINGS),
      ...(options?.settings ?? {}),
    };
    // League-ness lives in settings.isSeasonTournament; a caller that says what
    // the next game is wins over what this one was.
    const isLeagueReset = options?.settings?.isSeasonTournament !== undefined
      ? options.settings.isSeasonTournament === true
      : keepStructure && state.details?.type === 'season';
    const preservedType = isLeagueReset ? 'season' : 'standalone';
    // Every new tournament gets a fresh id, standalone included. This used to be
    // league-only, which left standalone games with localGameId undefined — so
    // consecutive standalone games were indistinguishable. That broke history
    // (every game after the first produced the same empty key and was skipped as
    // a duplicate) and meant repeat "Go Live" reused one Firestore document.
    const newLocalGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    writeScoped('tournamentLocalGameId', newLocalGameId, storageUidRef.current);
    // The previous game is over. The mirror is keyed by localGameId so it would
    // not match anyway, but leaving a dead roster in storage is how one came
    // back to life once already.
    clearLocalProgress(storageUidRef.current);
    // The next console may be a NEW mount reading only storage — see above.
    saveSettings(settings, storageUidRef.current);
    saveBlindLevels(levels, storageUidRef.current);
    savePrizeStructure(prizeStructure, storageUidRef.current);

    setState({
      levels,
      players: [],
      currentLevel: 0,
      secondsLeft: levels[0]?.duration ?? 0,
      isRunning: false,
      settings,
        prizeStructure,
      isFinalTable: false,
      details: { type: preservedType, localGameId: newLocalGameId },
    });
  }, [state.settings, state.prizeStructure, state.details, state.levels]);

  /**
   * Put a mirrored roster back into a live game, at the director's request.
   *
   * Only ever called from the recovery banner, and only for the narrow case
   * `recoverableProgress` allows. The ordinary sync effects then push it to
   * Firestore like any other change — there is no separate write path, because
   * two ways to save a game is the trap the removed handover code set.
   *
   * The clock comes back paused, for the same reason a local game's does: the
   * page was away for an unknown time, so resuming a running timer would
   * silently be wrong.
   */
  const restoreLocalProgress = useCallback((progress: {
    players: Player[];
    currentLevel: number;
    secondsLeft: number;
    isFinalTable?: boolean;
  }) => {
    setState(prev => ({
      ...prev,
      players: progress.players,
      currentLevel: progress.currentLevel,
      secondsLeft: progress.secondsLeft,
      isRunning: false,
      targetEndTime: undefined,
      isFinalTable: progress.isFinalTable ?? prev.isFinalTable,
    }));
  }, []);

  // Update players with comprehensive validation and immediate broadcasting
  const updatePlayers = (newPlayers: Player[]) => {
    setState(prev => {
      // Check if this is a seating action by comparing table assignments
      const previousSeatedPlayers = prev.players.filter(p => p.seated);
      const newSeatedPlayers = newPlayers.filter(p => p.seated);
      const isSeatingAction = previousSeatedPlayers.length !== newSeatedPlayers.length || 
                             JSON.stringify(previousSeatedPlayers.map(p => ({ id: p.id, tableAssignment: p.tableAssignment })).sort()) !== 
                             JSON.stringify(newSeatedPlayers.map(p => ({ id: p.id, tableAssignment: p.tableAssignment })).sort());

      const newState = {
        ...prev,
        players: newPlayers
      };

      // Broadcast the action immediately for all database tournaments
      if (prev.details?.type === 'database' && prev.details?.id) {
        // No seating write here either: it was the first of the three, and it
        // ran side effects from inside a setState updater, which React is free
        // to call more than once.
        //
        // Always broadcast via tournament action for real-time sync
        setTimeout(() => {
          broadcastTournamentAction(isSeatingAction ? 'seating_updated' : 'players_updated', newState);
        }, 100);
      } else {
        // For standalone tournaments, still broadcast for consistency
        setTimeout(() => {
          broadcastTournamentAction(isSeatingAction ? 'seating_updated' : 'players_updated', newState);
        }, 50);
      }

      // Always dispatch local events for immediate UI updates
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('playersUpdated', { 
          detail: { players: newPlayers, action: isSeatingAction ? 'seating' : 'update' } 
        }));
      }, 25);

      return newState;
    });
  };

  // Add blind level with auto-save
  const addBlindLevel = useCallback(() => {
    setState(prev => {
      const lastLevel = prev.levels[prev.levels.length - 1];
      // For consistency with the existing structure pattern
      let newSmall, newBig;

      // If the last level was 8000/16000
      if (lastLevel.small === 8000 && lastLevel.big === 16000) {
        newSmall = 10000;
        newBig = 20000;
      } else if (lastLevel.small === 10000 && lastLevel.big === 20000) {
        newSmall = 20000;
        newBig = 40000;
      } else {
        // Double the blinds (typical pattern)
        newSmall = lastLevel.small * 2;
        newBig = lastLevel.big * 2;
      }

      const newLevel = {
        small: newSmall,
        big: newBig,
        duration: lastLevel.duration // Keep the same duration
      };

      const newLevels = [...prev.levels, newLevel];
      // Auto-save blind levels
      saveBlindLevels(newLevels, storageUidRef.current);

      return {
        ...prev,
        levels: newLevels
      };
    });
  }, []);

  // Add a break after a specific level index (or current level if not specified)
  const addBreak = useCallback((breakDuration: number = 10, afterLevelIndex?: number) => {
    setState(prev => {
      // Use the specified level index or default to current level
      // (or last level if not started/already finished)
      const levelIndex = afterLevelIndex !== undefined
        ? afterLevelIndex
        : (prev.currentLevel < prev.levels.length
           ? prev.currentLevel
           : prev.levels.length - 1);

      // Get a copy of the levels array
      const newLevels = [...prev.levels];

      // Create a break level, using the level's blinds for display consistency
      const breakLevel: BlindLevel = {
        small: prev.levels[levelIndex].small,
        big: prev.levels[levelIndex].big,
        duration: breakDuration * 60, // Convert minutes to seconds
        isBreak: true
      };

      // Insert the break after the specified level
      newLevels.splice(levelIndex + 1, 0, breakLevel);

      // A break inserted BEFORE the level being played moves that level one
      // index along, and `currentLevel` has to move with it — or the clock
      // stays on the old index, which is now the level before, and the blinds
      // in play drop a level on every screen (October audit, Low).
      const insertedAt = levelIndex + 1;
      return {
        ...prev,
        levels: newLevels,
        currentLevel: insertedAt <= prev.currentLevel ? prev.currentLevel + 1 : prev.currentLevel,
      };
    });
  }, []);

  // Set all blind levels at once
  const setBlindLevels = useCallback((newLevels: BlindLevel[]) => {
    setState(prev => {
      saveBlindLevels(newLevels, storageUidRef.current);
      return {
        ...prev,
        levels: newLevels
      };
    });
  }, []);

  // Update blind level with auto-save
  const updateBlindLevel = useCallback((index: number, updates: Partial<BlindLevel>) => {
    setState(prev => {
      const newLevels = prev.levels.map((level, i) =>
        i === index ? { ...level, ...updates } : level
      );
      saveBlindLevels(newLevels, storageUidRef.current);
      const isCurrentLevelDuration =
        index === prev.currentLevel && typeof updates.duration === 'number';
      const secondsLeft = isCurrentLevelDuration ? updates.duration! : prev.secondsLeft;
      const targetEndTime = isCurrentLevelDuration && prev.isRunning
        ? Date.now() + updates.duration! * 1000
        : prev.targetEndTime;
      return {
        ...prev,
        levels: newLevels,
        secondsLeft,
        targetEndTime,
      };
    });
  }, []);

  /**
   * Settings are persisted when they CHANGE, wherever the change came from.
   *
   * `updateSettings` used to be the only thing that saved them, from inside its
   * own `setState` updater. That made every other writer of `state.settings` a
   * silent memory-only change — and `breakTable` and `goToFinalTable` are both
   * such writers now, lowering the table count. A reload restored the old count
   * while the players stayed where the consolidation had put them, which is the
   * orphaned-on-a-table-that-no-longer-exists state by a new route.
   *
   * Guarded on the serialised value, the shape the Firestore sync effects use:
   * the snapshot handler spreads `...data` over state on every snapshot, so the
   * settings object is a fresh reference each time even when nothing in it moved,
   * and an unguarded write here would run per snapshot.
   */
  const lastSavedSettingsRef = useRef<string | null>(null);
  useEffect(() => {
    const serialised = JSON.stringify(state.settings);
    if (serialised === lastSavedSettingsRef.current) return;
    lastSavedSettingsRef.current = serialised;
    saveSettings(state.settings, storageUidRef.current);
  }, [state.settings]);

  // Update settings with comprehensive validation and persistence
  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setState(prev => {
      const newSettings = { ...prev.settings, ...updates };
      // The localStorage write used to be here, INSIDE the updater — which React
      // is free to run more than once — and it was the only thing that persisted
      // settings at all. So a change made anywhere else was kept in memory only:
      // `breakTable` and `goToFinalTable` lower `tables.numberOfTables`, and a
      // reload put it straight back while the players stayed on the tables the
      // break had left them at. One writer, in an effect, below.

      const newState = {
        ...prev,
        settings: newSettings
      };

      // Dispatch event for real-time sync
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('settingsUpdated', {
          detail: { settings: newSettings }
        }));
        broadcastTournamentAction('settings_updated', newState);
        // The settings sync effect writes `settings` and `prizeStructure`.
      }, 50);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Set tournament details
  const updateTournamentDetails = useCallback((details: Partial<TournamentDetails>) => {
    setState(prev => {
      const merged = { type: 'standalone' as const, ...prev.details || {}, ...details };
      // Back-fill the local id for ANY game that is not already a document.
      // This tested 'season' only, which is the other half of the same gap: a
      // standalone game reaching Go Live without one was created with an
      // auto-generated document id, and createDocViaRest's 409-adopt arm needs
      // a docId to fire. lib/localGameId.ts owns which games need one.
      if (needsLocalGameId(merged)) {
        merged.localGameId = getOrCreateLocalGameId();
      }
      const newState = { ...prev, details: merged as TournamentDetails };

      // Broadcast details update to all connected clients (including league/standalone mode changes)
      setTimeout(() => {
        broadcastTournamentAction('tournament_details_updated', newState);
        // League-ness travels in `settings` — the settings sync effect writes
        // leagueId, seasonId and isSeasonTournament as top-level fields too,
        // which is what a mode change actually has to propagate.
      }, 100);

      // Dispatch local event for immediate UI updates
      window.dispatchEvent(new CustomEvent('tournamentDetailsUpdated', { 
        detail: { details: newState.details } 
      }));

      return newState;
    });
  }, [broadcastTournamentAction]);

  const updateNotes = useCallback((notes: string) => {
    setState(prev => {
      const newState = { ...prev, notes };
      
      setTimeout(() => {
        broadcastTournamentAction('notes_updated', newState);
        // `notes` is in the clock sync effect's payload and its deps.
      }, 100);
      
      return newState;
    });
  }, [broadcastTournamentAction, user?.id]);

  // Enhanced prize structure management with validation
  const updatePrizeStructure = useCallback((prizeStructure: Partial<PrizeStructure>) => {
    setState(prev => {
      const newPrizeStructure = {
        ...prev.prizeStructure || loadSavedPrizeStructure(storageUidRef.current),
        ...prizeStructure
      };

      // Validate prize structure before saving
      if (newPrizeStructure.buyIn && newPrizeStructure.buyIn > 0) {
        savePrizeStructure(newPrizeStructure, storageUidRef.current);
      }

      const newState = {
        ...prev,
        prizeStructure: newPrizeStructure
      };

      // No broadcast: the settings sync effect writes `prizeStructure`.

      return newState;
    });
  }, []);

  // Check if we should prompt for final table
  const shouldPromptForFinalTable = useCallback(() => finalTableIsDue(
    state.players,
    tablesOf(state.settings).seatsPerTable,
    state.isFinalTable,
  ), [state.players, state.settings.tables, state.isFinalTable]);

  /**
   * Should the director be asked to BREAK a table — and down to how many?
   *
   * The sibling of `shouldPromptForFinalTable`, kept separate for the reason
   * `lib/tableBreak.ts` gives: the final table carries the stored `isFinalTable`
   * flag and a `<=` that a real bug turned on, and one predicate answering both
   * at overlapping sizes is how a single bust-out gets two dialogs.
   */
  const tableBreakDue = useCallback(() => consolidationDue(
    state.players,
    {
      numberOfTables: tablesOf(state.settings).numberOfTables,
      seatsPerTable: tablesOf(state.settings).seatsPerTable,
    },
  ), [state.players, state.settings.tables]);

  /**
   * Collapse to the final table.
   *
   * A final table draw is supposed to be RANDOM, which is what separates this
   * from `breakTable` below: that one moves only the broken table's players and
   * leaves everyone else in their chair, because an intermediate break has no
   * reason to move anybody who does not have to move.
   *
   * It now lowers `settings.tables.numberOfTables` to 1 as well. It never did,
   * so a final table rendered with every other table still under it as an empty
   * felt with a full row of seats.
   */
  const goToFinalTable = useCallback(() => {
    setState(prev => {
      const activePlayers = prev.players.filter(p => p.isActive !== false);
      const seatsPerTable = tablesOf(prev.settings).seatsPerTable;

      const arr = [...activePlayers];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      const shuffledPlayers = arr;

      const updatedPlayers = prev.players.map(player => {
        const playerIndex = shuffledPlayers.findIndex(p => p.id === player.id);
        if (playerIndex === -1) return player;
        // Never a chair that does not exist. `seatsPerTable` was computed here
        // and thrown away, so collapsing more players than the table seats minted
        // seat 8 and seat 9 of an eight-seat table — the ghost, in the one place
        // it had not been closed. The prompt cannot reach it (it only asks at or
        // below one table's worth) but the Seating tab's button can.
        if (playerIndex >= seatsPerTable) {
          return { ...player, seated: false, tableAssignment: undefined };
        }
        return {
          ...player,
          seated: true,
          tableAssignment: { tableIndex: 0, seatIndex: playerIndex },
        };
      });

      return {
        ...prev,
        players: updatedPlayers,
        isFinalTable: true,
        // Taken BEFORE the redraw above overwrote it. A final table draw is
        // supposed to be random, which is exactly why the arrangement it
        // replaces has to be kept: without this, undoing the bust-out that
        // caused the collapse left everyone on their new random seat.
        preConsolidation: {
          seats: snapshotSeating(prev.players),
          tables: tablesOf(prev.settings).numberOfTables,
          names: prev.settings.tables?.tableNames,
          backgrounds: prev.settings.tableBackgrounds,
        },
        settings: {
          ...prev.settings,
          tables: {
            ...(prev.settings.tables || { seatsPerTable }),
            numberOfTables: 1,
            seatsPerTable,
            tableNames: reindexToOne(prev.settings.tables?.tableNames),
          },
          tableBackgrounds: reindexToOne(prev.settings.tableBackgrounds),
        },
      };
    });
  }, []);

  /**
   * Break ONE table: move its players onto the others and drop the count.
   *
   * The intermediate step the app never offered. Three tables of eight with
   * sixteen left is plainly a two-table tournament, and nothing said so — the
   * only question ever asked was about the FINAL table, at eight.
   *
   * `lib/tableBreak.ts` owns which table goes and where its players sit; this
   * only applies the answer and keeps what it replaced, so it can be undone.
   */
  const breakTable = useCallback((brokenIndex?: number) => {
    setState(prev => {
      const seatsPerTable = tablesOf(prev.settings).seatsPerTable;
      const numberOfTables = tablesOf(prev.settings).numberOfTables;
      if (numberOfTables < 2) return prev;

      const broken = brokenIndex ?? tableToBreak(prev.players, numberOfTables);
      if (broken === null || broken === undefined) return prev;

      const result = doBreakTable(prev.players, { numberOfTables, seatsPerTable, broken });

      return {
        ...prev,
        players: result.players,
        // Snapshotted BEFORE the move, for the same reason the collapse does it.
        preConsolidation: {
          seats: snapshotSeating(prev.players),
          tables: numberOfTables,
          names: prev.settings.tables?.tableNames,
          backgrounds: prev.settings.tableBackgrounds,
        },
        settings: {
          ...prev.settings,
          tables: {
            ...(prev.settings.tables || { seatsPerTable }),
            numberOfTables: result.tables,
            seatsPerTable,
            // Names and felts move WITH their tables rather than being trimmed
            // off the end — `tableNamesFor` trims the last one, which is wrong
            // when the table that went was in the middle.
            tableNames: reindexAfterBreak(prev.settings.tables?.tableNames, result.broken),
          },
          tableBackgrounds: reindexAfterBreak(prev.settings.tableBackgrounds, result.broken),
        },
      };
    });
  }, []);

  // `undoFinalTable` was here: exported, called by nothing. Undoing a
  // collapse happens through `consolidationAfterReturn` at all three doors
  // a player comes back by (rebuy, re-entry, undo bust-out), which restores
  // the seats, the flag and the table count from `preConsolidation` — the same
  // snapshot this read (October audit, Delete).

  // Enhanced prize pool calculation with comprehensive analytics
  // NOTE: a second `calculatePrizePool` used to live here. It was exported but
  // never called, and its rake maths diverged from lib/prizePool.ts — it raked a
  // percentage of the whole gross pool (so rebuy and addon money too) and, in
  // fixed mode, charged the fee once instead of per player. A GBP 5 fixed rake
  // across 10 players came to 5 rather than 50. Removed rather than fixed, since
  // lib/prizePool.ts is the canonical implementation and is now covered by tests.

  // Format time
  // One spelling of the digits, shared with the participant view — see
  // formatClock in lib/tournamentClock.ts.
  const formatTime = useCallback(() => formatClock(state.secondsLeft || 0), [state.secondsLeft]);

  // Calculate level progress percentage
  const calculateProgress = useCallback(() => {
    if (state.currentLevel >= state.levels.length) return 100;

    const totalSeconds = state.levels[state.currentLevel].duration;
    if (!totalSeconds) return 0;
    return 100 - (state.secondsLeft / totalSeconds) * 100;
  }, [state.currentLevel, state.levels, state.secondsLeft]);

  // Get current blinds with tournament status validation
  const getCurrentBlinds = useCallback(() => {
    // The same answer as the clock and TimerCard's own face (October audit, M16).
    if (gameIsOver(state.players)) {
      return "Finished";
    }

    if (state.currentLevel >= state.levels.length) {
      return "Tournament Complete";
    }

    const currentLevel = state.levels[state.currentLevel];

    if (currentLevel.isBreak) {
      return "Break Time";
    }

    const { small, big } = currentLevel;
    return `${small} / ${big}`;
  }, [state.currentLevel, state.levels, state.players]);

  // `getNextLevelInfo` and `getCurrentLevelText` were here: returned by this
  // hook and drawn by nothing — TimerCard renders its own level text — and
  // both put an emoji in a string (October audit, Low/Delete).

  // Get remaining time text
  const getRemainingTimeText = useCallback(() => {
    if (state.currentLevel >= state.levels.length) {
      return "0 min left";
    }

    const minutesLeft = Math.ceil(state.secondsLeft / 60);
    return `${minutesLeft} min left`;
  }, [state.currentLevel, state.levels.length, state.secondsLeft]);

  // Check if current level is a break
  const isBreak = useCallback(() => {
    if (state.currentLevel >= state.levels.length) return false;
    return !!state.levels[state.currentLevel].isBreak;
  }, [state.currentLevel, state.levels]);

  // Remove a level
  const removeLevel = useCallback((index: number) => {
    // Don't allow removing if there would be less than 2 levels left
    setState(prev => {
      if (prev.levels.length <= 2) return prev;

      // Create a copy of the levels array without the level at the specified index
      const newLevels = prev.levels.filter((_, i) => i !== index);

      // Adjust the current level index if necessary
      let newCurrentLevel = prev.currentLevel;

      // If we removed a level at or before the current level, adjust current level
      if (index <= prev.currentLevel) {
        // If we removed the current level, move to the previous level
        if (index === prev.currentLevel) {
          newCurrentLevel = Math.max(0, prev.currentLevel - 1);
        }
        // If we removed a level before the current level, just decrement
        else if (index < prev.currentLevel) {
          newCurrentLevel = prev.currentLevel - 1;
        }
      }

      // Only removing the level BEING PLAYED changes what is on the clock.
      // Removing an earlier one renumbers the current level without changing
      // it, and keying the reset on the index moving reset a paused clock to
      // the full duration whenever an earlier level was deleted (October audit,
      // Low).
      if (index !== prev.currentLevel) {
        return { ...prev, levels: newLevels, currentLevel: newCurrentLevel };
      }
      const secondsLeft = newCurrentLevel < newLevels.length
        ? newLevels[newCurrentLevel].duration
        : 0;
      const isRunning = newCurrentLevel >= newLevels.length ? false : prev.isRunning;

      return {
        ...prev,
        levels: newLevels,
        currentLevel: newCurrentLevel,
        secondsLeft,
        isRunning,
        // A running clock is an end time — see lib/tournamentClock.ts.
        targetEndTime: isRunning ? Date.now() + secondsLeft * 1000 : prev.targetEndTime,
      };
    });
  }, []);

  // NOTE: `completeTournament` was removed here.
  //
  // It was exported from this hook and called by nothing, and its prize maths
  // disagreed with the rest of the app: it paid the winner out of
  // `grossPrizePool - rakeAmount`, where every other site keeps the rake ON TOP
  // of the buy-in and pays out of the gross. A live game never hit it, so it was
  // a landmine rather than a loss — but the two answers could not both be right,
  // and reviving it would have paid a short winner.
  //
  // If an explicit "finish the game" action is ever wanted, build it on
  // lib/prizePool.ts like everything else, rather than restoring this.

  // Undo last elimination (or specific player if ID provided)
  const undoBustOut = useCallback((playerId?: string) => {
    setState(prev => {
      const eliminatedPlayers = prev.players.filter(p => p.isActive === false && p.position);
      if (eliminatedPlayers.length === 0) return prev;

      let playerToRestore;

      if (playerId) {
        // Find specific player to restore
        playerToRestore = eliminatedPlayers.find(p => p.id === playerId);
        if (!playerToRestore) return prev; // Player not found or not eliminated
      } else {
        // The most recently busted — the SMALLEST position among the bust-outs.
        // This used to take the highest, which is the first player out, the
        // inverted "most recent" lib/eliminationOrder.ts exists to own.
        playerToRestore = mostRecentlyBusted(prev.players);
        if (!playerToRestore) return prev;
      }

      // Their seat, if it is still free — the same question the rebuy asks.
      const reclaimedSeat = seatToReclaim(playerToRestore, prev.players, prev.settings.tables);

      // Renumber exactly as a re-entry does (October audit, H7): everybody who
      // went out AFTER the restored player finished one place worse than they
      // were given. Without it an undo that was not the last bust-out left the
      // next one a place somebody already held — and in a finished game, undoing
      // the top row of the Undo dialog (the FIRST player out) left the champion
      // at 1st with one player in, so busting that player again awarded a second
      // 1st and recorded two winners to the league.
      const renumberedForUndo = positionsAfterReEntry(prev.players, playerToRestore.id);

      // Restore the player to active status and remove their elimination data
      // Also decrement knockout count from the eliminating player
      const restoredPlayers = renumberedForUndo.map(player => {
        if (player.id === playerToRestore.id) {
          return {
            ...player,
            isActive: true,
            position: undefined,
            eliminatedBy: undefined,
            prizeMoney: 0,
            seated: !!reclaimedSeat,
            tableAssignment: reclaimedSeat ?? undefined,
            seatInfo: undefined
          };
        } else if (player.id === playerToRestore.eliminatedBy && player.knockouts > 0) {
          // Everything the knockout gave the hunter comes back off them —
          // the count, a bountyless knockout, and in a progressive game the half
          // bounty that went into their winnings and onto their head, which an
          // undo used to leave behind (October audit, M6).
          const ps = prev.prizeStructure;
          const progressive = !!ps?.enableBounties && ps?.bountyType === 'progressive';
          const won = progressive ? (playerToRestore.currentBounty ?? ps?.bountyAmount ?? 0) / 2 : 0;
          return {
            ...player,
            knockouts: player.knockouts - 1,
            ...(playerToRestore.currentBounty === 0 && (player.bountylessKnockouts || 0) > 0
              ? { bountylessKnockouts: (player.bountylessKnockouts || 0) - 1 }
              : {}),
            ...(won > 0 ? {
              bountyWinnings: Math.max(0, (player.bountyWinnings || 0) - won),
              currentBounty: Math.max(0, (player.currentBounty ?? 0) - won),
            } : {}),
          };
        }
        return player;
      });

      // Whoever held 1st did not win after all: undoing ANY bust-out puts a
      // second player back in, so the game is not over and the 1st-place holder
      // is back in play. Keyed on who held 1st BEFORE the renumbering, which may
      // have moved them to 2nd — the old check looked for position 1 afterwards
      // and only fired when two or more were already active, so undoing the
      // first player out of a finished game stranded the champion.
      const heldFirst = prev.players.find(p => p.position === 1 && p.isActive === false)?.id;
      const finalPlayers = repriceMovedFinishers(
        prev.players,
        heldFirst && heldFirst !== playerToRestore.id
          ? restoredPlayers.map(p =>
              p.id === heldFirst
                ? { ...p, isActive: true, position: undefined, prizeMoney: 0, eliminatedBy: undefined }
                : p)
          : restoredPlayers,
        prev.prizeStructure,
      );

      // Undoing the bust-out that CAUSED the collapse has to undo the collapse
      // too. Restoring the player puts more of them in the game than one table
      // seats, so the tournament is plainly not at its final table any more —
      // and their own chair, which seatToReclaim just returned, is on a table
      // everyone else was moved off.
      // Through the shared rule now, not a second copy of it. This site is where
      // the behaviour was WRITTEN — and it stayed here alone, so a rebuy during a
      // final table left a player sitting on his own at table 2. Leaving the
      // inline version behind is exactly the drift moving it exists to prevent.
      const ft = consolidationAfterReturn(finalPlayers, {
        isFinalTable: prev.isFinalTable,
        preConsolidation: prev.preConsolidation,
        seatsPerTable: tablesOf(prev.settings).seatsPerTable,
        numberOfTables: tablesOf(prev.settings).numberOfTables,
        returningId: playerToRestore.id,
        reclaimSeat: playerToRestore.seatInfo,
      });
      const seatedPlayers = ft.seatForReturner
        ? ft.players.map(p => p.id === playerToRestore.id
            ? { ...p, seated: true, tableAssignment: ft.seatForReturner ?? undefined }
            : p)
        : ft.players;

      const newState = {
        ...prev,
        players: seatedPlayers,
        isFinalTable: ft.isFinalTable,
        preConsolidation: ft.preConsolidation,
        settings: settingsAfterRestore(prev.settings, ft.restoreTables),
      };

      // Broadcast undo bustout action to all connected clients
      broadcastTournamentAction('undo_bustout', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Skip to next level
  const skipToNextLevel = useCallback(() => {
    setState(prev => {
      const nextLevel = prev.currentLevel + 1;

      // Don't skip beyond the last level
      if (nextLevel >= prev.levels.length) {
        return prev;
      }

      // Announce new level if voice is enabled
      if (prev.settings.enableVoice) {
        speak(levelAnnouncement(prev.levels, nextLevel, 'Skipped to'), { cancel: true, delayMs: 200 });
      }

      const newState = {
        ...prev,
        currentLevel: nextLevel,
        secondsLeft: prev.levels[nextLevel].duration,
        targetEndTime: prev.isRunning ? Date.now() + prev.levels[nextLevel].duration * 1000 : undefined,
        // Keep the timer running if it was running
        isRunning: prev.isRunning
      };

      // Broadcast level skip to all connected clients
      broadcastTournamentAction('level_skipped', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Skip to previous level
  const skipToPreviousLevel = useCallback(() => {
    setState(prev => {
      const prevLevel = prev.currentLevel - 1;

      // Don't skip before the first level
      if (prevLevel < 0) {
        return prev;
      }

      // Announce level if voice is enabled
      if (prev.settings.enableVoice) {
        speak(levelAnnouncement(prev.levels, prevLevel, 'Skipped back to'), { cancel: true, delayMs: 200 });
      }

      const newState = {
        ...prev,
        currentLevel: prevLevel,
        secondsLeft: prev.levels[prevLevel].duration,
        targetEndTime: prev.isRunning ? Date.now() + prev.levels[prevLevel].duration * 1000 : undefined,
        // Keep the timer running if it was running
        isRunning: prev.isRunning
      };

      // Broadcast level skip to all connected clients
      broadcastTournamentAction('level_skipped_back', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);


  // Helper function for timer updates with event dispatch
  const updateTimer = useCallback((updates: Partial<TournamentState>) => {
    setState(prev => {
      const newState = { ...prev, ...updates };
      
      // If secondsLeft is updated and the timer is running, we must update targetEndTime
      if (updates.secondsLeft !== undefined && newState.isRunning) {
        newState.targetEndTime = Date.now() + newState.secondsLeft * 1000;
      }
      
      // Broadcast timer adjustment to all connected clients
      broadcastTournamentAction('timer_adjusted', newState);
      
      return newState;
    });
  }, [broadcastTournamentAction]);


  return {
    state,
    startTimer,
    pauseTimer,
    resetTimer,
    addPlayer,
    removePlayer,
    addKnockout,
    eliminatePlayer,
    updatePlayers,
    addBlindLevel,
    addBreak,
    updateBlindLevel,
    setBlindLevels,
    updateSettings,
    updateTournamentDetails,
    updateNotes,
    updatePrizeStructure,
    removeLevel,
    skipToNextLevel,
    skipToPreviousLevel,
    updateTimer,
    restoreLocalProgress,

    formatTime,
    calculateProgress,
    getCurrentBlinds,
    getRemainingTimeText,
    isBreak,
    undoBustOut,
    undoPlayerReturn,
    processRebuy,
    processReEntry,
    processAddon,
    resetTournament,
    shouldPromptForFinalTable,
    goToFinalTable,
    breakTable,
    tableBreakDue,
    tableToBreak: () => tableToBreak(state.players, tablesOf(state.settings).numberOfTables),
    // `isComplete` was exported here and read by nobody. It also answered a
    // different question from the one its name implies — it ORed "the blind
    // structure ran out" into "the game is over", which are not the same thing
    // and would have surprised the first caller. Whether a game has finished
    // now lives in lib/gameOver.ts, where it is tested; a fifth spelling of it
    // in this hook is how the other four grew.

    // Real-time sync status
    isConnected,
    hasLoadedRemoteState,
    remoteLoad,
    controllingDeviceId,
    controlClaimedAt
  };
}