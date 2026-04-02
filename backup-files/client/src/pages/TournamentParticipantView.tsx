import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Trophy, Target } from 'lucide-react';
import PlayerSectionReadOnly from '@/components/PlayerSectionReadOnly';
import TablesSectionReadOnly from '@/components/TablesSectionReadOnly';

interface TournamentData {
  id: string;
  name: string;
  status: string;
  currentLevel: number;
  secondsLeft: number;
  isRunning: boolean;
  players: any[];
  tables: any[];
  buyIn: number;
  blindLevels: any[];
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
  };
  prizeStructure: {
    buyIn: number;
    enableBounties: boolean;
    bountyAmount: number;
    manualPayouts: any[];
  };
}

function TournamentParticipantView() {
  const params = useParams();
  const id = params.tournamentId || params.id;
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [ws, setWs] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const initializeConnection = async () => {
      // Fetch initial tournament data
      const fetchTournament = async () => {
        try {
          console.log('Fetching tournament data for ID:', id);
          const response = await fetch(`/api/tournaments/${id}`);
          console.log('Response status:', response.status);

          if (response.ok) {
            const data = await response.json();
            console.log('Fetched tournament data:', data);

            // Ensure blind levels have proper duration in seconds
            if (data.blindLevels) {
              data.blindLevels = data.blindLevels.map(level => ({
                ...level,
                duration: typeof level.duration === 'number' ? 
                  (level.duration < 100 ? level.duration * 60 : level.duration) : 900
              }));
            }

            setTournament(data);
            setTimeLeft(data.secondsLeft || 0);
            setError(null);
          } else {
            const errorText = await response.text();
            console.error('Failed to fetch tournament:', response.status, errorText);
            setError(`Failed to load tournament: ${response.status}`);
          }
        } catch (error) {
          console.error('Failed to fetch tournament:', error);
          setError(`Network error while loading tournament: ${error.message}`);
        }
      };

      await fetchTournament();

      // Set up Socket.IO connection for real-time updates
      const { io } = await import('socket.io-client');
      const socket = io(window.location.origin, {
        transports: ['websocket', 'polling']
      });

      console.log('Connecting to Socket.IO for tournament updates');

      socket.on('connect', () => {
        console.log('Socket.IO connected to tournament updates');
        setIsConnected(true);

        // Subscribe to tournament updates
        socket.emit('subscribe_tournament', { tournamentId: id });
        socket.emit('join-tournament', id);
      });

      socket.on('tournament_updated', (data) => {
        // Handle different message types
              if (data.tournamentId === id || data.tournamentId === parseInt(id)) {
                console.log('Updating tournament data from Socket.IO');

                if (data.tournament) {
                  setTournament(prev => prev ? { ...prev, ...data.tournament } : data.tournament);
                  if (data.tournament.secondsLeft !== undefined) {
                    setTimeLeft(data.tournament.secondsLeft);
                  }
                } else {
                  // Handle direct data updates including table settings and backgrounds
                  setTournament(prev => {
                    if (!prev) return data;

                    const updated = { ...prev, ...data };

                    // Ensure settings are properly merged, especially table settings and backgrounds
                    if (data.settings) {
                      updated.settings = {
                        ...prev.settings,
                        ...data.settings,
                        tables: {
                          ...prev.settings?.tables,
                          ...data.settings.tables
                        },
                        // Sync table backgrounds
                        tableBackgrounds: data.settings.tableBackgrounds || prev.settings?.tableBackgrounds || []
                      };
                    }

                    return updated;
                  });

                  if (data.secondsLeft !== undefined) {
                    setTimeLeft(data.secondsLeft);
                  }
                }
              }
      });

      socket.on('tournament-update', (data) => {
        console.log('Legacy tournament update received:', data);

        if (data.tournamentId === id || data.tournamentId === parseInt(id)) {
          setTournament(prev => prev ? { ...prev, ...data } : data);
          if (data.secondsLeft !== undefined) {
            setTimeLeft(data.secondsLeft);
          }
        }
      });

      socket.on('disconnect', () => {
        console.log('Socket.IO disconnected from tournament updates');
        setIsConnected(false);
      });

      socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
        setIsConnected(false);
      });

      setWs(socket as any);

      return socket;
    };

    let cleanup: (() => void) | undefined;

    initializeConnection().then(socket => {
      cleanup = () => {
        socket.disconnect();
      };
    });

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [id]);

  // Timer countdown effect - only runs when tournament is running AND synced
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    // Only run timer if tournament is explicitly running and we have time left
    if (tournament?.isRunning && timeLeft > 0) {
      console.log('Participant view timer starting');
      interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            console.log('Participant view timer reached zero');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      console.log('Participant view timer stopped - isRunning:', tournament?.isRunning, 'timeLeft:', timeLeft);
    }

    return () => {
      if (interval) {
        console.log('Clearing participant view timer interval');
        clearInterval(interval);
      }
    };
  }, [tournament?.isRunning, timeLeft]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

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
            <h1 className="text-3xl font-bold text-white tracking-tight">StackMate Go</h1>
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
                  onClick={() => window.location.href = '/'} 
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  Go Home
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading tournament...</p>
              {id && (
                <p className="text-sm text-muted-foreground">Tournament ID: {id}</p>
              )}
              <div className="mt-4">
                <button 
                  onClick={() => window.location.reload()} 
                  className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors text-sm"
                >
                  Refresh Page
                </button>
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

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header Section */}
        <header className="text-center mb-8">
          <div className="inline-block bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 rounded-xl shadow-lg transform hover:scale-105 transition-transform duration-200 mb-6">
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">StackMate Go</h1>
            <div className="text-orange-100 text-sm md:text-base font-medium mt-1">Participant View</div>
          </div>

          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-foreground mb-2">{tournament.name}</h2>
            <div className="flex items-center justify-center gap-4">
              <Badge variant={tournament.status === 'active' ? 'default' : 'secondary'}>
                {tournament.status}
              </Badge>
              <Badge variant={isConnected ? 'default' : 'destructive'} className="text-xs">
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </Badge>
            </div>
          </div>
        </header>

        {/* Main Timer Card */}
        <div className="mb-6">
          <Card className="bg-gradient-to-r from-teal-600/10 to-blue-600/10 border border-teal-500/20 rounded-xl shadow-lg p-4 sm:p-8 flex flex-col items-center">
            <div className="font-mono text-6xl sm:text-8xl md:text-[12rem] lg:text-[16rem] font-bold tracking-tight my-4 sm:my-8 flex-shrink-0" style={{ lineHeight: '0.85' }}>
              {formatTime(timeLeft)}
            </div>

            <div className={`text-xl sm:text-2xl md:text-4xl font-bold mb-3 sm:mb-7 ${
              currentLevel?.isBreak && "text-secondary"
            }`}>
              {(() => {
                const activePlayers = tournament.players?.filter(p => p.isActive !== false) || [];
                const eliminatedPlayers = tournament.players?.filter(p => p.isActive === false) || [];
                if (activePlayers.length === 1 && eliminatedPlayers.length > 0) {
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
            <div className="flex justify-between items-baseline text-muted-foreground text-sm w-full px-1 mb-2 sm:mb-3">
              <div>
                {currentLevel?.isBreak ? "🍺 Break" : 
                 `Level ${tournament.blindLevels ? 
                   tournament.blindLevels.slice(0, tournament.currentLevel + 1).filter(l => !l.isBreak).length : 
                   (tournament.currentLevel || 0) + 1}`}
              </div>

              {/* Next Break Info - Moved to center */}
              {(() => {
                const nextBreakInfo = getNextBreakInfo();
                if (nextBreakInfo && !currentLevel?.isBreak) {
                  return (
                    <div className="text-orange-500 font-medium text-center">
                      Next Break: {nextBreakInfo.timeUntilBreak}
                    </div>
                  );
                }
                return null;
              })()}

              <div className="font-medium">
                {nextLevel ? 
                  (nextLevel.isBreak ? "🍺 Break Time" : `Next: ${nextLevel.smallBlind || nextLevel.small}/${nextLevel.bigBlind || nextLevel.big}`) : 
                  "Tournament Complete"}
              </div>
            </div>
          </Card>
        </div>

        {/* Tournament Info Card */}
        <div className="mb-6">
          <Card className="bg-card/80 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Tournament Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              

              {/* Prize Pool Breakdown */}
              <div className="bg-background bg-opacity-40 rounded-lg p-4">
                <h3 className="text-base font-medium mb-3">Prize Pool Breakdown</h3>
                <div className="text-muted-foreground text-sm space-y-2">
                  <div className="flex justify-between">
                    <span>Buy-in per player:</span>
                    <span>{currencySymbol}{tournament.prizeStructure?.buyIn || tournament.buyIn || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Initial buy-ins ({tournament.players?.length || 0} players):</span>
                    <span>{currencySymbol}{((tournament.prizeStructure?.buyIn || tournament.buyIn || 0) * (tournament.players?.length || 0)).toLocaleString()}</span>
                  </div>

                  {/* Show bounties if enabled */}
                  {tournament.prizeStructure?.enableBounties && tournament.prizeStructure?.bountyAmount > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span>Bounty per knockout:</span>
                        <span>{currencySymbol}{tournament.prizeStructure.bountyAmount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total bounties available:</span>
                        <span>{currencySymbol}{(tournament.prizeStructure.bountyAmount * (tournament.players?.length || 0)).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  {(() => {
                    const totalRebuys = tournament.players?.reduce((sum, player) => sum + (player.rebuys || 0), 0) || 0;
                    const rebuyAmount = tournament.prizeStructure?.rebuyAmount || 0;
                    if (totalRebuys > 0 && rebuyAmount > 0) {
                      return (
                        <>
                          <div className="flex justify-between">
                            <span>Rebuy amount:</span>
                            <span>{currencySymbol}{rebuyAmount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total rebuys ({totalRebuys}):</span>
                            <span>{currencySymbol}{(rebuyAmount * totalRebuys).toLocaleString()}</span>
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                  {(() => {
                    const totalAddons = tournament.players?.reduce((sum, player) => sum + (player.addons || 0), 0) || 0;
                    const addonAmount = tournament.prizeStructure?.addonAmount || 0;
                    if (totalAddons > 0 && addonAmount > 0) {
                      return (
                        <>
                          <div className="flex justify-between">
                            <span>Add-on amount:</span>
                            <span>{currencySymbol}{addonAmount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total add-ons ({totalAddons}):</span>
                            <span>{currencySymbol}{(addonAmount * totalAddons).toLocaleString()}</span>
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}

                  {/* Chip Information */}
                  <div className="border-t border-muted pt-2 mt-2">
                    <div className="flex justify-between">
                      <span>Starting Stack:</span>
                      <span>{(tournament.prizeStructure?.startingChips || 10000).toLocaleString()} chips</span>
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

                  {/* Prize Distribution */}
                  {tournament.prizeStructure?.manualPayouts && tournament.prizeStructure.manualPayouts.length > 0 && (
                    <div className="border-t border-muted mt-3 pt-3">
                      <div className="font-medium mb-2">Prize Distribution (excluding bounties):</div>
                      <div className="space-y-1">
                        {tournament.prizeStructure.manualPayouts.map((payout, index) => {
                          const buyInAmount = tournament.prizeStructure?.buyIn || tournament.buyIn || 0;
                          const rebuyAmount = tournament.prizeStructure?.rebuyAmount || 0;
                          const addonAmount = tournament.prizeStructure?.addonAmount || 0;
                          const totalRebuys = tournament.players?.reduce((sum, player) => sum + (player.rebuys || 0), 0) || 0;
                          const totalAddons = tournament.players?.reduce((sum, player) => sum + (player.addons || 0), 0) || 0;
                          // Exclude bounties from prize distribution calculation
                          const totalPool = ((tournament.players?.length || 0) * buyInAmount) + (rebuyAmount * totalRebuys) + (addonAmount * totalAddons);
                          const prizeAmount = Math.floor((totalPool * payout.percentage) / 100);

                          // Add bounties (only winner gets their own bounty back plus knockouts)
                          let totalBountyBonus = 0;
                          if (tournament.prizeStructure?.enableBounties && tournament.prizeStructure?.bountyAmount > 0) {
                            const winner = tournament.players?.find(p => p.position === index + 1);
                            if (winner) {
                              // Only the winner (1st place) gets their own bounty back plus knockout bounties
                              if (index === 0) { // 1st place
                                totalBountyBonus = tournament.prizeStructure.bountyAmount * ((winner.knockouts || 0) + 1);
                              } else {
                                // All other positions only get knockout bounties
                                totalBountyBonus = tournament.prizeStructure.bountyAmount * (winner.knockouts || 0);
                              }
                            }
                          }

                          return (
                            <div key={index} className="flex justify-between">
                              <span>
                                {index === 0 ? "1st" : index === 1 ? "2nd" : index === 2 ? "3rd" : `${index + 1}th`} Place ({payout.percentage}%):
                              </span>
                              <span>
                                {currencySymbol}{prizeAmount}
                                {totalBountyBonus > 0 && (
                                  <span className="text-yellow-500 ml-1">
                                    +{currencySymbol}{totalBountyBonus}
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Show winner notification */}
                {(() => {
                  const activePlayers = tournament.players?.filter(p => p.isActive !== false) || [];
                  const eliminatedPlayers = tournament.players?.filter(p => p.isActive === false) || [];
                  if (activePlayers.length === 1 && eliminatedPlayers.length > 0) {
                    return (
                      <div className="mt-4 bg-[#2a2a2a] rounded-lg p-4">
                        <h3 className="font-medium text-secondary mb-2">Tournament Winner!</h3>
                        <div className="text-foreground">
                          {activePlayers[0]?.name} is the last player standing!
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Players Section */}
        <div className="mb-6">
          <PlayerSectionReadOnly tournament={tournamentForComponents} />
        </div>

        {/* Tables Section */}
        <div className="mb-6">
          <TablesSectionReadOnly tournament={tournamentForComponents} />
        </div>

        <footer className="mt-8 text-center text-muted-foreground text-sm py-4">
          <p>StackMate Go &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}

export default TournamentParticipantView;