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
  /**
   * REMOVED. Points belong to the league, not to a player in a live game.
   *
   * Two formulas used to write this — `(players - position + 1) * 10` on
   * elimination and `players * 36` for the winner — and neither matched any
   * scheme a league can be set to; `36 * p` is the first-place figure of one
   * preset and nothing else. They were a third and fourth points evaluator
   * beside `calculatePoints` and the settings dialog's validator.
   *
   * Nothing read either. The points chip beside a name comes from
   * `calculatePoints` at the call site (PlayerSection), and the standings come
   * from `recordResultByName`, so both were already right.
   *
   * If a live points figure is ever wanted, derive it through `calculatePoints`
   * at the point of display. Do not store it on the player.
   */
  points?: never;
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
  chipCount?: number; // Current chip count (for active players)
  /**
   * @deprecated Read only, for tournaments started before check-in moved off
   * the players array. A check-in write here had the exact shape of every
   * other players-array write, so the rule admitting it could not tell "set
   * my claim" from "rename this player" or "eliminate this player" — any QR
   * visitor's anonymous session could reach either. See lib/seatClaims.ts,
   * which is where claims live now: `activeTournaments/{id}.claims`, a
   * top-level map of playerId to device id. Never write this field again;
   * read a seat's claim through `claimedByFor()`, which checks the new map
   * first and falls back to this one.
   */
  claimedBy?: string;
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

/**
 * How the clock is framed. Four treatments live in index.css; only 'ring'
 * encodes the level progress, so choosing any other brings back the flat
 * progress bar under the clock (TimerCard) — two ways of reading progress is
 * one too many, none is worse.
 */
export type TimerPiping = 'ring' | 'drift' | 'rails' | 'ember';

export interface Settings {
  enableSounds: boolean;
  /** Piping around the timer card. Absent means 'ring'. */
  timerPiping?: TimerPiping;
  /** When a BREAK ends, wait for the director to press play instead of
   *  starting the next level automatically. */
  pauseAfterBreak?: boolean;
  enableVoice?: boolean;
  showNextLevel: boolean;
  bigBlindAnte?: boolean;
  applyDurationToAll?: boolean;
  /**
   * @deprecated Recent players is no longer a setting — the suggestions appear
   * when they are useful and are absent otherwise, like League Roster quick-add.
   * Declared only so stored settings and older tournament documents, which still
   * carry the key, keep loading. Nothing reads it.
   */
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
  /**
   * @deprecated Legacy home for the payout percentages. Nothing reads this —
   * every money figure comes from `manualPayouts`. Read through `payoutsOf()`
   * in lib/payoutTemplates.ts, which honours it for structures saved before the
   * default was corrected, and never write to it.
   */
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
  prizePool?: number;
  type: 'standalone' | 'season' | 'database'; // Tournament classification
  seasonId?: string | number; // ID of the season this tournament belongs to
  seasonName?: string; // Name of the season for display // Which tournament in the season (e.g., Game 5)
  id?: number | string; // Database ID for database tournaments
  localGameId?: string; // Stable per-game ID for result tracking, set before "Go Live"
  tables?: any[];
  status?: string;
  createdAt?: string;
  createdBy?: string;
  ownerId?: string;
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
  prizeStructure?: PrizeStructure;
  isFinalTable?: boolean;
  /** Where everyone sat before the final-table redraw, so it can be undone. */
  preFinalTableSeating?: { playerId: string; seated: boolean; tableIndex?: number; seatIndex?: number }[];
  details?: TournamentDetails;
  notes?: string;
}
