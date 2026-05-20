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
// poker — there is no meaningful offline use case. Persistent IndexedDB cache
// reliably triggers QuotaExceededError on iOS Safari (including iPadOS 13+
// which reports as "Macintosh" so UA detection is unreliable) and can cause
// stale-cache bugs on desktop. Memory cache is simpler and quota-safe.
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
