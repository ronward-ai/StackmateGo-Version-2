import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  BlindLevel, 
  BestLosingHand, 
  Player, 
  Settings, 
  TournamentState,
  TournamentDetails,
  PrizeStructure
} from '@/types';
import { v4 as uuidv4 } from 'uuid';

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
  enableVoice: false,
  showSeconds: true,
  showNextLevel: true,
  enableRecentPlayers: false,
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
const loadSavedSettings = (): Partial<Settings> => {
  try {
    const saved = localStorage.getItem('tournamentSettings');
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.error('Error loading saved settings:', error);
    return {};
  }
};

// Save settings to localStorage
const saveSettings = (settings: Settings) => {
  try {
    localStorage.setItem('tournamentSettings', JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
};

// Load saved blind levels
const loadSavedBlindLevels = (): BlindLevel[] => {
  try {
    const saved = localStorage.getItem('tournamentBlindLevels');
    return saved ? JSON.parse(saved) : DEFAULT_LEVELS;
  } catch (error) {
    console.error('Error loading saved blind levels:', error);
    return DEFAULT_LEVELS;
  }
};

// Save blind levels
const saveBlindLevels = (levels: BlindLevel[]) => {
  try {
    localStorage.setItem('tournamentBlindLevels', JSON.stringify(levels));
  } catch (error) {
    console.error('Error saving blind levels:', error);
  }
};

// Load saved prize structure
const loadSavedPrizeStructure = (): PrizeStructure => {
  try {
    const saved = localStorage.getItem('tournamentPrizeStructure');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Error loading saved prize structure:', error);
  }

  return {
    buyIn: 10,
    rebuyAmount: 10,
    addonAmount: 0,
    maxRebuys: 3,
    rebuyPeriodLevels: 5,
    allowRebuys: true,
    allowAddons: false,
    startingChips: 10000,
    rebuyChips: 10000,
    addonChips: 10000,
    addonAvailableLevel: 6,
    structure: [
      { position: 1, percentage: 60 },
      { position: 2, percentage: 30 },
      { position: 3, percentage: 10 }
    ]
  };
};

// Save prize structure
const savePrizeStructure = (prizeStructure: PrizeStructure) => {
  try {
    localStorage.setItem('tournamentPrizeStructure', JSON.stringify(prizeStructure));
  } catch (error) {
    console.error('Error saving prize structure:', error);
  }
};

// Function to broadcast tournament state to server for real-time updates
const broadcastTournamentState = async (tournamentId: number | string, state: any) => {
  if (!tournamentId) return;

  try {
    await fetch(`/api/tournaments/${tournamentId}/timer-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentLevel: state.currentLevel, // Send 0-based level index
        secondsLeft: state.secondsLeft,
        isRunning: state.isRunning,
        smallBlind: state.levels[state.currentLevel]?.small || 0,
        bigBlind: state.levels[state.currentLevel]?.big || 0,
        ante: state.levels[state.currentLevel]?.ante || 0,
        players: state.players || [],
        blindLevels: state.levels || [],
        settings: state.settings || {}
      })
    });
  } catch (error) {
    console.error('Failed to broadcast tournament state:', error);
  }
};

// Function to broadcast tournament details updates
const broadcastTournamentDetails = async (tournamentId: number | string) => {
  if (!tournamentId) return;

  try {
    await fetch(`/api/tournaments/${tournamentId}/details-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to broadcast tournament details:', error);
  }
};

// Function to broadcast participant updates for real-time updates
const broadcastParticipantUpdate = async (tournamentId: number) => {
  if (!tournamentId) return;

  try {
    await fetch(`/api/tournaments/${tournamentId}/participant-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to broadcast participant update:', error);
  }
};

export function useTournament() {
  // Load saved settings and merge with defaults
  const savedSettings = loadSavedSettings();
  const mergedSettings = { ...DEFAULT_SETTINGS, ...savedSettings };

  // Create an initial state with saved preferences
  const savedLevels = loadSavedBlindLevels();
  const initialState: TournamentState = {
    levels: savedLevels,
    players: [],
    currentLevel: 0,
    secondsLeft: savedLevels[0]?.duration || 900, // Default to 15 minutes if no levels
    isRunning: false,
    settings: mergedSettings,
    bestLosingHand: undefined,
    prizeStructure: loadSavedPrizeStructure(),
    isFinalTable: false,
    details: {
      type: 'standalone'
    }
  };

  // Tournament state
  const [state, setState] = useState<TournamentState>(initialState);

  // Timer interval reference
  const timerIntervalRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Set up audio on mount
  useEffect(() => {
    // Create audio element
    audioRef.current = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");

    // Clean up on unmount
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Set up WebSocket connection for real-time tournament synchronization
  useEffect(() => {
    // Only establish WebSocket connection for database tournaments
    if (state.details?.type === 'database' && state.details?.id) {
      console.log('🔌 Setting up WebSocket connection for tournament sync');
      
      const initializeSocket = async () => {
        try {
          const { io } = await import('socket.io-client');
          const socket = io(window.location.origin, {
            transports: ['websocket', 'polling']
          });

          socket.on('connect', () => {
            console.log('✅ Tournament hook connected to WebSocket:', socket.id);
            setIsConnected(true);
            
            // Subscribe to tournament updates
            socket.emit('subscribe_tournament', { tournamentId: state.details.id });
            socket.emit('join-tournament', state.details.id);
          });

          socket.on('tournament_updated', (data) => {
            console.log('📡 Tournament hook received update:', data);
            
            // Only process updates for this tournament
            if (data.tournamentId === state.details.id || data.tournamentId === parseInt(state.details.id)) {
              console.log('🔄 Applying tournament update to hook state');
              
              setState(currentState => {
                if (data.tournament) {
                  // Complete tournament state update
                  const updatedState = {
                    ...currentState,
                    ...data.tournament,
                    // Merge complex objects properly
                    players: data.tournament.players || currentState.players,
                    levels: data.tournament.blindLevels || currentState.levels,
                    settings: {
                      ...currentState.settings,
                      ...data.tournament.settings,
                      tables: {
                        ...currentState.settings.tables,
                        ...data.tournament.settings?.tables
                      }
                    }
                  };
                  
                  // Update timer state if provided
                  if (data.tournament.currentLevel !== undefined) {
                    updatedState.currentLevel = data.tournament.currentLevel;
                  }
                  if (data.tournament.secondsLeft !== undefined) {
                    updatedState.secondsLeft = data.tournament.secondsLeft;
                  }
                  if (data.tournament.isRunning !== undefined) {
                    updatedState.isRunning = data.tournament.isRunning;
                  }
                  
                  console.log('✅ Tournament state synchronized from WebSocket');
                  return updatedState;
                } else {
                  // Partial update
                  return {
                    ...currentState,
                    ...data,
                    // Ensure settings are properly merged
                    settings: data.settings ? {
                      ...currentState.settings,
                      ...data.settings,
                      tables: {
                        ...currentState.settings.tables,
                        ...data.settings.tables
                      }
                    } : currentState.settings
                  };
                }
              });
            }
          });

          socket.on('director-action', (data) => {
            console.log('🎯 Director action received in tournament hook:', data);
            
            // Sync tournament state from director actions
            if (data.actionData && data.tournamentId === state.details.id) {
              console.log('🔄 Syncing tournament state from director action');
              
              setState(currentState => ({
                ...currentState,
                ...data.actionData,
                // Merge complex objects properly
                players: data.actionData.players || currentState.players,
                levels: data.actionData.blindLevels || currentState.levels,
                settings: {
                  ...currentState.settings,
                  ...data.actionData.settings,
                  tables: {
                    ...currentState.settings.tables,
                    ...data.actionData.settings?.tables
                  }
                }
              }));
            }
          });

          socket.on('disconnect', () => {
            console.log('❌ Tournament hook WebSocket disconnected');
            setIsConnected(false);
          });

          socket.on('connect_error', (error) => {
            console.error('❌ Tournament hook WebSocket connection error:', error);
            setIsConnected(false);
          });

          socketRef.current = socket;
        } catch (error) {
          console.error('❌ Failed to initialize WebSocket connection:', error);
        }
      };

      initializeSocket();

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }
  }, [state.details?.type, state.details?.id]);

  // Handle timer interval - single comprehensive timer effect
  useEffect(() => {
    console.log("Timer effect running, isRunning:", state.isRunning);

    // Clean up any existing interval
    if (timerIntervalRef.current) {
      console.log("Clearing existing timer interval");
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // If timer should be running, set up a new interval
    if (state.isRunning) {
      console.log("Setting up new timer interval");

      // Create new interval that runs every second
      const intervalId = setInterval(() => {
        console.log("Timer tick");

        setState(prevState => {
          // Check if tournament is complete before processing timer tick
          // Only count players who have been explicitly eliminated (isActive === false)
          const eliminatedPlayers = prevState.players.filter(p => p.isActive === false);
          const totalPlayers = prevState.players.length;

          // Tournament is finished when all but one player have been eliminated
          if (eliminatedPlayers.length >= totalPlayers - 1 && totalPlayers > 1) {
            console.log("🏆 Tournament finished - stopping timer automatically");
            console.log(`🏆 Final results: ${totalPlayers - eliminatedPlayers.length} active player(s) remaining`);
            return {
              ...prevState,
              isRunning: false // Stop the timer when tournament finishes
            };
          }

          const newSecondsLeft = prevState.secondsLeft - 1;

          // 30 second warning alert
          if (newSecondsLeft === 30 && prevState.settings.enableSounds) {
            // Create gentle notification sound similar to level complete but with 2 beeps
            try {
              const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

              const createSoftWarningChime = (frequency: number, startTime: number) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = frequency;
                oscillator.type = 'sine'; // Smooth, pleasant sound
                gainNode.gain.value = 0.25; // Softer volume

                // Gentle fade out
                gainNode.gain.setValueAtTime(0.25, startTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.6);

                oscillator.start(startTime);
                oscillator.stop(startTime + 0.6);
              };

              // Play 2 gentle warning chimes with pleasant tones (E5 twice)
              const now = audioContext.currentTime;
              createSoftWarningChime(659, now); // E5 - first beep
              createSoftWarningChime(659, now + 0.7); // E5 - second beep

            } catch (error) {
              console.log("Audio context failed for 30-second warning");
            }

            if (prevState.settings.enableVoice) {
              setTimeout(() => {
                const utterance = new SpeechSynthesisUtterance('30 seconds remaining');
                utterance.rate = 0.8;
                utterance.volume = 0.7;
                speechSynthesis.speak(utterance);
              }, 1200);
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

            // Broadcast state every 1 second for database tournaments for real-time updates
            // Only sync during active play (when timer is running)
            if (prevState.details?.type === 'database' && prevState.details?.id && prevState.isRunning) {
              broadcastTournamentState(prevState.details.id, newState).catch(error => {
                console.error('Failed to broadcast tournament state:', error);
              });
            }

            return newState;
          } 
          // Current level is complete
          else {
            const nextLevelIndex = prevState.currentLevel + 1;

            // Level completed sound - gentle but noticeable
            if (prevState.settings.enableSounds) {
              try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

                // Create a pleasant completion sound - ascending notes
                const createLevelCompleteChime = (frequency: number, startTime: number) => {
                  const oscillator = audioContext.createOscillator();
                  const gainNode = audioContext.createGain();

                  oscillator.connect(gainNode);
                  gainNode.connect(audioContext.destination);

                  oscillator.frequency.value = frequency;
                  oscillator.type = 'sine'; // Smooth, pleasant sound
                  gainNode.gain.value = 0.4; // Moderate volume

                  // Gentle fade out
                  gainNode.gain.setValueAtTime(0.4, startTime);
                  gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.8);

                  oscillator.start(startTime);
                  oscillator.stop(startTime + 0.8);
                };

                // Play pleasant ascending chimes (C-E-G chord)
                const now = audioContext.currentTime;
                createLevelCompleteChime(523, now); // C5
                createLevelCompleteChime(659, now + 0.3); // E5
                createLevelCompleteChime(784, now + 0.6); // G5

              } catch (error) {
                console.log("Audio context failed for level complete sound");
              }
            }

            // If there are more levels
            if (nextLevelIndex < prevState.levels.length) {
              const nextLevel = prevState.levels[nextLevelIndex];
              console.log("Moving to next level:", nextLevelIndex, "duration:", nextLevel.duration);

              // Move to next level and reset seconds first
              const newState = {
                ...prevState,
                currentLevel: nextLevelIndex,
                secondsLeft: nextLevel.duration,
                isRunning: true // Keep running
              };

              // Schedule voice announcement - use immediate approach
              if (prevState.settings.enableVoice) {
                let announcement = '';

                if (nextLevel.isBreak) {
                  announcement = `Break time. Duration: ${nextLevel.duration / 60} minutes`;
                } else {
                  // Calculate blind level number (excluding breaks)
                  const blindLevelNumber = prevState.levels
                    .slice(0, nextLevelIndex + 1)
                    .filter(level => !level.isBreak)
                    .length;

                  announcement = `Level ${blindLevelNumber}. Small blind ${nextLevel.small}, big blind ${nextLevel.big}`;

                  if (nextLevel.ante && nextLevel.ante > 0) {
                    announcement += `, ante ${nextLevel.ante}`;
                  }
                }

                console.log("📢 Voice announcement prepared:", announcement);

                // Use immediate execution after level complete sound
                setTimeout(() => {
                  console.log("📢 Executing voice announcement:", announcement);

                  // Clear any pending speech
                  if (speechSynthesis.speaking || speechSynthesis.pending) {
                    speechSynthesis.cancel();
                  }

                  // Create and configure utterance
                  const utterance = new SpeechSynthesisUtterance(announcement);
                  utterance.rate = 0.8;
                  utterance.volume = 1.0;
                  utterance.pitch = 1.0;
                  utterance.lang = 'en-US';

                  // Add event handlers for better feedback
                  utterance.onstart = () => console.log("Voice announcement started:", announcement);
                  utterance.onend = () => console.log("Voice announcement completed successfully");
                  utterance.onerror = (event) => {
                    console.log("Voice announcement failed:", event.error);
                  };

                  // Speak immediately
                  try {
                    speechSynthesis.speak(utterance);
                    console.log("🔊 Speech synthesis speak() called");
                  } catch (error) {
                    console.error("❌ Speech synthesis failed:", error);
                  }
                }, 2500); // Reduced delay to 2.5 seconds
              }

              // Broadcast level change for database tournaments (during active play)
              if (prevState.details?.type === 'database' && prevState.details?.id && prevState.isRunning) {
                broadcastTournamentState(prevState.details.id, newState).catch(error => {
                  console.error('Failed to broadcast tournament state:', error);
                });
              }

              return newState;
            } 
            // Tournament is complete
            else {
              console.log("Tournament complete - stopping timer");

              if (prevState.settings.enableVoice) {
                const utterance = new SpeechSynthesisUtterance('Tournament complete');
                utterance.rate = 0.8;
                utterance.volume = 1.0;
                speechSynthesis.speak(utterance);
              }

              // No more levels, stop the timer
              const finalState = {
                ...prevState,
                secondsLeft: 0,
                isRunning: false // Stop the timer
              };

              // Broadcast tournament completion for database tournaments
              if (prevState.details?.type === 'database' && prevState.details?.id) {
                broadcastTournamentState(prevState.details.id, finalState).catch(error => {
                  console.error('Failed to broadcast tournament state:', error);
                });
              }

              return finalState;
            }
          }
        });
      }, 1000);

      // Store the interval ID for cleanup
      timerIntervalRef.current = intervalId;

      // Return cleanup function
      return () => {
        console.log("Cleaning up timer interval");
        clearInterval(intervalId);
      };
    }

    // If timer isn't running, just return a no-op cleanup
    return () => {};
  }, [state.isRunning, state.settings.enableSounds, state.settings.enableVoice]);

  // Enhanced broadcast function for all tournament actions
  const broadcastTournamentAction = useCallback(async (actionName: string, newState: TournamentState) => {
    // Broadcast to database tournaments via WebSocket
    if (newState.details?.type === 'database' && newState.details?.id) {
      try {
        // Broadcast via director-action event for immediate sync
        if (socketRef.current?.connected) {
          socketRef.current.emit('director-action', {
            tournamentId: newState.details.id,
            action: actionName,
            actionData: {
              currentLevel: newState.currentLevel,
              secondsLeft: newState.secondsLeft,
              isRunning: newState.isRunning,
              players: newState.players,
              blindLevels: newState.levels,
              settings: newState.settings,
              prizeStructure: newState.prizeStructure
            }
          });
        }

        // Also broadcast via HTTP for backup sync
        await broadcastTournamentState(newState.details.id, newState);
      } catch (error) {
        console.error('Failed to broadcast tournament action:', error);
      }
    }
  }, []);

  // Start the timer - enhanced version with better logging
  const startTimer = useCallback(() => {
    console.log("Start timer function called");
    setState(prev => {
      console.log("Starting tournament timer - setting isRunning to true");
      const newState = { ...prev, isRunning: true };

      // Broadcast timer start to all connected clients
      broadcastTournamentAction('timer_start', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Pause the timer
  const pauseTimer = useCallback(() => {
    console.log("Pause timer function called");
    setState(prev => {
      const newState = { ...prev, isRunning: false };

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
    setState(prev => ({
      ...prev,
      currentLevel: 0,
      secondsLeft: prev.levels[0].duration,
      isRunning: false
    }));
  }, []);

  // Add player with comprehensive initialization
  const addPlayer = useCallback((name: string) => {
    if (name.trim() === '') return;

    setState(prev => {
      const newState = {
        ...prev,
        players: [
          ...prev.players,
          { 
            id: uuidv4(), 
            name: name.trim(), 
            knockouts: 0, 
            seated: false,
            isActive: true,
            position: undefined,
            prizeMoney: 0,
            rebuys: 0,
            addons: 0,
            totalInvestment: prev.prizeStructure?.buyIn || 0
          }
        ]
      };

      // Broadcast player addition to all connected clients
      broadcastTournamentAction('player_added', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Remove player
  const removePlayer = useCallback((playerId: string) => {
    setState(prev => {
      const newState = {
        ...prev,
        players: prev.players.filter(p => p.id !== playerId)
      };

      // Broadcast player removal to all connected clients
      broadcastTournamentAction('player_removed', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Add knockout
  const addKnockout = useCallback((playerId: string) => {
    setState(prev => ({
      ...prev,
      players: prev.players.map(player => 
        player.id === playerId 
          ? { ...player, knockouts: player.knockouts + 1 } 
          : player
      )
    }));
  }, []);

  // Track player elimination
  const eliminatePlayer = useCallback((playerId: string, eliminatedById: string, seatInfo?: { tableIndex: number; seatIndex: number; totalSeatedPlayers: number }) => {
    console.log('🔥 ELIMINATE PLAYER called for:', playerId, 'by:', eliminatedById);
    setState(prev => {
      // Find the player to eliminate
      const playerToEliminate = prev.players.find(p => p.id === playerId);
      if (!playerToEliminate) {
        console.log('❌ Player to eliminate not found:', playerId);
        return prev;
      }
      console.log('👤 Eliminating player:', playerToEliminate.name, 'isActive before:', playerToEliminate.isActive);

      // Count active players currently (those who haven't been eliminated yet)
      const activePlayers = prev.players.filter(p => p.isActive === true);

      // Position should be the current number of active players
      // Example: 4 active players, eliminate one → they get 4th place
      const newPosition = activePlayers.length;

      // Import the league points calculation formula
      // Points formula: 
      // 1st=n*36, 2nd=n*24, 3rd=n*20, 4th=n*16, 5th=n*12, 6th=n*10, 7th=n*8, 8th=n*6, 
      // 9th-15th=n*2, 16th-20th=n, where n=number of players
      const totalPlayers = prev.players.length;
      let points = 0;

      if (newPosition === 1) points = totalPlayers * 36;
      else if (newPosition === 2) points = totalPlayers * 24;
      else if (newPosition === 3) points = totalPlayers * 20;
      else if (newPosition === 4) points = totalPlayers * 16;
      else if (newPosition === 5) points = totalPlayers * 12;
      else if (newPosition === 6) points = totalPlayers * 10;
      else if (newPosition === 7) points = totalPlayers * 8;
      else if (newPosition === 8) points = totalPlayers * 6;
      else if (newPosition >= 9 && newPosition <= 15) points = totalPlayers * 2;
      else if (newPosition >= 16 && newPosition <= 20) points = totalPlayers;
      else points = 0; // Beyond 20th place

      // Calculate prize money based on position (only for tournament placement, not bounties)
      let prizeMoney = 0;

      // Use manual payouts from prize structure
      if (prev.prizeStructure?.manualPayouts && prev.prizeStructure.manualPayouts.length > 0) {
        const payout = prev.prizeStructure.manualPayouts.find(p => p.position === newPosition);
        if (payout && payout.percentage > 0) {
          const totalPool = prev.players.length * (prev.prizeStructure.buyIn || 0);
          prizeMoney = Math.floor((totalPool * payout.percentage) / 100);
        }
      }

      // Update the eliminated player's data with comprehensive analytics
      const updatedPlayers = prev.players.map(player => 
        player.id === playerId 
          ? { 
              ...player, 
              seated: false,
              tableAssignment: undefined,
              position: newPosition,
              points,
              eliminatedBy: eliminatedById,
              prizeMoney,
              isActive: false,
              seatInfo,
              eliminationLevel: prev.currentLevel + 1, // Track elimination level
              playTime: prev.levels.slice(0, prev.currentLevel + 1)
                .reduce((total, level) => total + level.duration, 0) - prev.secondsLeft
            } 
          : player
      );

      console.log('✅ Player eliminated successfully:', playerToEliminate.name, 'Position:', newPosition);
      console.log('🔍 Tournament status:', updatedPlayers.filter(p => p.isActive !== false).length, 'active players remaining');

      // Check if only one player remains active and award them 1st place
      const remainingActivePlayers = updatedPlayers.filter(p => p.isActive === true);
      if (remainingActivePlayers.length === 1) {
        const winner = remainingActivePlayers[0];

        // Calculate 1st place prize money
        const totalPrizePool = prev.players.length * (prev.prizeStructure?.buyIn || 0);
        let firstPlacePrize = 0;

        if (prev.prizeStructure?.manualPayouts && prev.prizeStructure.manualPayouts.length > 0) {
          const firstPlacePayout = prev.prizeStructure.manualPayouts.find(p => p.position === 1);
          if (firstPlacePayout && firstPlacePayout.percentage > 0) {
            firstPlacePrize = Math.floor((totalPrizePool * firstPlacePayout.percentage) / 100);
          }
        }

        // Add bounty winnings if enabled (knockouts + own bounty back)
        if (prev.prizeStructure?.enableBounties && prev.prizeStructure?.bountyAmount) {
          const knockouts = winner.knockouts || 0;
          // Winner gets their own bounty back (they didn't lose it) plus knockout bounties
          firstPlacePrize += (knockouts + 1) * prev.prizeStructure.bountyAmount;
        }

        // Award the winner 1st place with comprehensive analytics
        const finalPlayers = updatedPlayers.map(player =>
          player.id === winner.id
            ? {
                ...player,
                seated: false,
                tableAssignment: undefined,
                position: 1,
                points: prev.players.length * 36,
                prizeMoney: firstPlacePrize,
                isActive: false,
                eliminationLevel: prev.currentLevel + 1,
                playTime: prev.levels.slice(0, prev.currentLevel + 1)
                  .reduce((total, level) => total + level.duration, 0) - prev.secondsLeft
              }
            : player
        );

        console.log(`🏆 Tournament Winner: ${winner.name} with ${firstPlacePrize} prize money`);

        // Tournament completion notification
        setTimeout(() => {
          if (prev.settings.enableSounds) {
            try {
              const audio = new Audio('/level-complete.mp3');
              audio.volume = 0.8;
              audio.play().catch(() => console.log('Tournament completion sound not available'));
            } catch (error) {
              console.log('Audio playback failed');
            }
          }

          if (prev.settings.enableVoice) {
            try {
              const announcement = `Tournament complete! Winner: ${winner.name}. Congratulations!`;
              const utterance = new SpeechSynthesisUtterance(announcement);
              utterance.rate = 0.8;
              utterance.volume = 1.0;
              speechSynthesis.speak(utterance);
            } catch (error) {
              console.log('Voice announcement failed');
            }
          }

          // Browser notification if permission granted
          if (Notification.permission === 'granted') {
            try {
              new Notification('Tournament Complete!', {
                body: `Winner: ${winner.name}`,
                icon: '/favicon.ico'
              });
            } catch (error) {
              console.log('Browser notification failed');
            }
          }
        }, 500);

        return {
          ...prev,
          players: finalPlayers
        };
      }

      // Broadcast complete tournament state for database tournaments
      if (prev.details?.type === 'database' && prev.details?.id) {
        setTimeout(() => {
          fetch(`/api/tournaments/${prev.details.id}/participant-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }).catch(error => {
            console.error('Failed to broadcast participant update:', error);
          });
        }, 100);
      }

      return {
        ...prev,
        players: updatedPlayers
      };
    });
  }, []);

  // Rebuy functionality
  const processRebuy = useCallback((playerId: string) => {
    console.log('💰 REBUY: Processing rebuy for player:', playerId);
    setState(prev => {
      if (!prev.prizeStructure?.allowRebuys) return prev;

      const player = prev.players.find(p => p.id === playerId);
      if (!player || player.isActive !== false) return prev; // Can only rebuy if eliminated

      console.log('💰 REBUY: Player found:', player.name, 'Current status: eliminated');

      // Check rebuy period (if specified)
      if (prev.prizeStructure.rebuyPeriodLevels && prev.currentLevel >= prev.prizeStructure.rebuyPeriodLevels) {
        console.log('💰 REBUY: Rebuy period has ended');
        return prev; // Rebuy period ended
      }

      // Check max rebuys
      const currentRebuys = player.rebuys || 0;
      if (prev.prizeStructure.maxRebuys && currentRebuys >= prev.prizeStructure.maxRebuys) {
        console.log('💰 REBUY: Max rebuys reached');
        return prev; // Max rebuys reached
      }

      console.log('💰 REBUY: Reactivating player and clearing elimination data');

      const updatedPlayers = prev.players.map(p => 
        p.id === playerId 
          ? {
              ...p,
              isActive: true, // Reactivate player
              seated: false, // Leave unseated so they get a "Seat" button
              tableAssignment: undefined, // Clear table assignment - they need to be manually seated
              position: undefined, // Clear elimination position
              eliminatedBy: undefined, // Clear elimination data
              prizeMoney: 0,
              rebuys: currentRebuys + 1,
              totalInvestment: (p.totalInvestment || (prev.prizeStructure?.buyIn || 0)) + (prev.prizeStructure?.rebuyAmount || 0),
              seatInfo: undefined,
              eliminationLevel: undefined,
              playTime: undefined
            }
          : p
      );

      return {
        ...prev,
        players: updatedPlayers
      };
    });
  }, []);

  // Process addon
  const processAddon = useCallback((playerId: string) => {
    setState(prev => {
      if (!prev.prizeStructure?.allowAddons) return prev;

      const updatedPlayers = prev.players.map(p => 
        p.id === playerId 
          ? {
              ...p,
              addons: (p.addons || 0) + 1,
              totalInvestment: (p.totalInvestment || (prev.prizeStructure?.buyIn || 0)) + (prev.prizeStructure?.addonAmount || 0)
            }
          : p
      );

      return {
        ...prev,
        players: updatedPlayers
      };
    });
  }, []);

  // Reset entire tournament to initial state
  const resetTournament = useCallback(() => {
    // Clear any running timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Preserve current settings instead of resetting to defaults
    const currentSettings = state.settings;
    const currentPrizeStructure = state.prizeStructure;

    // Reset to initial state but preserve settings
    setState({
      levels: loadSavedBlindLevels(),
      players: [],
      currentLevel: 0,
      secondsLeft: loadSavedBlindLevels()[0].duration,
      isRunning: false,
      settings: currentSettings, // Preserve current settings
      bestLosingHand: undefined,
      prizeStructure: currentPrizeStructure || loadSavedPrizeStructure(),
      isFinalTable: false, // Reset final table flag
      details: {
        type: 'standalone'
      }
    });
  }, [state.settings, state.prizeStructure]);

  // Update players with comprehensive validation
  const updatePlayers = (newPlayers: Player[]) => {
    console.log('useTournament: updatePlayers called with', newPlayers.length, 'players');
    console.log('useTournament: updatePlayers called from:');
    console.trace();

    // Track seated players for debugging
    const seatedPlayers = newPlayers.filter(p => p.seated);
    if (seatedPlayers.length > 0) {
      console.log('useTournament: Seated players in update:', seatedPlayers.map(p => `${p.name}(seated:${p.seated}, active:${p.isActive})`));
    }

    // MANUAL SEATING ONLY - No automatic table balancing or player movement
    const previousSeatedPlayers = state.players.filter(p => p.seated);
    const newSeatedPlayers = newPlayers.filter(p => p.seated);

    // Only allow specific manual operations:
    // 1. Initial seating (no players were seated before)
    // 2. Complete re-seating (all players unseated first, then new seating)
    // 3. Player elimination (bust-out)
    // 4. Unseating all players

    if (previousSeatedPlayers.length > 0) {
      // Check if this is a bust-out (players marked as inactive)
      const isBustOut = newPlayers.some(p => 
        previousSeatedPlayers.find(prev => prev.id === p.id && prev.isActive === true) && 
        p.isActive === false
      );

      // Check if this is a complete re-seating (all previous seated players removed first)
      const isCompleteReseating = previousSeatedPlayers.every(prev => 
        !newSeatedPlayers.find(np => np.id === prev.id)
      ) && newSeatedPlayers.length > 0;

      // Check if unseating all players
      const isUnseatingAll = newSeatedPlayers.length === 0;

      // Check if this is a single player table assignment change (manual move)
      const isSinglePlayerMove = previousSeatedPlayers.length === newSeatedPlayers.length &&
        previousSeatedPlayers.every(prev => newSeatedPlayers.find(np => np.id === prev.id)) &&
        newSeatedPlayers.every(np => previousSeatedPlayers.find(prev => prev.id === np.id)) &&
        previousSeatedPlayers.some(prev => {
          const newPlayer = newSeatedPlayers.find(np => np.id === prev.id);
          return newPlayer && (
            prev.tableAssignment?.tableIndex !== newPlayer.tableAssignment?.tableIndex ||
            prev.tableAssignment?.seatIndex !== newPlayer.tableAssignment?.seatIndex
          );
        });

      // Check if this is a single new player being seated (individual seat button)
      const isSinglePlayerAddition = newSeatedPlayers.length === previousSeatedPlayers.length + 1 &&
        previousSeatedPlayers.every(prev => newSeatedPlayers.find(np => np.id === prev.id)) &&
        newSeatedPlayers.filter(np => !previousSeatedPlayers.find(prev => prev.id === np.id)).length === 1;

      // Debug logging
      if (isSinglePlayerMove) {
        console.log('✅ Single player move detected - allowing update');
      }
      if (isSinglePlayerAddition) {
        console.log('✅ Single new player seating detected - allowing update');
      }

      // BLOCK any other type of seating change
      if (!isBustOut && !isCompleteReseating && !isUnseatingAll && !isSinglePlayerMove && !isSinglePlayerAddition) {
        console.log('🚫 MANUAL SEATING ONLY - Automatic table balancing blocked');
        console.log('Previous seated:', previousSeatedPlayers.map(p => p.name));
        console.log('Attempted seating:', newSeatedPlayers.map(p => p.name));
        console.log('Checks: bustOut:', isBustOut, 'reseating:', isCompleteReseating, 'unseating:', isUnseatingAll, 'singleMove:', isSinglePlayerMove, 'singleAddition:', isSinglePlayerAddition);
        return; // Block the update
      }
    }

    // Update state - manual seating operations only
    console.log('✅ Updating player seating - manual operation confirmed');
    setState(prev => {
      const newState = {
        ...prev,
        players: newPlayers
      };

      // Broadcast player update to all connected clients
      broadcastTournamentAction('players_updated', newState);

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
      saveBlindLevels(newLevels);

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
      // Auto-save blind levels
      saveBlindLevels(newLevels);
      return {
        ...prev,
        levels: newLevels
      };
    });
  }, []);

  // Update settings with comprehensive validation and persistence
  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setState(prev => {
      const newSettings = { ...prev.settings, ...updates };
      // Validate and save settings to localStorage
      saveSettings(newSettings);

      const newState = {
        ...prev,
        settings: newSettings
      };

      // Broadcast settings update to all connected clients
      broadcastTournamentAction('settings_updated', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Set tournament details
  const updateTournamentDetails = useCallback((details: Partial<TournamentDetails>) => {
    setState(prev => {
      const newState = {
        ...prev,
        details: {
          type: 'standalone' as const,
          ...prev.details || {},
          ...details
        } as TournamentDetails
      };

      // Broadcast details update to all connected clients
      if (newState.details?.type === 'database' && newState.details?.id) {
        broadcastTournamentAction('tournament_details_updated', newState);
      }

      return newState;
    });
  }, [broadcastTournamentAction]);

  // Enhanced prize structure management with validation
  const updatePrizeStructure = useCallback((prizeStructure: Partial<PrizeStructure>) => {
    setState(prev => {
      const newPrizeStructure = {
        ...prev.prizeStructure || loadSavedPrizeStructure(),
        ...prizeStructure
      };

      // Validate prize structure before saving
      if (newPrizeStructure.buyIn && newPrizeStructure.buyIn > 0) {
        savePrizeStructure(newPrizeStructure);
      }

      const newState = {
        ...prev,
        prizeStructure: newPrizeStructure
      };

      // Broadcast tournament details update for database tournaments
      if (prev.details?.type === 'database' && prev.details?.id) {
        setTimeout(() => {
          broadcastTournamentState(prev.details.id, newState).catch(error => {
            console.error('Failed to broadcast tournament state:', error);
          });
        }, 100);
      }

      return newState;
    });
  }, []);

  // Check if we should prompt for final table
  const shouldPromptForFinalTable = useCallback(() => {
    const activePlayers = state.players.filter(p => p.isActive !== false);
    const eliminatedPlayers = state.players.filter(p => p.isActive === false);
    const seatsPerTable = state.settings.tables?.seatsPerTable || 6;

    // Only trigger final table prompt if:
    // 1. Active players equal seats at one table
    // 2. We haven't already gone to final table
    // 3. At least one player has been eliminated (to avoid triggering on initial seating)
    return activePlayers.length === seatsPerTable && 
           activePlayers.length > 1 && 
           !state.isFinalTable &&
           eliminatedPlayers.length > 0;
  }, [state.players, state.settings.tables, state.isFinalTable]);

  // Set final table mode and reseat players
  const goToFinalTable = useCallback(() => {
    setState(prev => {
      const activePlayers = prev.players.filter(p => p.isActive !== false);
      const seatsPerTable = prev.settings.tables?.seatsPerTable || 6;

      // Randomly assign seats at Table 1 for final table
      const shuffledPlayers = [...activePlayers].sort(() => Math.random() - 0.5);

      const updatedPlayers = prev.players.map(player => {
        const playerIndex = shuffledPlayers.findIndex(p => p.id === player.id);

        if (playerIndex !== -1) {
          // Assign random seat at final table (Table 1)
          return {
            ...player,
            seated: true,
            tableAssignment: {
              tableIndex: 0, // Table 1
              seatIndex: playerIndex
            }
          };
        }

        return player;
      });

      console.log('🏆 Final table created with players:', shuffledPlayers.map(p => p.name));

      return {
        ...prev,
        players: updatedPlayers,
        isFinalTable: true
      };
    });
  }, []);

  // Enhanced prize pool calculation with comprehensive analytics
  const calculatePrizePool = useCallback(() => {
    const totalPlayers = state.players.length;
    if (totalPlayers === 0) return 0;

    const buyIn = state.prizeStructure?.buyIn || 10;
    let totalPool = totalPlayers * buyIn;

    // Calculate rebuys and addons with validation
    if (state.prizeStructure?.allowRebuys) {
      const actualRebuys = state.players.reduce((sum, player) => sum + (player.rebuys || 0), 0);
      totalPool += actualRebuys * (state.prizeStructure?.rebuyAmount || buyIn);
    }

    if (state.prizeStructure?.allowAddons) {
      const actualAddons = state.players.reduce((sum, player) => sum + (player.addons || 0), 0);
      totalPool += actualAddons * (state.prizeStructure?.addonAmount || buyIn);
    }

    // Use manual payouts if configured
    if (state.prizeStructure?.manualPayouts && state.prizeStructure.manualPayouts.length > 0) {
      return {
        totalPlayers,
        totalPool,
        payouts: state.prizeStructure.manualPayouts,
        payoutStructure: "manual"
      };
    }

    // Different payout structure based on number of players
    if (totalPlayers < 13) {
      // Under 13 players: 2 places (60% / 40%)
      return {
        totalPlayers,
        totalPool,
        firstPlace: Math.floor(totalPool * 0.6),
        secondPlace: Math.floor(totalPool * 0.4),
        thirdPlace: 0,
        payouts: [
          { position: 1, amount: Math.floor(totalPool * 0.6) },
          { position: 2, amount: Math.floor(totalPool * 0.4) }
        ],
        payoutStructure: "2-places" // Track which structure we're using
      };
    } else {
      // 13+ players: 3 places (50% / 30% / 20%)
      return {
        totalPlayers,
        totalPool,
        firstPlace: Math.floor(totalPool * 0.5),
        secondPlace: Math.floor(totalPool * 0.3),
        thirdPlace: Math.floor(totalPool * 0.2),
        payouts: [
          { position: 1, amount: Math.floor(totalPool * 0.5) },
          { position: 2, amount: Math.floor(totalPool * 0.3) },
          { position: 3, amount: Math.floor(totalPool * 0.2) }
        ],
        payoutStructure: "3-places" // Track which structure we're using
      };
    }
  }, [state.players.length, state.prizeStructure]);

  // Format time
  const formatTime = useCallback(() => {
    // Ensure secondsLeft is a valid number and not negative
    const validSecondsLeft = Math.max(0, Math.floor(state.secondsLeft || 0));
    
    // Cap at reasonable maximum (99:59) to prevent display issues
    const cappedSeconds = Math.min(validSecondsLeft, 5999); // 99 minutes 59 seconds max
    
    const minutes = Math.floor(cappedSeconds / 60).toString().padStart(2, '0');
    const seconds = (cappedSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [state.secondsLeft]);

  // Calculate level progress percentage
  const calculateProgress = useCallback(() => {
    if (state.currentLevel >= state.levels.length) return 100;

    const totalSeconds = state.levels[state.currentLevel].duration;
    return 100 - (state.secondsLeft / totalSeconds) * 100;
  }, [state.currentLevel, state.levels, state.secondsLeft]);

  // Get current blinds with tournament status validation
  const getCurrentBlinds = useCallback(() => {
    const eliminatedPlayers = state.players.filter(p => p.isActive === false);
    if (eliminatedPlayers.length >= state.players.length - 1 && state.players.length > 1) {
      return "Finished";
    }

    if (state.currentLevel >= state.levels.length) {
      return "Tournament Complete";
    }

    const currentLevel = state.levels[state.currentLevel];

    if (currentLevel.isBreak) {
      return "Break Time";
    }

    const { small, big, ante } = currentLevel;
    let blindText = `Blinds: ${small}/${big}`;
    if (ante && ante > 0) {
      blindText += ` (Ante: ${ante})`;
    }
    return blindText;
  }, [state.currentLevel, state.levels, state.players]);

  // Get next level info
  const getNextLevelInfo = useCallback(() => {
    if (state.currentLevel + 1 >= state.levels.length) {
      return "Tournament will be complete";
    }

    const nextLevel = state.levels[state.currentLevel + 1];

    // If next level is a break
    if (nextLevel.isBreak) {
      return `🍺 Break | Duration: ${nextLevel.duration / 60} min`;
    }

    return `Small: ${nextLevel.small} | Big: ${nextLevel.big} | Duration: ${nextLevel.duration / 60} min`;
  }, [state.currentLevel, state.levels]);

  // Get current level text
  const getCurrentLevelText = useCallback(() => {
    if (state.currentLevel >= state.levels.length) {
      return "Tournament complete";
    }

    const currentLevel = state.levels[state.currentLevel];

    // If this is a break, show it as a break without level number
    if (currentLevel.isBreak) {
      return `🍺 Break`;
    }

    // Calculate the correct blind level number (excluding breaks)
    const blindLevelNumber = state.levels
      .slice(0, state.currentLevel + 1)
      .filter(level => !level.isBreak)
      .length;

    // Count total blind levels (excluding breaks)
    const totalBlindLevels = state.levels.filter(level => !level.isBreak).length;

    return `Level ${blindLevelNumber}/${totalBlindLevels}`;
  }, [state.currentLevel, state.levels]);

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

      // Also adjust the seconds left if we're now on a different level
      const secondsLeft = newCurrentLevel < newLevels.length
        ? newLevels[newCurrentLevel].duration 
        : 0;

      return {
        ...prev,
        levels: newLevels,
        currentLevel: newCurrentLevel,
        secondsLeft: newCurrentLevel !== prev.currentLevel ? secondsLeft : prev.secondsLeft,
        isRunning: newCurrentLevel >= newLevels.length ? false : prev.isRunning
      };
    });
  }, []);

  // Update the best losing hand
  const updateBestLosingHand = useCallback((hand: BestLosingHand) => {
    setState(prev => ({
      ...prev,
      bestLosingHand: hand
    }));
  }, []);

  // Clear the best losing hand
  const clearBestLosingHand = useCallback(() => {
    setState(prev => ({
      ...prev,
      bestLosingHand: undefined
    }));
  }, []);

  // Complete tournament and assign 1st place prize money
  const completeTournament = useCallback(() => {
    setState(prev => {
      // Find the winner (last active player)
      const winner = prev.players.find(p => p.isActive !== false);
      if (!winner) return prev;

      // Calculate 1st place prize money using buy-in settings
      const totalPlayers = prev.players.length;
      const totalPrizePool = (prev.prizeStructure?.buyIn || 0) * totalPlayers;

      let firstPlacePrize = 0;
      if (prev.prizeStructure?.manualPayouts && prev.prizeStructure.manualPayouts.length > 0) {
        const firstPlacePayout = prev.prizeStructure.manualPayouts.find(p => p.position === 1);
        if (firstPlacePayout && firstPlacePayout.percentage > 0) {
          firstPlacePrize = Math.floor((totalPrizePool * firstPlacePayout.percentage) / 100);
        }
      }

      // Add bounty winnings if enabled (knockouts + own bounty back)
      if (prev.prizeStructure?.enableBounties && prev.prizeStructure?.bountyAmount) {
        const knockouts = winner.knockouts || 0;
        // Winner gets their own bounty back (they didn't lose it) plus knockout bounties
        firstPlacePrize += (knockouts + 1) * prev.prizeStructure.bountyAmount;
      }

      // Update the winner with prize money and position 1
      return {
        ...prev,
        players: prev.players.map(player => 
          player.id === winner.id 
            ? { 
                ...player, 
                position: 1, // First place
                points: totalPlayers * 36, // 1st place points
                prizeMoney: firstPlacePrize,
                isActive: false // Mark as inactive so tournament shows as complete
              } 
            : player
        )
      };
    });
  }, []);

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
        // Find the most recently eliminated player (highest position number among eliminated players)
        playerToRestore = eliminatedPlayers.reduce((latest, current) => 
          (current.position || 0) > (latest.position || 0) ? current : latest
        );
      }

      // Check if the player had table assignment information  
      const shouldRestoreToSeat = playerToRestore.seatInfo && 
        playerToRestore.seatInfo.tableIndex !== undefined &&
        playerToRestore.seatInfo.seatIndex !== undefined;

      // Restore the player to active status and remove their elimination data
      // Also decrement knockout count from the eliminating player
      return {
        ...prev,
        players: prev.players.map(player => {
          if (player.id === playerToRestore.id) {
            // Restore the eliminated player with their original table assignment
            return {
              ...player,
              isActive: true,
              position: undefined,
              eliminatedBy: undefined,
              prizeMoney: 0, // Reset prize money as they're back in the game
              seated: shouldRestoreToSeat, // Only seat if they had seat info
              tableAssignment: shouldRestoreToSeat ? {
                tableIndex: playerToRestore.seatInfo!.tableIndex,
                seatIndex: playerToRestore.seatInfo!.seatIndex
              } : undefined,
              seatInfo: undefined // Clear seat info after using it
            };
          } else if (player.id === playerToRestore.eliminatedBy && player.knockouts > 0) {
            // Remove knockout from the eliminating player
            return {
              ...player,
              knockouts: player.knockouts - 1
            };
          }
          return player;
        })
      };
    });
  }, []);

  // Reset all players to active (for testing/fixing rankings)
  const resetAllPlayersToActive = useCallback(() => {
    setState(prev => ({
      ...prev,
      players: prev.players.map(player => ({
        ...player,
        isActive: true,
        position: undefined,
        prizeMoney: 0,
        eliminatedBy: undefined
      }))
    }));
  }, []);

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
        const nextLevelData = prev.levels[nextLevel];

        setTimeout(() => {
          try{
            let announcement = '';

            if (nextLevelData.isBreak) {
              announcement = `Skipped to break time. Duration: ${nextLevelData.duration / 60} minutes`;
            } else {
              // Calculate blind level number (excluding breaks)
              const blindLevelNumber = prev.levels
                .slice(0, nextLevel + 1)
                .filter(level => !level.isBreak)
                .length;

              announcement = `Skipped to Level ${blindLevelNumber}. Small blind ${nextLevelData.small}, big blind ${nextLevelData.big}`;

              if (nextLevelData.ante && nextLevelData.ante > 0) {
                announcement += `, ante ${nextLevelData.ante}`;
              }
            }

            console.log("Skip forward announcement:", announcement);
            speechSynthesis.cancel();

            setTimeout(() => {
              const utterance = new SpeechSynthesisUtterance(announcement);
              utterance.rate = 0.8;
              utterance.volume = 1.0;
              utterance.onstart = () => console.log("✓ Skip forward voice started:", announcement);
              utterance.onend = () => console.log("✓ Skip forward voice completed");
              utterance.onerror = (event) => console.log("✗ Skip forward voice error:", event);
              speechSynthesis.speak(utterance);
            }, 100);
          } catch (error) {
            console.log("Skip forward speech error:", error);
          }
        }, 100);
      }

      return {
        ...prev,
        currentLevel: nextLevel,
        secondsLeft: prev.levels[nextLevel].duration,
        // Keep the timer running if it was running
        isRunning: prev.isRunning
      };
    });
  }, []);

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
        const prevLevelData = prev.levels[prevLevel];

        setTimeout(() => {
          try {
            let announcement = '';

            if (prevLevelData.isBreak) {
              announcement = `Skipped back to break time. Duration: ${prevLevelData.duration / 60} minutes`;
            } else {
              // Calculate blind level number (excluding breaks)
              const blindLevelNumber = prev.levels
                .slice(0, prevLevel + 1)
                .filter(level => !level.isBreak)
                .length;

              announcement = `Skipped back to Level ${blindLevelNumber}. Small blind ${prevLevelData.small}, big blind ${prevLevelData.big}`;

              if (prevLevelData.ante && prevLevelData.ante > 0) {
                announcement += `, ante ${prevLevelData.ante}`;
              }
            }

            console.log("Skip back announcement:", announcement);
            speechSynthesis.cancel();

            setTimeout(() => {
              const utterance = new SpeechSynthesisUtterance(announcement);
              utterance.rate = 0.8;
              utterance.volume = 1.0;
              utterance.onstart = () => console.log("✓ Skip back voice started:", announcement);
              utterance.onend = () => console.log("✓ Skip back voice completed");
              utterance.onerror = (event) => console.log("✗ Skip back voice error:", event);
              speechSynthesis.speak(utterance);
            }, 100);
          } catch (error) {
            console.log("Skip back speech error:", error);
          }
        }, 100);
      }

      return {
        ...prev,
        currentLevel: prevLevel,
        secondsLeft: prev.levels[prevLevel].duration,
        // Keep the timer running if it was running
        isRunning: prev.isRunning
      };
    });
  }, []);

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
    updateSettings,
    updateTournamentDetails,
    updatePrizeStructure,
    removeLevel,
    updateBestLosingHand,
    clearBestLosingHand,
    skipToNextLevel,
    skipToPreviousLevel,

    calculatePrizePool,
    formatTime,
    calculateProgress,
    getCurrentBlinds,
    getNextLevelInfo,
    getCurrentLevelText,
    getRemainingTimeText,
    isBreak,
    completeTournament,
    undoBustOut,
    resetAllPlayersToActive,
    processRebuy,
    processAddon,
    resetTournament,
    shouldPromptForFinalTable,
    goToFinalTable,
    isComplete: (state.players.filter(p => p.isActive === false).length >= state.players.length - 1 && state.players.length > 1) || state.currentLevel >= state.levels.length,
    
    // Real-time sync status
    isConnected,
    socketRef
  };
}