import { useState, useEffect, useCallback } from 'react';
import { useSeasons } from './useSeasons';
import { useLeague } from './useLeague';

export interface TournamentContext {
  mode: 'standalone' | 'season';
  seasonId?: string;
  seasonName?: string;
  tournamentNumber?: number;
  totalTournaments?: number;
}

export function useTournamentContext() {
  const [context, setContext] = useState<TournamentContext>({ mode: 'standalone' });
  const { currentSeason } = useSeasons();
  const { leaguePlayers } = useLeague();

  // Auto-detect context based on current season and league activity
  useEffect(() => {
    // If we have an active season with players, we're likely in season mode
    if (currentSeason?.isActive && leaguePlayers.length > 0) {
      // Calculate tournament number based on results
      const seasonPlayers = leaguePlayers.filter((p: any) => p.seasonId === currentSeason.id);
      const tournamentCount = seasonPlayers.length > 0 
        ? Math.max(...seasonPlayers.map((p: any) => p.tournamentResults.length)) 
        : 0;

      setContext({
        mode: 'season',
        seasonId: currentSeason.id,
        seasonName: currentSeason.name,
        tournamentNumber: tournamentCount + 1,
        totalTournaments: undefined // Could be configurable
      });
    } else {
      setContext({ mode: 'standalone' });
    }
  }, [currentSeason, leaguePlayers]);

  // Manually set tournament context
  const setTournamentMode = useCallback((mode: 'standalone' | 'season', seasonId?: string) => {
    if (mode === 'season' && seasonId) {
      const seasonPlayers = leaguePlayers.filter((p: any) => p.seasonId === seasonId);
      const tournamentCount = seasonPlayers.length > 0 
        ? Math.max(...seasonPlayers.map((p: any) => p.tournamentResults.length)) 
        : 0;

      setContext({
        mode: 'season',
        seasonId,
        seasonName: currentSeason?.name,
        tournamentNumber: tournamentCount + 1
      });
    } else {
      setContext({ mode: 'standalone' });
    }
  }, [leaguePlayers, currentSeason]);

  // Check if we should suggest season mode
  const shouldSuggestSeasonMode = useCallback(() => {
    return currentSeason?.isActive && context.mode === 'standalone';
  }, [currentSeason, context.mode]);

  return {
    context,
    setTournamentMode,
    shouldSuggestSeasonMode: shouldSuggestSeasonMode()
  };
}