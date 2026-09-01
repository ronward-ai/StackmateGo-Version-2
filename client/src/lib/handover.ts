import { getFunctions, httpsCallable, type FunctionsError } from 'firebase/functions';
import { app } from '@/lib/firebase';

/**
 * Director handover, via Cloud Functions.
 *
 * Callable functions rather than plain HTTP: the Firebase SDK attaches the
 * signed-in user's ID token and the function verifies it, so the caller's
 * identity never travels as a uid in the payload — a client that could name its
 * own uid could hand itself any tournament. CORS is handled too.
 *
 * This runs as a Cloud Function rather than on the app's own Express server
 * because the project inherits an organisation policy forbidding service
 * account key creation. Code on Google's infrastructure gets its admin
 * credentials from the runtime, so there is no key to create.
 *
 * See functions/src/index.ts.
 */

const functions = getFunctions(app);

const callCreateTransferCode = httpsCallable<
  { tournamentId: string },
  { code: string; expiresAt: string }
>(functions, 'createTransferCode');

const callClaimTournament = httpsCallable<
  { code: string },
  { tournamentId: string }
>(functions, 'claimTournament');

/** A failure with a message worth putting in front of the director. */
export class HandoverError extends Error {}

/**
 * Turn a callable rejection into something a person can act on.
 *
 * The function throws HttpsError with a message written for the director, so
 * prefer that. `internal` is the code the SDK uses when it could not reach the
 * function at all — including when it has never been deployed — which would
 * otherwise surface as the unhelpful "internal".
 */
function toHandoverError(err: unknown): HandoverError {
  const e = err as FunctionsError;
  if (e?.code === 'functions/internal' || e?.code === 'functions/unavailable') {
    return new HandoverError('Handover is unavailable right now. Please try again.');
  }
  return new HandoverError(e?.message || 'Something went wrong. Please try again.');
}

/** Generate a transfer code for a tournament you currently direct. */
export async function createTransferCode(
  tournamentId: string,
): Promise<{ code: string; expiresAt: string }> {
  try {
    const { data } = await callCreateTransferCode({ tournamentId });
    return data;
  } catch (err) {
    throw toHandoverError(err);
  }
}

/** Redeem a transfer code and become the tournament's director. */
export async function claimTournament(code: string): Promise<string> {
  try {
    const { data } = await callClaimTournament({ code });
    return data.tournamentId;
  } catch (err) {
    throw toHandoverError(err);
  }
}
