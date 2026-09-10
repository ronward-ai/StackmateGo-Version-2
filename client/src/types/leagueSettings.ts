
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
  reEntries: boolean; // Total re-entry count across all games
  itmPercentage: boolean; // % of games finishing in the money
  addOns: boolean; // Total add-on count across all games
  totalInvested: boolean; // Sum of buy-ins + rebuys + add-ons
  bountiesWon: boolean; // Bounty money collected — an amount, not a count of heads (that is Hits)
  attendancePercent: boolean; // Games attended as % of total season games
  currentStreak: boolean; // Consecutive in-the-money finishes (most recent)
  biggestWin: boolean; // Highest single-tournament cash amount
  worstFinish: boolean; // Lowest finishing position recorded
  winRate: boolean; // % of games won (1st place finishes)
  bestFinish: boolean; // Best finishing position recorded
  earlyExits: boolean; // Finishes in bottom 20% of field
}

export interface LeagueSettings {
  id: string;
  name: string;
  pointsSystem: PointsSystem;
  statsToTrack: LeagueStatsTracked; // Always all enabled - these are calculated
  statsToDisplay: LeagueStatsDisplay; // User configurable for league table
  statsOrder?: string[]; // Column display order — ordered list of stat keys
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

export const STAT_LABELS: Record<string, string> = {
  points: 'Points',
  games: 'Games',
  averagePoints: 'Avg. Points',
  firstPlaceFinishes: '1st Place',
  secondPlaceFinishes: '2nd Place',
  thirdPlaceFinishes: '3rd Place',
  hits: 'Hits',
  cashWinnings: 'Cash',
  averagePosition: 'Avg. Pos',
  finalTableAppearances: 'Final Tables',
  profit: 'Profit',
  roi: 'ROI',
  rebuys: 'Rebuys',
  reEntries: 'Re-entries',
  itmPercentage: 'ITM %',
  addOns: 'Add-ons',
  totalInvested: 'Invested',
  bountiesWon: 'Bounty £',
  attendancePercent: 'Attendance',
  currentStreak: 'Streak',
  biggestWin: 'Biggest Win',
  worstFinish: 'Worst',
  winRate: 'Win Rate',
  bestFinish: 'Best Finish',
  earlyExits: 'Early Exits',
};

// Predefined points systems
/**
 * The scoring schemes, named for what they DO.
 *
 * They were labelled Logarithmic, Square Root and Linear — curve families, which
 * is how the maths thinks and not how a director does. Nobody setting up a home
 * league wants to pick between logarithms; they want the winner to get a lot
 * more than second, or everyone to score close together.
 *
 * `mathName` keeps the technical term for anyone who does think that way, and
 * the Points tab shows a live table of what each one actually pays — the choice
 * is made by looking, like the timer piping swatches.
 */
export const POINTS_SYSTEMS = {
  logarithmic: {
    id: 'logarithmic',
    name: 'Close together',
    mathName: 'Logarithmic',
    // Honest about what the numbers do. With the defaults a field of 12 scores
    // 38, 24, 23, 23, 21 — second to fifth are nearly level, and the gap is
    // almost entirely the winner's bonus. It used to claim it "rewards top
    // finishes heavily", which the table plainly contradicts.
    description: 'Everyone finishes on similar points, with a clear bonus for the winner',
    formula: {
      type: 'logarithmic' as const,
      baseMultiplier: 10,
      winnerMultiplier: 1.5
    }
  },
  squareRoot: {
    id: 'square-root',
    name: 'Balanced',
    mathName: 'Square root',
    description: 'A steady drop down the field, without a runaway winner',
    formula: {
      type: 'squareRoot' as const,
      baseMultiplier: 10,
      winnerMultiplier: 1.2
    }
  },
  linear: {
    id: 'linear',
    name: 'Even steps',
    mathName: 'Linear',
    description: 'Every place is worth the same amount more than the one below it',
    formula: {
      type: 'linear' as const,
      baseMultiplier: 10,
      winnerMultiplier: 1.0
    }
  },
  fixed: {
    id: 'fixed',
    name: 'Set points per place',
    mathName: 'Fixed',
    description: 'You choose exactly what each finishing position scores',
    formula: {
      type: 'fixed' as const,
      positionPoints: [25, 18, 13, 9, 6, 4, 3, 2, 1] // Default: positions 1-9 get these points, 10+ get 0
    }
  },
  custom: {
    id: 'custom',
    name: 'Custom formula (advanced)',
    mathName: 'Custom',
    description: 'Write the scoring yourself, or load a known scheme',
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
    rebuys: false,
    reEntries: false,
    itmPercentage: false,
    addOns: false,
    totalInvested: false,
    bountiesWon: false,
    attendancePercent: false,
    currentStreak: false,
    biggestWin: false,
    worstFinish: false,
    winRate: false,
    bestFinish: false,
    earlyExits: false
  },
  statsOrder: [
    'points', 'games', 'averagePoints', 'firstPlaceFinishes', 'secondPlaceFinishes',
    'thirdPlaceFinishes', 'hits', 'cashWinnings', 'averagePosition', 'finalTableAppearances',
    'profit', 'roi', 'rebuys', 'reEntries', 'itmPercentage', 'addOns', 'totalInvested',
    'bountiesWon', 'attendancePercent', 'currentStreak', 'biggestWin', 'worstFinish',
    'winRate', 'bestFinish', 'earlyExits'
  ],
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
