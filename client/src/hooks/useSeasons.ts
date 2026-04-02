import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeagueSettings } from './useLeagueSettings';
import { db, collections } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { sanitizeForFirestore } from '@/lib/utils';

// Season interface matching database schema
interface Season {
  id: string | number;
  leagueId: string | number;
  name: string;
  startDate: string;
  endDate: string;
  numberOfGames: number;
  status: 'draft' | 'active' | 'completed' | 'archived';
  pointsSystemConfig?: any;
  settings?: any;
  createdAt?: any;
  updatedAt?: any;
}

// Minimal season interface for backward compatibility
interface MinimalSeason {
  id: string | number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  numberOfGames?: number;
}

interface UseSeasonsOptions {
  leagueId?: string | number;
}

export function useSeasons(options: UseSeasonsOptions = {}) {
  const { leagueId } = options;
  const { settings } = useLeagueSettings();
  const queryClient = useQueryClient();

  const [dbSeasons, setDbSeasons] = useState<Season[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch seasons from database if leagueId is provided and valid
  useEffect(() => {
    if (!leagueId) {
      setDbSeasons([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const q = query(collections.seasons, where('leagueId', '==', String(leagueId)));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const seasonsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Season));
      setDbSeasons(seasonsData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching seasons:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [leagueId]);

  // Create mutation for creating a season
  const createSeasonMutation = useMutation({
    mutationFn: async (seasonData: {
      name: string;
      startDate: string;
      endDate: string;
      numberOfGames: number;
      status?: 'draft' | 'active';
    }) => {
      if (!leagueId) throw new Error('No active league');
      const newSeason = sanitizeForFirestore({
        ...seasonData,
        leagueId: String(leagueId),
        status: seasonData.status || 'draft',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      const docRef = await addDoc(collections.seasons, newSeason);
      return { id: docRef.id, ...newSeason };
    },
    onSuccess: () => {
      if (leagueId) {
        queryClient.invalidateQueries({ queryKey: ['seasons', leagueId] });
      }
    }
  });

  // Update season mutation
  const updateSeasonMutation = useMutation({
    mutationFn: async ({ seasonId, data }: { seasonId: string | number; data: Partial<Season> }) => {
      const docRef = doc(db, 'seasons', String(seasonId));
      await updateDoc(docRef, sanitizeForFirestore({
        ...data,
        updatedAt: serverTimestamp()
      }));
      return { id: seasonId, ...data };
    },
    onSuccess: () => {
      if (leagueId) {
        queryClient.invalidateQueries({ queryKey: ['seasons', leagueId] });
      }
    }
  });

  // Delete season mutation
  const deleteSeasonMutation = useMutation({
    mutationFn: async (seasonId: string | number) => {
      await deleteDoc(doc(db, 'seasons', String(seasonId)));
      return seasonId;
    },
    onSuccess: () => {
      if (leagueId) {
        queryClient.invalidateQueries({ queryKey: ['seasons', leagueId] });
      }
    }
  });

  // Create fallback season from league settings for backward compatibility
  const fallbackSeason = useMemo<MinimalSeason>(() => {
    const seasonSettings = settings?.seasonSettings;
    
    const now = new Date();
    const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    
    return {
      id: 'default-season',
      name: seasonSettings?.seasonName || 'Default Season',
      startDate: seasonSettings?.startDate || now.toISOString(),
      endDate: seasonSettings?.endDate || threeMonthsLater.toISOString(),
      isActive: true,
      numberOfGames: seasonSettings?.numberOfGames || 12
    };
  }, [settings]);

  // Auto-create default season for leagues that don't have any
  // Track which leagues have had creation attempted (persists across component renders)
  const attemptedLeagueIds = useRef(new Set<string | number>());
  useEffect(() => {
    if (
      leagueId && 
      !isLoading && 
      dbSeasons.length === 0 && 
      !createSeasonMutation.isPending && 
      !attemptedLeagueIds.current.has(leagueId)
    ) {
      attemptedLeagueIds.current.add(leagueId);
      
      const now = new Date();
      const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      
      createSeasonMutation.mutate({
        name: 'Season 1',
        startDate: now.toISOString(),
        endDate: threeMonthsLater.toISOString(),
        numberOfGames: 12,
        status: 'active'
      });
    }
  }, [leagueId, isLoading, dbSeasons.length, createSeasonMutation]);

  // Convert database seasons to MinimalSeason format
  const seasons: MinimalSeason[] = useMemo(() => {
    if (dbSeasons.length > 0) {
      return dbSeasons.map(season => ({
        id: season.id,
        name: season.name,
        startDate: season.startDate,
        endDate: season.endDate,
        isActive: season.status === 'active',
        numberOfGames: season.numberOfGames
      }));
    }
    return [fallbackSeason];
  }, [dbSeasons, fallbackSeason]);

  // Get current active season
  const currentSeason = useMemo(() => {
    const activeSeason = seasons.find(s => s.isActive);
    return activeSeason || seasons[0] || fallbackSeason;
  }, [seasons, fallbackSeason]);

  // Format season date range for display
  const formatSeasonDateRange = useCallback((season: MinimalSeason) => {
    const start = new Date(season.startDate).toLocaleDateString();
    const end = new Date(season.endDate).toLocaleDateString();
    return `${start} - ${end}`;
  }, []);

  // Check if a season is currently active based on dates
  const isSeasonActive = useCallback((season: MinimalSeason) => {
    const now = new Date();
    const startDate = new Date(season.startDate);
    const endDate = new Date(season.endDate);
    return now >= startDate && now <= endDate;
  }, []);

  // Create a new season
  const addSeason = useCallback(async (seasonData: {
    name: string;
    startDate: string;
    endDate: string;
    numberOfGames: number;
  }) => {
    if (!leagueId) {
      console.warn('Cannot create season without league ID');
      return fallbackSeason;
    }
    
    try {
      const newSeason = await createSeasonMutation.mutateAsync(seasonData);
      return {
        id: newSeason.id,
        name: newSeason.name,
        startDate: newSeason.startDate,
        endDate: newSeason.endDate,
        isActive: newSeason.status === 'active',
        numberOfGames: newSeason.numberOfGames
      };
    } catch (error) {
      console.error('Failed to create season:', error);
      return fallbackSeason;
    }
  }, [leagueId, createSeasonMutation, fallbackSeason]);

  // Update an existing season
  const updateSeason = useCallback(async (seasonId: string | number, data: Partial<Season>) => {
    if (!leagueId) {
      console.warn('Cannot update season without league ID');
      return;
    }

    try {
      await updateSeasonMutation.mutateAsync({ seasonId, data });
    } catch (error) {
      console.error('Failed to update season:', error);
    }
  }, [leagueId, updateSeasonMutation]);

  // Delete a season
  const deleteSeason = useCallback(async (seasonId: string | number) => {
    if (!leagueId) {
      console.warn('Cannot delete season without league ID');
      return;
    }

    try {
      await deleteSeasonMutation.mutateAsync(seasonId);
    } catch (error) {
      console.error('Failed to delete season:', error);
    }
  }, [leagueId, deleteSeasonMutation]);

  // Reset a season (clear all data but keep the season)
  const resetSeason = useCallback(async (seasonId: string | number) => {
    if (!leagueId) {
      console.warn('Cannot reset season without league ID');
      return;
    }

    try {
      // Find all tournament results for this season and delete them
      const q = query(collections.tournamentResults, where('seasonId', '==', String(seasonId)));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, 'tournamentResults', docSnap.id)));
      await Promise.all(deletePromises);
      
      queryClient.invalidateQueries({ queryKey: ['leaguePlayers', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['leagueResults', leagueId] });
    } catch (error) {
      console.error('Failed to reset season:', error);
    }
  }, [leagueId, queryClient]);

  return {
    seasons,
    currentSeason,
    isLoading,
    formatSeasonDateRange,
    isSeasonActive,
    addSeason,
    updateSeason,
    deleteSeason,
    resetSeason,
    // Legacy compatibility stubs
    switchSeason: (id: string | number) => {},
    addPlayerToSeason: () => {},
    getCurrentSeasonPlayers: () => []
  };
}
