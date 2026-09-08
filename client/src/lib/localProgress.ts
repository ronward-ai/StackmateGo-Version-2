import type { Player } from '@/types';

/**
 * The live part of a local game — everything the settings/levels/prize-structure
 * keys do not already cover.
 *
 * Players were never persisted, so a refresh has always lost the roster of a game
 * that had not gone live, and logging out (a full page load since d95771a) made
 * that reachable by an ordinary action: six players and two bust-outs, gone.
 *
 * Keyed by localGameId so starting a new game never inherits the last one's
 * roster.
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

export function loadLocalProgress(localGameId?: string): LocalProgress | null {
  if (!localGameId) return null;
  try {
    const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as LocalProgress;
    if (saved?.localGameId !== localGameId || !Array.isArray(saved.players)) return null;
    return saved;
  } catch {
    return null;
  }
}

export function saveLocalProgress(progress: LocalProgress) {
  try {
    localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(progress));
  } catch {}
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
export function clearLocalProgress() {
  try {
    localStorage.removeItem(LOCAL_PROGRESS_KEY);
  } catch {}
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
): LocalProgress | null {
  if (!dbTournamentId || remotePlayerCount > 0) return null;
  try {
    const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as LocalProgress;
    if (saved?.dbTournamentId !== dbTournamentId) return null;
    if (!Array.isArray(saved.players) || saved.players.length === 0) return null;
    return saved;
  } catch {
    return null;
  }
}
