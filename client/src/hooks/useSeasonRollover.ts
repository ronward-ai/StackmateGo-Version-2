import { useCallback, useState } from 'react';
import { useLeague } from './useLeague';
import { useSeasons } from './useSeasons';
import { seasonDraftProblem, seasonFromDraft, type SeasonDraft } from '@/lib/seasonProgress';

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
   * End this season and create the one after it, FROM THE DIRECTOR'S ANSWERS.
   *
   * This used to invent the next season — the following period and the same
   * number of games — and create it on the press of a button, which is wrong for
   * a league whose seasons follow the calendar. The draft now comes from
   * `NewSeasonDialog`, prefilled by `nextSeasonDraft` and confirmed by the
   * director. The new season becomes current, so the next game counts toward it.
   *
   * Resolves to the new season's id, or null when nothing was created — Next
   * Game uses it to move its dialog straight onto the season it just made.
   */
  const startNextSeason = useCallback(async (draft: SeasonDraft): Promise<string | null> => {
    if (!currentSeason?.id) return null;
    const problem = seasonDraftProblem(draft);
    if (problem) { setError(problem); return null; }
    setBusy(true); setError(null);
    try {
      const created = await addSeason({ ...seasonFromDraft(draft), status: 'active' });

      if (!created?.id || created.id === 'default-season') {
        setError('The next season could not be created.');
        return null;
      }

      // Close the old one only after the new one exists, so a failure never
      // leaves the league with no running season.
      await updateSeason(currentSeason.id, { status: 'completed' } as any);
      await setActiveSeason(String(created.id));
      return String(created.id);
    } catch (err: any) {
      setError(err?.message || 'Could not start the next season.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentSeason, addSeason, updateSeason, setActiveSeason]);

  return { endCurrentSeason, startNextSeason, busy, error };
}
