export interface BlindLevel {
  small: number;
  big: number;
  ante?: number; // Optional ante amount
  duration: number; // in seconds
  isBreak?: boolean; // Flag to indicate if this is a break
}

export interface Player {
  id: string;
  name: string;
  knockouts: number;
  seated?: boolean;
  position?: number;
  points?: number;
  eliminatedBy?: string;
  prizeMoney?: number;
  isActive?: boolean;
  seatInfo?: { tableIndex: number; seatIndex: number; totalSeatedPlayers: number };
  tableAssignment?: { tableIndex: number; seatIndex: number };
  rebuys?: number;
  addons?: number;
  reEntries?: number;
  currentBounty?: number;
  bountyWinnings?: number;
  totalInvestment?: number;
  canRebuy?: boolean;
  eliminationLevel?: number; // Level at which player was eliminated
  playTime?: number; // Total play time in seconds
  chipCount?: number; // Current chip count (for active players)
}

export interface TableConfig {
  numberOfTables: number;
  seatsPerTable: number;
  tableNames?: string[]; // Array of custom table names
}

export interface BrandingSettings {
  leagueName: string;
  logoUrl?: string;
  isVisible?: boolean; // Toggle for showing/hiding branding
}

export interface Settings {
  enableSounds: boolean;
  enableVoice?: boolean;
  showSeconds: boolean;
  showNextLevel: boolean;
  bigBlindAnte?: boolean;
  applyDurationToAll?: boolean;
  enableRecentPlayers?: boolean;
  tables?: {
    numberOfTables: number;
    seatsPerTable: number;
    tableNames?: string[];
  };
  tableBackgrounds?: string[];
  branding?: {
    leagueName?: string;
    logoUrl?: string;
    isVisible?: boolean;
  };
  currency?: string; // Currency symbol (£, $, €, etc.)
}

export interface BestLosingHand {
  playerName: string;
  handDescription: string;
  beatenBy: string; // Player who won with the hand that beat this one
  date?: string; // Optional date when it happened
  notes?: string; // Optional additional notes
}

export interface PrizeStructure {
  buyIn: number;
  rebuyAmount?: number;
  addonAmount?: number;
  maxRebuys?: number;
  rebuyPeriodLevels?: number;
  allowRebuys?: boolean;
  allowAddons?: boolean;
  rakePercentage?: number;
  rakeAmount?: number;
  rakeType?: 'percentage' | 'fixed';
  structure?: Array<{
    position: number;
    percentage: number;
  }>;
  manualPayouts?: Array<{
    position: number;
    percentage: number;
  }>;
  bountyAmount?: number;
  enableBounties?: boolean;
  bountyType?: 'standard' | 'progressive';
  allowReEntry?: boolean;
  startingChips?: number;
  rebuyChips?: number;
  addonChips?: number;
  addonAvailableLevel?: number;
}

export interface TournamentTemplate {
  id?: string;
  name: string;
  ownerId: string;
  blindLevels: BlindLevel[];
  prizeStructure: PrizeStructure;
  createdAt?: string;
  updatedAt?: string;
}

export interface TournamentDetails {
  name?: string;
  startTime?: string;
  endTime?: string;
  league?: string;
  season?: string;
  prizePool?: number;
  totalEntrants?: number;
  type: 'standalone' | 'season' | 'database'; // Tournament classification
  seasonId?: string | number; // ID of the season this tournament belongs to
  seasonName?: string; // Name of the season for display
  tournamentNumber?: number; // Which tournament in the season (e.g., Game 5)
  id?: number | string; // Database ID for database tournaments
  tables?: any[];
  status?: string;
  createdAt?: string;
  createdBy?: string;
  ownerId?: string;
  directorCode?: string;
  participantCode?: string;
}

export interface TournamentState {
  levels: BlindLevel[];
  players: Player[];
  currentLevel: number;
  secondsLeft: number;
  targetEndTime?: number;
  isRunning: boolean;
  settings: Settings;
  bestLosingHand?: BestLosingHand;
  prizeStructure?: PrizeStructure;
  isFinalTable?: boolean;
  details?: TournamentDetails;
  notes?: string;
}