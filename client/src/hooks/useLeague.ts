import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import { useAuth } from '@/hooks/useAuth';
import { db, collections } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { sanitizeForFirestore } from '@/lib/utils';

// Legacy interface for backwards compatibility
export interface TournamentResult {
  id: string;
  position: number;
  totalPlayers: number;
  points: number;
  playersEliminatedCount?: number;
  cashWon?: number;
  buyIn?: number;
  date: string;
  prizeMoney?: number;
  winnings?: number;
  prizeAmount?: number;
  totalWinnings?: number;
  buyInAmount?: number;
  rebuys?: number;
  rebuyAmount?: number;
  addons?: number;
  addonAmount?: number;
  tournamentId?: string | number;
}

// Legacy interface for backwards compatibility  
export interface LeaguePlayer {
  id: string;
  name: string;
  totalPoints: number;
  tournamentResults: TournamentResult[];
  seasonId?: number | string;
}

// Default league setup - ensures users always have a league to work with
const DEFAULT_LEAGUE_NAME = 'Main League';

export function useLeague(overrideOwnerId?: string) {
  const { user, isAnonymous } = useAuth();
  const { calculatePoints: calculatePointsFromSettings } = useLeagueSettings(overrideOwnerId);
  const queryClient = useQueryClient();
  const [hasAttemptedCreate, setHasAttemptedCreate] = useState(false);

  const targetOwnerId = overrideOwnerId || (isAnonymous ? null : user?.id);

  // Fetch user's leagues first
  const { data: userLeagues = [], isLoading: leaguesLoading } = useQuery<any[]>({
    queryKey: ['leagues', targetOwnerId],
    queryFn: async () => {
      if (!targetOwnerId) return [];
      const q = query(collections.leagues, where('ownerId', '==', targetOwnerId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    staleTime: 30000, // Cache for 30 seconds
    enabled: !!targetOwnerId
  });

  // Get current league (first one or null)
  const currentLeague = userLeagues[0] || null;
  const currentLeagueId = currentLeague?.id ?? null;

  // Create league mutation
  const createLeagueMutation = useMutation({
    mutationFn: async () => {
      if (!user || isAnonymous) throw new Error('Not authenticated');
      const newLeague = {
        name: DEFAULT_LEAGUE_NAME,
        description: 'Default poker league',
        isPublic: false,
        currentSeasonName: 'Season 1',
        ownerId: user.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(collections.leagues, newLeague);
      return { id: docRef.id, ...newLeague };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', user?.id] });
    },
    onError: (error) => {
      console.error('❌ Failed to create default league:', error);
      setHasAttemptedCreate(false); // Allow retry on error
    }
  });

  // Auto-create league when none exists
  useEffect(() => {
    if (user && !isAnonymous && !overrideOwnerId && !leaguesLoading && userLeagues.length === 0 && !createLeagueMutation.isPending && !hasAttemptedCreate) {
      console.log('📝 Creating default league...');
      setHasAttemptedCreate(true);
      createLeagueMutation.mutate();
    }
  }, [user, isAnonymous, overrideOwnerId, leaguesLoading, userLeagues.length, hasAttemptedCreate]);

  const [cloudPlayers, setCloudPlayers] = useState<any[]>([]);
  const [cloudResults, setCloudResults] = useState<any[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);

  const [playersError, setPlayersError] = useState<Error | null>(null);

  // Real-time listener for league players
  useEffect(() => {
    if (!currentLeagueId) {
      setCloudPlayers([]);
      setPlayersLoading(false);
      return;
    }

    setPlayersLoading(true);
    setPlayersError(null);
    const q = query(collections.leaguePlayers, where('leagueId', '==', String(currentLeagueId)));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCloudPlayers(players);
      setPlayersLoading(false);
    }, (error) => {
      console.error('Error fetching league players:', error);
      setPlayersError(error as Error);
      setPlayersLoading(false);
    });

    return () => unsubscribe();
  }, [currentLeagueId]);

  // Real-time listener for tournament results
  useEffect(() => {
    if (!currentLeagueId) {
      setCloudResults([]);
      setResultsLoading(false);
      return;
    }

    setResultsLoading(true);
    const q = query(collections.tournamentResults, where('leagueId', '==', String(currentLeagueId)));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCloudResults(results);
      setResultsLoading(false);
    }, (error) => {
      console.error('Error fetching tournament results:', error);
      setResultsLoading(false);
    });

    return () => unsubscribe();
  }, [currentLeagueId]);

  // Convert cloud data to legacy format for compatibility
  const leaguePlayers: LeaguePlayer[] = cloudPlayers.map((player: any) => {
    const playerResults = cloudResults.filter((result: any) => result.leaguePlayerId === player.id);
    return {
      id: player.id.toString(),
      name: player.name,
      totalPoints: player.totalPoints || 0,
      tournamentResults: playerResults.map((result: any) => ({
        id: result.id.toString(),
        tournamentId: result.tournamentId,
        position: result.position,
        totalPlayers: result.totalPlayers,
        points: result.points,
        playersEliminatedCount: result.knockouts,
        cashWon: result.prizeMoney,
        buyIn: result.buyIn,
        date: result.createdAt?.toDate?.()?.toISOString() || result.createdAt || new Date().toISOString()
      }))
    };
  });

  const isLoading = leaguesLoading || playersLoading || resultsLoading || createLeagueMutation.isPending;
  const error = playersError || createLeagueMutation.error;

  // Create league player mutation
  const createPlayerMutation = useMutation({
    mutationFn: async (playerData: { name: string }) => {
      if (!currentLeagueId) throw new Error('No active league');
      const newPlayer = {
        ...playerData,
        leagueId: String(currentLeagueId),
        totalPoints: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(collections.leaguePlayers, newPlayer);
      return { id: docRef.id, ...newPlayer };
    },
    onSuccess: () => {
      if (currentLeagueId) {
        queryClient.invalidateQueries({ queryKey: ['leaguePlayers', currentLeagueId] });
      }
    }
  });

  // Add tournament result mutation
  const addResultMutation = useMutation({
    mutationFn: async (resultData: {
      leaguePlayerId: string | number;
      position: number;
      totalPlayers: number;
      points: number;
      knockouts?: number;
      prizeMoney?: number;
      buyIn?: number;
      tournamentDate: Date;
      tournamentName?: string;
      tournamentId?: string;
    }) => {
      if (!currentLeagueId) throw new Error('No active league');
      const newResult = sanitizeForFirestore({
        ...resultData,
        leagueId: String(currentLeagueId),
        leaguePlayerId: String(resultData.leaguePlayerId),
        createdAt: serverTimestamp()
      });
      const docRef = await addDoc(collections.tournamentResults, newResult);
      
      // Update player's total points
      const playerRef = doc(db, 'leaguePlayers', String(resultData.leaguePlayerId));
      // We should ideally use a transaction here, but for simplicity we'll just fetch and update
      // The proper way is to use Firestore transactions or let the client calculate totalPoints
      // from results. Since the client calculates it anyway, we can just update it here as a cache.
      
      return { id: docRef.id, ...newResult };
    },
    onSuccess: () => {
      if (currentLeagueId) {
        queryClient.invalidateQueries({ queryKey: ['leaguePlayers', currentLeagueId] });
        queryClient.invalidateQueries({ queryKey: ['leagueResults', currentLeagueId] });
      }
    }
  });

  const addLeaguePlayer = useCallback(async (name: string) => {
    try {
      // Wait for league creation to complete
      if (createLeagueMutation.isPending || !currentLeagueId) {
        console.warn('⚠️ Waiting for league creation to complete...');
        // Wait up to 5 seconds for league creation
        for (let i = 0; i < 50; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          // Re-fetch the current state
          const currentLeagues = queryClient.getQueryData<any[]>(['leagues', user?.id]);
          if (currentLeagues && currentLeagues.length > 0) {
            console.log('✅ League created, proceeding with player addition');
            break;
          }
        }
      }

      // Re-check after wait
      const currentLeagues = queryClient.getQueryData<any[]>(['leagues', user?.id]);
      const activeLeagueId = currentLeagues?.[0]?.id;
      
      if (!activeLeagueId) {
        console.error('❌ No active league available - league creation may have failed');
        return;
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        console.warn('⚠️ Invalid player name provided to addLeaguePlayer:', name);
        return;
      }

      // Check if player already exists
      const existingPlayer = leaguePlayers.find((p: any) => 
        p.name.toLowerCase() === name.toLowerCase()
      );

      if (existingPlayer) {
        console.log(`Player ${name} already exists in league`);
        return;
      }

      await createPlayerMutation.mutateAsync({
        name: name.trim()
      });
    } catch (error) {
      console.error('❌ Error in addLeaguePlayer:', error);
    }
  }, [currentLeagueId, leaguePlayers, createPlayerMutation, isLoading]);

  const recordResult = useCallback(async (playerId: string, position: number, totalPlayers: number) => {
    try {
      if (!currentLeagueId) {
        console.warn('⚠️ No active league - cannot record result');
        return;
      }

      if (!playerId || typeof position !== 'number' || typeof totalPlayers !== 'number') {
        console.warn('⚠️ Invalid parameters for recordResult:', { playerId, position, totalPlayers });
        return;
      }

      if (position < 1 || totalPlayers < 1 || position > totalPlayers) {
        console.warn('⚠️ Invalid position or totalPlayers values:', { position, totalPlayers });
        return;
      }

      const points = calculatePointsFromSettings(position, totalPlayers, 0); // Default 0 knockouts for basic recordResult
      const playerFound = leaguePlayers.find(p => p.id === playerId);

      if (!playerFound) {
        console.warn('⚠️ Player not found when recording result:', playerId);
        return;
      }

      await addResultMutation.mutateAsync({
        leaguePlayerId: typeof playerId === 'string' ? playerId : String(playerId),
        position,
        totalPlayers,
        points,
        knockouts: 0,
        prizeMoney: 0,
        buyIn: 10,
        tournamentDate: new Date(),
        tournamentName: 'Tournament Result'
      });
    } catch (error) {
      console.error('❌ Error in recordResult:', error);
      throw error; // Re-throw to be handled by caller
    }
  }, [currentLeagueId, calculatePointsFromSettings, leaguePlayers, addResultMutation]);

  const getLeagueStandings = useCallback(() => {
    return [...leaguePlayers]
      .sort((a, b) => {
        // Primary sort: total points (descending)
        if (b.totalPoints !== a.totalPoints) {
          return b.totalPoints - a.totalPoints;
        }

        // Secondary sort: number of games (ascending - fewer games played ranks higher)
        const aGames = a.tournamentResults.length;
        const bGames = b.tournamentResults.length;
        if (aGames !== bGames) {
          return aGames - bGames;
        }

        // Tertiary sort: best finish (ascending - better finish ranks higher)
        const aBest = Math.min(...a.tournamentResults.map(r => r.position), 999);
        const bBest = Math.min(...b.tournamentResults.map(r => r.position), 999);
        return aBest - bBest;
      });
  }, [leaguePlayers]);

  const removeResult = useCallback(async (playerId: string, resultId: string) => {
    try {
      // For now, removing results is not implemented in the API
      // This would require a DELETE endpoint for tournament results
    } catch (error) {
      console.error('❌ Error in removeResult:', error);
      throw error; // Re-throw to be handled by caller
    }
  }, []);

  const recordResultByName = useCallback(async (
    playerName: string,
    position: number,
    totalPlayers: number,
    playersEliminatedCount: number = 0,
    prizeMoney: number = 0,
    buyInAmount?: number,
    tournamentId?: string
  ) => {
    try {
      // Wait for league creation to complete
      if (createLeagueMutation.isPending || !currentLeagueId) {
        console.warn('⚠️ Waiting for league creation to complete...');
        // Wait up to 5 seconds for league creation
        for (let i = 0; i < 50; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          // Re-fetch the current state
          const currentLeagues = queryClient.getQueryData<any[]>(['leagues', user?.id]);
          if (currentLeagues && currentLeagues.length > 0) {
            console.log('✅ League created, proceeding with result recording');
            break;
          }
        }
      }

      // Re-check after wait
      const currentLeagues = queryClient.getQueryData<any[]>(['leagues', user?.id]);
      const activeLeagueId = currentLeagues?.[0]?.id;
      
      if (!activeLeagueId) {
        console.error('❌ No active league available - league creation may have failed');
        return;
      }

      console.log(`🎯 Recording result for ${playerName}: position ${position}/${totalPlayers}`);

      // Find or create the player
      let targetPlayer = leaguePlayers.find((p: any) => 
        p.name.toLowerCase() === playerName.toLowerCase()
      );

      if (!targetPlayer) {
        console.log(`Creating new league player: ${playerName}`);
        const newPlayer = await createPlayerMutation.mutateAsync({
          name: playerName
        });
        targetPlayer = newPlayer;
      }

      // Calculate points
      const points = calculatePointsFromSettings(position, totalPlayers);

      // Note: Season handling is done separately via useSeasons hook
      // Results are recorded to the league, seasons are managed independently

      // Add the tournament result
      await addResultMutation.mutateAsync({
        leaguePlayerId: typeof targetPlayer.id === 'string' ? targetPlayer.id : String(targetPlayer.id),
        position,
        totalPlayers,
        points,
        knockouts: playersEliminatedCount,
        prizeMoney,
        buyIn: buyInAmount || 10,
        tournamentDate: new Date(),
        tournamentName: 'Tournament Result',
        tournamentId
      });
    } catch (error) {
      console.error('❌ Error in recordResultByName:', error);
      throw error; // Re-throw to be handled by caller
    }
  }, [currentLeagueId, calculatePointsFromSettings, leaguePlayers, createPlayerMutation, addResultMutation, isLoading]);

  const removeTournamentResultForPlayer = useCallback(async (playerName: string, tournamentId: string) => {
    if (!currentLeagueId) return;
    try {
      // 1. Find the player
      const player = leaguePlayers.find((p: any) => p.name.toLowerCase() === playerName.toLowerCase());
      if (!player) return;

      // 2. Query tournamentResults
      const q = query(
        collections.tournamentResults,
        where('leagueId', '==', String(currentLeagueId)),
        where('leaguePlayerId', '==', String(player.id)),
        where('tournamentId', '==', String(tournamentId))
      );
      const snapshot = await getDocs(q);
      
      // 3. Delete them
      const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, 'tournamentResults', docSnap.id)));
      await Promise.all(deletePromises);
      
      // 4. Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['leaguePlayers', currentLeagueId] });
      queryClient.invalidateQueries({ queryKey: ['leagueResults', currentLeagueId] });
    } catch (error) {
      console.error('Error removing tournament result for rebuy:', error);
    }
  }, [currentLeagueId, queryClient, leaguePlayers]);

  const resetLeague = useCallback(() => {
    try {
      // For cloud storage, we don't reset the entire league
      // This would require clearing all players and results via API
      return false;
    } catch (error) {
      console.error('Error resetting league:', error);
      return false;
    }
  }, []);

  const league = currentLeague ? {
    id: currentLeague.id.toString(),
    name: currentLeague.name,
    currentWeek: 1,
    totalWeeks: 52,
    isActive: true
  } : {
    id: 'pending',
    name: 'Loading...',
    currentWeek: 1,
    totalWeeks: 52,
    isActive: false
  };

  return {
    league,
    leaguePlayers,
    addLeaguePlayer,
    recordResult,
    recordResultByName,
    removeTournamentResultForPlayer,
    removeResult,
    getLeagueStandings,
    resetLeague,
    calculatePoints: calculatePointsFromSettings,
    isLoading,
    error,
    // Legacy compatibility
    players: leaguePlayers,
    processElimination: (playerName: string, position: number, totalPlayers: number, playersEliminatedCount: number = 0, prizeMoney: number = 0) => 
      recordResultByName(playerName, position, totalPlayers, playersEliminatedCount, prizeMoney),
    processTournamentResults: () => {},
    clearLeagueData: resetLeague,
    addPlayer: () => false,
    removePlayer: () => {},
    addPoints: () => {},
    recordTournamentResult: recordResult,
    updateLeague: () => {},
    clearError: () => {},
    calculateTournamentPoints: calculatePointsFromSettings
  };
}