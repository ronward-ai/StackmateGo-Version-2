import { useState, useEffect, useRef } from 'react';
import { useTournament } from '@/hooks/useTournament';
import { useLeague } from '@/hooks/useLeague';
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
  const { recordResultByName, addLeaguePlayer, removeTournamentResultForPlayer } = useLeague();
  const { user, isAnonymous } = useAuth();
  const [processedEliminations, setProcessedEliminations] = useState(new Set<string>());
  const [activeTab, setActiveTab] = useState('players'); // State to manage active tab
  const [dbTournamentId, setDbTournamentId] = useState<string | null>(tournamentId || null);
  const isCreatingTournament = useRef(false);
  const tournamentRef = useRef(tournament);
  tournamentRef.current = tournament;

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

  // Create database tournament when logged in (for director handoff feature).
  // Deps intentionally exclude tournament.state — we only want this to run on
  // login/logout, not on every timer tick. tournamentRef gives us current values
  // without adding state to the dependency array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user || isAnonymous || dbTournamentId || isCreatingTournament.current) return;

    const createDatabaseTournament = async () => {
      isCreatingTournament.current = true;
      try {
        const t = tournamentRef.current;
        const tournamentName = t.state.details?.type === 'season'
          ? `League Game - ${new Date().toLocaleDateString()}`
          : t.state.details?.name || `Tournament - ${new Date().toLocaleDateString()}`;

        const { collection, addDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const { sanitizeForFirestore } = await import('@/lib/utils');

        const participantCode = Math.random().toString(36).substr(2, 6).toUpperCase();
        const directorCode = Math.random().toString(36).substr(2, 6).toUpperCase();

        const docRef = await addDoc(collection(db, 'activeTournaments'), sanitizeForFirestore({
          name: tournamentName,
          currentLevel: t.state.currentLevel,
          secondsLeft: t.state.secondsLeft,
          isRunning: t.state.isRunning,
          buyIn: t.state.prizeStructure?.buyIn || 10,
          blindLevels: t.state.levels,
          settings: t.state.settings,
          prizeStructure: t.state.prizeStructure,
          players: t.state.players,
          participantCode,
          directorCode,
          createdAt: new Date().toISOString(),
          createdBy: user.id,
          ownerId: user.id,
          status: 'active'
        }));

        setDbTournamentId(docRef.id);
        t.updateTournamentDetails({
          type: 'database',
          id: docRef.id,
          name: tournamentName,
          participantCode,
          directorCode
        });
      } catch (error) {
        console.error('Failed to create database tournament:', error);
        isCreatingTournament.current = false;
      }
    };

    createDatabaseTournament();
  }, [user, isAnonymous, dbTournamentId]);

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
  }, [tournament]);

  // Auto-record eliminated players to league when season mode is enabled
  useEffect(() => {
    // Wrap the entire effect in a try-catch to prevent crashes
    try {
      const isSeasonTournament = tournament?.state?.details?.type === 'season';

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
              console.warn('Invalid player data, skipping:', player);
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
              tournament.state.details?.id
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
      // Don't let this crash the app - continue running
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
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header Section */}
        <header className="text-center">
          {/* Main StackMate Go Logo + User Menu */}
          <div className="mb-8 relative">
            <img
              src="/stackmatelogo.svg"
              alt="StackMate Go"
              className="h-16 md:h-19 w-auto object-contain mx-auto"
              style={{ filter: 'brightness(1.1)' }}
              onError={(e) => {
                console.error('Failed to load logo:', e);
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
            <div className="absolute top-0 right-0">
              <UserMenu />
            </div>
          </div>

          {/* Event Branding - Clean Minimal Style */}
          {tournament.state.settings.branding?.isVisible && (tournament.state.settings.branding?.leagueName || tournament.state.settings.branding?.logoUrl) && (
            <div className="mb-6">
              <div className="flex items-center justify-center gap-6">
                {tournament.state.settings.branding?.logoUrl && (
                  <img
                    src={tournament.state.settings.branding.logoUrl}
                    alt={tournament.state.settings.branding?.leagueName || 'League Logo'}
                    className="h-16 md:h-20 w-auto object-contain"
                  />
                )}
                {tournament.state.settings.branding?.leagueName && (
                  <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-wide truncate max-w-[60vw]">
                    {tournament.state.settings.branding.leagueName}
                  </h2>
                )}
                {tournament.state.settings.branding?.logoUrl && (
                  <img
                    src={tournament.state.settings.branding.logoUrl}
                    alt={tournament.state.settings.branding?.leagueName || 'League Logo'}
                    className="h-16 md:h-20 w-auto object-contain"
                  />
                )}
              </div>
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

        {/* Tabbed Management Sections */}
        <div className="mb-6">
          <div className="flex justify-end mb-4">
            <TournamentTemplatesDialog 
              currentBlindLevels={tournament.state.levels}
              currentPrizeStructure={tournament.state.prizeStructure || { buyIn: 0 }}
              onLoadTemplate={(blindLevels, prizeStructure) => {
                tournament.setBlindLevels(blindLevels);
                tournament.updatePrizeStructure(prizeStructure);
              }}
            />
          </div>
          <Tabs defaultValue="players" className="w-full">
            <TabsList className="flex w-full overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-hide justify-start sm:justify-center">
              <TabsTrigger value="players" variant="players" className="flex-shrink-0 min-w-[80px]">Players</TabsTrigger>
              <TabsTrigger value="tables" variant="tables" className="flex-shrink-0 min-w-[80px]">Tables</TabsTrigger>
              <TabsTrigger value="levels" variant="timer" className="flex-shrink-0 min-w-[80px]">Levels</TabsTrigger>
              <TabsTrigger value="buyins" variant="buy-ins" className="flex-shrink-0 min-w-[80px]">Structure</TabsTrigger>
              <TabsTrigger value="league" variant="league" className="flex-shrink-0 min-w-[80px]">League</TabsTrigger>
              <TabsTrigger value="qr" variant="timer" className="flex-shrink-0 min-w-[80px]">Access</TabsTrigger>
              <TabsTrigger value="settings" variant="settings" className="flex-shrink-0 min-w-[80px]">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="players" className="mt-6">
              <PlayerSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="tables" className="mt-6">
              <TablesSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="levels" className="mt-6">
              <BlindLevelsSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="buyins" className="mt-6">
              <BuyInSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="league" className="mt-6">
              <LeagueSection tournament={tournament} />
            </TabsContent>

            <TabsContent value="qr" className="mt-6">
              <QRCodeSection tournament={tournament} dbTournamentId={dbTournamentId} />
            </TabsContent>

            <TabsContent value="settings" className="mt-6">
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