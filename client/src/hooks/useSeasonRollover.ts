import { useCallback, useState } from 'react';
import { useLeague } from './useLeague';
import { useSeasons } from './useSeasons';
import { nextSeasonDates, suggestNextName } from '@/lib/seasonProgress';

/**
 * Ending a season and starting the next one.
 *
 * Quarterly leagues roll over four times a year, and before this the director
 * had to remember to do it: nothing reacted to the last game being played or
 * the end date passing, so the counter simply ran on past the schedule.
 *
 * Nothing here happens automatically — a cancelled week means "past the end
 * date" is not the same as "finished", so the director decides.
 */
export function useSeasonRollover(currentSeason: any) {
  const { league, setActiveSeason } = useLeague();
  const { addSeason, updateSeason } = useSeasons({ leagueId: league?.id });
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

  /**
   * End this season and create the one after it, prefilled from this one:
   * the following calendar period and the same number of games. The new season
   * becomes current, so the next game counts toward it.
   */
  const startNextSeason = useCallback(async () => {
    if (!currentSeason?.id) return;
    setBusy(true); setError(null);
    try {
      const dates = nextSeasonDates(currentSeason);
      if (!dates) {
        setError('This season has no usable dates, so the next one cannot be prefilled. Create it from Manage League → Seasons.');
        return;
      }

      const created = await addSeason({
        name: suggestNextName(currentSeason.name, dates.startDate),
        startDate: dates.startDate,
        endDate: dates.endDate,
        numberOfGames: currentSeason.numberOfGames || 12,
        status: 'active',
      });

      if (!created?.id || created.id === 'default-season') {
        setError('The next season could not be created.');
        return;
      }

      // Close the old one only after the new one exists, so a failure never
      // leaves the league with no running season.
      await updateSeason(currentSeason.id, { status: 'completed' } as any);
      await setActiveSeason(String(created.id));
    } catch (err: any) {
      setError(err?.message || 'Could not start the next season.');
    } finally {
      setBusy(false);
    }
  }, [currentSeason, addSeason, updateSeason, setActiveSeason]);

  return { endCurrentSeason, startNextSeason, busy, error };
}
