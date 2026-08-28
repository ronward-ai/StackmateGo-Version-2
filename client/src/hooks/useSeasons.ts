import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeagueSettings } from './useLeagueSettings';
import { useAuth } from './useAuth';
import { db, collections } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { sanitizeForFirestore } from '@/lib/utils';
import { useSharedSnapshot } from '@/lib/sharedSnapshot';

/** Stable empty references — required by useSharedSnapshot. */
const EMPTY_SEASONS: Season[] = [];
const NO_LEAGUE_DOC: { activeSeasonId?: string } | null = null;

/** One migration attempt per league per page load. */
const backfilledLeagues = new Set<string>();

// Season interface matching database schema
interface Season {
  id: string | number;
  leagueId: string | number;
  name: string;
  startDate: string;
  endDate: string;
  numberOfGames: number;
  /** Only 'active' and 'completed' are reachable. 'draft' and 'archived' were
   *  declared but never meaningfully set: 'archived' was never written at all,
   *  and 'draft' was produced solely by the demote-every-other-season loop that
   *  season switching used to run — which is why finished seasons could display
   *  "Draft". That loop is gone; the league's activeSeasonId decides which
   *  season is current. */
  status: 'active' | 'completed';
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
  /** True once the director has ended the season. */
  isEnded?: boolean;
  status?: 'active' | 'completed';
  numberOfGames?: number;
  settings?: any;
}

interface UseSeasonsOptions {
  leagueId?: string | number;
}


export function useSeasons(options: UseSeasonsOptions = {}) {
  const { leagueId } = options;
  const { settings } = useLeagueSettings(undefined, leagueId ? String(leagueId) : null);
  const { isAuthenticated: isUserAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // One shared listener per league, regardless of how many components call this
  // hook. See lib/sharedSnapshot.ts.
  const { data: dbSeasons, isLoading } = useSharedSnapshot<Season[]>(
    leagueId ? `seasons:${leagueId}` : null,
    (emit, fail) => onSnapshot(
      query(collections.seasons, where('leagueId', '==', String(leagueId))),
      snapshot => emit(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Season))),
      error => { console.error('Error fetching seasons:', error); fail(error); },
    ),
    EMPTY_SEASONS,
  );

  // Which season is current is stored once, on the league document, and read
  // from there by every instance. This replaces an earlier localStorage +
  // CustomEvent override which could not work: its reset effect keyed on
  // [leagueId] ran on EVERY instance mount, and six components mount this hook,
  // so any later mount wiped the key and the choice never survived a reload.
  //
  // Shared listener, so all instances see the same value at the same time.
  const { data: leagueDoc } = useSharedSnapshot<{ activeSeasonId?: string } | null>(
    leagueId ? `league:${leagueId}` : null,
    (emit, fail) => onSnapshot(
      doc(db, 'leagues', String(leagueId)),
      snap => emit(snap.exists() ? (snap.data() as any) : null),
      error => { console.error('Error reading league:', error); fail(error); },
    ),
    NO_LEAGUE_DOC,
  );
  const activeSeasonId = leagueDoc?.activeSeasonId ?? null;

  // Create mutation for creating a season
  const createSeasonMutation = useMutation({
    mutationFn: async (seasonData: {
      name: string;
      startDate: string;
      endDate: string;
      numberOfGames: number;
      status?: 'active' | 'completed';
    }) => {
      if (!leagueId) throw new Error('No active league');
      const newSeason = sanitizeForFirestore({
        ...seasonData,
        leagueId: String(leagueId),
        status: seasonData.status || 'active',
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

  // Auto-create a default season if none exist. Uses a deterministic document ID
  // so setDoc is idempotent — safe to call on every page load, no duplicates created.
  const creatingRef = useRef(false);
  useEffect(() => {
    if (!leagueId || isLoading || dbSeasons.length > 0 || creatingRef.current) return;
    creatingRef.current = true;

    const defaultSeasonId = `${leagueId}-season-1`;
    const now = new Date();
    const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const newSeason = sanitizeForFirestore({
      name: 'Season 1',
      leagueId: String(leagueId),
      startDate: now.toISOString(),
      endDate: threeMonthsLater.toISOString(),
      numberOfGames: 12,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    setDoc(doc(db, 'seasons', defaultSeasonId), newSeason, { merge: true }).catch(err => {
      console.error('Failed to create default season:', err);
      creatingRef.current = false;
    });
  }, [leagueId, isLoading, dbSeasons.length]);

  // Convert database seasons to MinimalSeason format, deduplicating by name
  const seasons: MinimalSeason[] = useMemo(() => {
    if (dbSeasons.length > 0) {
      const seen = new Set<string>();
      const unique: MinimalSeason[] = [];
      // Newest first. There is no active-first ordering any more: the league's
      // activeSeasonId decides which season is current, and legacy data can
      // carry several seasons still marked 'active'.
      const sorted = [...dbSeasons].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );
      for (const season of sorted) {
        const key = season.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push({
          id: season.id,
          name: season.name,
          startDate: season.startDate,
          endDate: season.endDate,
          // Retained for the pre-pointer fallback in currentSeason only. It is
          // NOT what makes a season current — leagues/{id}.activeSeasonId is.
          isActive: season.status !== 'completed',
          isEnded: season.status === 'completed',
          status: season.status,
          numberOfGames: season.numberOfGames,
          settings: season.settings,
        });
      }
      return unique;
    }
    return [fallbackSeason];
  }, [dbSeasons, fallbackSeason, leagueId]);

  // The league's activeSeasonId is authoritative. The status fallback exists only
  // for leagues written before the pointer was introduced and is removed once the
  // backfill below has run.
  const currentSeason = useMemo(() => {
    if (activeSeasonId) {
      const pointed = seasons.find(s => String(s.id) === String(activeSeasonId));
      if (pointed) return pointed;
    }
    const legacyActive = seasons.find(s => s.isActive);
    return legacyActive || seasons[0] || fallbackSeason;
  }, [seasons, fallbackSeason, activeSeasonId]);

  // One-time backfill for leagues predating the pointer. Attempted once per
  // league per page load; non-owners are denied by the rules and the error is
  // swallowed, which is correct — only the owner should be setting this.
  useEffect(() => {
    if (!leagueId || !leagueDoc || activeSeasonId) return;
    const key = String(leagueId);
    if (backfilledLeagues.has(key)) return;
    const legacyActive = seasons.find(s => s.isActive && s.id !== 'default-season');
    if (!legacyActive) return;
    backfilledLeagues.add(key);
    updateDoc(doc(db, 'leagues', key), { activeSeasonId: String(legacyActive.id) })
      .catch(() => { /* not the owner, or offline — harmless */ });
  }, [leagueId, leagueDoc, activeSeasonId, seasons]);

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
    // Forwarded to createSeasonMutation, which has always accepted it — the
    // omission here was a type-level oversight, not intended behaviour.
    status?: 'active' | 'completed';
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

  // Delete a season and all its tournament results
  const deleteSeason = useCallback(async (seasonId: string | number) => {
    if (!leagueId) {
      console.warn('Cannot delete season without league ID');
      return;
    }

    try {
      // Cascade: remove all tournament results tied to this season
      const sid = String(seasonId);
      const resultsSnap = await getDocs(query(collections.tournamentResults, where('seasonId', '==', sid)));
      await Promise.all(resultsSnap.docs.map(d => deleteDoc(doc(db, 'tournamentResults', d.id))));

      await deleteSeasonMutation.mutateAsync(seasonId);

      queryClient.invalidateQueries({ queryKey: ['leaguePlayers', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['leagueResults', leagueId] });
    } catch (error) {
      console.error('Failed to delete season:', error);
      throw error;
    }
  }, [leagueId, deleteSeasonMutation, queryClient]);

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
