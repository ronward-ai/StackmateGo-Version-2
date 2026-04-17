import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import { useAuth } from '@/hooks/useAuth';
import { db, collections } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, writeBatch } from 'firebase/firestore';
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
  tournamentDate?: { seconds: number; nanoseconds: number } | number | null;
  seasonId?: string | null;
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

export function useLeague(overrideOwnerId?: string, directLeagueId?: string | null) {
  const { user, isAnonymous, isAuthenticated: isUserAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [hasAttemptedCreate, setHasAttemptedCreate] = useState(false);

  // Active season ID - set externally via setActiveSeasonId
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);

  const targetOwnerId = overrideOwnerId || (isAnonymous ? null : user?.id);

  // Persist the user's chosen league across sessions. All useLeague instances
  // stay in sync via a same-tab custom event — without this, switching leagues
  // in one component (e.g. the header dropdown) wouldn't update tables mounted
  // elsewhere that hold their own useState copy.
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(() => {
    try { return localStorage.getItem('activeLeagueId'); } catch { return null; }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail ?? null;
      setSelectedLeagueId(id);
    };
    window.addEventListener('leagueSwitched', handler);
    return () => window.removeEventListener('leagueSwitched', handler);
  }, []);

  const switchLeague = useCallback((id: string) => {
    setSelectedLeagueId(id);
    try { localStorage.setItem('activeLeagueId', id); } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('leagueSwitched', { detail: id }));
    }
  }, []);

  // Fetch user's leagues — wait for Firebase auth to complete before querying.
  // Anonymous participants must be signed in before Firestore rules allow reads.
  // Skip entirely when a directLeagueId is provided (participant view shortcut).
  const { data: userLeagues = [], isLoading: leaguesLoading } = useQuery<any[]>({
    queryKey: ['leagues', targetOwnerId],
    queryFn: async () => {
      if (!targetOwnerId) return [];
      const q = query(collections.leagues, where('ownerId', '==', targetOwnerId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    staleTime: 30000, // Cache for 30 seconds
    enabled: !!targetOwnerId && isUserAuthenticated && !directLeagueId
  });

  // When a direct league ID is given (participant view), use it immediately —
  // no auth check needed since leaguePlayers and tournamentResults are publicly readable.
  const currentLeague = directLeagueId
    ? { id: directLeagueId, name: 'League' }
    : (userLeagues.find((l: any) => l.id === selectedLeagueId) || userLeagues[0] || null);
  const currentLeagueId = currentLeague?.id ?? null;

  // Points calculation uses per-league settings
  const { calculatePoints: calculatePointsFromSettings } = useLeagueSettings(
    overrideOwnerId,
    currentLeagueId ? String(currentLeagueId) : null
  );

  // When leagues load, ensure selectedLeagueId points to a real league
  useEffect(() => {
    if (userLeagues.length === 0) return;
    const valid = userLeagues.some((l: any) => l.id === selectedLeagueId);
    if (!valid) switchLeague(String(userLeagues[0].id));
  }, [userLeagues, selectedLeagueId, switchLeague]);

  // Create league mutation
  const createLeagueMutation = useMutation({
    mutationFn: async (name?: string) => {
      if (!user || isAnonymous) throw new Error('Not authenticated');
      const newLeague = {
        name: name || DEFAULT_LEAGUE_NAME,
        description: '',
        isPublic: false,
        currentSeasonName: 'Season 1',
        ownerId: user.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(collections.leagues, newLeague);
      return { id: docRef.id, ...newLeague };
    },
    onSuccess: (newLeague) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', user?.id] });
      // Auto-switch to the newly created league
      if (newLeague?.id) switchLeague(String(newLeague.id));
    },
    onError: (error) => {
      console.error('❌ Failed to create league:', error);
      setHasAttemptedCreate(false);
    }
  });

  // Auto-create league when none exists
  useEffect(() => {
    if (user && !isAnonymous && !overrideOwnerId && !leaguesLoading && userLeagues.length === 0 && !createLeagueMutation.isPending && !hasAttemptedCreate) {
      setHasAttemptedCreate(true);
      createLeagueMutation.mutate(undefined);
    }
  }, [user, isAnonymous, overrideOwnerId, leaguesLoading, userLeagues.length, hasAttemptedCreate]);

  const createLeague = useCallback(async (name: string) => {
    await createLeagueMutation.mutateAsync(name);
  }, [createLeagueMutation]);

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
        tournamentDate: result.tournamentDate || null, // Firestore Timestamp — used by previousRankings for arrow logic
        seasonId: result.seasonId || null,
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
      seasonId?: string | null; // ← added
    }) => {
      if (!currentLeagueId) throw new Error('No active league');
      const newResult = sanitizeForFirestore({
        ...resultData,
        leagueId: String(currentLeagueId),
        leaguePlayerId: String(resultData.leaguePlayerId),
        seasonId: resultData.seasonId || null, // ← persisted to Firestore
        createdAt: serverTimestamp()
      });
      const docRef = await addDoc(collections.tournamentResults, newResult);
      
      // Update player's total points using a Firestore transaction-safe approach:
      // Recalculate from all results for this player
      const allPlayerResults = cloudResults.filter(
        r => r.leaguePlayerId === String(resultData.leaguePlayerId)
      );
      const newTotal = allPlayerResults.reduce((sum, r) => sum + (r.points || 0), 0) + resultData.points;
      const playerRef = doc(db, 'leaguePlayers', String(resultData.leaguePlayerId));
      await updateDoc(playerRef, { totalPoints: newTotal, updatedAt: serverTimestamp() });
      
      return { id: docRef.id, ...newResult };
    },
    onSuccess: () => {
      if (currentLeagueId) {
        queryClient.invalidateQueries({ queryKey: ['leaguePlayers', currentLeagueId] });
        queryClient.invalidateQueries({ queryKey: ['leagueResults', currentLeagueId] });
      }
    }
  });

  // Wait for league to be ready - uses React Query state, not busy-wait
  const waitForLeague = useCallback(async (): Promise<string | null> => {
    // If league already exists, return immediately
    if (currentLeagueId) return String(currentLeagueId);

    // If creation is pending, wait for it to resolve via query cache
    if (createLeagueMutation.isPending) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const leagues = queryClient.getQueryData<any[]>(['leagues', user?.id]);
          if (leagues && leagues.length > 0) {
            clearInterval(checkInterval);
            resolve(String(leagues[0].id));
          }
        }, 200);
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(null);
        }, 10000);
      });
    }

    return null;
  }, [currentLeagueId, createLeagueMutation.isPending, queryClient, user?.id]);

  const addLeaguePlayer = useCallback(async (name: string) => {
    try {
      const leagueId = await waitForLeague();
      if (!leagueId) return;

      if (!name || typeof name !== 'string' || name.trim().length === 0) return;

      const existingPlayer = leaguePlayers.find((p: any) =>
        p.name.toLowerCase() === name.toLowerCase()
      );
      if (existingPlayer) return;

      await createPlayerMutation.mutateAsync({ name: name.trim() });
    } catch (error) {
      console.error('❌ Error in addLeaguePlayer:', error);
    }
  }, [currentLeagueId, leaguePlayers, createPlayerMutation, waitForLeague]);

  const recordResult = useCallback(async (playerId: string, position: number, totalPlayers: number) => {
    try {
      if (!currentLeagueId) return;
      if (!playerId || typeof position !== 'number' || typeof totalPlayers !== 'number') return;
      if (position < 1 || totalPlayers < 1 || position > totalPlayers) return;

      const points = calculatePointsFromSettings(position, totalPlayers, 0);
      const playerFound = leaguePlayers.find(p => p.id === playerId);
      if (!playerFound) return;

      await addResultMutation.mutateAsync({
        leaguePlayerId: playerId,
        position,
        totalPlayers,
        points,
        knockouts: 0,
        prizeMoney: 0,
        buyIn: 10,
        tournamentDate: new Date(),
        tournamentName: 'Tournament Result',
        seasonId: activeSeasonId
      });
    } catch (error) {
      console.error('❌ Error in recordResult:', error);
      throw error;
    }
  }, [currentLeagueId, calculatePointsFromSettings, leaguePlayers, addResultMutation, activeSeasonId]);

  const getLeagueStandings = useCallback(() => {
    return [...leaguePlayers].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      const aGames = a.tournamentResults.length;
      const bGames = b.tournamentResults.length;
      if (aGames !== bGames) return aGames - bGames;
      const aBest = Math.min(...a.tournamentResults.map(r => r.position), 999);
      const bBest = Math.min(...b.tournamentResults.map(r => r.position), 999);
      return aBest - bBest;
    });
  }, [leaguePlayers]);

  const removeResult = useCallback(async (playerId: string, resultId: string) => {
    if (!currentLeagueId) return;
    try {
      await deleteDoc(doc(db, 'tournamentResults', resultId));
      // Recalculate total points for player
      const remainingResults = cloudResults.filter(
        r => r.leaguePlayerId === playerId && r.id !== resultId
      );
      const newTotal = remainingResults.reduce((sum, r) => sum + (r.points || 0), 0);
      const playerRef = doc(db, 'leaguePlayers', playerId);
      await updateDoc(playerRef, { totalPoints: newTotal, updatedAt: serverTimestamp() });
      queryClient.invalidateQueries({ queryKey: ['leaguePlayers', currentLeagueId] });
      queryClient.invalidateQueries({ queryKey: ['leagueResults', currentLeagueId] });
    } catch (error) {
      console.error('❌ Error in removeResult:', error);
      throw error;
    }
  }, [currentLeagueId, cloudResults, queryClient]);

  const recordResultByName = useCallback(async (
    playerName: string,
    position: number,
    totalPlayers: number,
    playersEliminatedCount: number = 0,
    prizeMoney: number = 0,
    buyInAmount?: number,
    tournamentId?: string,
    seasonId?: string
  ) => {
    try {
      const leagueId = await waitForLeague();
      if (!leagueId) return;

      // Find or create the player
      let targetPlayer = leaguePlayers.find((p: any) =>
        p.name.toLowerCase() === playerName.toLowerCase()
      );

      if (!targetPlayer) {
        const newPlayer = await createPlayerMutation.mutateAsync({
          name: playerName
        });
        targetPlayer = newPlayer;
      }

      // Deduplicate: skip if a result already exists for this player+tournament
      if (tournamentId) {
        const alreadyRecorded = cloudResults.some(r =>
          r.leaguePlayerId === String(targetPlayer.id) && r.tournamentId === tournamentId
        );
        if (alreadyRecorded) return;
      }

      // Calculate points
      const points = calculatePointsFromSettings(position, totalPlayers);

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
        tournamentId,
        seasonId: seasonId ?? activeSeasonId
      });
    } catch (error) {
      console.error('❌ Error in recordResultByName:', error);
      throw error;
    }
  }, [currentLeagueId, calculatePointsFromSettings, leaguePlayers, createPlayerMutation, addResultMutation, waitForLeague, activeSeasonId]);

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

  // Delete the currently active league and all its associated data
  const deleteLeague = useCallback(async (leagueId: string) => {
    if (!user?.id) return;
    try {
      const lid = String(leagueId);

      // 1. Delete all tournament results for this league
      const resultsSnap = await getDocs(query(collections.tournamentResults, where('leagueId', '==', lid)));
      await Promise.all(resultsSnap.docs.map(d => deleteDoc(doc(db, 'tournamentResults', d.id))));

      // 2. Delete all league players
      const playersSnap = await getDocs(query(collections.leaguePlayers, where('leagueId', '==', lid)));
      await Promise.all(playersSnap.docs.map(d => deleteDoc(doc(db, 'leaguePlayers', d.id))));

      // 3. Delete all seasons
      const seasonsSnap = await getDocs(query(collections.seasons, where('leagueId', '==', lid)));
      await Promise.all(seasonsSnap.docs.map(d => deleteDoc(doc(db, 'seasons', d.id))));

      // 4. Delete league settings docs
      const settingsSnap = await getDocs(query(collections.leagueSettings, where('userId', '==', user.id), where('leagueId', '==', lid)));
      await Promise.all(settingsSnap.docs.map(d => deleteDoc(doc(db, 'leagueSettings', d.id))));

      // 5. Delete the league doc itself
      await deleteDoc(doc(db, 'leagues', lid));

      queryClient.invalidateQueries({ queryKey: ['leagues', user.id] });

      // Switch to another league if one exists
      const remaining = userLeagues.filter((l: any) => String(l.id) !== lid);
      if (remaining.length > 0) {
        switchLeague(String(remaining[0].id));
      }
    } catch (error) {
      console.error('Error deleting league:', error);
      throw error;
    }
  }, [user?.id, userLeagues, switchLeague, queryClient]);

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
    userLeagues,
    switchLeague,
    createLeague,
    deleteLeague,
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
    activeSeasonId,
    setActiveSeasonId,
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