import { getAuth } from 'firebase/auth';
import { projectId, databaseId } from '@/lib/firebase';
import { sanitizeForFirestore } from '@/lib/utils';
import { eventNameOf } from '@/lib/eventName';
import type { TournamentState } from '@/types';

/**
 * Creating the server-side copy of a tournament.
 *
 * Lifted out of QRCodeSection so there is exactly ONE way a tournament document
 * comes into existence. It used to happen only at "Go Live", which quietly made
 * publishing to players the thing that decided whether a game was saved at all —
 * so a director who never showed a QR code had no cloud copy, could not resume on
 * another device, and lost the game on logging out.
 *
 * Saving and publishing are now separate: this creates the document, and Go Live
 * only sets isPublished.
 */

export function generateSecureCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes confusable 0/O/1/I
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// Convert a plain JS value to Firestore REST API field format
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  // Plain object → mapValue
  const fields: Record<string, any> = {};
  for (const k of Object.keys(val)) fields[k] = toFirestoreValue(val[k]);
  return { mapValue: { fields } };
}

// Write a document to Firestore via the REST API (bypasses SDK WebChannel issues).
// If docId is provided, it is used as the document ID (?documentId= query param).
export async function createDocViaRest(
  projectId: string,
  databaseId: string,
  collection: string,
  data: Record<string, any>,
  idToken: string,
  docId?: string,
): Promise<string> {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(databaseId)}/documents`;
  const fields: Record<string, any> = {};
  for (const k of Object.keys(data)) fields[k] = toFirestoreValue(data[k]);
  const url = docId ? `${base}/${collection}?documentId=${encodeURIComponent(docId)}` : `${base}/${collection}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields }),
  });

  // Document already exists with this localGameId (previous session) — overwrite it.
  if (res.status === 409 && docId) {
    const patchRes = await fetch(
      `${base}/${collection}/${encodeURIComponent(docId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ fields }),
      }
    );
    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Firestore error ${patchRes.status}`);
    }
    return docId;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Firestore error ${res.status}`);
  }

  const result = await res.json();
  // result.name is "projects/.../databases/.../documents/collection/docId"
  return result.name.split('/').pop() as string;
}


/**
 * The document a tournament starts life as.
 *
 * Kept here rather than at the call sites so the shape cannot drift between the
 * one that saves and the one that publishes.
 */
export function buildTournamentDocument(
  state: TournamentState,
  ownerId: string,
  leagueName?: string,
  isPublished = false,
) {
  return sanitizeForFirestore({
    name: state.details?.name || `Tournament ${new Date().toLocaleDateString()}`,
    currentLevel: state.currentLevel,
    secondsLeft: state.secondsLeft,
    isRunning: state.isRunning,
    buyIn: state.prizeStructure?.buyIn || 10,
    players: state.players || [],
    tables: state.details?.tables || [],
    blindLevels: state.levels || [],
    settings: {
      enableSounds: state.settings.enableSounds,
      enableVoice: state.settings.enableVoice,
      showSeconds: state.settings.showSeconds,
      showNextLevel: state.settings.showNextLevel,
      currency: state.settings.currency || '£',
      tables: state.settings.tables || {
        numberOfTables: 1,
        seatsPerTable: 9,
        tableNames: ['Table 1'],
      },
      branding: {
        // Participants see the same name as the big screen, league fallback included.
        leagueName: eventNameOf(state.settings, leagueName),
        logoUrl: state.settings.branding?.logoUrl || null,
        isVisible: state.settings.branding?.isVisible ?? true,
      },
      isSeasonTournament: state.settings.isSeasonTournament || false,
      leagueId: state.settings.leagueId || null,
      seasonId: state.settings.seasonId || null,
    },
    prizeStructure: state.prizeStructure || {
      buyIn: 10,
      enableBounties: false,
      bountyAmount: 0,
      manualPayouts: [],
    },
    participantCode: generateSecureCode(),
    directorCode: generateSecureCode(),
    ownerId,
    /**
     * Whether players may watch this game.
     *
     * A saved-but-unpublished game is the director's own working copy. Absent
     * means published: every document written before this existed was created by
     * Go Live, and their QR links must keep working.
     */
    isPublished,
  });
}

/**
 * Save a tournament to the director's account, returning its document id.
 *
 * The localGameId becomes the document id so result tracking is consistent
 * before and after the game is published.
 */
export async function createTournamentDocument(
  state: TournamentState,
  ownerId: string,
  leagueName?: string,
  isPublished = false,
): Promise<string> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) {
    throw new Error('Not signed in. Please log out and log back in, then try again.');
  }
  const idToken = await currentUser.getIdToken(true);

  return Promise.race([
    createDocViaRest(
      projectId,
      databaseId,
      'activeTournaments',
      {
        ...buildTournamentDocument(state, ownerId, leagueName, isPublished),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      idToken,
      state.details?.localGameId,
    ),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Could not reach Firestore. Check your internet connection and try again.')),
        15000,
      ),
    ),
  ]);
}
