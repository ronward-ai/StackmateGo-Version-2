import { pgTable, text, serial, integer, boolean, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Reusable player names
export const playerNames = pgTable("player_names", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: text("created_at").notNull()
});

// Player model
export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  knockouts: integer("knockouts").notNull().default(0),
  tournamentId: integer("tournament_id").notNull()
});

// Blind Level model
export const blindLevels = pgTable("blind_levels", {
  id: serial("id").primaryKey(),
  small: integer("small").notNull(),
  big: integer("big").notNull(),
  ante: integer("ante").notNull().default(0),
  duration: integer("duration").notNull(), // in seconds
  tournamentId: integer("tournament_id").notNull(),
  levelOrder: integer("level_order").notNull() // To maintain the order of levels
});

// Tournament model
export const tournaments = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  currentLevel: integer("current_level").notNull().default(0),
  secondsLeft: integer("seconds_left").notNull(),
  isRunning: boolean("is_running").notNull().default(false),
  buyIn: integer("buy_in").notNull().default(10),
  enableSounds: boolean("enable_sounds").notNull().default(true),
  enableVoice: boolean("enable_voice").notNull().default(false),
  showSeconds: boolean("show_seconds").notNull().default(true),
  showNextLevel: boolean("show_next_level").notNull().default(true),
  accessCode: text("access_code"), // For participants to join
  directorCode: text("director_code"), // For directors to join
  participantCode: text("participant_code") // For participants to join
});

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tournament participants with role-based access
export const tournamentParticipants = pgTable("tournament_participants", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull(),
  userId: varchar("user_id").notNull(),
  playerName: text("player_name").notNull(),
  tableNumber: integer("table_number"),
  seatNumber: integer("seat_number"),
  isDirector: boolean("is_director").notNull().default(false),
  role: text("role").notNull().default("participant"), // "participant", "director", "admin"
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  joinedAt: text("joined_at").notNull()
});

// Table assignments
export const tableAssignments = pgTable("table_assignments", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull(),
  tableNumber: integer("table_number").notNull(),
  seatNumber: integer("seat_number").notNull(),
  playerId: text("player_id"), // References the tournament player ID
  playerName: text("player_name"),
  isActive: boolean("is_active").notNull().default(true)
});

// Insert schemas
export const insertPlayerNameSchema = createInsertSchema(playerNames).omit({ id: true, createdAt: true });
export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export const insertBlindLevelSchema = createInsertSchema(blindLevels).omit({ id: true });
export const insertTournamentSchema = z.object({
  name: z.string().min(1, "Tournament name is required"),
  buyIn: z.number().min(0).default(0),
  smallBlind: z.number().min(1).default(25),
  bigBlind: z.number().min(1).default(50),
  playerCount: z.number().min(2).default(10),
  levelDuration: z.number().min(1).default(15),
  maxPlayers: z.number().min(1).default(50),
  maxTables: z.number().min(1).default(10),
  isActive: z.boolean().default(true),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  participantCode: z.string().optional(),
  directorCode: z.string().optional(),
});
export const insertTournamentParticipantSchema = createInsertSchema(tournamentParticipants).omit({ id: true });
export const insertTableAssignmentSchema = createInsertSchema(tableAssignments).omit({ id: true });

// Types
export type InsertPlayerName = z.infer<typeof insertPlayerNameSchema>;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type InsertBlindLevel = z.infer<typeof insertBlindLevelSchema>;
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export const tournamentSchema = insertTournamentSchema.extend({
  id: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  participantCode: z.string().optional(),
  directorCode: z.string().optional(),
});
export type InsertTournamentParticipant = z.infer<typeof insertTournamentParticipantSchema>;
export type InsertTableAssignment = z.infer<typeof insertTableAssignmentSchema>;

export type PlayerName = typeof playerNames.$inferSelect;
export type Player = typeof players.$inferSelect;
export type BlindLevel = typeof blindLevels.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type TournamentParticipant = typeof tournamentParticipants.$inferSelect;
export type TableAssignment = typeof tableAssignments.$inferSelect;
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;