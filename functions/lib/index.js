"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimTournament = exports.createTransferCode = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
/**
 * Director handover.
 *
 * Passing control of a live tournament to another person's device. This runs as
 * a Cloud Function rather than on the app's own Express server for one reason:
 * code running on Google's infrastructure receives admin credentials from the
 * runtime, so there is no service account key to create. The project inherits
 * an organisation policy (iam.disableServiceAccountKeyCreation) that forbids
 * creating one, and it is not ours to lift.
 *
 * Two things make this impossible to do from the client:
 *
 *  - `ownerId` is unwritable by clients on purpose. Every activeTournaments
 *    update branch in firestore.rules excludes it, so the old client-side
 *    handover could never have worked — it only ever showed a generic failure.
 *  - `activeTournaments` is world-readable, so a transfer code kept on that
 *    document could be read by every participant who scanned the QR. The code
 *    lives in `transferCodes`, which denies all client access; the Admin SDK
 *    bypasses rules and is the only thing that touches it.
 */
(0, app_1.initializeApp)();
/**
 * This project's data is NOT in the (default) database.
 *
 * It was provisioned by Google AI Studio and carries a generated name, which
 * the client passes explicitly to initializeFirestore. A bare getFirestore()
 * reads an empty (default) database and reports "not found" for everything.
 */
const DATABASE_ID = process.env.FIREBASE_DATABASE_ID?.trim() ||
    'ai-studio-127bb0ae-6c5c-42d1-a030-fd85760f05b1';
const db = (0, firestore_1.getFirestore)(DATABASE_ID);
/** Code characters, excluding the confusable 0/O and 1/I. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60 * 1000;
function newCode() {
    return Array.from((0, crypto_1.randomBytes)(CODE_LENGTH))
        .map(b => CODE_CHARS[b % CODE_CHARS.length])
        .join('');
}
/**
 * Generate a transfer code for a tournament you currently direct.
 *
 * Callable, so the Firebase SDK attaches and verifies the caller's ID token —
 * the uid is never taken from the payload, since a client that could name its
 * own uid could hand itself any tournament.
 */
exports.createTransferCode = (0, https_1.onCall)(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in to generate a transfer code.');
    }
    const tournamentId = String(request.data?.tournamentId || '').trim();
    if (!tournamentId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing tournamentId.');
    }
    const snap = await db.collection('activeTournaments').doc(tournamentId).get();
    if (!snap.exists) {
        throw new https_1.HttpsError('not-found', 'That tournament no longer exists.');
    }
    if (snap.data()?.ownerId !== uid) {
        throw new https_1.HttpsError('permission-denied', 'Only the current director can generate a transfer code.');
    }
    const code = newCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    // Keyed by tournament, so generating a new code replaces the old one and only
    // ever one code is live per tournament.
    await db.collection('transferCodes').doc(tournamentId).set({
        code,
        expiresAt,
        tournamentId,
        createdBy: uid,
        createdAt: new Date().toISOString(),
    });
    return { code, expiresAt };
});
/**
 * Redeem a transfer code and become the tournament's director.
 */
exports.claimTournament = (0, https_1.onCall)(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in to use a transfer code.');
    }
    const code = String(request.data?.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
        throw new https_1.HttpsError('invalid-argument', 'Code must be 6 letters or numbers.');
    }
    const matches = await db.collection('transferCodes').where('code', '==', code).limit(1).get();
    if (matches.empty) {
        throw new https_1.HttpsError('not-found', 'That code is not valid.');
    }
    const codeDoc = matches.docs[0];
    const data = codeDoc.data();
    if (!data.expiresAt || new Date(data.expiresAt).getTime() < Date.now()) {
        await codeDoc.ref.delete();
        throw new https_1.HttpsError('deadline-exceeded', 'That code has expired.');
    }
    const tournamentId = String(data.tournamentId || codeDoc.id);
    const tournamentRef = db.collection('activeTournaments').doc(tournamentId);
    if (!(await tournamentRef.get()).exists) {
        await codeDoc.ref.delete();
        throw new https_1.HttpsError('not-found', 'That tournament no longer exists.');
    }
    // Reassign and burn the code together, so a code cannot be used twice even if
    // two people submit it at the same moment.
    const batch = db.batch();
    batch.update(tournamentRef, { ownerId: uid });
    batch.delete(codeDoc.ref);
    await batch.commit();
    return { tournamentId };
});
//# sourceMappingURL=index.js.map