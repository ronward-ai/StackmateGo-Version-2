import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  collection,
  memoryLocalCache,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '',
};

const KNOWN_DATABASE_ID = 'ai-studio-127bb0ae-6c5c-42d1-a030-fd85760f05b1';

export const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId || '').trim();
export const databaseId = (import.meta.env.VITE_FIREBASE_DATABASE_ID || '').trim() || KNOWN_DATABASE_ID;

// Initialize Firebase SDK
export const app = initializeApp(firebaseConfig);

// Use in-memory cache for all clients. This app is always-online real-time
// poker, so offline persistence buys nothing and an in-memory cache avoids a
// class of stale-data bugs.
//
// This was originally introduced to chase "quota limit exceeded" errors on
// mobile, on the theory that the persistent IndexedDB cache was exhausting
// device storage. That theory was wrong — a storage snapshot on an affected
// device showed 0.00 MB used of a 10 GB quota. The real cause was that the
// Firestore database was provisioned by Google AI Studio and ran under shared
// AI quota limits, unrelated to this project's usage or billing; it was fixed
// by moving the database to pay-as-you-go in the Firebase console. Keeping the
// memory cache on its own merits, not as a quota workaround.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
}, databaseId);
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
