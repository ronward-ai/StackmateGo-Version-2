import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy, Users, Play, Pause, SkipForward, Settings, Volume2, VolumeX, Timer, AlertCircle, Shield, Check, X } from 'lucide-react';
import PlayerSectionReadOnly from '@/components/PlayerSectionReadOnly';
import TablesSectionReadOnly from '@/components/TablesSectionReadOnly';
import RealTimeLeagueTable from '@/components/RealTimeLeagueTable';
import { Button } from '@/components/ui/button'; // Assuming Button component is available
import { useAuth } from '@/hooks/useAuth';
import TournamentOverBanner from '@/components/TournamentOverBanner';

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
  };
  state?: {
    notes?: string;
  };
}

import { Skeleton } from '@/components/ui/skeleton';

function TournamentParticipantView() {
  const params = useParams<{ tournamentId?: string; id?: string }>();
  const [, navigate] = useLocation();
  const id = params.tournamentId || params.id;
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  // Ref so the interval always reads the latest targetEndTime without restarting
  const targetEndTimeRef = useRef<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, isLoading, signInAnonymously } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      signInAnonymously().catch(console.error);
    }
  }, [isAuthenticated, isLoading, signInAnonymously]);

  useEffect(() => {
    if (!id || !isAuthenticated) return;

    const initializeConnection = async () => {
      try {
        const { doc, onSnapshot } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        
        console.log('Connecting to Firebase for tournament updates:', id);
        
        const docRef = doc(db, 'activeTournaments', id.toString());
        
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            console.log('Fetched tournament data from Firebase:', data);
            
            // Ensure blind levels have proper duration in seconds
            if (data.blindLevels) {
              data.blindLevels = data.blindLevels.map((level: any) => ({
                ...level,
                duration: typeof level.duration === 'number' ?
                  (level.duration < 100 ? level.duration * 60 : level.duration) : 900
              }));
            }
            
            setTournament(data as any);
            targetEndTimeRef.current = data.targetEndTime;
            // Only set timeLeft directly when paused — the interval owns it when running
            if (!data.isRunning) {
              setTimeLeft(data.secondsLeft || 0);
            }
            setError(null);
            setIsConnected(true);
            
            // Dispatch events for league data if needed
            if (data.settings?.isSeasonTournament) {
              window.dispatchEvent(new CustomEvent('leagueDataChanged', {
                detail: {
                  source: 'participant-firebase-update',
                  forceUpdate: true
                }
              }));
            }
          } else {
            console.error('Tournament not found in Firebase');
            setError('Tournament not found');
          }
        }, (error) => {
          console.error('Firebase listener error:', error);
          setError(`Network error while loading tournament: ${error.message}`);
        });
        
        return unsubscribe;
        
      } catch (error: any) {
        console.error('Failed to initialize Firebase connection:', error);
        setError(`Failed to initialize connection: ${error.message}`);
        return () => {};
      }
    };

    let cleanup: (() => void) | undefined;

    initializeConnection().then(unsubscribe => {
      cleanup = unsubscribe;
    });

    // Listen for tournament sync events (from director actions)
    const handleTournamentSync = (event: CustomEvent) => {
      console.log('Participant view received tournament sync:', event.detail);
      if (event.detail?.tournament) {
        const syncedTournament = event.detail.tournament;

        // Update tournament state
        setTournament(prev => {
          if (!prev) return syncedTournament;

          return {
            ...prev,
            ...syncedTournament,
            // Ensure settings are properly merged
            settings: {
              ...prev.settings,
              ...syncedTournament.settings,
              tables: {
                ...prev.settings?.tables,
                ...syncedTournament.settings?.tables
              },
              tableBackgrounds: syncedTournament.settings?.tableBackgrounds || prev.settings?.tableBackgrounds || []
            }
          };
        });

        // Update the ref so the interval picks up the new targetEndTime immediately
        if (syncedTournament.targetEndTime !== undefined) {
          targetEndTimeRef.current = syncedTournament.targetEndTime;
        }
        // Only set timeLeft directly when paused — the interval owns it when running
        if (!syncedTournament.isRunning && syncedTournament.secondsLeft !== undefined) {
          setTimeLeft(syncedTournament.secondsLeft);
        }
      }
    };

    window.addEventListener('tournament-sync', handleTournamentSync as EventListener);

    return () => {
      if (cleanup) {
        cleanup();
      }
      window.removeEventListener('tournament-sync', handleTournamentSync as EventListener);
    };
  }, [id]);

  // Timer countdown — single source of truth for timeLeft when running.
  // Uses targetEndTimeRef so it never has a stale closure and doesn't need
  // to restart on every Firestore snapshot.
  useEffect(() => {
    if (!tournament?.isRunning || !tournament?.targetEndTime) return;

    // Snap to correct value immediately when starting/resuming
    setTimeLeft(Math.max(0, Math.ceil((tournament.targetEndTime - Date.now()) / 1000)));

    const interval = setInterval(() => {
      const endTime = targetEndTimeRef.current;
      if (endTime) {
        setTimeLeft(Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));
      }
    }, 1000);

    return () => clearInterval(interval);
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
          <div className="inline-block bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 rounded-xl shadow-lg mb-4">
            <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight">StackMate Go</h1>
          </div>
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
                  onClick={() => navigate('/')}
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

  // Add calculatePrizePool utility function
  const calculatePrizePool = (tournamentData: any) => {
    const totalPlayers = tournamentData.players?.length || 0;
    if (totalPlayers === 0) return { totalPlayers: 0, totalPool: 0, grossPrizePool: 0, rakeAmount: 0, payouts: [], payoutStructure: "none" };

    const buyIn = tournamentData.prizeStructure?.buyIn || tournamentData.buyIn || 10;
    let grossPrizePool = totalPlayers * buyIn;

    // Calculate rebuys, addons, and re-entries with validation
    if (tournamentData.prizeStructure?.allowRebuys) {
      const actualRebuys = tournamentData.players?.reduce((sum: number, player: any) => sum + (player.rebuys || 0), 0) || 0;
      grossPrizePool += actualRebuys * (tournamentData.prizeStructure?.rebuyAmount || buyIn);
    }

    if (tournamentData.prizeStructure?.allowReEntry) {
      const actualReEntries = tournamentData.players?.reduce((sum: number, player: any) => sum + (player.reEntries || 0), 0) || 0;
      grossPrizePool += actualReEntries * buyIn;
    }

    if (tournamentData.prizeStructure?.allowAddons) {
      const actualAddons = tournamentData.players?.reduce((sum: number, player: any) => sum + (player.addons || 0), 0) || 0;
      grossPrizePool += actualAddons * (tournamentData.prizeStructure?.addonAmount || buyIn);
    }

    // Calculate rake
    const rakePercentage = tournamentData.prizeStructure?.rakePercentage || 0;
    const rakeType = tournamentData.prizeStructure?.rakeType || 'percentage';
    const rakeAmountFixed = tournamentData.prizeStructure?.rakeAmount || 0;
    
    const rakeAmount = rakeType === 'percentage' 
      ? Math.floor(grossPrizePool * (rakePercentage / 100))
      : rakeAmountFixed;
      
    const totalPool = Math.max(0, grossPrizePool - rakeAmount);

    return {
      totalPlayers,
      totalPool,
      grossPrizePool,
      rakeAmount,
      rakeType,
      rakePercentage,
      payouts: tournamentData.prizeStructure?.manualPayouts || []
    };
  };

  const prizePoolData = calculatePrizePool(tournament);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white overflow-auto">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-white truncate max-w-[90vw]">{tournament?.name || 'Tournament'}</h1>
            <p className="text-gray-300">Live Tournament View</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Director access button removed as it's no longer password-based */}
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

        {/* Main Timer Card */}
        <div className="mb-6">
          <Card className="bg-gradient-to-r from-teal-600/10 to-blue-600/10 border border-teal-500/20 rounded-xl shadow-lg p-4 sm:p-8 flex flex-col items-center">
            <div className="font-mono text-6xl sm:text-8xl md:text-[12rem] lg:text-[16rem] font-bold tracking-tight my-4 sm:my-8 flex-shrink-0 timer-responsive" style={{ lineHeight: '0.85' }}>
              {formatTime(timeLeft)}
            </div>

            <div className={`text-xl sm:text-2xl md:text-4xl font-bold mb-3 sm:mb-7 ${
              currentLevel?.isBreak && "text-secondary"
            }`}>
              {(() => {
                const players = tournament.players || [];
                // Separate active and eliminated players with explicit checks
                const activePlayers = players.filter(p => p.isActive === true || (p.isActive !== false && !p.position));
                const eliminatedPlayers = players
                  .filter(p => p.isActive === false || p.position)
                  .sort((a, b) => (a.position || 0) - (b.position || 0));
                const totalPlayers = players.length || 0;
                const winner = players.find(p => p.position === 1);

                // Tournament is finished when we have a winner OR enough players have been eliminated
                const tournamentFinished = winner ||
                                         (eliminatedPlayers.length >= totalPlayers - 1 && totalPlayers > 1) ||
                                         (activePlayers.length === 1 && eliminatedPlayers.length > 0);


                if (tournamentFinished) {
                  return "TOURNAMENT FINISHED";
                }
                if (currentLevel?.isBreak) {
                  return "BREAK TIME";
                }
                if (currentLevel) {
                  return `Blinds: ${currentLevel.smallBlind || currentLevel.small}/${currentLevel.bigBlind || currentLevel.big}`;
                }
                return "Loading...";
              })()}
            </div>

            {/* Show ante if present and not on break */}
            {!currentLevel?.isBreak && currentLevel?.ante > 0 && (
              <div className="text-sm sm:text-md font-medium mb-3 sm:mb-7 text-amber-500">
                Ante: {currentLevel.ante}
              </div>
            )}

            {/* Status indicator */}
            <div className="flex justify-center items-center gap-4 mb-4 sm:mb-6">
              <div className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${
                tournament.isRunning
                  ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                  : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
              }`}>
                <div className={`w-2 h-2 rounded-full ${tournament.isRunning ? 'bg-green-500' : 'bg-yellow-500'}`} />
                {tournament.isRunning ? 'RUNNING' : 'PAUSED'}
              </div>
              <Badge variant={isConnected ? 'default' : 'destructive'} className="text-xs">
                {isConnected ? '🟢 Live' : '🔴 Offline'}
              </Badge>
            </div>

            {/* Level Progress Indicator */}
            <div className="w-full h-2.5 mb-3 sm:mb-6 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ${
                  currentLevel?.isBreak ? 'bg-secondary' : 'bg-primary'
                }`}
                style={{
                  width: `${tournament.blindLevels && tournament.currentLevel < tournament.blindLevels.length ?
                    (100 - (timeLeft / (tournament.blindLevels[tournament.currentLevel]?.duration || 900)) * 100) : 0}%`
                }}
              />
            </div>

            {/* Level Info */}
            <div className="flex justify-between items-start text-muted-foreground text-sm w-full px-1 mb-2 sm:mb-3">
              <div className="flex-1 text-left">
                {currentLevel?.isBreak ? "🍺 Break" :
                 `Level ${tournament.blindLevels ?
                   tournament.blindLevels.slice(0, tournament.currentLevel + 1).filter(l => !l.isBreak).length :
                   (tournament.currentLevel || 0) + 1}`}
              </div>

              {/* Next Break Info - Moved to center */}
              <div className="flex flex-col items-center justify-center flex-1">
                {(() => {
                  const nextBreakInfo = getNextBreakInfo();
                  if (nextBreakInfo && !currentLevel?.isBreak) {
                    return (
                      <div className="text-orange-500 font-medium text-center mb-2">
                        Next Break: {nextBreakInfo.timeUntilBreak}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="flex-1 text-right font-medium">
                {nextLevel ?
                  (nextLevel.isBreak ? "🍺 Break Time" : `Next: ${nextLevel.smallBlind || nextLevel.small}/${nextLevel.bigBlind || nextLevel.big}`) :
                  "Tournament Complete"}
              </div>
            </div>
          </Card>
        </div>

        {/* Tournament Info Card */}
        <div className="mb-6">
          <Card className="p-4 bg-gradient-to-r from-purple-600/10 to-pink-600/10 border border-purple-500/20">
            <div className="flex items-center justify-between cursor-pointer">
              <h2 className="text-xl font-semibold flex items-center">
                <span className="material-icons mr-2 text-secondary">info</span>
                Tournament Info
              </h2>
            </div>
            <div className="p-4 pt-0 border-t border-[#2a2a2a]">
              <div>
              {/* Prize Pool Info */}
              <div className="bg-background bg-opacity-40 rounded-lg p-4 mt-4">
                <h3 className="text-xl font-medium mb-3">
                  Total Players: {tournament.players?.length || 0} | Prize Pool: {currencySymbol}{prizePoolData.totalPool}
                </h3>

                {/* Prize Pool Breakdown */}
                <div className="text-muted-foreground text-sm space-y-2">
                  <div className="flex justify-between">
                    <span>Buy-in:</span>
                    <span>{currencySymbol}{tournament.prizeStructure?.buyIn || tournament.buyIn || 0}</span>
                  </div>
                  {tournament.prizeStructure?.enableBounties && tournament.prizeStructure?.bountyAmount > 0 && (
                    <div className="flex justify-between">
                      <span>Bounty per knockout:</span>
                      <span>{currencySymbol}{tournament.prizeStructure.bountyAmount}</span>
                    </div>
                  )}
                  {(() => {
                    const totalRebuys = tournament.players?.reduce((sum, player) => sum + (player.rebuys || 0), 0) || 0;
                    const rebuyAmount = tournament.prizeStructure?.rebuyAmount || 0;
                    if (totalRebuys > 0) {
                      return (
                        <>
                          <div className="flex justify-between">
                            <span>Rebuy amount:</span>
                            <span>{currencySymbol}{rebuyAmount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total rebuys ({totalRebuys}):</span>
                            <span>{currencySymbol}{rebuyAmount * totalRebuys}</span>
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                  {(() => {
                    const totalAddons = tournament.players?.reduce((sum, player) => sum + (player.addons || 0), 0) || 0;
                    const addonAmount = tournament.prizeStructure?.addonAmount || 0;
                    if (totalAddons > 0) {
                      return (
                        <>
                          <div className="flex justify-between">
                            <span>Add-on amount:</span>
                            <span>{currencySymbol}{addonAmount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total add-ons ({totalAddons}):</span>
                            <span>{currencySymbol}{addonAmount * totalAddons}</span>
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                  <div className="border-t border-muted pt-2 mt-2">
                    {(() => {
                      return (
                        <>
                          {prizePoolData.rakeAmount > 0 && (
                            <>
                              <div className="flex justify-between text-muted-foreground">
                                <span>Total Collected:</span>
                                <span>{currencySymbol}{prizePoolData.grossPrizePool}</span>
                              </div>
                              <div className="flex justify-between text-muted-foreground">
                                <span>Tournament Fee / Rake {prizePoolData.rakeType === 'percentage' ? `(${prizePoolData.rakePercentage}%)` : ''}:</span>
                                <span>-{currencySymbol}{prizePoolData.rakeAmount}</span>
                              </div>
                            </>
                          )}
                          <div className="flex justify-between font-medium mt-1">
                            <span>Net Prize Pool:</span>
                            <span>{currencySymbol}{prizePoolData.totalPool}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {tournament.prizeStructure?.manualPayouts && tournament.prizeStructure.manualPayouts.length > 0 && (
                    <div className="border-t border-muted mt-3 pt-3">
                      <div className="font-medium mb-2">
                        Prize Distribution{tournament.prizeStructure?.enableBounties ? ' (excluding bounties)' : ''}:
                      </div>
                      <div className="space-y-1">
                        {tournament.prizeStructure.manualPayouts.map((payout, index) => {
                          return (
                            <div key={index} className="flex justify-between">
                              <span>
                                {index === 0 ? "1st" : index === 1 ? "2nd" : index === 2 ? "3rd" : `${index + 1}th`} Place ({payout.percentage}%):
                              </span>
                              <span>{currencySymbol}{Math.floor((prizePoolData.totalPool * payout.percentage) / 100)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Rebuy Information - Show when enabled */}
                  {tournament.prizeStructure?.allowRebuys && (
                    <div className="border-t border-muted mt-3 pt-3">
                      <div className="font-medium mb-2">
                        Rebuy Information:
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Rebuy Period:</span>
                          <span>First {tournament.prizeStructure.rebuyPeriodLevels || 3} levels</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rebuy Cost:</span>
                          <span>{currencySymbol}{tournament.prizeStructure.rebuyAmount || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rebuy Chips:</span>
                          <span>{(tournament.prizeStructure.rebuyChips || 10000).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Max Rebuys:</span>
                          <span>{tournament.prizeStructure.maxRebuys || 'Unlimited'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rebuys Used:</span>
                          <span>{tournament.players?.reduce((sum, player) => sum + (player.rebuys || 0), 0) || 0}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Add-on Information - Show when enabled */}
                  {tournament.prizeStructure?.allowAddons && (
                    <div className="border-t border-muted mt-3 pt-3">
                      <div className="font-medium mb-2">
                        Add-on Information:
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Available from Level:</span>
                          <span>{tournament.prizeStructure.addonAvailableLevel || 6}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Add-on Cost:</span>
                          <span>{currencySymbol}{tournament.prizeStructure.addonAmount || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Add-on Chips:</span>
                          <span>{(tournament.prizeStructure.addonChips || 10000).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Add-ons Used:</span>
                          <span>{tournament.players?.reduce((sum, player) => sum + (player.addons || 0), 0) || 0}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chip Information */}
                  <div className="border-t border-muted mt-3 pt-3">
                    <div className="flex justify-between">
                      <span>Starting Stack:</span>
                      <span>{(tournament.prizeStructure?.startingChips || 10000).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Chips:</span>
                      <span>
                        {(() => {
                          const startingChips = tournament.prizeStructure?.startingChips || 10000;
                          const totalRebuys = tournament.players?.reduce((sum, player) => sum + (player.rebuys || 0), 0) || 0;
                          const totalAddons = tournament.players?.reduce((sum, player) => sum + (player.addons || 0), 0) || 0;
                          const rebuyChips = tournament.prizeStructure?.rebuyChips || startingChips;
                          const addonChips = tournament.prizeStructure?.addonChips || startingChips;

                          const totalChips = (startingChips * (tournament.players?.length || 0)) + (rebuyChips * totalRebuys) + (addonChips * totalAddons);
                          return totalChips.toLocaleString();
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Stack:</span>
                      <span>
                        {(() => {
                          const startingChips = tournament.prizeStructure?.startingChips || 10000;
                          const totalRebuys = tournament.players?.reduce((sum, player) => sum + (player.rebuys || 0), 0) || 0;
                          const totalAddons = tournament.players?.reduce((sum, player) => sum + (player.addons || 0), 0) || 0;
                          const rebuyChips = tournament.prizeStructure?.rebuyChips || startingChips;
                          const addonChips = tournament.prizeStructure?.addonChips || startingChips;

                          const totalChips = (startingChips * (tournament.players?.length || 0)) + (rebuyChips * totalRebuys) + (addonChips * totalAddons);
                          const activePlayers = tournament.players?.filter(p => p.isActive !== false).length || 0;
                          const avgStack = activePlayers > 0 ? Math.floor(totalChips / activePlayers) : 0;
                          return avgStack.toLocaleString();
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Show winner notification when tournament is complete */}
                {(() => {
                  const totalPlayers = tournament.players?.length || 0;
                  const eliminatedPlayers = tournament.players?.filter(p => p.isActive === false) || [];
                  const winner = tournament.players?.find(p => p.position === 1);
                  const actuallyActivePlayers = tournament.players?.filter(p => p.isActive === true || (p.isActive !== false && !p.position)) || [];

                  // Tournament is finished when we have a winner OR enough eliminations have occurred
                  const tournamentFinished = winner ||
                                           (eliminatedPlayers.length >= totalPlayers - 1 && totalPlayers > 1) ||
                                           (actuallyActivePlayers.length === 1 && eliminatedPlayers.length > 0);

                  if (tournamentFinished) {
                    const winnerName = winner?.name || actuallyActivePlayers[0]?.name || 'Champion';
                    return (
                      <div className="mt-4 bg-[#2a2a2a] rounded-lg p-4">
                        <h3 className="font-medium text-secondary mb-2">Tournament Winner!</h3>
                        <div className="text-foreground">
                          {winnerName} is the champion!
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              </div>
            </div>
          </Card>
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

        {/* Real-Time League Table */}
        <div className="mb-6">
          <RealTimeLeagueTable tournament={{
            ...tournament,
            isSeasonTournament: tournament?.isSeasonTournament || tournament?.settings?.isSeasonTournament || false,
            settings: {
              ...tournament?.settings,
              isSeasonTournament: tournament?.isSeasonTournament || tournament?.settings?.isSeasonTournament || false
            }
          }} isParticipantView={true} />
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
                <Card className="p-4 bg-gradient-to-r from-yellow-600/10 to-orange-600/10 border border-yellow-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-semibold flex items-center">
                      <span className="material-icons mr-2 text-yellow-500">note</span>
                      Tournament Notes
                    </h2>
                  </div>
                  <div className="p-4 pt-0 border-t border-[#2a2a2a]">
                    <div className="bg-background bg-opacity-40 rounded-lg p-4">
                      <div className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                        {notes}
                      </div>
                    </div>
                  </div>
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
    </div>
  );
}

export default TournamentParticipantView;