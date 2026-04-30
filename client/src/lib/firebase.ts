import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection } from 'firebase/firestore';
import fallbackConfig from '../../../firebase-applet-config.json';

// Use VITE_ env vars if set (production deployments), otherwise fall back to
// the bundled JSON config (dev / environments without env vars configured)
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || fallbackConfig.apiKey,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || fallbackConfig.authDomain,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || fallbackConfig.projectId,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || fallbackConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackConfig.messagingSenderId,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || fallbackConfig.appId,
};

const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || fallbackConfig.firestoreDatabaseId;

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
