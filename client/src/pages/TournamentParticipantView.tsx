import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy, Users, Play, Pause, SkipForward, Settings, Volume2, VolumeX, Timer, AlertCircle, Shield, Check, X, ChevronUp, ChevronDown, Home, LogIn, LogOut, StickyNote } from 'lucide-react';
import PlayerSectionReadOnly from '@/components/PlayerSectionReadOnly';
import TablesSectionReadOnly from '@/components/TablesSectionReadOnly';
import RealTimeLeagueTable from '@/components/RealTimeLeagueTable';
import { Button } from '@/components/ui/button'; // Assuming Button component is available
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from '@/components/AuthModal';
import TournamentOverBanner from '@/components/TournamentOverBanner';
import ParticipantTournamentInfoCard from '@/components/ParticipantTournamentInfoCard';
import { prizePoolFor, type RakeStructure } from '@/lib/prizePool';
import TimerFace from '@/components/TimerFace';
import { cn } from '@/lib/utils';

interface TournamentData {
  id: string;
  name: string;
  status: string;
  currentLevel: number;
  secondsLeft: number;
  targetEndTime?: number;
  isRunning: boolean;
  players: any[];
  tables: any[];
  buyIn: number;
  blindLevels: any[];
  notes?: string;
  ownerId?: string;
  settings: {
    enableSounds: boolean;
    enableVoice: boolean;
    showSeconds: boolean;
    showNextLevel: boolean;
    currency: string;
    tables: {
      numberOfTables: number;
      seatsPerTable: number;
      tableNames: string[];
    };
    tableBackgrounds: string[];
    branding?: {
      leagueName?: string;
      logoUrl?: string;
    };
    isSeasonTournament?: boolean;
    leagueId?: string;
    notes?: string;
  };
  prizeStructure: {
    buyIn: number;
    enableBounties: boolean;
    bountyAmount: number;
    manualPayouts: any[];
    allowRebuys?: boolean;
    rebuyAmount?: number;
    rebuyChips?: number;
    rebuyPeriodLevels?: number;
    maxRebuys?: number;
    allowAddons?: boolean;
    addonAmount?: number;
    addonChips?: number;
    addonAvailableLevel?: number;
    startingChips?: number;
    allowReEntry?: boolean;
    maxReEntries?: number;
    reEntryPeriodLevels?: number;
  };
  state?: {
    notes?: string;
  };
}

import { Skeleton } from '@/components/ui/skeleton';

function TournamentParticipantView() {
  const params = useParams<{ tournamentId?: string; id?: string }>();
  const id = params.tournamentId || params.id;
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const { user, isAuthenticated, isAnonymous, isLoading, signInAnonymously, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [signInRequested, setSignInRequested] = useState(false);

  // `user` is a union with the legacy anonymous shape, which carries no email.
  const accountLabel = user && 'email' in user ? user.email : undefined;
  useEffect(() => {
    if (!signInRequested || !isAuthenticated || isAnonymous || !id) return;

    const ownerId = tournament?.ownerId;
    const mayDirect = !ownerId || ownerId === user?.id;

    setSignInRequested(false);
    if (mayDirect) setLocation(`/tournament/${id}/director`);
  }, [signInRequested, isAuthenticated, isAnonymous, id, tournament?.ownerId, user?.id, setLocation]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      signInAnonymously().catch(console.error);
    }
  }, [isAuthenticated, isLoading, signInAnonymously]);

  // Update browser tab title when tournament name is known
  useEffect(() => {
    if (tournament?.name) {
      document.title = `StackMate Live · ${tournament.name}`;
    } else {
      document.title = 'StackMate Live';
    }
    return () => { document.title = 'StackMate Go - Poker Tournament Timer'; };
  }, [tournament?.name]);

  // Firebase real-time connection — no auth required (activeTournaments is public read)
  useEffect(() => {
    if (!id) return;

    let unsubscribeFirestore: (() => void) | undefined;
    let mounted = true;

    const applySnapshot = (data: any) => {
      if (!mounted) return;

      // A saved-but-unpublished game is the director's own working copy: every
      // tournament is now saved to their account as soon as it has players,
      // while "Go Live" is what decides players may watch it.
      //
      // Absent means published — every document written before isPublished
      // existed was created by Go Live, and those QR links must keep working.
      if (data.isPublished === false) {
        setError('This tournament is not being shared yet. Ask the director to go live.');
        setIsConnected(false);
        return;
      }

      if (data.blindLevels) {
        data.blindLevels = data.blindLevels.map((level: any) => ({
          ...level,
          duration: typeof level.duration === 'number' ?
            (level.duration < 100 ? level.duration * 60 : level.duration) : 900
        }));
      }
      setTournament(data as any);
      if (data.targetEndTime && data.isRunning) {
        setTimeLeft(Math.max(0, Math.ceil((data.targetEndTime - Date.now()) / 1000)));
      } else {
        setTimeLeft(data.secondsLeft || 0);
      }
      setError(null);
      setIsConnected(true);
      if (data.settings?.isSeasonTournament) {
        window.dispatchEvent(new CustomEvent('leagueDataChanged', {
          detail: { source: 'participant-firebase-update', forceUpdate: true }
        }));
      }
    };

    const setup = async () => {
      try {
        const { projectId, databaseId, db } = await import('@/lib/firebase');

        // Initial load via REST API — bypasses SDK WebChannel/auth issues
        const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(databaseId)}/documents/activeTournaments/${id}`;
        const restRes = await fetch(restUrl);
        if (restRes.ok) {
          const raw = await restRes.json();
          // Convert Firestore REST field format to plain JS
          const fromFirestoreValue = (v: any): any => {
            if ('nullValue' in v) return null;
            if ('booleanValue' in v) return v.booleanValue;
            if ('integerValue' in v) return Number(v.integerValue);
            if ('doubleValue' in v) return v.doubleValue;
            if ('stringValue' in v) return v.stringValue;
            if ('timestampValue' in v) return v.timestampValue;
            if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
            if ('mapValue' in v) {
              const o: any = {};
              for (const [k, fv] of Object.entries(v.mapValue.fields || {})) o[k] = fromFirestoreValue(fv);
              return o;
            }
            return null;
          };
          const fields: any = {};
          for (const [k, fv] of Object.entries(raw.fields || {})) fields[k] = fromFirestoreValue(fv as any);
          if (mounted) applySnapshot(fields);
        } else if (restRes.status === 404) {
          if (mounted) setError('Tournament not found');
          return;
        }

        // Real-time updates via SDK onSnapshot
        if (!mounted) return;
        const { doc, onSnapshot } = await import('firebase/firestore');
        const docRef = doc(db, 'activeTournaments', id.toString());
        unsubscribeFirestore = onSnapshot(
          docRef,
          (docSnap) => { if (docSnap.exists()) applySnapshot(docSnap.data()); },
          (err) => { console.error('Firebase listener error:', err); }
        );
      } catch (err: any) {
        console.error('Failed to initialize connection:', err);
        setError(`Failed to load tournament data: ${err.message}`);
      }
    };

    setup();

    // When the tab becomes visible again (e.g. iOS returning from background),
    // do a one-shot read to resync the level and timer immediately rather than
    // waiting for the next Firestore push.
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !mounted) return;
      try {
        const { projectId, databaseId } = await import('@/lib/firebase');
        const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(databaseId)}/documents/activeTournaments/${id}`;
        const res = await fetch(restUrl);
        if (res.ok) {
          const raw = await res.json();
          const fields: any = {};
          const fromVal = (v: any): any => {
            if ('nullValue' in v) return null;
            if ('booleanValue' in v) return v.booleanValue;
            if ('integerValue' in v) return Number(v.integerValue);
            if ('doubleValue' in v) return v.doubleValue;
            if ('stringValue' in v) return v.stringValue;
            if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromVal);
            if ('mapValue' in v) { const o: any = {}; for (const [k, fv] of Object.entries(v.mapValue.fields || {})) o[k] = fromVal(fv as any); return o; }
            return null;
          };
          for (const [k, fv] of Object.entries(raw.fields || {})) fields[k] = fromVal(fv as any);
          if (mounted) applySnapshot(fields);
        }
      } catch { /* silently ignore */ }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      unsubscribeFirestore?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [id]);

  // Timer countdown effect - only runs when tournament is running AND synced
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    // Only run timer if tournament is explicitly running
    if (tournament?.isRunning) {
      interval = setInterval(() => {
        setTimeLeft(prev => {
          if (tournament.targetEndTime) {
            const newTime = Math.max(0, Math.ceil((tournament.targetEndTime - Date.now()) / 1000));
            if (newTime <= 0) return 0;
            return newTime;
          }
          return prev;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [tournament?.isRunning, tournament?.targetEndTime]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Director authentication logic removed as it's handled by the login system now.

  const getNextLevelInfo = () => {
    if (!tournament?.blindLevels || tournament.currentLevel >= tournament.blindLevels.length - 1) {
      return null;
    }
    return tournament.blindLevels[tournament.currentLevel + 1];
  };

  const getNextBreakInfo = () => {
    if (!tournament?.blindLevels) return null;

    // If we're currently on a break, return null
    if (getCurrentLevel()?.isBreak) return null;

    // Look for the next break starting from the current level
    for (let i = tournament.currentLevel + 1; i < tournament.blindLevels.length; i++) {
      if (tournament.blindLevels[i].isBreak) {
        // Found the next break
        let secondsUntilBreak = timeLeft; // Current level remaining time

        // Add the duration of all levels between current and break
        for (let j = tournament.currentLevel + 1; j < i; j++) {
          secondsUntilBreak += tournament.blindLevels[j].duration;
        }

        // Format the time until break
        const minutesUntilBreak = Math.floor(secondsUntilBreak / 60);
        const secondsRemaining = secondsUntilBreak % 60;

        return {
          timeUntilBreak: `${minutesUntilBreak}:${secondsRemaining.toString().padStart(2, '0')}`
        };
      }
    }

    // No breaks found in the remaining levels
    return null;
  };

  const getCurrentLevel = () => {
    if (!tournament?.blindLevels) return null;
    return tournament.blindLevels[tournament.currentLevel] || tournament.blindLevels[0];
  };

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center">
        <div className="text-center">
          <img
            src="/stackmatelogo.svg"
            alt="StackMate Go"
            className="h-10 w-auto object-contain mx-auto mb-4"
            style={{ filter: 'brightness(1.1)' }}
          />
          {error ? (
            <div className="space-y-2">
              <p className="text-red-400">{error}</p>
              <p className="text-sm text-muted-foreground">Tournament ID: {id}</p>
              <div className="flex gap-2 justify-center mt-4">
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.href = '/'}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  Go Home
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 w-full max-w-4xl mx-auto p-4">
              <div className="flex justify-between items-center mb-8">
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-10 w-32" />
              </div>
              <Skeleton className="h-[400px] w-full rounded-xl" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Skeleton className="h-[300px] w-full rounded-xl" />
                <Skeleton className="h-[300px] w-full rounded-xl" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentLevel = getCurrentLevel();
  const nextLevel = getNextLevelInfo();
  const currencySymbol = tournament.settings?.currency || '£';

  // Create tournament object for read-only components with proper player data structure
  const tournamentForComponents = {
    state: {
      players: tournament.players || [],
      settings: {
        ...tournament.settings,
        currency: tournament.settings?.currency || '£',
        tables: tournament.settings?.tables || {
          numberOfTables: 1,
          seatsPerTable: 9,
          tableNames: ['Table 1']
        },
        tableBackgrounds: tournament.settings?.tableBackgrounds || []
      },
      prizeStructure: tournament.prizeStructure || {
        buyIn: tournament.buyIn || 0,
        enableBounties: false,
        bountyAmount: 0,
        manualPayouts: []
      }
    }
  };

  /**
   * The pool and the house fee, from the same function the director's screen
   * uses.
   *
   * This used to be a local copy that omitted re-entry and rebuy rake, so the
   * house fee shown to players disagreed with the figure the director was
   * looking at for the very same game. The pool itself matched, so payouts were
   * never affected — it just could not be explained to anyone who compared the
   * two screens.
   */
  /**
   * What the clock is showing, derived once.
   *
   * The headline used to be assembled inline inside the JSX with an IIFE, and
   * the class it sat in was built as `${cond && "text-secondary"}` — which emits
   * the string "false" into className whenever the game is not on a break.
   */
  const participantPlayers = tournament.players || [];
  const eliminatedCount = participantPlayers.filter((p: any) => p.isActive === false || p.position).length;
  const activeCount = participantPlayers.filter((p: any) => p.isActive === true || (p.isActive !== false && !p.position)).length;
  const tournamentFinished = !!participantPlayers.find((p: any) => p.position === 1)
    || (eliminatedCount >= participantPlayers.length - 1 && participantPlayers.length > 1)
    || (activeCount === 1 && eliminatedCount > 0);

  const headline = tournamentFinished
    ? 'TOURNAMENT FINISHED'
    : currentLevel?.isBreak
      ? 'BREAK TIME'
      : currentLevel
        ? `${currentLevel.smallBlind || currentLevel.small} / ${currentLevel.bigBlind || currentLevel.big}`
        : '\u2014';

  const levelDuration = tournament.blindLevels?.[tournament.currentLevel]?.duration || 900;
  const levelProgress = Math.min(100, Math.max(0, 100 - (timeLeft / levelDuration) * 100));

  const prizePoolData = (() => {
    // Typed as RakeStructure rather than any: the local default object this is
    // read from is narrower than a real prize structure, and the version this
    // replaced dodged that by taking `any`.
    const ps = (tournament.prizeStructure || {}) as RakeStructure;
    const buyIn = ps.buyIn || tournament.buyIn || 10;
    const players = tournament.players || [];
    const { gross, rake } = prizePoolFor(players, { ...ps, buyIn });

    return {
      totalPlayers: players.length,
      totalPool: gross,
      grossPrizePool: gross,
      rakeAmount: rake,
      rakeType: ps.rakeType || 'percentage',
      rakePercentage: ps.rakePercentage || 0,
      payouts: tournament.prizeStructure?.manualPayouts || [],
    };
  })();


  return (
    /* The app's own shell. This hard-coded its own gradient and pure white, so
       the screen players actually see was a colder, bluer app than the one the
       director runs — and it flashed on load, because the loading branch below
       already used bg-background. */
    <div className="min-h-screen bg-background text-foreground font-sans overflow-auto">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <img
                src="/stackmatelogo.svg"
                alt="StackMate Go"
                className="h-7 w-auto object-contain"
                style={{ filter: 'brightness(1.1)' }}
              />
              <span className="flex items-center gap-1 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                LIVE
              </span>
            </div>
            <h1 className="text-xl font-bold text-white leading-tight">{tournament?.name || 'Tournament'}</h1>
          </div>

          {/* A way back into the app.
              This screen used to be a dead end: "Go Home" existed only in the
              error branch, so a tournament that loaded successfully offered no
              route anywhere. A director who signed out was redirected here and
              left looking at their own game with nothing to click. It is also
              the only exit for a player who arrived by QR and wants to run a
              game of their own.

              A deliberate labelled control rather than a clickable logo, so
              nobody taps it by accident while watching a live game. */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {/* An account control in BOTH states.
                This used to offer Sign In only when signed out, so a director who
                landed here signed in as the wrong account had nothing to press —
                no sign-out, and no Take control because they did not own the
                game. The only escape was clearing site cookies from browser
                settings, which is what actually happened.

                The account is named on purpose rather than decoratively: seeing
                WHICH login is in use would have made that whole episode a
                glance. Players arriving by QR are anonymous, so they only ever
                see Sign in. */}
            {(!isAuthenticated || isAnonymous) ? (
              <button
                onClick={() => { setSignInRequested(true); setShowAuthModal(true); }}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg px-3 py-2 transition-colors"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Sign in</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  // Full page load, matching the director header — see the note
                  // on handleLogout in PokerTimer.
                  logout()
                    .catch(err => console.error('Sign out failed:', err))
                    .finally(() => { window.location.href = '/?home=1'; });
                }}
                className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 transition-colors max-w-[190px]"
                title={accountLabel ? `Signed in as ${accountLabel}` : 'Sign out'}
              >
                <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{accountLabel || 'Sign out'}</span>
              </button>
            )}
            {/* ?home=1 makes this a guaranteed way out. A plain "/" is redirected
                straight back to the pinned live game by PokerTimer, so from a
                wedged state the home button could not actually get you home. */}
            <a
              href="/?home=1"
              className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              <span>StackMate Go</span>
            </a>
          </div>
        </div>

        {/* Tournament Over Banner */}
        {(() => {
          const activePlayers = tournament?.players?.filter(p => p.isActive === true) || [];
          const eliminatedPlayers = tournament?.players?.filter(p => p.isActive === false) || [];

          if (activePlayers.length === 1 && (tournament?.players?.length || 0) > 1 && eliminatedPlayers.length > 0) {
            return <TournamentOverBanner winnerName={activePlayers[0]?.name || 'Unknown'} />;
          }
          return null;
        })()}

        {/* Personalised player card */}
        {(() => {
          const uid = (user as any)?.uid;
          const claimedId = id ? localStorage.getItem(`claimedPlayer_${id}`) : null;
          const me = claimedId
            ? tournament?.players?.find((p: any) => p.id === claimedId)
            : uid
            ? tournament?.players?.find((p: any) => p.claimedBy === uid)
            : null;
          if (!me) return null;
          const seat = me.tableAssignment || me.seatInfo;
          return (
            <div className="mb-4">
              <Card variant="live" className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <UserCheck className="h-5 w-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="font-bold text-white">{me.name}</p>
                      <p className="text-xs text-orange-300">
                        {me.isActive === false
                          ? me.position === 1
                            ? 'Winner!'
                            : me.position
                            ? `Finished in position ${me.position}`
                            : 'Eliminated'
                          : seat
                          ? `Table ${(seat.tableIndex ?? 0) + 1} · Seat ${(seat.seatIndex ?? 0) + 1}`
                          : 'Active'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-300 space-y-0.5">
                    {me.chipCount != null && (
                      <p className="font-mono font-bold text-white">{me.chipCount.toLocaleString()} chips</p>
                    )}
                    {(me.rebuys ?? 0) > 0 && <p>{me.rebuys} rebuy{me.rebuys !== 1 ? 's' : ''}</p>}
                    {me.prizeMoney != null && me.prizeMoney > 0 && (
                      <p className="text-green-400 font-bold">Prize: ${me.prizeMoney}</p>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          );
        })()}

        {/* Main Timer Card */}
        <div className="mb-6">
          {/*
            The SAME timer the director sees — piping and all.
            This used to be a hand-rolled duplicate with its own card, size ramp
            and inline line-height, so every improvement to the console's clock
            was invisible to the people actually scanning the QR code. Players
            always get the ring: it is the treatment that shows how far through
            the level the table is, which is the thing they want to know.
          */}
          <TimerFace
            clock={formatTime(timeLeft)}
            secondsLeft={timeLeft}
            progress={levelProgress}
            isRunning={!!tournament.isRunning}
            isBreak={!!currentLevel?.isBreak}
            isFinished={tournamentFinished}
            headline={headline}
            ante={currentLevel?.ante}
          >
            {/* Live / paused, and whether this phone is still connected. */}
            <div className="flex justify-center items-center gap-3 mb-4 sm:mb-6">
              <div className={cn(
                "px-3 py-1.5 rounded-full text-label font-medium flex items-center gap-2",
                tournament.isRunning
                  ? "bg-green-500/15 text-green-300"
                  : "bg-yellow-500/15 text-yellow-300"
              )}>
                <div className={cn("w-2 h-2 rounded-full", tournament.isRunning ? "bg-green-500" : "bg-yellow-500")} />
                {tournament.isRunning ? 'RUNNING' : 'PAUSED'}
              </div>
              <div className={cn(
                "px-3 py-1.5 rounded-full text-label font-medium flex items-center gap-2",
                isConnected ? "bg-white/5 text-muted-foreground" : "bg-red-500/15 text-red-300"
              )}>
                <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
                {isConnected ? 'Live' : 'Offline'}
              </div>
            </div>

            {/* Level info. No progress bar: the piping ring above is the level
                progress, and two indicators for one number can only disagree. */}
            <div className="flex justify-between items-start text-muted-foreground text-label w-full px-1 mb-2 sm:mb-3 gap-2">
              <div className="flex-1 min-w-0 truncate text-left font-medium">
                {currentLevel?.isBreak ? "Break" :
                 `Level ${tournament.blindLevels ?
                   tournament.blindLevels.slice(0, tournament.currentLevel + 1).filter((l: any) => !l.isBreak).length :
                   (tournament.currentLevel || 0) + 1}`}
              </div>

              <div className="flex flex-col items-center justify-center flex-1 min-w-0">
                {(() => {
                  const nextBreakInfo = getNextBreakInfo();
                  if (nextBreakInfo && !currentLevel?.isBreak) {
                    return (
                      <div className="text-primary font-medium text-center">
                        Next break: {nextBreakInfo.timeUntilBreak}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="flex-1 min-w-0 truncate text-right font-medium">
                {nextLevel ?
                  (nextLevel.isBreak ? "Next: Break" : `Next: ${nextLevel.smallBlind || nextLevel.small}/${nextLevel.bigBlind || nextLevel.big}`) :
                  "Tournament complete"}
              </div>
            </div>
          </TimerFace>
        </div>

        {/* Tournament Info Card */}
        <div className="mb-6">
          <ParticipantTournamentInfoCard tournament={tournament} />
        </div>

        {/* Director Controls removed */}

        {/* Players Section */}
        <div className="mb-6">
          <PlayerSectionReadOnly tournament={tournamentForComponents} />
        </div>

        {/* Tables Section */}
        <div className="mb-6">
          <TablesSectionReadOnly tournament={tournamentForComponents} />
        </div>

        {/* Real-Time League Table — always mounted for season tournaments;
            the component handles auth-pending state and loading internally */}
        <div className="mb-6">
          <RealTimeLeagueTable tournament={tournament} isParticipantView={true} />
        </div>

        {/* Tournament Notes Section */}
        {(() => {
          // Check multiple possible locations for notes
          const notes = tournament?.notes ||
                       tournament?.settings?.notes ||
                       '';

          if (notes && notes.trim()) {
            return (
              <div className="mb-6">
                <Card className="card-glass p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-semibold flex items-center">
                      <StickyNote className="mr-2 h-5 w-5 text-yellow-500" />
                      Tournament Notes
                    </h2>
                    <button onClick={() => setNotesExpanded(v => !v)}>
                      {notesExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </div>
                  {notesExpanded && (
                    <div className="p-4 pt-0 border-t border-[#2a2a2a]">
                      <div className="bg-background bg-opacity-40 rounded-lg p-4">
                        <div className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                          {notes}
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            );
          }
          return null;
        })()}

        <footer className="mt-8 text-center text-muted-foreground text-sm py-4">
          <p>StackMate Go &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}

export default TournamentParticipantView;