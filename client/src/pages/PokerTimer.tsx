import { useState, useEffect, useRef, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
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
import { User, LogOut, UserCircle, ChevronDown, Settings2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import TimerCard from '@/components/TimerCard';
import TournamentInfoCard, { TournamentNewButton, TournamentModeToggle } from '@/components/TournamentInfoCard';
import TournamentTemplatesDialog from '@/components/TournamentTemplatesDialog';
import TournamentHistoryDialog from '@/components/TournamentHistoryDialog';
import PlayerSection from '@/components/PlayerSection';
import TablesSection from '@/components/TablesSection';
import BlindLevelsSection from '@/components/BlindLevelsSection';
import BuyInSection from '@/components/BuyInSection';
import QRCodeSection from '@/components/QRCodeSection';
import SettingsSection from '@/components/SettingsSection';
import LeagueSection from '@/components/LeagueSection';
import TournamentOverBanner from '@/components/TournamentOverBanner';
import { LiveBanner } from '@/components/LiveBanner';

function UserMenu() {
  const { user, isAuthenticated, isAnonymous, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <>
      {!isAuthenticated || isAnonymous ? (
        <Button
          onClick={() => setShowAuthModal(true)}
          variant="default"
          size="sm"
          className="bg-orange-600 hover:bg-orange-700 text-white"
        >
          <User className="mr-2 h-4 w-4" />
          Sign In
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              <span className="max-w-[120px] truncate">
                {user && ('playerName' in user ? user.playerName : user.firstName || user.name || 'Account')}
              </span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-gray-800 border-gray-700">
            <div className="px-3 py-2 text-sm text-gray-300 border-b border-gray-700">
              <div className="font-medium text-white">
                {user && ('playerName' in user 
                  ? user.playerName 
                  : (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name || 'User'))}
              </div>
              {user && !('playerName' in user) && user.email && (
                <div className="text-xs text-gray-400 mt-1">{user.email}</div>
              )}
            </div>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 hover:bg-gray-700/50 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
}

export default function PokerTimer({ params }: { params?: { tournamentId?: string } }) {
  const tournamentId = params?.tournamentId;
  const [, setLocation] = useLocation();
  const { user, isAnonymous, isLoading: authLoading } = useAuth();

  // If returning to the home page after previously going live, redirect back to the
  // live director view so Firestore state is fully restored from the database.
  //
  // Only while someone is actually signed in to be that director. This used to
  // fire regardless, which pinned the app to the tournament: every visit to /
  // bounced straight back into a game the signed-out user could not direct, and
  // the home screen — the only place with a Sign In button — became unreachable.
  //
  // Waiting for authLoading matters. useAuth starts with no user, so checking
  // without it would skip the redirect on every cold load and break the case
  // this effect exists for.
  useEffect(() => {
    if (tournamentId || authLoading) return;
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

  return <PokerTimerInner tournament={tournament} tournamentId={tournamentId} />;
}

function PokerTimerInner({
  tournament,
  tournamentId,
}: {
  tournament: NonNullable<ReturnType<typeof useTournament>>;
  tournamentId?: string;
}) {
  const { recordResultByName, removeTournamentResultForPlayer, league, switchLeague, userLeagues, leaguePlayers } = useLeague();
  const { currentSeason, seasons } = useSeasons({ leagueId: league?.id });
  const currentSeasonRef = useRef(currentSeason);
  useEffect(() => { currentSeasonRef.current = currentSeason; }, [currentSeason]);
  // The season the UI displays — settings.seasonId when set, else currentSeason.
  // Held in a ref so the elimination effect reads it without re-subscribing.
  const displaySeasonRef = useRef<any>(null);
  const { user, isAnonymous } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Compute game number once here so TournamentInfoCard and TournamentModeToggle always show the same value.
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
  // Handing over makes this device a spectator.
  //
  // The rules now allow only the tournament's owner to change a live game, so
  // after a handover this screen's controls would appear to work and silently
  // change nothing. Say so, and move to the view that is honestly read-only.
  //
  // Guarded on ownerId actually being present: a snapshot without the field must
  // never eject a director mid-game. Fires once — handedOverRef stops a repeat
  // on every subsequent snapshot.
  const handedOverRef = useRef(false);
  useEffect(() => {
    const ownerId = tournament.state.details?.ownerId;
    const liveId = tournament.state.details?.id;
    if (!liveId || typeof ownerId !== 'string' || !ownerId) return;
    if (!user?.id || isAnonymous) return;
    if (ownerId === user.id || handedOverRef.current) return;

    handedOverRef.current = true;
    toast({
      title: 'Director control passed on',
      description: 'Another device is running this tournament now. You can still watch it.',
    });
    setLocation(`/tournament/${liveId}`);
  }, [tournament.state.details?.ownerId, tournament.state.details?.id, user?.id, isAnonymous, toast, setLocation]);

  // Another DEVICE has taken control.
  //
  // Separate from the ownership check above: with both directors sharing one
  // login, ownerId matches on both devices and cannot tell them apart. The same
  // outcome either way — this screen would appear to work while changing
  // nothing — so step back to the view that is honestly read-only, which offers
  // Take control to come back.
  const lostControlRef = useRef(false);
  useEffect(() => {
    const liveId = tournament.state.details?.id;
    if (!liveId || tournament.state.details?.type !== 'database') return;
    if (tournament.hasControl || lostControlRef.current) return;

    lostControlRef.current = true;
    toast({
      title: 'Another device is running this game',
      description: 'This screen is now view only. You can take control back from there.',
    });
    setLocation(`/tournament/${liveId}`);
  }, [tournament.hasControl, tournament.state.details?.id, tournament.state.details?.type, toast, setLocation]);

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
    if (players.length === 0) return;
    // eliminatePlayer marks every player inactive on completion, including the
    // winner, who is the one given position 1.
    const stillIn = players.filter(p => p.isActive !== false);
    const finished = stillIn.length === 0 && players.some(p => p.position === 1);
    if (!finished) return;

    // Dedupe key. Falls back to the shape of the finished game rather than an
    // empty string: a missing id used to collide with the previous missing id
    // and silently drop every game after the first. The fallback still differs
    // between games (different winner or player count) while staying stable
    // across re-renders of the same finished game, so it cannot cause repeat
    // writes either.
    const details = tournament.state.details;
    const winnerId = players.find(p => p.position === 1)?.id ?? '';
    const gameKey = String(
      details?.localGameId ?? details?.id ?? `anon:${players.length}:${winnerId}`
    );
    if (savedHistoryRef.current === gameKey) return;

    // Signed-out directors have nowhere to save history to; saveCompletedTournament
    // returns null for that case just as it does for a real failure, so guard here
    // rather than reporting a failure that is really "not applicable".
    if (!user?.id) return;

    savedHistoryRef.current = gameKey;

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

  // The League tab is only meaningful for a league game. Hiding it in standalone
  // also keeps the tab bar from overflowing on a phone in portrait, where it was
  // pushing Share off-screen. League mode is enabled from the mode toggle above
  // the tabs, so hiding the tab never blocks getting into league mode.
  // Reuses _isLeagueMode from above rather than recomputing the same expression.
  const isLeagueMode = _isLeagueMode;

  // Don't strand the user on a tab that is about to disappear.
  useEffect(() => {
    if (!isLeagueMode && activeTab === 'league') setActiveTab('players');
  }, [isLeagueMode, activeTab]);
  const [dbTournamentId, setDbTournamentId] = useState<string | null>(tournamentId || null);
  const lastSyncedPlayersRef = useRef<string>('');

  // Tournament creation is now explicit — triggered by "Go Live" in QRCodeSection (Pro feature).
  // The sync effects below are already guarded on dbTournamentId so they naturally no-op until live.

  // Directly sync players to Firestore whenever they change.
  // This is a reliable belt-and-suspenders sync that bypasses the broadcast chain.
  useEffect(() => {
    if (!dbTournamentId || !user || isAnonymous) return;
    const sync = async () => {
      const serialised = JSON.stringify(tournament.state.players);
      if (serialised === lastSyncedPlayersRef.current) return;
      lastSyncedPlayersRef.current = serialised;
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const { sanitizeForFirestore } = await import('@/lib/utils');
      try {
        await updateDoc(
          doc(db, 'activeTournaments', dbTournamentId),
          sanitizeForFirestore({ players: tournament.state.players })
        );
      } catch (e) {
        console.error('Player sync to Firestore failed:', e);
        toast({ title: 'Sync issue', description: 'Live updates may be delayed.', variant: 'destructive' });
      }
    };
    sync();
  }, [tournament.state.players, dbTournamentId, user, isAnonymous]); // eslint-disable-line react-hooks/exhaustive-deps

  // Directly sync timer state to Firestore whenever it changes.
  useEffect(() => {
    if (!dbTournamentId || !user || isAnonymous) return;
    const sync = async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const { sanitizeForFirestore } = await import('@/lib/utils');
      try {
        await updateDoc(
          doc(db, 'activeTournaments', dbTournamentId),
          sanitizeForFirestore({
            currentLevel: tournament.state.currentLevel,
            secondsLeft: tournament.state.secondsLeft,
            isRunning: tournament.state.isRunning,
            targetEndTime: tournament.state.targetEndTime || null,
            smallBlind: tournament.state.levels[tournament.state.currentLevel]?.small || 0,
            bigBlind: tournament.state.levels[tournament.state.currentLevel]?.big || 0,
            ante: tournament.state.levels[tournament.state.currentLevel]?.ante || 0,
            blindLevels: tournament.state.levels,
            notes: tournament.state.notes || '',
          })
        );
      } catch (e) {
        console.error('Timer sync to Firestore failed:', e);
        toast({ title: 'Sync issue', description: 'Live updates may be delayed.', variant: 'destructive' });
      }
    };
    sync();
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    tournament.state.isRunning,       // start / pause
    tournament.state.currentLevel,    // level skip
    tournament.state.targetEndTime,   // set on start, cleared on pause
    tournament.state.levels,
    tournament.state.notes,
    dbTournamentId,
    user,
    isAnonymous,
  ]);

  // Directly sync prizeStructure and settings to Firestore whenever they change.
  useEffect(() => {
    if (!dbTournamentId || !user || isAnonymous) return;
    const sync = async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const { sanitizeForFirestore } = await import('@/lib/utils');
      try {
        await updateDoc(
          doc(db, 'activeTournaments', dbTournamentId),
          sanitizeForFirestore({
            prizeStructure: tournament.state.prizeStructure,
            settings: tournament.state.settings,
            // Keep top-level league fields in sync so handover always works
            leagueId: tournament.state.settings?.leagueId || null,
            seasonId: tournament.state.settings?.seasonId || null,
            isSeasonTournament: tournament.state.settings?.isSeasonTournament || false,
          })
        );
      } catch (e) {
        console.error('PrizeStructure sync to Firestore failed:', e);
        toast({ title: 'Sync issue', description: 'Live updates may be delayed.', variant: 'destructive' });
      }
    };
    sync();
  }, [tournament.state.prizeStructure, tournament.state.settings, dbTournamentId, user, isAnonymous]); // eslint-disable-line react-hooks/exhaustive-deps

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
            processedEliminationsRef.current.delete(player.id);
            if (gameId) await removeTournamentResultForPlayer(player.name, gameId);
          } catch (rebuyError) {
            console.error('Error handling rebuy for league tracking:', player.name, rebuyError);
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
      <div className="container mx-auto px-4 py-3 sm:py-6 max-w-4xl">
        {/* Header — row 1: logo + user menu | row 2: mode toggle */}
        <header className="mb-3 sm:mb-5">
          {/* Row 1: logo left, user menu right */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col">
              <img
                src="/stackmatelogo.svg"
                alt="StackMate Go"
                className="h-8 sm:h-11 w-auto object-contain"
                style={{ filter: 'brightness(1.1)' }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              <p className="text-lg font-semibold text-orange-600 mt-1 pl-0.5">Your poker night, sorted.</p>
            </div>
            <UserMenu />
          </div>

          {/* Event Branding */}
          {tournament.state.settings.branding?.isVisible && (displayEventName || tournament.state.settings.branding?.logoUrl) && (
            <div className="mt-2 sm:mt-4 flex items-center justify-center gap-4">
              {tournament.state.settings.branding?.logoUrl && (
                <img
                  src={tournament.state.settings.branding.logoUrl}
                  alt={displayEventName || 'Event Logo'}
                  className="h-10 sm:h-14 w-auto object-contain"
                />
              )}
              {displayEventName && (
                <h2 className="text-xl sm:text-3xl font-bold text-foreground tracking-wide truncate max-w-[60vw]">
                  {displayEventName}
                </h2>
              )}
              {tournament.state.settings.branding?.logoUrl && (
                <img
                  src={tournament.state.settings.branding.logoUrl}
                  alt={displayEventName || 'Event Logo'}
                  className="h-10 sm:h-14 w-auto object-contain"
                />
              )}
            </div>
          )}
        </header>

        {/* Tournament Over Banner */}
        {(() => {
          const activePlayers = tournament.state.players.filter(p => p.isActive === true);
          const eliminatedPlayers = tournament.state.players.filter(p => p.isActive === false);

          if (activePlayers.length === 1 && tournament.state.players.length > 1 && eliminatedPlayers.length > 0) {
            return <TournamentOverBanner winnerName={activePlayers[0]?.name || 'Unknown'} />;
          }
          return null;
        })()}



        {/* Main Timer Card - Always Visible */}
        <div className="mb-6">
          <TimerCard
            tournament={tournament}
            recentLevelChange={recentLevelChange}
          />
        </div>

        {/* Tournament Info Card - Always Visible */}
        <div className="mb-6">
          <TournamentInfoCard tournament={tournament} league={league} leaguePlayers={leaguePlayers} currentSeason={currentSeason} seasons={seasons} gameNumber={gameNumber} totalGames={totalGames} />
        </div>

        {/* Live banner — shown when players exist but haven't gone live yet */}
        {tournament.state.players.length > 0 && !dbTournamentId && (
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
                <TournamentNewButton tournament={tournament} league={league} userLeagues={userLeagues} switchLeague={switchLeague} leaguePlayers={leaguePlayers} currentSeason={currentSeason} seasons={seasons} />
              </div>
            </div>
            {/* Row 2: mode toggle */}
            <div className="px-4 pb-3">
              <TournamentModeToggle tournament={tournament} league={league} leaguePlayers={leaguePlayers} currentSeason={currentSeason} seasons={seasons} />
            </div>
            <div className="relative">
              <TabsList className="flex w-full overflow-x-auto overflow-y-hidden whitespace-nowrap hide-scrollbar justify-start sm:justify-center rounded-none bg-transparent p-0 border-b border-border/40 h-auto">
                <TabsTrigger value="players" variant="players" className="flex-shrink-0 min-w-[80px]">Players</TabsTrigger>
                <TabsTrigger value="tables" variant="tables" className="flex-shrink-0 min-w-[80px]">Seating</TabsTrigger>
                <TabsTrigger value="buyins" variant="buy-ins" className="flex-shrink-0 min-w-[80px]">Structure</TabsTrigger>
                <TabsTrigger value="levels" variant="timer" className="flex-shrink-0 min-w-[80px]">Levels</TabsTrigger>
                {isLeagueMode && (
                  <TabsTrigger value="league" variant="league" className="flex-shrink-0 min-w-[80px]">League</TabsTrigger>
                )}
                <TabsTrigger value="settings" variant="settings" className="flex-shrink-0 min-w-[80px]">Settings</TabsTrigger>
                <TabsTrigger value="qr" variant="timer" className="flex-shrink-0 min-w-[80px]">
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex items-center justify-center h-3.5 w-3.5 flex-shrink-0">
                      <span className="radar-ring absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-500" style={{ animationDelay: '0s' }} />
                      <span className="radar-ring absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-500" style={{ animationDelay: '1s' }} />
                      <span className="radar-ring absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-500" style={{ animationDelay: '2s' }} />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                    Share
                  </span>
                </TabsTrigger>
              </TabsList>
              <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-background to-transparent sm:hidden" />
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

            {isLeagueMode && (
              <TabsContent value="league" className="mt-0 p-4 pt-5">
                <LeagueSection tournament={tournament} />
              </TabsContent>
            )}

            <TabsContent value="qr" className="mt-0 p-4 pt-5">
              <QRCodeSection tournament={tournament} dbTournamentId={dbTournamentId} onGoLive={setDbTournamentId} />
            </TabsContent>

            <TabsContent value="settings" className="mt-0 p-4 pt-5">
              <SettingsSection tournament={tournament} />
            </TabsContent>
          </Tabs>
        </Card>

        <footer className="mt-8 text-center text-muted-foreground text-sm py-4">
          <p>StackMateGo &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}
