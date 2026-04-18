import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTournament } from '@/hooks/useTournament';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/AuthModal';
import { User, LogOut, UserCircle, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import TimerCard from '@/components/TimerCard';
import TournamentInfoCard from '@/components/TournamentInfoCard';
import TournamentTemplatesDialog from '@/components/TournamentTemplatesDialog';
import PlayerSection from '@/components/PlayerSection';
import TablesSection from '@/components/TablesSection';
import BlindLevelsSection from '@/components/BlindLevelsSection';
import BuyInSection from '@/components/BuyInSection';
import QRCodeSection from '@/components/QRCodeSection';
import SettingsSection from '@/components/SettingsSection';
import RankingsSection from '@/components/RankingsSection';
import LeagueSection from '@/components/LeagueSection';
import RealTimeLeagueTable from '@/components/RealTimeLeagueTable';
import DirectorCoordinationPanel from '@/components/DirectorCoordinationPanel';
import TournamentOverBanner from '@/components/TournamentOverBanner';
import { LiveBanner } from '@/components/LiveBanner';
import { ChevronDown as ChevronDownIcon } from 'lucide-react';

function GettingStartedCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors"
      >
        <span>How it works</span>
        <ChevronDownIcon className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2.5 border-t border-border/30 pt-3">
          {[
            ['Add players', 'Open the Players tab and add everyone at the table'],
            ['Set your structure', 'Configure buy-ins and blind levels in Structure & Levels'],
            ['Share live', 'Tap Share — players scan the QR and follow blinds, standings & seats on their phones in real time, no app needed'],
          ].map(([title, desc], i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold mt-0.5">
                {i + 1}
              </span>
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">{title}</span> — {desc}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const tournament = useTournament(tournamentId); // Pass tournamentId here
  const { recordResultByName, addLeaguePlayer, removeTournamentResultForPlayer, league, switchLeague } = useLeague();
  const { currentSeason } = useSeasons({ leagueId: league?.id });
  const { user, isAnonymous } = useAuth();
  const { toast } = useToast();
  const [processedEliminations, setProcessedEliminations] = useState(new Set<string>());
  const [activeTab, setActiveTab] = useState('players'); // State to manage active tab
  const [dbTournamentId, setDbTournamentId] = useState<string | null>(tournamentId || null);

  // Add safety check for tournament hook
  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="flex flex-col items-center space-y-4">
          <div className="text-gray-400">Loading tournament...</div>
        </div>
      </div>
    );
  }

  // Tournament creation is now explicit — triggered by "Go Live" in QRCodeSection (Pro feature).
  // The sync effects below are already guarded on dbTournamentId so they naturally no-op until live.

  // Directly sync players to Firestore whenever they change.
  // This is a reliable belt-and-suspenders sync that bypasses the broadcast chain.
  useEffect(() => {
    if (!dbTournamentId || !user || isAnonymous) return;
    const sync = async () => {
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
          })
        );
      } catch (e) {
        console.error('Timer sync to Firestore failed:', e);
      }
    };
    sync();
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    tournament.state.isRunning,       // start / pause
    tournament.state.currentLevel,    // level skip
    tournament.state.targetEndTime,   // set on start, cleared on pause
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
            leagueId: (tournament.state.settings as any)?.leagueId || null,
            seasonId: (tournament.state.settings as any)?.seasonId || null,
            isSeasonTournament: (tournament.state.settings as any)?.isSeasonTournament || false,
          })
        );
      } catch (e) {
        console.error('PrizeStructure sync to Firestore failed:', e);
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
    // Wrap the entire effect in a try-catch to prevent crashes
    try {
      const isSeasonTournament =
        tournament?.state?.details?.type === 'season' ||
        (tournament?.state?.settings as any)?.isSeasonTournament === true;

      if (!isSeasonTournament) {
        return;
      }

      // Get players to record - if tournament is finished, record all players, otherwise just newly eliminated
      const activePlayers = tournament?.state?.players?.filter(p => p.isActive !== false) || [];
      const isFinished = activePlayers.length <= 1 && tournament?.state?.players && tournament.state.players.length > 1;

      const eliminatedPlayers = tournament?.state?.players?.filter(p => {
        if (isFinished) {
          // Tournament finished - record all players with positions who haven't been processed
          return p.position && p.position > 0 && !processedEliminations.has(p.id);
        } else {
          // Tournament ongoing - only record eliminated players
          return p.isActive === false &&
                 p.position &&
                 p.position > 0 &&
                 !processedEliminations.has(p.id);
        }
      }) || [];

      if (eliminatedPlayers.length > 0) {
        // Process each player with individual error handling
        const processedPlayerIds: string[] = [];

        eliminatedPlayers.forEach(player => {
          try {
            // Validate player data before processing
            if (!player.name || !player.position || !tournament?.state?.players?.length) {
              return;
            }

            // Add player to league if not already there
            addLeaguePlayer(player.name);

            // Calculate eliminations for this player - use knockouts field
            const eliminationsCount = player.knockouts || 0;

            // Get prize money for this player
            const prizeMoney = player.prizeMoney || 0;

            // Record tournament result for this player
            recordResultByName(
              player.name,
              player.position,
              tournament.state.players.length,
              eliminationsCount,
              prizeMoney,
              tournament.state.prizeStructure?.buyIn || 10,
              tournament.state.details?.id,
              currentSeason?.id ? String(currentSeason.id) : undefined
            );

            // Track successful processing
            processedPlayerIds.push(player.id);
          } catch (playerError) {
            console.error('Error recording individual player to league:', player.name, playerError);
            // Continue processing other players even if one fails
          }
        });

        // Update processed eliminations only for successfully processed players
        if (processedPlayerIds.length > 0) {
          setProcessedEliminations(prev => {
            const newSet = new Set(prev);
            processedPlayerIds.forEach(id => newSet.add(id));
            return newSet;
          });
        }
      }

      // Handle Rebuys: If a player is active again but was previously processed as eliminated,
      // we need to remove their premature league result and remove them from processedEliminations.
      const rebuysToProcess = activePlayers.filter(p => processedEliminations.has(p.id));
      if (rebuysToProcess.length > 0) {
        rebuysToProcess.forEach(player => {
          try {
            // 1. Remove from processed eliminations so they can be recorded again later
            setProcessedEliminations(prev => {
              const newSet = new Set(prev);
              newSet.delete(player.id);
              return newSet;
            });
            
            // 2. Remove their premature result from the league database
            if (tournament.state.details?.id) {
              removeTournamentResultForPlayer(player.name, tournament.state.details.id);
            }
          } catch (rebuyError) {
            console.error('Error handling rebuy for league tracking:', player.name, rebuyError);
          }
        });
      }
    } catch (effectError) {
      console.error('Critical error in league recording effect:', effectError);
      toast({ title: 'League recording error', description: 'Some results may not have been saved to the league. Please check Tournament History.', variant: 'destructive' });
    }
  }, [tournament?.state?.players, tournament?.state?.details?.type, tournament?.state?.details?.id, tournament?.state?.prizeStructure?.buyIn, recordResultByName, addLeaguePlayer, removeTournamentResultForPlayer, processedEliminations]);

  // Reset processed eliminations when tournament resets
  useEffect(() => {
    const activePlayers = tournament?.state?.players?.filter(p => p.isActive !== false) || [];
    const totalPlayers = tournament?.state?.players?.length || 0;

    // If all players are active again, reset processed eliminations
    if (activePlayers.length === totalPlayers && totalPlayers > 0) {
      setProcessedEliminations(new Set());
    }
  }, [tournament?.state?.players]);

  // Restore league context when a tournament is loaded via director handover.
  // The leagueId is stored in tournament settings and synced to Firestore, so the
  // receiving director's device always gets the right league regardless of localStorage.
  useEffect(() => {
    const leagueId = (tournament.state.settings as any)?.leagueId;
    if (leagueId && tournament.state.details?.type === 'database') {
      switchLeague(String(leagueId));
    }
  }, [(tournament.state.settings as any)?.leagueId, tournament.state.details?.type, switchLeague]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {tournament.state.settings.branding?.isVisible && (tournament.state.settings.branding?.leagueName || tournament.state.settings.branding?.logoUrl) && (
            <div className="mt-2 sm:mt-4 flex items-center justify-center gap-4">
              {tournament.state.settings.branding?.logoUrl && (
                <img
                  src={tournament.state.settings.branding.logoUrl}
                  alt={tournament.state.settings.branding?.leagueName || 'League Logo'}
                  className="h-10 sm:h-14 w-auto object-contain"
                />
              )}
              {tournament.state.settings.branding?.leagueName && (
                <h2 className="text-xl sm:text-3xl font-bold text-foreground tracking-wide truncate max-w-[60vw]">
                  {tournament.state.settings.branding.leagueName}
                </h2>
              )}
              {tournament.state.settings.branding?.logoUrl && (
                <img
                  src={tournament.state.settings.branding.logoUrl}
                  alt={tournament.state.settings.branding?.leagueName || 'League Logo'}
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
          <TournamentInfoCard tournament={tournament} />
        </div>

        {/* Getting started — collapsible, visible until first player is added */}
        {tournament.state.players.length === 0 && (
          <GettingStartedCard />
        )}

        {/* Live banner — shown when players exist but haven't gone live yet */}
        {tournament.state.players.length > 0 && !dbTournamentId && (
          <LiveBanner onGoLive={() => setActiveTab('qr')} />
        )}

        {/* Tabbed Management Sections */}
        <div className="mb-6 rounded-xl border border-border/40 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="relative">
              <TabsList className="flex w-full overflow-x-auto overflow-y-hidden whitespace-nowrap hide-scrollbar justify-start sm:justify-center rounded-none">
                <TabsTrigger value="players" variant="players" className="flex-shrink-0 min-w-[80px]">Players</TabsTrigger>
                <TabsTrigger value="tables" variant="tables" className="flex-shrink-0 min-w-[80px]">Seating</TabsTrigger>
                <TabsTrigger value="buyins" variant="buy-ins" className="flex-shrink-0 min-w-[80px]">Structure</TabsTrigger>
                <TabsTrigger value="levels" variant="timer" className="flex-shrink-0 min-w-[80px]">Levels</TabsTrigger>
                <TabsTrigger value="league" variant="league" className="flex-shrink-0 min-w-[80px]">League</TabsTrigger>
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
              <div className="flex justify-end mb-3">
                <TournamentTemplatesDialog
                  currentBlindLevels={tournament.state.levels}
                  currentPrizeStructure={tournament.state.prizeStructure || { buyIn: 0 }}
                  onLoadTemplate={(blindLevels, prizeStructure) => {
                    tournament.setBlindLevels(blindLevels);
                    tournament.updatePrizeStructure(prizeStructure);
                  }}
                />
              </div>
              <BuyInSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="levels" className="mt-0 p-4 pt-5">
              <BlindLevelsSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="tables" className="mt-0 p-4 pt-5">
              <TablesSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="league" className="mt-0 p-4 pt-5">
              <LeagueSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="qr" className="mt-0 p-4 pt-5">
              <QRCodeSection tournament={tournament} dbTournamentId={dbTournamentId} onGoLive={setDbTournamentId} />
            </TabsContent>

            <TabsContent value="settings" className="mt-0 p-4 pt-5">
              <SettingsSection tournament={tournament} />
            </TabsContent>
          </Tabs>
        </div>

        <footer className="mt-8 text-center text-muted-foreground text-sm py-4">
          <p>StackMateGo &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}