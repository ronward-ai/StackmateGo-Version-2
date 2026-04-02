import { useState, useEffect, useCallback } from 'react';
import { Season, LeaguePlayer, createNewSeason, formatDate } from '@/types/league';

// Initialize with a default current season
const defaultSeason: Season = createNewSeason('Season 1');

// LocalStorage key for seasons data
const SEASONS_STORAGE_KEY = 'chipstackr-seasons';

export function useSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([defaultSeason]);
  const [currentSeason, setCurrentSeason] = useState<Season>(defaultSeason);
  
  // Load seasons from localStorage on component mount
  useEffect(() => {
    const savedSeasons = localStorage.getItem(SEASONS_STORAGE_KEY);
    
    if (savedSeasons) {
      try {
        const parsedSeasons = JSON.parse(savedSeasons) as Season[];
        
        if (parsedSeasons.length > 0) {
          setSeasons(parsedSeasons);
          
          // Set current season to the active one, or the most recent one
          const activeSeason = parsedSeasons.find(season => season.isActive);
          if (activeSeason) {
            setCurrentSeason(activeSeason);
          } else {
            // If no active season, use the most recent one by end date
            const sortedSeasons = [...parsedSeasons].sort((a, b) => 
              new Date(b.endDate).getTime() - new Date(a.endDate).getTime()
            );
            setCurrentSeason(sortedSeasons[0]);
          }
        }
      } catch (error) {
        console.error('Error parsing seasons from localStorage:', error);
      }
    }
  }, []);
  
  // Save seasons to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(SEASONS_STORAGE_KEY, JSON.stringify(seasons));
  }, [seasons]);
  
  // Add a new season
  const addSeason = useCallback((name: string, startDate?: Date) => {
    const newSeason = createNewSeason(name, startDate);
    
    // Deactivate all other seasons if this one is active
    if (newSeason.isActive) {
      setSeasons(prev => prev.map(season => ({
        ...season,
        isActive: false
      })));
    }
    
    setSeasons(prev => [...prev, newSeason]);
    setCurrentSeason(newSeason);
    
    return newSeason;
  }, []);
  
  // Update a season
  const updateSeason = useCallback((id: string, updates: Partial<Season>) => {
    setSeasons(prev => {
      const updatedSeasons = prev.map(season => {
        if (season.id === id) {
          const updatedSeason = { ...season, ...updates };
          
          // If this season is being set to active, deactivate others
          if (updates.isActive) {
            return updatedSeason;
          }
          
          return updatedSeason;
        }
        
        // If we're activating one season, deactivate all others
        if (updates.isActive) {
          return { ...season, isActive: false };
        }
        
        return season;
      });
      
      return updatedSeasons;
    });
    
    // Update current season if needed
    if (currentSeason.id === id) {
      setCurrentSeason(prev => ({ ...prev, ...updates }));
    } else if (updates.isActive) {
      // If we're activating a different season, set it as current
      const newCurrentSeason = seasons.find(season => season.id === id);
      if (newCurrentSeason) {
        setCurrentSeason({ ...newCurrentSeason, ...updates });
      }
    }
  }, [currentSeason, seasons]);
  
  // Delete a season
  const deleteSeason = useCallback((id: string) => {
    // Check if this is the current season
    if (currentSeason.id === id) {
      // Find a different season to make current
      const remainingSeasons = seasons.filter(season => season.id !== id);
      
      if (remainingSeasons.length > 0) {
        // Find an active season or use the most recent one
        const activeSeason = remainingSeasons.find(season => season.isActive);
        if (activeSeason) {
          setCurrentSeason(activeSeason);
        } else {
          // Sort by end date and use the most recent
          const sortedSeasons = [...remainingSeasons].sort((a, b) => 
            new Date(b.endDate).getTime() - new Date(a.endDate).getTime()
          );
          setCurrentSeason(sortedSeasons[0]);
        }
      } else {
        // Create a new default season if there are no remaining ones
        const newDefaultSeason = createNewSeason('Season 1');
        setCurrentSeason(newDefaultSeason);
        setSeasons([newDefaultSeason]);
        return;
      }
    }
    
    // Remove the season
    setSeasons(prev => prev.filter(season => season.id !== id));
  }, [currentSeason, seasons]);
  
  // Switch the current season
  const switchSeason = useCallback((id: string) => {
    const season = seasons.find(s => s.id === id);
    if (season) {
      setCurrentSeason(season);
    }
  }, [seasons]);
  
  // Add a player to a season
  const addPlayerToSeason = useCallback((seasonId: string, player: LeaguePlayer) => {
    setSeasons(prev => prev.map(season => {
      if (season.id === seasonId) {
        // Check if player already exists
        const playerExists = season.players.some(p => p.id === player.id);
        
        if (playerExists) {
          // Update existing player
          return {
            ...season,
            players: season.players.map(p => 
              p.id === player.id ? { ...player, seasonId } : p
            )
          };
        } else {
          // Add new player
          return {
            ...season,
            players: [...season.players, { ...player, seasonId }]
          };
        }
      }
      return season;
    }));
    
    // Update current season if needed
    if (currentSeason.id === seasonId) {
      setCurrentSeason(prev => {
        const playerExists = prev.players.some(p => p.id === player.id);
        
        if (playerExists) {
          return {
            ...prev,
            players: prev.players.map(p => 
              p.id === player.id ? { ...player, seasonId } : p
            )
          };
        } else {
          return {
            ...prev,
            players: [...prev.players, { ...player, seasonId }]
          };
        }
      });
    }
  }, [currentSeason]);
  
  // Get players for the current season
  const getCurrentSeasonPlayers = useCallback(() => {
    return currentSeason.players;
  }, [currentSeason]);
  
  // Format season date range for display
  const formatSeasonDateRange = useCallback((season: Season) => {
    return `${formatDate(season.startDate)} - ${formatDate(season.endDate)}`;
  }, []);
  
  // Check if a season is active (current date is within range)
  const isSeasonActive = useCallback((season: Season) => {
    const now = new Date();
    const startDate = new Date(season.startDate);
    const endDate = new Date(season.endDate);
    
    return now >= startDate && now <= endDate;
  }, []);
  
  return {
    seasons,
    currentSeason,
    addSeason,
    updateSeason,
    deleteSeason,
    switchSeason,
    addPlayerToSeason,
    getCurrentSeasonPlayers,
    formatSeasonDateRange,
    isSeasonActive
  };
}