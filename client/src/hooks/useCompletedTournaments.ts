import { useCallback, useMemo } from 'react';
import { currencyOf } from '@/lib/currency';
import { query, where, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, collections } from '@/lib/firebase';
import { useAuth } from './useAuth';
import { useSharedSnapshot } from '@/lib/sharedSnapshot';
import { sanitizeForFirestore } from '@/lib/utils';
import { countEntries, prizePoolFor } from '@/lib/prizePool';
import type { CompletedTournament, TournamentState } from '@/types';

/** Stable empty reference — required by useSharedSnapshot. */
const EMPTY: CompletedTournament[] = [];

/**
 * History of finished tournaments, stored in Firestore so it follows the
 * director across devices rather than living in one browser's localStorage.
 *
 * Standalone games are the reason this exists: results are only written to
 * tournamentResults for league games, so a standalone tournament previously
 * left no record once the next one started. League games are saved here as
 * well, so the history is a single list.
 */
export function useCompletedTournaments() {
  const { user, isAnonymous } = useAuth();
  const ownerId = !isAnonymous ? user?.id : undefined;

  const { data: tournaments, isLoading } = useSharedSnapshot<CompletedTournament[]>(
    ownerId ? `completedTournaments:${ownerId}` : null,
    (emit, fail) => onSnapshot(
      query(collections.completedTournaments, where('ownerId', '==', ownerId)),
      snap => emit(snap.docs.map(d => ({ id: d.id, ...d.data() } as CompletedTournament))),
      error => { console.error('Failed to load tournament history:', error); fail(error); },
    ),
    EMPTY,
  );

  // Newest first. Sorted client-side so no composite index is needed.
  const history = useMemo(
    () => [...tournaments].sort((a, b) =>
      new Date(b.endTime || b.correctedAt || 0).getTime() - new Date(a.endTime || a.correctedAt || 0).getTime()
    ),
    [tournaments],
  );

  /**
   * Persist a finished tournament.
   *
   * Keyed on localGameId where available so that re-finishing the same game —
   * or a late state sync arriving after completion — overwrites the record
   * rather than creating a duplicate.
   */
  const saveCompletedTournament = useCallback(async (
    state: TournamentState,
    options?: { corrected?: boolean },
  ) => {
    if (!ownerId) return null;
    if (!state?.players?.length) return null;

    const players = state.players;
    const ps = state.prizeStructure;
    const buyIn = ps?.buyIn || 0;

    const { totalRebuys, totalAddons, totalReEntries } = countEntries(players);

    // Reuse the canonical calculation rather than recomputing it here — see
    // lib/prizePool.ts and its tests.
    const { gross, rake } = prizePoolFor(players, ps);

    const localGameId = (state.details as any)?.localGameId
      ?? (state.details as any)?.id
      ?? undefined;

    const record: CompletedTournament = {
      ownerId,
      name: state.details?.name || undefined,
      type: (state.details?.type as CompletedTournament['type']) || 'standalone',
      localGameId: localGameId ? String(localGameId) : undefined,
      // The live document, so History can reopen the game to correct it. The
      // id is usually the localGameId as well, but said outright from now on.
      tournamentId: state.details?.id ? String(state.details.id) : undefined,
      seasonId: (state.settings as any)?.seasonId,
      seasonName: (state.settings as any)?.seasonName,
      leagueId: (state.settings as any)?.leagueId,
      endTime: new Date().toISOString(),
      playerCount: players.length,
      winner: players.find(p => p.position === 1)?.name,
      buyIn,
      currency: currencyOf(state.settings),
      prizePool: gross,
      rake,
      totalRebuys,
      totalAddons,
      totalReEntries,
      results: players
        .filter(p => p.position && p.position > 0)
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map(p => ({
          playerId: p.id,
          playerName: p.name,
          position: p.position as number,
          prizeMoney: p.prizeMoney || 0,
          knockouts: p.knockouts || 0,
          rebuys: p.rebuys || 0,
          reEntries: p.reEntries || 0,
          addons: p.addons || 0,
        })),
      // The night's Summary, kept with the record so History can show it even
      // once the live document has gone.
      summary: state.nightLog ?? [],
    };

    // A CORRECTED ending — the game was reopened from History, or its final
    // hand undone, and has finished again — keeps its place in History: the
    // merge leaves the original end time and creation stamp alone.
    const { endTime: _originalNight, ...keepingEndTime } = record;
    const stamped = options?.corrected
      ? { ...keepingEndTime, correctedAt: new Date().toISOString() }
      : { ...record, createdAt: serverTimestamp() };

    try {
      // Deterministic id per owner+game keeps re-saves idempotent.
      const docId = localGameId
        ? `${ownerId}_${localGameId}`
        : `${ownerId}_${Date.now()}`;
      await setDoc(
        doc(db, 'completedTournaments', docId),
        sanitizeForFirestore(stamped),
        { merge: true },
      );
      return docId;
    } catch (error) {
      console.error('Failed to save completed tournament:', error);
      return null;
    }
  }, [ownerId]);

  const deleteCompletedTournament = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'completedTournaments', id));
    } catch (error) {
      console.error('Failed to delete tournament history entry:', error);
      throw error;
    }
  }, []);

  return { history, isLoading, saveCompletedTournament, deleteCompletedTournament };
}
