import { useCallback } from 'react';
import { useLocation } from 'wouter';

/**
 * Open one of this account's live games on THIS device.
 *
 * Two things offer it — the banner saying the account is running a game
 * elsewhere, and the confirm that catches Next Game pressed past that banner —
 * and both must pin and navigate identically. Writing it twice is how the QR
 * code and the sync effects ended up with two answers to "which game is the
 * console on", which is the fault `consoleTournamentId()` exists to have fixed.
 *
 * Same two steps the resume effect performs, in the same order: the pin first,
 * so a refresh lands back here rather than on the home screen.
 */
export function useOpenLiveGame() {
  const [, setLocation] = useLocation();
  return useCallback((id: string) => {
    try { localStorage.setItem('activeDirectorTournamentId', String(id)); } catch {}
    setLocation(`/tournament/${id}/director`);
  }, [setLocation]);
}
