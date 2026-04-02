export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  players: LeaguePlayer[];
}

export interface LeaguePlayer {
  id: string;
  name: string;
  totalPoints: number;
  tournamentResults: TournamentResult[];
  seasonId?: string; // Reference to which season this player's data belongs
}

export interface TournamentResult {
  tournamentId: string;
  position: number;
  points: number;
  date: string;
  seasonId?: string; // Reference to which season this result belongs
}

// Points calculation formula
export function calculatePoints(position: number, totalPlayers: number): number {
  if (position === 1) return totalPlayers * 36;
  if (position === 2) return totalPlayers * 24;
  if (position === 3) return totalPlayers * 20;
  if (position === 4) return totalPlayers * 16;
  if (position === 5) return totalPlayers * 12;
  if (position === 6) return totalPlayers * 10;
  if (position === 7) return totalPlayers * 8;
  if (position === 8) return totalPlayers * 6;
  if (position >= 9 && position <= 15) return totalPlayers * 2;
  if (position >= 16 && position <= 20) return totalPlayers;
  return 0; // Beyond 20th place
}

// Helper function to create a new season with default 3-month duration
export function createNewSeason(name: string, startDate: Date = new Date()): Season {
  // Calculate end date (3 months from start date)
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 3);
  
  return {
    id: crypto.randomUUID(),
    name,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    isActive: true,
    players: []
  };
}

// Format date for display
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
}