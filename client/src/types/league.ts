
export interface WeeklyTournament {
  id: string;
  name: string;
  date: string;
  totalPlayers: number;
  completed: boolean;
  results: PlayerResult[];
}

export interface PlayerResult {
  playerId: string;
  playerName: string;
  position: number;
  points: number;
}

export interface LeaguePlayer {
  id: string;
  name: string;
  totalPoints: number;
  weeklyResults: PlayerResult[];
  tournamentsPlayed: number;
}

export interface LeagueState {
  players: LeaguePlayer[];
  tournaments: WeeklyTournament[];
  currentWeek: number;
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

// Helper to get week number from date
export function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
}

// Helper to format date
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-UK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}
