import type { Player } from '@/types';
import { readScoped, removeScoped, writeScoped } from './scopedStorage';

/**
 * The live part of a local game — everything the settings/levels/prize-structure
 * keys do not already cover.
 *
 * Players were never persisted, so a refresh has always lost the roster of a game
 * that had not gone live, and logging out (a full page load since d95771a) made
 * that reachable by an ordinary action: six players and two bust-outs, gone.
 *
 * Keyed by localGameId so starting a new game never inherits the last one's
 * roster, and stored per account (lib/scopedStorage.ts) so a second director
 * signing in on the same browser never inherits the first one's. The uid is
 * passed in rather than looked up here, because this module stays free of React
 * and Firebase — the lib/ convention that keeps it testable without mocking.
 */
export const LOCAL_PROGRESS_KEY = 'tournamentLocalProgress';

export interface LocalProgress {
  localGameId: string;
  players: Player[];
  currentLevel: number;
  secondsLeft: number;
  isRunning: boolean;
  targetEndTime?: number;
  isFinalTable?: boolean;
  /** Which live game this mirrors, so it can never be offered for another. */
  dbTournamentId?: string;
  /** ISO, so the offer can say how old the copy is. */
  updatedAt?: string;
}

/**
 * Why there is no mirror to offer.
 *
 * `absent` and `corrupt` both used to return null and read identically to the
 * caller — so a mirror that existed but could not be parsed looked exactly like
 * never having had one, which is the single case where a director would want to
 * know. `mismatch` is ordinary: the mirror belongs to a different game.
 */
export type LocalProgressMiss = 'absent' | 'mismatch' | 'corrupt';

export function readLocalProgress(
  localGameId?: string,
  uid: string | null = null,
): { progress: LocalProgress } | { miss: LocalProgressMiss } {
  if (!localGameId) return { miss: 'absent' };

  const raw = readScoped(LOCAL_PROGRESS_KEY, uid);
  if (!raw) return { miss: 'absent' };

  let saved: LocalProgress;
  try {
    saved = JSON.parse(raw) as LocalProgress;
  } catch (err) {
    console.error('The local backup of this game could not be read:', err);
    return { miss: 'corrupt' };
  }

  if (!saved || !Array.isArray(saved.players)) {
    console.error('The local backup of this game is not the right shape.');
    return { miss: 'corrupt' };
  }
  if (saved.localGameId !== localGameId) return { miss: 'mismatch' };
  return { progress: saved };
}

/** The original shape, for callers that only want the roster or nothing. */
export function loadLocalProgress(localGameId?: string, uid: string | null = null): LocalProgress | null {
  const result = readLocalProgress(localGameId, uid);
  return 'progress' in result ? result.progress : null;
}

export function saveLocalProgress(progress: LocalProgress, uid: string | null = null) {
  writeScoped(LOCAL_PROGRESS_KEY, JSON.stringify(progress), uid);
}

/**
 * Forget the local copy when a game genuinely ends or is replaced.
 *
 * It used to be cleared the moment a game became a database tournament, on the
 * reasoning that the blob stands in for a cloud copy and keeping it once there
 * is one makes it a rival source of truth. The hazard is real — a roster from
 * before a game was saved once survived a logout and was resurrected over the
 * real game two hours further on.
 *
 * But it assumed Firestore was REACHABLE. With an ad blocker cancelling every
 * write to firestore.googleapis.com (reads were fine, so the game looked
 * normal), deleting this left the roster living only in the tab's memory, and a
 * refresh brought back the near-empty document written when the game was
 * created. Deleting the only copy is worse than keeping a second one.
 *
 * So the mirror is kept for every game now, and the hazard is closed at the
 * other end instead: it is never restored into a live tournament automatically.
 * See `recoverableProgress`.
 */
export function clearLocalProgress(uid: string | null = null) {
  removeScoped(LOCAL_PROGRESS_KEY, uid);
}

/**
 * The local mirror, but only where offering it back is unambiguously right.
 *
 * Three conditions, all of them load-bearing:
 *   - the mirror names THIS tournament, so a copy of a different game can never
 *     be poured into this one;
 *   - it has players, so there is something to recover;
 *   - the caller has read the remote document and found its roster EMPTY.
 *
 * That last one is the whole safety argument. Where Firestore holds a real
 * roster it wins, always. Only when the cloud copy has nothing is the device's
 * copy the better of the two — which is exactly the shape a browser with
 * blocked writes leaves behind.
 *
 * And even then it is only OFFERED. Restoring automatically is what lost a game
 * before.
 */
export function recoverableProgress(
  dbTournamentId: string | null | undefined,
  remotePlayerCount: number,
  uid: string | null = null,
): LocalProgress | null {
  if (!dbTournamentId || remotePlayerCount > 0) return null;
  try {
    const raw = readScoped(LOCAL_PROGRESS_KEY, uid);
    if (!raw) return null;
    const saved = JSON.parse(raw) as LocalProgress;
    if (saved?.dbTournamentId !== dbTournamentId) return null;
    if (!Array.isArray(saved.players) || saved.players.length === 0) return null;
    return saved;
  } catch {
    return null;
  }
}
