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
  blindLevels: collection(db, 'blindLevels'),
  leagues: collection(db, 'leagues'),
  seasons: collection(db, 'seasons'),
  leaguePlayers: collection(db, 'leaguePlayers'),
  tournamentResults: collection(db, 'tournamentResults'),
  activeTournaments: collection(db, 'activeTournaments'),
  leagueSettings: collection(db, 'leagueSettings'),
  tournamentTemplates: collection(db, 'tournamentTemplates'),
};
