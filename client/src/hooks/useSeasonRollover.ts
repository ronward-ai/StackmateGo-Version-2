import { useCallback, useState } from 'react';
import { useLeague } from './useLeague';
import { useSeasons } from './useSeasons';

/**
 * Ending a season.
 *
 * Quarterly leagues roll over four times a year, and before this the director
 * had to remember to do it: nothing reacted to the last game being played or
 * the end date passing, so the counter simply ran on past the schedule.
 *
 * Nothing here happens automatically — a cancelled week means "past the end
 * date" is not the same as "finished", so the director decides.
 */
export function useSeasonRollover(currentSeason: any) {
  const { league } = useLeague();
  const { updateSeason } = useSeasons({ leagueId: league?.id });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Mark the season finished. Standings are untouched. */
  const endCurrentSeason = useCallback(async () => {
    if (!currentSeason?.id) return;
    setBusy(true); setError(null);
    try {
      await updateSeason(currentSeason.id, { status: 'completed' } as any);
    } catch (err: any) {
      setError(err?.message || 'Could not end the season.');
    } finally {
      setBusy(false);
    }
  }, [currentSeason?.id, updateSeason]);

  // There used to be a startNextSeason here that created the next season
  // silently — the following dates and the SAME number of games. Wrong for a
  // league whose seasons follow the calendar. Start Next Season now opens the
  // season set-up in Manage League instead (hooks/useSeasonSetup.ts).

  return { endCurrentSeason, busy, error };
}
