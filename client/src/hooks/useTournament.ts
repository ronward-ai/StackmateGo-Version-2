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
import { db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { sanitizeForFirestore } from '../lib/utils';

import { useAuth } from './useAuth';

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
const broadcastTournamentState = async (tournamentId: number | string, state: any, ownerId?: string, userId?: string) => {
  if (!tournamentId || ownerId !== userId) return;

  try {
    const docRef = doc(db, 'activeTournaments', tournamentId.toString());
    await updateDoc(docRef, sanitizeForFirestore({
      currentLevel: state.currentLevel,
      secondsLeft: state.secondsLeft,
      targetEndTime: state.targetEndTime || null,
      isRunning: state.isRunning,
      smallBlind: state.levels[state.currentLevel]?.small || 0,
      bigBlind: state.levels[state.currentLevel]?.big || 0,
      ante: state.levels[state.currentLevel]?.ante || 0,
      players: state.players || [],
      blindLevels: state.levels || [],
      settings: state.settings || {},
      notes: state.notes || ''
    }));
  } catch (error) {
    console.error('Failed to broadcast tournament state:', error);
  }
};

// Function to broadcast seating updates specifically
const broadcastSeatingUpdate = async (tournamentId: number | string, players: Player[], ownerId?: string, userId?: string) => {
  if (!tournamentId || ownerId !== userId) return;

  try {
    const docRef = doc(db, 'activeTournaments', tournamentId.toString());
    await updateDoc(docRef, sanitizeForFirestore({ players }));
  } catch (error) {
    console.error('Failed to broadcast seating update:', error);
  }
};

// Function to broadcast tournament details updates
const broadcastTournamentDetails = async (tournamentId: number | string, ownerId?: string, userId?: string) => {
  if (!tournamentId || ownerId !== userId) return;

  try {
    const docRef = doc(db, 'activeTournaments', tournamentId.toString());
    await updateDoc(docRef, { updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Failed to broadcast tournament details:', error);
  }
};

// Function to broadcast participant updates for real-time updates
const broadcastParticipantUpdate = async (tournamentId: number | string) => {
  if (!tournamentId) return;

  try {
    const docRef = doc(db, 'activeTournaments', tournamentId.toString());
    await updateDoc(docRef, { updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Failed to broadcast participant update:', error);
  }
};

export function useTournament(tournamentId?: string) {
  const { user } = useAuth();
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
    details: tournamentId ? {
      type: 'database',
      id: tournamentId
    } : (mergedSettings as any)?.isSeasonTournament ? {
      type: 'season',
      localGameId: `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    } : {
      type: 'standalone'
    }
  };

  // Tournament state
  const [state, setState] = useState<TournamentState>(initialState);

  // Timer interval reference
  const timerIntervalRef = useRef<any>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Load tournament data from database if tournamentId is provided
  useEffect(() => {
    if (tournamentId) {
      const loadTournamentData = async () => {
        try {
          const docRef = doc(db, 'activeTournaments', tournamentId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const tournamentData = docSnap.data();

            // Force reload league data from localStorage for director access
            // This ensures director access sees the current league state
            if (typeof window !== 'undefined') {
              try {
                const savedLeagueData = localStorage.getItem('leaguePlayers');
                if (savedLeagueData) {
                  // Dispatch event to refresh league data across all components
                  window.dispatchEvent(new CustomEvent('leagueDataChanged'));
                }
              } catch (error) {
                console.error('Error reloading league data for director access:', error);
              }
            }

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
                leagueId: tournamentData.leagueId || tournamentData.settings?.leagueId || mergedSettings.leagueId,
                seasonId: tournamentData.seasonId || tournamentData.settings?.seasonId || mergedSettings.seasonId,
                isSeasonTournament: tournamentData.isSeasonTournament ?? tournamentData.settings?.isSeasonTournament ?? mergedSettings.isSeasonTournament,
                tables: {
                  ...mergedSettings.tables,
                  ...tournamentData.settings?.tables
                }
              },
              bestLosingHand: undefined,
              prizeStructure: tournamentData.prizeStructure || loadSavedPrizeStructure(),
              isFinalTable: false,
              details: {
                type: 'database',
                id: tournamentId,
                name: tournamentData.name,
                status: tournamentData.status,
                createdAt: tournamentData.createdAt,
                createdBy: tournamentData.createdBy,
                ownerId: tournamentData.ownerId,
                directorCode: tournamentData.directorCode
              }
            };

            setState(transformedState);
          } else {
            console.error('Failed to load tournament: Document does not exist');
          }
        } catch (error) {
          console.error('Error loading tournament data:', error);
        }
      };

      loadTournamentData();
    }
  }, [tournamentId]);

  // Set up audio on mount
  useEffect(() => {
    // Create audio element
    audioRef.current = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");

    // Clean up on unmount
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Set up Firestore listener for real-time tournament synchronization
  useEffect(() => {
    // Only establish Firestore connection for database tournaments
    if (state.details?.type === 'database' && state.details?.id) {
      const docRef = doc(db, 'activeTournaments', state.details.id.toString());
      
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsConnected(true);
          
          setState(currentState => {
            try {
              // CRITICAL: Protect eliminated players from being restored by sync
              let finalPlayers = currentState.players;

              if (Array.isArray(data.players)) {
                // Compare player states and preserve eliminations
                finalPlayers = data.players.map((incomingPlayer: any) => {
                  const currentPlayer = currentState.players.find(p => p.id === incomingPlayer.id);

                  // If current player is eliminated (isActive === false) and incoming is active,
                  // keep the eliminated state to prevent resurrection
                  if (currentPlayer && currentPlayer.isActive === false && incomingPlayer.isActive !== false) {
                    return currentPlayer; // Keep eliminated state
                  }

                  // If incoming player is eliminated and current is active, allow elimination
                  if (currentPlayer && currentPlayer.isActive !== false && incomingPlayer.isActive === false) {
                    return incomingPlayer; // Allow elimination
                  }

                  // For active players preserve monotonically-increasing local fields
                  // that may not yet have been flushed to Firestore
                  if (currentPlayer && currentPlayer.isActive !== false) {
                    return {
                      ...incomingPlayer,
                      knockouts: Math.max(incomingPlayer.knockouts || 0, currentPlayer.knockouts || 0),
                      rebuys: Math.max(incomingPlayer.rebuys || 0, currentPlayer.rebuys || 0),
                      reEntries: Math.max(incomingPlayer.reEntries || 0, currentPlayer.reEntries || 0),
                      prizeMoney: currentPlayer.prizeMoney || incomingPlayer.prizeMoney || 0,
                    };
                  }
                  return incomingPlayer;
                });

                // Add any players that exist in current but not in incoming (shouldn't happen but safety)
                const incomingPlayerIds = new Set(data.players.map((p: any) => p.id));
                const missingPlayers = currentState.players.filter(p => !incomingPlayerIds.has(p.id));
                finalPlayers = [...finalPlayers, ...missingPlayers];
              }

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

              // Update timer state if provided with validation
              if (typeof data.currentLevel === 'number' && data.currentLevel >= 0) {
                updatedState.currentLevel = data.currentLevel;
              }
              if (typeof data.secondsLeft === 'number' && data.secondsLeft >= 0) {
                updatedState.secondsLeft = data.secondsLeft;
              }
              if (typeof data.isRunning === 'boolean') {
                updatedState.isRunning = data.isRunning;
              }

              return updatedState;
            } catch (error) {
              console.error('Error processing tournament update:', error);
              return currentState;
            }
          });
        } else {
          setIsConnected(false);
        }
      }, (error) => {
        console.error('Firestore subscription error:', error);
        setIsConnected(false);
      });

      return () => {
        unsubscribe();
        setIsConnected(false);
      };
    }
  }, [state.details?.type, state.details?.id]);

  // Listen for tournament sync events (from director actions) with debouncing
  const handleTournamentSync = (event: CustomEvent) => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      if (event.detail?.tournament) {
        const syncedTournament = event.detail.tournament;
        setState(currentState => {
          // Check if this sync actually contains new data
          const hasChanges = (
            syncedTournament.currentLevel !== currentState.currentLevel ||
            syncedTournament.secondsLeft !== currentState.secondsLeft ||
            syncedTournament.isRunning !== currentState.isRunning ||
            JSON.stringify(syncedTournament.players) !== JSON.stringify(currentState.players)
          );

          if (!hasChanges) {
            return currentState;
          }

          // Apply the synced tournament data with the same elimination protection
          const updatedState = {
            ...currentState,
            currentLevel: syncedTournament.currentLevel ?? currentState.currentLevel,
            secondsLeft: syncedTournament.secondsLeft ?? currentState.secondsLeft,
            isRunning: syncedTournament.isRunning ?? currentState.isRunning,
            // Merge settings properly
            settings: {
              ...currentState.settings,
              ...syncedTournament.settings,
              tables: {
                ...currentState.settings.tables,
                ...syncedTournament.settings?.tables
              }
            }
          };

          // Apply elimination protection for players array if present
          if (syncedTournament.players && Array.isArray(syncedTournament.players)) {
            updatedState.players = syncedTournament.players.map(incomingPlayer => {
              const currentPlayer = currentState.players.find(p => p.id === incomingPlayer.id);

              // Protect eliminated players from resurrection during sync
              if (currentPlayer && currentPlayer.isActive === false && incomingPlayer.isActive !== false) {
                return currentPlayer;
              }

              return incomingPlayer;
            });
          }

          return updatedState;
        });
      }
    }, 100); // 100ms debounce
  };

  useEffect(() => {
    window.addEventListener('tournament-sync', handleTournamentSync as EventListener);

    return () => {
      window.removeEventListener('tournament-sync', handleTournamentSync as EventListener);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [state.details?.id, state.details?.type]); // Add type to dependency to prevent unnecessary re-runs

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
          // Only count players who have been explicitly eliminated (isActive === false)
          const eliminatedPlayers = prevState.players.filter(p => p.isActive === false);
          const totalPlayers = prevState.players.length;

          // Tournament is finished when all but one player have been eliminated
          if (eliminatedPlayers.length >= totalPlayers - 1 && totalPlayers > 1) {
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
              // Audio context not available
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
                // Audio context not available
              }
            }

            // If there are more levels
            if (nextLevelIndex < prevState.levels.length) {
              const nextLevel = prevState.levels[nextLevelIndex];

              // Move to next level and reset seconds first
              const newState = {
                ...prevState,
                currentLevel: nextLevelIndex,
                secondsLeft: nextLevel.duration,
                targetEndTime: Date.now() + nextLevel.duration * 1000,
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

                // Use immediate execution after level complete sound
                setTimeout(() => {
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

                  // Speak immediately
                  try {
                    speechSynthesis.speak(utterance);
                  } catch (error) {
                    console.error("Speech synthesis failed:", error);
                  }
                }, 2500); // Reduced delay to 2.5 seconds
              }

              // Broadcast level change for database tournaments (during active play)
              if (prevState.details?.type === 'database' && prevState.details?.id && prevState.isRunning) {
                broadcastTournamentState(prevState.details.id, newState, prevState.details.ownerId, user?.id).catch(error => {
                  console.error('Failed to broadcast tournament state:', error);
                });
              }

              return newState;
            }
            // Tournament is complete
            else {
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
                broadcastTournamentState(prevState.details.id, finalState, prevState.details.ownerId, user?.id).catch(error => {
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
        clearInterval(intervalId);
      };
    }

    // If timer isn't running, just return a no-op cleanup
    return () => {};
  }, [state.isRunning, state.settings.enableSounds, state.settings.enableVoice, user]);

  // Enhanced broadcast function with proper WebSocket communication
  const broadcastTournamentAction = useCallback(async (actionName: string, newState: TournamentState) => {
    // Common action data for all tournament types
    const actionData = {
      currentLevel: newState.currentLevel,
      secondsLeft: newState.secondsLeft,
      targetEndTime: newState.targetEndTime || null,
      isRunning: newState.isRunning,
      players: newState.players,
      blindLevels: newState.levels,
      settings: newState.settings,
      prizeStructure: newState.prizeStructure,
      notes: newState.notes || ''
    };

    // Broadcast to database tournaments via HTTP
    if (newState.details?.type === 'database' && newState.details?.id) {
      try {
        // Use dedicated seating endpoint for seating actions
        if (actionName === 'seating_updated') {
          await broadcastSeatingUpdate(newState.details.id, newState.players, newState.details.ownerId, user?.id);
        }

        // Always broadcast via HTTP for reliable sync (except for seating which uses dedicated endpoint)
        if (actionName !== 'seating_updated') {
          await broadcastTournamentState(newState.details.id, newState, newState.details.ownerId, user?.id);
        }

      } catch (error) {
        console.error('Failed to broadcast database tournament action:', error);
      }
    }
    
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
  }, [user]);

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
        totalInvestment: prev.prizeStructure?.buyIn || 0,
        currentBounty: (prev.prizeStructure?.enableBounties && prev.prizeStructure?.bountyType === 'progressive') ? (prev.prizeStructure?.bountyAmount || 0) : undefined,
        bountyWinnings: 0
      };

      const newState = {
        ...prev,
        players: [...prev.players, newPlayer]
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
      const newState = {
        ...prev,
        players: prev.players.filter(p => p.id !== playerId)
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

      // Count current active players to determine position
      const alreadyPositioned = prev.players.filter(p => p.isActive === false && p.position).length;
      const newPosition = prev.players.length - alreadyPositioned;

      // Calculate points (simplified system)
      const totalPlayers = prev.players.length;
      const points = Math.max(0, (totalPlayers - newPosition + 1) * 10);

      // Calculate prize money if position qualifies
      let prizeMoney = 0;
      if (prev.prizeStructure?.manualPayouts) {
        const payout = prev.prizeStructure.manualPayouts.find(p => p.position === newPosition);
        if (payout && payout.percentage > 0) {
          const buyInAmount = prev.prizeStructure?.buyIn || 0;
          const rebuyAmount = prev.prizeStructure?.rebuyAmount || 0;
          const addonAmount = prev.prizeStructure?.addonAmount || 0;
          const rakePercentage = prev.prizeStructure?.rakePercentage || 0;
          const rakeAmountFixed = prev.prizeStructure?.rakeAmount || 0;
          const rakeType = prev.prizeStructure?.rakeType || 'percentage';
          
          const totalRebuys = prev.players.reduce((sum, p) => sum + (p.rebuys || 0), 0);
          const totalAddons = prev.players.reduce((sum, p) => sum + (p.addons || 0), 0);
          const totalReEntries = prev.players.reduce((sum, p) => sum + (p.reEntries || 0), 0);
          const grossPrizePool = (buyInAmount * prev.players.length) + (rebuyAmount * totalRebuys) + (addonAmount * totalAddons) + (buyInAmount * totalReEntries);

          const reEntryRake = prev.prizeStructure?.reEntryRake ?? true;
          const rebuyRake = prev.prizeStructure?.rebuyRake || false;
          const perEntryRake = rakeType === 'percentage'
            ? Math.floor(buyInAmount * (rakePercentage / 100))
            : rakeAmountFixed;
          const rakeAmount = perEntryRake * prev.players.length
            + (reEntryRake ? totalReEntries * (prev.prizeStructure?.reEntryRakeAmount || perEntryRake) : 0)
            + (rebuyRake ? totalRebuys * (prev.prizeStructure?.rebuyRakeAmount || perEntryRake) : 0);

          const totalPrizePool = Math.max(0, grossPrizePool - rakeAmount);

          prizeMoney = Math.floor((totalPrizePool * payout.percentage) / 100);
        }
      }

      // Add bounty winnings to prize money if bounties are enabled
      if (prev.prizeStructure?.enableBounties && prev.prizeStructure?.bountyAmount) {
        const knockouts = playerToEliminate.knockouts || 0;
        // All eliminated players get bounty winnings for their knockouts
        prizeMoney += knockouts * prev.prizeStructure.bountyAmount;
      }

      // Update the eliminated player's data with comprehensive analytics
      let updatedPlayers = prev.players.map(player =>
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
              eliminationLevel: prev.currentLevel + 1,
              playTime: prev.levels.slice(0, prev.currentLevel + 1)
                .reduce((total, level) => total + level.duration, 0) - prev.secondsLeft
            }
          : player.id === eliminatedById && eliminatedById
            ? { ...player, knockouts: (player.knockouts || 0) + 1 }
            : player
      );

      // Handle PKO logic if enabled
      if (eliminatedById && prev.prizeStructure?.enableBounties && prev.prizeStructure?.bountyType === 'progressive') {
        const eliminatedBounty = playerToEliminate.currentBounty || prev.prizeStructure.bountyAmount || 0;
        const wonAmount = eliminatedBounty / 2;
        
        updatedPlayers = updatedPlayers.map(player => {
          if (player.id === eliminatedById) {
            return {
              ...player,
              bountyWinnings: (player.bountyWinnings || 0) + wonAmount,
              currentBounty: (player.currentBounty || prev.prizeStructure!.bountyAmount || 0) + wonAmount
            };
          }
          return player;
        });
      }

      // Check if only one player remains active and award them 1st place
      const remainingActivePlayers = updatedPlayers.filter(p => p.isActive === true);
      if (remainingActivePlayers.length === 1) {
        const winner = remainingActivePlayers[0];

        // Calculate 1st place prize money
        let firstPlacePrize = 0;
        if (prev.prizeStructure?.manualPayouts) {
          const firstPlacePayout = prev.prizeStructure.manualPayouts.find(p => p.position === 1);
          if (firstPlacePayout && firstPlacePayout.percentage > 0) {
            const buyInAmount = prev.prizeStructure?.buyIn || 0;
            const rebuyAmount = prev.prizeStructure?.rebuyAmount || 0;
            const addonAmount = prev.prizeStructure?.addonAmount || 0;
            const rakePercentage = prev.prizeStructure?.rakePercentage || 0;
            const rakeAmountFixed = prev.prizeStructure?.rakeAmount || 0;
            const rakeType = prev.prizeStructure?.rakeType || 'percentage';
            
            const totalRebuys = prev.players.reduce((sum, p) => sum + (p.rebuys || 0), 0);
            const totalAddons = prev.players.reduce((sum, p) => sum + (p.addons || 0), 0);
            const totalReEntries = prev.players.reduce((sum, p) => sum + (p.reEntries || 0), 0);
            const grossPrizePool = (buyInAmount * prev.players.length) + (rebuyAmount * totalRebuys) + (addonAmount * totalAddons) + (buyInAmount * totalReEntries);

            const reEntryRake = prev.prizeStructure?.reEntryRake ?? true;
            const rebuyRake = prev.prizeStructure?.rebuyRake || false;
            const perEntryRake = rakeType === 'percentage'
              ? Math.floor(buyInAmount * (rakePercentage / 100))
              : rakeAmountFixed;
            const rakeAmount = perEntryRake * prev.players.length
              + (reEntryRake ? totalReEntries * (prev.prizeStructure?.reEntryRakeAmount || perEntryRake) : 0)
              + (rebuyRake ? totalRebuys * (prev.prizeStructure?.rebuyRakeAmount || perEntryRake) : 0);

            const totalPrizePool = Math.max(0, grossPrizePool - rakeAmount);

            firstPlacePrize = Math.floor((totalPrizePool * firstPlacePayout.percentage) / 100);
          }
        }

        // Add bounty winnings if enabled
        if (prev.prizeStructure?.enableBounties && prev.prizeStructure?.bountyAmount) {
          if (prev.prizeStructure?.bountyType === 'progressive') {
            // Winner gets their own current bounty back
            const ownBounty = winner.currentBounty || prev.prizeStructure.bountyAmount || 0;
            // The bountyWinnings already includes the won portions of other players' bounties
            firstPlacePrize += ownBounty;
          } else {
            const knockouts = winner.knockouts || 0;
            // Winner gets their own bounty back plus all their knockout bounties
            firstPlacePrize += (knockouts + 1) * prev.prizeStructure.bountyAmount;
          }
        }

        const finalState = {
          ...prev,
          players: updatedPlayers.map(player =>
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

  // Process a re-entry for an eliminated player
  const processReEntry = useCallback((playerId: string) => {
    setState(prev => {
      const player = prev.players.find(p => p.id === playerId);
      if (!player || player.isActive !== false) {
        return prev;
      }

      if (!prev.prizeStructure?.allowReEntry) {
        return prev;
      }

      // Update player to active status and increment re-entry count
      const updatedPlayers = prev.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              isActive: true, // Reactivate the player
              position: undefined, // Clear elimination position
              eliminatedBy: undefined, // Clear elimination data
              prizeMoney: 0, // Reset prize money
              reEntries: (p.reEntries || 0) + 1, // Increment re-entry count
              seated: false, // They need to be reseated
              tableAssignment: undefined, // Clear table assignment
              currentBounty: prev.prizeStructure?.enableBounties
                ? ((prev.prizeStructure?.reEntryBounty !== false) ? (prev.prizeStructure?.bountyAmount || 0) : 0)
                : undefined
            }
          : p
      );

      const newState = {
        ...prev,
        players: updatedPlayers
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

      // Check if rebuys are allowed and player hasn't exceeded max rebuys
      const maxRebuys = prev.prizeStructure?.maxRebuys || 3;
      const currentRebuys = player.rebuys || 0;

      if (!prev.prizeStructure?.allowRebuys || currentRebuys >= maxRebuys) {
        return prev;
      }

      // Update player to active status and increment rebuy count
      const updatedPlayers = prev.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              isActive: true,
              position: undefined,
              eliminatedBy: undefined,
              prizeMoney: 0,
              rebuys: (p.rebuys || 0) + 1,
              seated: false,
              tableAssignment: undefined,
              currentBounty: prev.prizeStructure?.enableBounties
                ? (prev.prizeStructure?.rebuyBounty ? (prev.prizeStructure?.bountyAmount || 0) : 0)
                : undefined
            }
          : p
      );

      const newState = { ...prev, players: updatedPlayers };
      broadcastTournamentAction('player_rebuy', newState);
      return newState;
    });
  }, [broadcastTournamentAction]);

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

      const newState = { ...prev, players: updatedPlayers };
      broadcastTournamentAction('player_addon', newState);
      return newState;
    });
  }, [broadcastTournamentAction]);

  // Reset entire tournament to initial state
  const resetTournament = useCallback((options?: { keepStructure?: boolean }) => {
    const keepStructure = options?.keepStructure ?? true;

    // Clear any running timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const levels = keepStructure ? state.levels : DEFAULT_LEVELS;
    const prizeStructure = keepStructure ? (state.prizeStructure || loadSavedPrizeStructure()) : { buyIn: 0 };
    const settings = keepStructure ? state.settings : DEFAULT_SETTINGS;
    const isLeagueReset = keepStructure && state.details?.type === 'season';
    const preservedType = isLeagueReset ? 'season' : 'standalone';
    const newLocalGameId = isLeagueReset
      ? `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      : undefined;

    setState({
      levels,
      players: [],
      currentLevel: 0,
      secondsLeft: levels[0]?.duration ?? 0,
      isRunning: false,
      settings,
      bestLosingHand: undefined,
      prizeStructure,
      isFinalTable: false,
      details: { type: preservedType, localGameId: newLocalGameId },
    });
  }, [state.settings, state.prizeStructure, state.details, state.levels]);

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
        if (isSeatingAction) {
          // Use dedicated seating endpoint for immediate sync
          setTimeout(() => {
            broadcastSeatingUpdate(prev.details.id, newPlayers, prev.details.ownerId, user?.id).catch(error => {
              console.error('Failed to broadcast seating update:', error);
            });
          }, 50);
        }
        
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

  // Set all blind levels at once
  const setBlindLevels = useCallback((newLevels: BlindLevel[]) => {
    setState(prev => {
      saveBlindLevels(newLevels);
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
      saveBlindLevels(newLevels);
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

      // Dispatch event for real-time sync
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('settingsUpdated', {
          detail: { settings: newSettings }
        }));
        broadcastTournamentAction('settings_updated', newState);
        if (prev.details?.type === 'database' && prev.details?.id) {
          broadcastTournamentState(prev.details.id, newState, prev.details.ownerId, user?.id)
            .catch(err => console.error('Settings broadcast failed:', err));
        }
      }, 50);

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

      // Broadcast details update to all connected clients (including league/standalone mode changes)
      setTimeout(() => {
        broadcastTournamentAction('tournament_details_updated', newState);
        if (newState.details?.type === 'database' && newState.details?.id) {
          broadcastTournamentState(newState.details.id, newState, newState.details.ownerId, user?.id)
            .catch(err => console.error('Details broadcast failed:', err));
        }
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
        if (newState.details?.type === 'database' && newState.details?.id) {
          broadcastTournamentState(newState.details.id, newState, newState.details.ownerId, user?.id);
        }
      }, 100);
      
      return newState;
    });
  }, [broadcastTournamentAction, user?.id]);

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
          broadcastTournamentState(prev.details.id, newState, prev.details.ownerId, user?.id).catch(error => {
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
      const arr = [...activePlayers];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      const shuffledPlayers = arr;

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
    if (totalPlayers === 0) return { totalPlayers: 0, totalPool: 0, grossPrizePool: 0, rakeAmount: 0, payouts: [], payoutStructure: "none" };

    const buyIn = state.prizeStructure?.buyIn || 10;
    let grossPrizePool = totalPlayers * buyIn;

    // Calculate rebuys, addons, and re-entries with validation
    if (state.prizeStructure?.allowRebuys) {
      const actualRebuys = state.players.reduce((sum, player) => sum + (player.rebuys || 0), 0);
      grossPrizePool += actualRebuys * (state.prizeStructure?.rebuyAmount || buyIn);
    }

    if (state.prizeStructure?.allowReEntry) {
      const actualReEntries = state.players.reduce((sum, player) => sum + (player.reEntries || 0), 0);
      grossPrizePool += actualReEntries * buyIn;
    }

    if (state.prizeStructure?.allowAddons) {
      const actualAddons = state.players.reduce((sum, player) => sum + (player.addons || 0), 0);
      grossPrizePool += actualAddons * (state.prizeStructure?.addonAmount || buyIn);
    }

    // Calculate rake
    const rakePercentage = state.prizeStructure?.rakePercentage || 0;
    const rakeAmount = rakePercentage > 0 
      ? Math.floor(grossPrizePool * (rakePercentage / 100))
      : (state.prizeStructure?.rakeAmount || 0);
      
    const totalPool = Math.max(0, grossPrizePool - rakeAmount);

    // Use manual payouts if configured
    if (state.prizeStructure?.manualPayouts && state.prizeStructure.manualPayouts.length > 0) {
      return {
        totalPlayers,
        totalPool,
        grossPrizePool,
        rakeAmount,
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
        grossPrizePool,
        rakeAmount,
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
        grossPrizePool,
        rakeAmount,
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
  }, [state.players, state.prizeStructure]);

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
    if (!totalSeconds) return 0;
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

    const { small, big } = currentLevel;
    return `${small} / ${big}`;
  }, [state.currentLevel, state.levels, state.players]);

  // Get next level info
  const getNextLevelInfo = useCallback(() => {
    if (state.currentLevel + 1 >= state.levels.length) {
      return "Tournament will be complete";
    }

    const nextLevel = state.levels[state.currentLevel + 1];

    // If next level is a break
    if (nextLevel.isBreak) {
      return `🍺 Break | Duration: ${(nextLevel.duration || 0) / 60} min`;
    }

    return `Small: ${nextLevel.small} | Big: ${nextLevel.big} | Duration: ${(nextLevel.duration || 0) / 60} min`;
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
      const buyInAmount = prev.prizeStructure?.buyIn || 0;
      const rebuyAmount = prev.prizeStructure?.rebuyAmount || 0;
      const addonAmount = prev.prizeStructure?.addonAmount || 0;
      const rakePercentage = prev.prizeStructure?.rakePercentage || 0;
      const rakeAmountFixed = prev.prizeStructure?.rakeAmount || 0;
      const rakeType = prev.prizeStructure?.rakeType || 'percentage';
      
      const totalRebuys = prev.players.reduce((sum, p) => sum + (p.rebuys || 0), 0);
      const totalAddons = prev.players.reduce((sum, p) => sum + (p.addons || 0), 0);
      const totalReEntries = prev.players.reduce((sum, p) => sum + (p.reEntries || 0), 0);
      const grossPrizePool = (buyInAmount * totalPlayers) + (rebuyAmount * totalRebuys) + (addonAmount * totalAddons) + (buyInAmount * totalReEntries);

      const reEntryRake = prev.prizeStructure?.reEntryRake ?? true;
      const rebuyRake = prev.prizeStructure?.rebuyRake || false;
      const perEntryRake = rakeType === 'percentage'
        ? Math.floor(buyInAmount * (rakePercentage / 100))
        : rakeAmountFixed;
      const rakeAmount = perEntryRake * totalPlayers
        + (reEntryRake ? totalReEntries * (prev.prizeStructure?.reEntryRakeAmount || perEntryRake) : 0)
        + (rebuyRake ? totalRebuys * (prev.prizeStructure?.rebuyRakeAmount || perEntryRake) : 0);

      const totalPrizePool = Math.max(0, grossPrizePool - rakeAmount);

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
      const restoredPlayers = prev.players.map(player => {
        if (player.id === playerToRestore.id) {
          return {
            ...player,
            isActive: true,
            position: undefined,
            eliminatedBy: undefined,
            prizeMoney: 0,
            seated: shouldRestoreToSeat,
            tableAssignment: shouldRestoreToSeat ? {
              tableIndex: playerToRestore.seatInfo!.tableIndex,
              seatIndex: playerToRestore.seatInfo!.seatIndex
            } : undefined,
            seatInfo: undefined
          };
        } else if (player.id === playerToRestore.eliminatedBy && player.knockouts > 0) {
          return { ...player, knockouts: player.knockouts - 1 };
        }
        return player;
      });

      // If 2+ players are now active, reset any false winner locked in at position 1
      const activeAfterUndo = restoredPlayers.filter(p => p.isActive !== false).length;
      const finalPlayers = activeAfterUndo >= 2
        ? restoredPlayers.map(p =>
            p.position === 1 && p.isActive === false
              ? { ...p, isActive: true, position: undefined, prizeMoney: 0, eliminatedBy: undefined }
              : p
          )
        : restoredPlayers;

      const newState = { ...prev, players: finalPlayers };

      // Broadcast undo bustout action to all connected clients
      broadcastTournamentAction('undo_bustout', newState);

      return newState;
    });
  }, [broadcastTournamentAction]);

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
          try {
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

            speechSynthesis.cancel();

            setTimeout(() => {
              const utterance = new SpeechSynthesisUtterance(announcement);
              utterance.rate = 0.8;
              utterance.volume = 1.0;
              speechSynthesis.speak(utterance);
            }, 100);
          } catch (error) {
            // Speech synthesis not available
          }
        }, 100);
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

            speechSynthesis.cancel();

            setTimeout(() => {
              const utterance = new SpeechSynthesisUtterance(announcement);
              utterance.rate = 0.8;
              utterance.volume = 1.0;
              speechSynthesis.speak(utterance);
            }, 100);
          } catch (error) {
            // Speech synthesis not available
          }
        }, 100);
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
    updateBestLosingHand,
    clearBestLosingHand,
    skipToNextLevel,
    skipToPreviousLevel,
    updateTimer,

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
    processReEntry,
    processAddon,
    resetTournament,
    shouldPromptForFinalTable,
    goToFinalTable,
    isComplete: (state.players.filter(p => p.isActive === false).length >= state.players.length - 1 && state.players.length > 1) || state.currentLevel >= state.levels.length,

    // Real-time sync status
    isConnected
  };
}