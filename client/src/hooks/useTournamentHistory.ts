import { useState, useEffect, useCallback } from 'react';
import { TournamentState } from '@/types';

export interface CompletedTournament {
  id: string;
  type: 'standalone' | 'season' | 'database';
  seasonId?: string | number;
  seasonName?: string;
  tournamentNumber?: number;
  startTime: string;
  endTime: string;
  playerCount: number;
  winner?: string;
  prizePool: number;
  buyIn: number;
  results: Array<{
    playerId: string;
    playerName: string;
    position: number;
    prizeMoney: number;
    points?: number;
  }>;
}

const TOURNAMENT_HISTORY_KEY = 'chipstackr-tournament-history';

export function useTournamentHistory() {
  const [tournamentHistory, setTournamentHistory] = useState<CompletedTournament[]>([]);

  // Load tournament history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(TOURNAMENT_HISTORY_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as CompletedTournament[];
        setTournamentHistory(parsed);
      } catch (error) {
        console.error('Error loading tournament history:', error);
      }
    }
  }, []);

  // Save tournament history to localStorage
  useEffect(() => {
    localStorage.setItem(TOURNAMENT_HISTORY_KEY, JSON.stringify(tournamentHistory));
  }, [tournamentHistory]);

  // Save a completed tournament
  const saveCompletedTournament = useCallback((tournamentState: TournamentState) => {
    if (!tournamentState.details) return;

    const eliminatedPlayers = tournamentState.players.filter(p => p.isActive === false);
    const winner = tournamentState.players.find(p => p.position === 1);

    // Calculate comprehensive tournament analytics
    const totalRebuys = tournamentState.players.reduce((sum, p) => sum + (p.rebuys || 0), 0);
    const totalAddons = tournamentState.players.reduce((sum, p) => sum + (p.addons || 0), 0);
    
    const buyInAmount = tournamentState.prizeStructure?.buyIn || 0;
    const rebuyAmount = tournamentState.prizeStructure?.rebuyAmount || 0;
    const addonAmount = tournamentState.prizeStructure?.addonAmount || 0;
    const rakePercentage = tournamentState.prizeStructure?.rakePercentage || 0;
    const rakeAmountFixed = tournamentState.prizeStructure?.rakeAmount || 0;
    const rakeType = tournamentState.prizeStructure?.rakeType || 'percentage';
    
    const grossPrizePool = (tournamentState.players.length * buyInAmount) +
                          (totalRebuys * rebuyAmount) +
                          (totalAddons * addonAmount);
                          
    const rakeAmount = rakeType === 'percentage' 
      ? Math.floor(grossPrizePool * (rakePercentage / 100))
      : rakeAmountFixed;
      
    const totalPrizePool = Math.max(0, grossPrizePool - rakeAmount);

    const completedTournament: CompletedTournament = {
      id: `tournament-${Date.now()}`,
      type: tournamentState.details.type,
      seasonId: tournamentState.details.seasonId,
      seasonName: tournamentState.details.seasonName,
      tournamentNumber: tournamentState.details.tournamentNumber,
      startTime: tournamentState.details.startTime || new Date().toISOString(),
      endTime: new Date().toISOString(),
      playerCount: tournamentState.players.length,
      winner: winner?.name,
      prizePool: totalPrizePool,
      buyIn: tournamentState.prizeStructure?.buyIn || 0,
      results: tournamentState.players
        .filter(p => p.position !== undefined)
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map(p => ({
          playerId: p.id,
          playerName: p.name,
          position: p.position!,
          prizeMoney: p.prizeMoney || 0,
          points: p.points
        }))
    };

    setTournamentHistory(prev => [completedTournament, ...prev]);
    return completedTournament;
  }, []);

  // Get tournaments by type
  const getStandaloneTournaments = useCallback(() => {
    return tournamentHistory.filter(t => t.type === 'standalone');
  }, [tournamentHistory]);

  const getSeasonTournaments = useCallback((seasonId?: string | number) => {
    const seasonTournaments = tournamentHistory.filter(t => t.type === 'season');
    if (seasonId) {
      return seasonTournaments.filter(t => t.seasonId === seasonId);
    }
    return seasonTournaments;
  }, [tournamentHistory]);

  // Get recent tournaments
  const getRecentTournaments = useCallback((limit: number = 10) => {
    return tournamentHistory.slice(0, limit);
  }, [tournamentHistory]);

  return {
    tournamentHistory,
    saveCompletedTournament,
    getStandaloneTournaments,
    getSeasonTournaments,
    getRecentTournaments
  };
}
