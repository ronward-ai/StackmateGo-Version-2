import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

/**
 * Director handover — passing control of a live tournament to another device.
 *
 * WHY THIS SHAPE
 *
 * Handover has never worked. The original client wrote `ownerId` straight to the
 * tournament document, which every `activeTournaments` update branch rejects on
 * purpose, so it only ever showed a generic failure. A Cloud Function version
 * was written but could not be deployed: it needed a service account key, and
 * the project inherits a Google organisation policy forbidding key creation.
 *
 * So it runs in the security rules, which deploy by pasting into the Firebase
 * console — the one deployment route this project actually has.
 *
 * WHY THE CODE IS NOT ON THE TOURNAMENT DOCUMENT
 *
 * `activeTournaments` is world-readable: every participant who scans the QR can
 * read it. A code stored there could be read by any of them, and they could take
 * the game over. The code is instead the ID of a document in `transferCodes`,
 * which cannot be listed — so it can only be read by someone who already knows
 * the six characters.
 */

/** Excludes the confusable 0/O and 1/I. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60 * 1000;

export class HandoverError extends Error {}

function newCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new HandoverError('Sign in first, then try again.');
  return uid;
}

/**
 * Generate a transfer code for a tournament you currently direct.
 *
 * The rules only permit the write if you own the tournament, so a permission
 * error here means you are not its director.
 */
export async function createTransferCode(
  tournamentId: string,
): Promise<{ code: string; expiresAt: string }> {
  const uid = requireUid();
  const code = newCode();
  const expiresAtMs = Date.now() + CODE_TTL_MS;

  try {
    await setDoc(doc(db, 'transferCodes', code), {
      tournamentId: String(tournamentId),
      expiresAtMs,
      createdBy: uid,
      createdAt: new Date().toISOString(),
    });
  } catch {
    throw new HandoverError(
      'Could not create a transfer code. Only the current director of this tournament can.',
    );
  }

  return { code, expiresAt: new Date(expiresAtMs).toISOString() };
}

/**
 * Redeem a transfer code and become the tournament's director.
 *
 * Taking ownership and burning the code happen in one batch, so a code cannot be
 * used twice even if two people submit it at the same moment — and the code
 * stops working the instant the claim lands, which is what makes it safe for the
 * submitted code to touch the world-readable tournament document at all.
 */
export async function claimTournament(code: string): Promise<string> {
  const uid = requireUid();
  const trimmed = code.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(trimmed)) {
    throw new HandoverError('A transfer code is six letters and numbers.');
  }

  const codeRef = doc(db, 'transferCodes', trimmed);
  const codeSnap = await getDoc(codeRef).catch(() => null);
  if (!codeSnap?.exists()) {
    throw new HandoverError('That code is not valid. Check it and try again.');
  }

  const data = codeSnap.data() as { tournamentId?: string; expiresAtMs?: number };
  const tournamentId = data?.tournamentId;
  if (!tournamentId) {
    throw new HandoverError('That code is not valid. Check it and try again.');
  }

  // Checked here for a clear message; the rules enforce it regardless.
  if (!data.expiresAtMs || data.expiresAtMs < Date.now()) {
    await deleteDoc(codeRef).catch(() => {});
    throw new HandoverError('That code has expired. Ask for a new one.');
  }

  const tournamentRef = doc(db, 'activeTournaments', tournamentId);

  try {
    const batch = writeBatch(db);
    // claimCode is how the rules see the code at all — they can only read what
    // the request carries. It is cleared immediately below.
    batch.update(tournamentRef, { ownerId: uid, claimCode: trimmed });
    batch.delete(codeRef);
    await batch.commit();
  } catch {
    throw new HandoverError('That code is no longer valid. Ask for a new one.');
  }

  // Tidy the spent code off the tournament document. Best effort: the code it
  // names was destroyed by the batch above, so it already unlocks nothing.
  await updateDoc(tournamentRef, { claimCode: deleteField() }).catch(() => {});

  return tournamentId;
}
