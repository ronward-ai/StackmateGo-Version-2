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
  claimedBy?: string; // Firebase anonymous UID of player who claimed this seat
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
  /** When a BREAK ends, wait for the director to press play instead of
   *  starting the next level automatically. */
  pauseAfterBreak?: boolean;
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
    /**
     * Name shown on the big screen and in the participant view — the EVENT, not
     * the league. A standalone tournament has one of these and no league at all.
     *
     * Distinct from `leagues/{id}.name`, which is the league entity and appears
     * in the standings title. Both were previously called "league name", so
     * renaming the league appeared to do nothing to the on-screen header.
     */
    eventName?: string;
    /** @deprecated Former name for eventName. Read via eventNameOf() for
     *  existing tournaments; never written to any more. */
    leagueName?: string;
    logoUrl?: string;
    isVisible?: boolean;
  };
  currency?: string; // Currency symbol (£, $, €, etc.)
  isSeasonTournament?: boolean;
  leagueId?: string;
  seasonId?: string;
  seasonName?: string;
  numberOfGames?: number;
  gameNumber?: number;
  notes?: string;
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
  rebuyRake?: boolean;
  rebuyRakeAmount?: number;
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
  reEntryRake?: boolean;
  reEntryRakeAmount?: number;
  rebuyBounty?: boolean;
  reEntryBounty?: boolean;
  maxReEntries?: number;
  reEntryPeriodLevels?: number;
  startingChips?: number;
  rebuyChips?: number;
  addonChips?: number;
  addonAvailableLevel?: number;
}

/**
 * A finished tournament, kept as history.
 *
 * Standalone games previously left no record at all — results are only written
 * to tournamentResults for league games — so once a new tournament started the
 * old standings were gone. League games are stored here too, so history is one
 * list rather than two.
 */
export interface CompletedTournament {
  id?: string;
  ownerId: string;
  name?: string;
  type: 'standalone' | 'season' | 'database';
  /** Stable per-game id, so re-finishing the same game overwrites rather than duplicates. */
  localGameId?: string;
  seasonId?: string;
  seasonName?: string;
  leagueId?: string;
  startTime?: string;
  endTime: string;
  playerCount: number;
  winner?: string;
  buyIn: number;
  currency?: string;
  prizePool: number;
  rake?: number;
  totalRebuys?: number;
  totalAddons?: number;
  totalReEntries?: number;
  results: Array<{
    playerId: string;
    playerName: string;
    position: number;
    prizeMoney: number;
    knockouts?: number;
    rebuys?: number;
    addons?: number;
  }>;
  createdAt?: any;
}

export interface TournamentTemplate {
  id?: string;
  name: string;
  ownerId: string;
  blindLevels: BlindLevel[];
  prizeStructure: PrizeStructure;
  templateType?: 'blindLevels' | 'tournament';
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
  localGameId?: string; // Stable per-game ID for result tracking, set before "Go Live"
  tables?: any[];
  status?: string;
  createdAt?: string;
  createdBy?: string;
  ownerId?: string;
  directorCode?: string;
  participantCode?: string;
  /**
   * Whether players may watch this game.
   *
   * Mirrored from the document so the director's screen can tell a saved game
   * from a published one — since auto-save, having a document id no longer
   * means the QR works. Absent means published: every document written before
   * the field existed came from Go Live.
   */
  isPublished?: boolean;
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
