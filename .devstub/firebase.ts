// Local render stub. Firebase AUTH rejects a fake API key, which is what stops
// the console rendering on this machine; Firestore initialises happily offline
// with a memory cache and simply fails its network calls. So the app, the
// Firestore instance and the collection refs are REAL — only `auth` is faked,
// alongside the useAuth stub. Aliased in by devstub.vite.config.ts only.
import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, memoryLocalCache } from 'firebase/firestore';

export const projectId = 'stackmate-local';
export const databaseId = '(default)';
export const app = initializeApp({ apiKey: 'local', projectId: 'stackmate-local', appId: 'local' });
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
export const auth = {
  currentUser: null,
  onAuthStateChanged: () => () => {},
  signOut: async () => {},
} as any;
export const collections = {
  leagues: collection(db, 'leagues'),
  seasons: collection(db, 'seasons'),
  leaguePlayers: collection(db, 'leaguePlayers'),
  tournamentResults: collection(db, 'tournamentResults'),
  activeTournaments: collection(db, 'activeTournaments'),
  leagueSettings: collection(db, 'leagueSettings'),
  tournamentTemplates: collection(db, 'tournamentTemplates'),
  completedTournaments: collection(db, 'completedTournaments'),
};
