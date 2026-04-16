
export interface PointsSystem {
  id: string;
  name: string;
  description: string;
  formula: PointsFormula;
}

export type PointsFormulaType = 'logarithmic' | 'squareRoot' | 'linear' | 'fixed' | 'custom';

export interface PointsFormula {
  type: PointsFormulaType;
  // For logarithmic, square root, and linear systems
  baseMultiplier?: number;
  winnerMultiplier?: number;
  // For fixed system
  fixedPoints?: number; // Legacy support
  positionPoints?: number[]; // Array of points for each position [1st, 2nd, 3rd, ...]
  // For custom system
  customFormula?: string;
  // Bonus points — apply on top of any formula type
  participationPoints?: number; // Flat bonus for every player who plays
  knockoutPoints?: number;      // Points per elimination (bounty games)
}

export interface PositionPoints {
  position: number;
  basePoints: number;
  multiplier: 'none' | 'entries';
  bonus: number;
}

// All stats that are always tracked/calculated
export interface LeagueStatsTracked {
  points: boolean; // Total points
  hits: boolean; // Players busted out by this player
  games: boolean; // Number of games played
  averagePoints: boolean; // Average points per game
  firstPlaceFinishes: boolean; // Number of 1st place finishes
  secondPlaceFinishes: boolean; // Number of 2nd place finishes
  thirdPlaceFinishes: boolean; // Number of 3rd place finishes
  cashWinnings: boolean; // Total cash winnings
  averagePosition: boolean; // Average finishing position
  finalTableAppearances: boolean; // Final table appearances
  profit: boolean; // Earnings minus buy-ins spent
  roi: boolean; // Return on Investment (profit / total buy-ins)
}

// Stats that can be displayed on the league table (user configurable)
export interface LeagueStatsDisplay {
  points: boolean; // Total points
  hits: boolean; // Players busted out
  games: boolean; // Number of games played
  averagePoints: boolean; // Average points per game
  firstPlaceFinishes: boolean; // Number of 1st place finishes
  secondPlaceFinishes: boolean; // Number of 2nd place finishes
  thirdPlaceFinishes: boolean; // Number of 3rd place finishes
  cashWinnings: boolean; // Total cash winnings
  averagePosition: boolean; // Average finishing position
  finalTableAppearances: boolean; // Final table appearances
  profit: boolean; // Earnings minus buy-ins spent
  roi: boolean; // Return on Investment (profit / total buy-ins)
  rebuys: boolean; // Total rebuy count across all games
}

export interface LeagueSettings {
  id: string;
  name: string;
  pointsSystem: PointsSystem;
  statsToTrack: LeagueStatsTracked; // Always all enabled - these are calculated
  statsToDisplay: LeagueStatsDisplay; // User configurable for league table
  displaySettings: {
    showPosition: boolean;
    showTrend: boolean;
    showMovementArrows: boolean;
    maxPlayersInTable: number;
    highlightTopN: number;
    showPlayerDetails: boolean;
  };
  seasonSettings: {
    seasonName: string;
    numberOfGames: number;
    autoReset: boolean;
    startDate?: string;
    endDate?: string;
  };
}

// Predefined points systems
export const POINTS_SYSTEMS = {
  logarithmic: {
    id: 'logarithmic',
    name: 'Logarithmic',
    description: 'Points calculated using logarithmic formula - rewards top finishes heavily',
    formula: {
      type: 'logarithmic' as const,
      baseMultiplier: 10,
      winnerMultiplier: 1.5
    }
  },
  squareRoot: {
    id: 'square-root',
    name: 'Square Root',
    description: 'Points calculated using square root formula - balanced reward system',
    formula: {
      type: 'squareRoot' as const,
      baseMultiplier: 10,
      winnerMultiplier: 1.2
    }
  },
  linear: {
    id: 'linear',
    name: 'Linear',
    description: 'Points decrease linearly by position - simple and predictable',
    formula: {
      type: 'linear' as const,
      baseMultiplier: 10,
      winnerMultiplier: 1.0
    }
  },
  fixed: {
    id: 'fixed',
    name: 'Fixed Points',
    description: 'Fixed points per position - configurable point values for each finishing position',
    formula: {
      type: 'fixed' as const,
      positionPoints: [25, 18, 13, 9, 6, 4, 3, 2, 1] // Default: positions 1-9 get these points, 10+ get 0
    }
  },
  custom: {
    id: 'custom',
    name: 'Custom Formula',
    description: 'User-defined mathematical formula for points calculation',
    formula: {
      type: 'custom' as const,
      customFormula: '10 * (totalPlayers - position + 1)'
    }
  }
} as const;

// Default points system
export const DEFAULT_POINTS_SYSTEM: PointsSystem = POINTS_SYSTEMS.logarithmic;

// Default league settings
export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  id: 'default-league',
  name: 'Main League',
  pointsSystem: DEFAULT_POINTS_SYSTEM,
  statsToTrack: {
    points: true,
    hits: true,
    games: true,
    averagePoints: true,
    firstPlaceFinishes: true,
    secondPlaceFinishes: true,
    thirdPlaceFinishes: true,
    cashWinnings: true,
    averagePosition: true,
    finalTableAppearances: true,
    profit: true,
    roi: true
  },
  statsToDisplay: {
    points: true,
    games: true,
    averagePoints: false,
    firstPlaceFinishes: false,
    secondPlaceFinishes: false,
    thirdPlaceFinishes: false,
    hits: false,
    cashWinnings: false,
    averagePosition: false,
    finalTableAppearances: false,
    profit: false,
    roi: false,
    rebuys: false
  },
  displaySettings: {
    showPosition: true,
    showTrend: true,
    showMovementArrows: true,
    maxPlayersInTable: 10,
    highlightTopN: 3,
    showPlayerDetails: true
  },
  seasonSettings: {
    seasonName: 'July to September 2025',
    numberOfGames: 12,
    autoReset: false,
    startDate: new Date(2025, 6, 1).toISOString(),
    endDate: new Date(2025, 8, 30).toISOString()
  }
};
