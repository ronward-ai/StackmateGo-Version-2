import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '',
};

const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || '';

// Initialize Firebase SDK
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);

// Collections
export const collections = {
  leagues: collection(db, 'leagues'),
  seasons: collection(db, 'seasons'),
  leaguePlayers: collection(db, 'leaguePlayers'),
  tournamentResults: collection(db, 'tournamentResults'),
  activeTournaments: collection(db, 'activeTournaments'),
  leagueSettings: collection(db, 'leagueSettings'),
  tournamentTemplates: collection(db, 'tournamentTemplates'),
};
