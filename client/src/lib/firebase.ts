import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

// Initialize Firebase SDK
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Collections
export const collections = {
  playerNames: collection(db, 'playerNames'),
  players: collection(db, 'players'),
  blindLevels: collection(db, 'blindLevels'),
  tournaments: collection(db, 'tournaments'),
  users: collection(db, 'users'),
  tournamentParticipants: collection(db, 'tournamentParticipants'),
  tableAssignments: collection(db, 'tableAssignments'),
  leagues: collection(db, 'leagues'),
  leagueMembers: collection(db, 'leagueMembers'),
  seasons: collection(db, 'seasons'),
  leaguePlayers: collection(db, 'leaguePlayers'),
  tournamentResults: collection(db, 'tournamentResults'),
  activeTournaments: collection(db, 'activeTournaments'),
  tournamentSnapshots: collection(db, 'tournamentSnapshots'),
  leagueSettings: collection(db, 'leagueSettings'),
  tournamentTemplates: collection(db, 'tournamentTemplates'),
};
