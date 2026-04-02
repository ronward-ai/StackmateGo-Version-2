import { 
  PlayerName, 
  Tournament, 
  InsertPlayerName, 
  InsertTournament, 
  User, 
  UpsertUser, 
  TournamentParticipant, 
  InsertTournamentParticipant, 
  TableAssignment, 
  InsertTableAssignment,
  Player,
  InsertPlayer,
  BlindLevel,
  InsertBlindLevel
} from "../shared/schema.js";

// In-memory storage
let playerNames: PlayerName[] = [
  { id: 1, name: "Alice Johnson", createdAt: new Date().toISOString() },
  { id: 2, name: "Bob Smith", createdAt: new Date().toISOString() },
  { id: 3, name: "Charlie Brown", createdAt: new Date().toISOString() },
  { id: 4, name: "Diana Prince", createdAt: new Date().toISOString() },
  { id: 5, name: "Eve Wilson", createdAt: new Date().toISOString() }
];

let tournaments: Tournament[] = [];
let users: User[] = [];
let tournamentParticipants: TournamentParticipant[] = [];
let tableAssignments: TableAssignment[] = [];
let players: Player[] = [];
let blindLevels: BlindLevel[] = [
  { id: 1, small: 25, big: 50, duration: 1200, tournamentId: 1, levelOrder: 1 },
  { id: 2, small: 50, big: 100, duration: 1200, tournamentId: 1, levelOrder: 2 },
  { id: 3, small: 75, big: 150, duration: 1200, tournamentId: 1, levelOrder: 3 },
  { id: 4, small: 100, big: 200, duration: 1200, tournamentId: 1, levelOrder: 4 },
  { id: 5, small: 150, big: 300, duration: 1200, tournamentId: 1, levelOrder: 5 }
];

let nextPlayerNameId = 6;
let nextTournamentId = 1;
let nextParticipantId = 1;
let nextAssignmentId = 1;
let nextPlayerId = 1;
let nextBlindLevelId = 6;

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Tournament operations
  getTournaments(): Promise<Tournament[]>;
  getTournament(id: number): Promise<Tournament | undefined>;
  createTournament(tournament: InsertTournament): Promise<Tournament>;
  updateTournament(id: number, data: Partial<Tournament>): Promise<Tournament | undefined>;
  deleteTournament(id: number): Promise<boolean>;

  // Player name operations
  getPlayerNames(): Promise<PlayerName[]>;
  createPlayerName(playerName: InsertPlayerName): Promise<PlayerName>;
  deletePlayerName(id: number): Promise<boolean>;

  // Player operations (generic players, not tournament participants)
  getPlayers(): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: number, data: Partial<Player>): Promise<Player | undefined>;
  deletePlayer(id: number): Promise<boolean>;

  // Blind level operations
  getBlindLevels(): Promise<BlindLevel[]>;
  getBlindLevel(id: number): Promise<BlindLevel | undefined>;
  createBlindLevel(blindLevel: InsertBlindLevel): Promise<BlindLevel>;
  updateBlindLevel(id: number, data: Partial<BlindLevel>): Promise<BlindLevel | undefined>;
  deleteBlindLevel(id: number): Promise<boolean>;

  // Tournament participant operations
  getTournamentParticipants(tournamentId: number): Promise<TournamentParticipant[]>;
  addTournamentParticipant(participant: InsertTournamentParticipant): Promise<TournamentParticipant>;
  updateParticipantSeating(participantId: number, tableNumber: number, seatNumber: number): Promise<void>;
  setParticipantRole(tournamentId: number, userId: string, role: 'participant' | 'director' | 'admin'): Promise<boolean>;
  getParticipantRole(tournamentId: number, userId: string): Promise<string | null>;
  getTournamentDirectors(tournamentId: number): Promise<TournamentParticipant[]>;

  // Table assignment operations
  getTableAssignments(tournamentId: number): Promise<TableAssignment[]>;
  updateTableAssignments(tournamentId: number, assignments: InsertTableAssignment[]): Promise<void>;
}

export class MemoryStorage implements IStorage {
  constructor() {}

  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    return users.find(user => user.id === id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUserIndex = users.findIndex(user => user.id === userData.id);

    if (existingUserIndex >= 0) {
      // Update existing user
      const updatedUser: User = {
        ...users[existingUserIndex],
        id: userData.id,
        email: userData.email || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        updatedAt: new Date()
      };
      users[existingUserIndex] = updatedUser;
      return updatedUser;
    } else {
      // Create new user
      const newUser: User = {
        id: userData.id,
        email: userData.email || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      users.push(newUser);
      return newUser;
    }
  }

  // Tournament participant operations
  async getTournamentParticipants(tournamentId: number): Promise<TournamentParticipant[]> {
    return tournamentParticipants.filter(p => p.tournamentId === tournamentId);
  }

  async addTournamentParticipant(participant: InsertTournamentParticipant): Promise<TournamentParticipant> {
    const newParticipant: TournamentParticipant = {
      id: nextParticipantId++,
      tournamentId: participant.tournamentId,
      userId: participant.userId,
      playerName: participant.playerName,
      tableNumber: participant.tableNumber || null,
      seatNumber: participant.seatNumber || null,
      isDirector: participant.isDirector || false,
      role: participant.role || 'participant',
      isAnonymous: participant.isAnonymous || false,
      joinedAt: new Date().toISOString()
    };
    tournamentParticipants.push(newParticipant);
    return newParticipant;
  }

  async setParticipantRole(tournamentId: number, userId: string, role: 'participant' | 'director' | 'admin'): Promise<boolean> {
    const participant = tournamentParticipants.find(p => p.tournamentId === tournamentId && p.userId === userId);
    if (participant) {
      participant.role = role;
      participant.isDirector = role === 'director' || role === 'admin';
      return true;
    }
    return false;
  }

  async getParticipantRole(tournamentId: number, userId: string): Promise<string | null> {
    const participant = tournamentParticipants.find(p => p.tournamentId === tournamentId && p.userId === userId);
    return participant ? participant.role : null;
  }

  async getTournamentDirectors(tournamentId: number): Promise<TournamentParticipant[]> {
    return tournamentParticipants.filter(p => p.tournamentId === tournamentId && p.isDirector);
  }

  async updateParticipantSeating(participantId: number, tableNumber: number, seatNumber: number): Promise<void> {
    const participant = tournamentParticipants.find(p => p.id === participantId);
    if (participant) {
      participant.tableNumber = tableNumber;
      participant.seatNumber = seatNumber;
    }
  }

  async getTableAssignments(tournamentId: number): Promise<TableAssignment[]> {
    return tableAssignments.filter(a => a.tournamentId === tournamentId);
  }

  async updateTableAssignments(tournamentId: number, assignments: InsertTableAssignment[]): Promise<void> {
    // Remove existing assignments for this tournament
    tableAssignments = tableAssignments.filter(a => a.tournamentId !== tournamentId);

    // Add new assignments
    for (const assignment of assignments) {
      const newAssignment: TableAssignment = {
        id: nextAssignmentId++,
        tournamentId: assignment.tournamentId,
        playerId: assignment.playerId ?? null,
        playerName: assignment.playerName ?? null,
        isActive: assignment.isActive ?? true,
        tableNumber: assignment.tableNumber,
        seatNumber: assignment.seatNumber
      };
      tableAssignments.push(newAssignment);
    }
  }

  // Tournament operations
  async getTournaments(): Promise<Tournament[]> {
    return tournaments;
  }

  // Player name operations
  async getPlayerNames(): Promise<PlayerName[]> {
    return playerNames;
  }

  async createPlayerName(playerName: InsertPlayerName): Promise<PlayerName> {
    const newPlayerName: PlayerName = {
      id: nextPlayerNameId++,
      name: playerName.name,
      createdAt: new Date().toISOString()
    };
    playerNames.push(newPlayerName);
    return newPlayerName;
  }

  async deletePlayerName(id: number): Promise<boolean> {
    const index = playerNames.findIndex(p => p.id === id);
    if (index >= 0) {
      playerNames.splice(index, 1);
      return true;
    }
    return false;
  }

  async getTournament(id: number): Promise<Tournament | undefined> {
    return tournaments.find(t => t.id === id);
  }

  async createTournament(tournament: InsertTournament): Promise<Tournament> {
    const newTournament: Tournament = {
      id: nextTournamentId++,
      name: tournament.name,
      secondsLeft: tournament.secondsLeft,
      currentLevel: tournament.currentLevel || 1,
      isRunning: tournament.isRunning || false,
      buyIn: tournament.buyIn || 0,
      enableSounds: tournament.enableSounds || false,
      enableVoice: tournament.enableVoice || false,
      showSeconds: tournament.showSeconds || false,
      showNextLevel: tournament.showNextLevel || false,
      accessCode: tournament.accessCode || null,
      participantCode: tournament.participantCode || Math.random().toString(36).substr(2, 6).toUpperCase(),
      directorCode: tournament.directorCode || Math.random().toString(36).substr(2, 6).toUpperCase(),
    };
    tournaments.push(newTournament);
    return newTournament;
  }

  async updateTournament(id: number, data: Partial<Tournament>): Promise<Tournament | undefined> {
    const index = tournaments.findIndex(t => t.id === id);
    if (index >= 0) {
      tournaments[index] = { ...tournaments[index], ...data };
      return tournaments[index];
    }
    return undefined;
  }

  async deleteTournament(id: number): Promise<boolean> {
    const index = tournaments.findIndex(t => t.id === id);
    if (index >= 0) {
      tournaments.splice(index, 1);
      return true;
    }
    return false;
  }

  // Player operations
  async getPlayers(): Promise<Player[]> {
    return players;
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    return players.find(p => p.id === id);
  }

  async createPlayer(player: InsertPlayer): Promise<Player> {
    const newPlayer: Player = {
      id: nextPlayerId++,
      name: player.name,
      knockouts: player.knockouts || 0,
      tournamentId: player.tournamentId
    };
    players.push(newPlayer);
    return newPlayer;
  }

  async updatePlayer(id: number, data: Partial<Player>): Promise<Player | undefined> {
    const index = players.findIndex(p => p.id === id);
    if (index >= 0) {
      players[index] = { ...players[index], ...data };
      return players[index];
    }
    return undefined;
  }

  async deletePlayer(id: number): Promise<boolean> {
    const index = players.findIndex(p => p.id === id);
    if (index >= 0) {
      players.splice(index, 1);
      return true;
    }
    return false;
  }

  // Blind level operations
  async getBlindLevels(): Promise<BlindLevel[]> {
    return blindLevels;
  }

  async getBlindLevel(id: number): Promise<BlindLevel | undefined> {
    return blindLevels.find(b => b.id === id);
  }

  async createBlindLevel(blindLevel: InsertBlindLevel): Promise<BlindLevel> {
    const newBlindLevel: BlindLevel = {
      id: nextBlindLevelId++,
      small: blindLevel.small,
      big: blindLevel.big,
      duration: blindLevel.duration,
      tournamentId: blindLevel.tournamentId,
      levelOrder: blindLevel.levelOrder
    };
    blindLevels.push(newBlindLevel);
    return newBlindLevel;
  }

  async updateBlindLevel(id: number, data: Partial<BlindLevel>): Promise<BlindLevel | undefined> {
    const index = blindLevels.findIndex(b => b.id === id);
    if (index >= 0) {
      blindLevels[index] = { ...blindLevels[index], ...data };
      return blindLevels[index];
    }
    return undefined;
  }

  async deleteBlindLevel(id: number): Promise<boolean> {
    const index = blindLevels.findIndex(b => b.id === id);
    if (index >= 0) {
      blindLevels.splice(index, 1);
      return true;
    }
    return false;
  }
}

export const storage = new MemoryStorage();