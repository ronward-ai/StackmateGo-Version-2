import { useState, useCallback, useEffect } from 'react';
import { LeaguePlayer, TournamentResult, calculatePoints } from '@/types/league';
import { useSeasons } from '@/hooks/useSeasons';
import { v4 as uuidv4 } from 'uuid';

export function useLeague() {
  const { currentSeason, addPlayerToSeason, seasons } = useSeasons();
  
  const [leaguePlayers, setLeaguePlayers] = useState<LeaguePlayer[]>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem('leaguePlayers');
    return saved ? JSON.parse(saved) : [];
  });

  // Save to localStorage whenever leaguePlayers changes
  useEffect(() => {
    try {
      localStorage.setItem('leaguePlayers', JSON.stringify(leaguePlayers));
    } catch (error) {
      console.log('Failed to save league players to local storage');
    }
  }, [leaguePlayers]);
  
  // Initialize with current season players whenever the current season changes
  useEffect(() => {
    if (currentSeason && currentSeason.players) {
      setLeaguePlayers(currentSeason.players);
    }
  }, [currentSeason]);

  // Add a new player to the league and current season
  const addLeaguePlayer = useCallback((name: string) => {
    if (name.trim() === '' || !currentSeason) return;
    
    // Create a new player
    const newPlayer: LeaguePlayer = {
      id: uuidv4(),
      name,
      totalPoints: 0,
      tournamentResults: [],
      seasonId: currentSeason.id
    };
    
    // Update local state
    setLeaguePlayers(prev => {
      // Check if player already exists in this season
      if (prev.some(player => 
        player.name.toLowerCase() === name.toLowerCase() && 
        player.seasonId === currentSeason.id
      )) {
        return prev; // Don't add duplicate players
      }
      
      return [...prev, newPlayer];
    });
    
    // Add to the season
    addPlayerToSeason(currentSeason.id, newPlayer);
  }, [currentSeason, addPlayerToSeason]);

  // Record a tournament result for a player
  const recordResult = useCallback((playerId: string, position: number, totalPlayers: number, tournamentId: string = uuidv4()) => {
    if (!currentSeason) return;
    
    const points = calculatePoints(position, totalPlayers);
    const date = new Date().toISOString();
    
    // Create new result with season information
    const newResult: TournamentResult = {
      tournamentId,
      position,
      points,
      date,
      seasonId: currentSeason.id
    };
    
    // Update local state
    setLeaguePlayers(prev => {
      return prev.map(player => {
        if (player.id !== playerId) return player;
        
        // Calculate new total points
        const newTotalPoints = player.tournamentResults.reduce(
          (sum, result) => sum + result.points, 
          0
        ) + points;
        
        const updatedPlayer = {
          ...player,
          tournamentResults: [...player.tournamentResults, newResult],
          totalPoints: newTotalPoints
        };
        
        // Update the player in the season
        addPlayerToSeason(currentSeason.id, updatedPlayer);
        
        return updatedPlayer;
      });
    });
  }, [currentSeason, addPlayerToSeason]);

  // Remove a result
  const removeResult = useCallback((playerId: string, tournamentId: string) => {
    setLeaguePlayers(prev => {
      return prev.map(player => {
        if (player.id !== playerId) return player;
        
        // Filter out the result to remove
        const newResults = player.tournamentResults.filter(
          result => result.tournamentId !== tournamentId
        );
        
        // Recalculate total points
        const newTotalPoints = newResults.reduce(
          (sum, result) => sum + result.points, 
          0
        );
        
        return {
          ...player,
          tournamentResults: newResults,
          totalPoints: newTotalPoints
        };
      });
    });
  }, []);

  // Get sorted league standings for the current season
  const getLeagueStandings = useCallback(() => {
    if (!currentSeason) return [];
    
    // Filter players by current season
    const seasonPlayers = leaguePlayers.filter(
      player => player.seasonId === currentSeason.id
    );
    
    return [...seasonPlayers].sort((a, b) => b.totalPoints - a.totalPoints);
  }, [leaguePlayers, currentSeason]);

  // Reset the league standings for the current season
  const resetLeague = useCallback(() => {
    if (!currentSeason) return;
    
    if (window.confirm(`Are you sure you want to reset the league standings for ${currentSeason.name}? This will delete all player data for this season and cannot be undone.`)) {
      // Update the current season with empty players
      const updatedSeason = {
        ...currentSeason,
        players: []
      };
      
      // Update seasons state
      const seasonIndex = seasons.findIndex(s => s.id === currentSeason.id);
      if (seasonIndex !== -1) {
        const updatedSeasons = [...seasons];
        updatedSeasons[seasonIndex] = updatedSeason;
        localStorage.setItem('chipstackr-seasons', JSON.stringify(updatedSeasons));
      }
      
      // Clear local players state
      setLeaguePlayers([]);
    }
  }, [currentSeason, seasons]);

  // Record a tournament result with full result object
  const recordTournamentResult = useCallback((playerId: string, result: TournamentResult) => {
    if (!currentSeason) return;
    
    // Update local state
    setLeaguePlayers(prev => {
      return prev.map(player => {
        if (player.id !== playerId) return player;
        
        // Calculate new total points
        const newTotalPoints = player.tournamentResults.reduce(
          (sum, existingResult) => sum + existingResult.points, 
          0
        ) + result.points;
        
        const updatedPlayer = {
          ...player,
          tournamentResults: [...player.tournamentResults, result],
          totalPoints: newTotalPoints
        };
        
        // Update the player in the season
        addPlayerToSeason(currentSeason.id, updatedPlayer);
        
        return updatedPlayer;
      });
    });
  }, [currentSeason, addPlayerToSeason]);

  return {
    leaguePlayers,
    addLeaguePlayer,
    recordResult,
    recordTournamentResult,
    removeResult,
    getLeagueStandings,
    resetLeague
  };
}