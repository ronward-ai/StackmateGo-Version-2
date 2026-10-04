import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Archive, Trash2, Check } from 'lucide-react';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { useSubscription } from '@/hooks/useSubscription';
import {
  EMPTY_SEASON_DRAFT, seasonDraftProblem, seasonFromDraft, seasonSubtitle, type SeasonDraft,
} from '@/lib/seasonProgress';
import SeasonForm from '@/components/SeasonForm';

/**
 * Season management, gathered in one place.
 *
 * These controls used to be scattered across the League tab header: an
 * unlabelled `…` menu titled "Season actions" holding New/End/Delete Season AND
 * Delete League, a borderless season dropdown that looked like plain text, and
 * an inline new-season form. The header is now read-only context and everything
 * that *changes* the league lives here.
 *
 * Switching the active season is deliberately a considered action rather than a
 * one-tap control beside the title: it changes which season new games count
 * toward, and it changes what every participant sees.
 */
export default function LeagueSeasonsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { league, setActiveSeason } = useLeague();
  const {
    seasons, currentSeason, addSeason, updateSeason, deleteSeason, formatSeasonDateRange,
  } = useSeasons({ leagueId: league?.id });
  const { isPro } = useSubscription();

  const [showNew, setShowNew] = useState(false);
  // The ONE season form, shared with Start Next Season (`SeasonForm`).
  const [draft, setDraft] = useState<SeasonDraft>(EMPTY_SEASON_DRAFT);

  const [endTarget, setEndTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seasonName = (id: string | null) =>
    seasons.find(s => String(s.id) === String(id))?.name ?? 'this season';

  const handleCreate = async () => {
    // seasonDraftProblem decides, and the button is disabled by the same answer.
    // Dates used to be compulsory here while the button was not disabled, so
    // pressing Create did nothing and said nothing — indistinguishable from a
    // broken app. Dates are needed now only by a season that says it follows
    // the calendar.
    if (seasonDraftProblem(draft)) return;
    setBusy(true); setError(null);
    try {
      // A games season stores no dates even if some were typed before the kind
      // was switched — seasonFromDraft owns that.
      const created = await addSeason({ ...seasonFromDraft(draft), status: 'active' });
      // A failed create used to close this dialog and reset the form anyway, so
      // the director walked away believing they had a season. addSeason returns
      // null now rather than a synthetic one, and nothing is cleared until it
      // has genuinely been created — their typing survives the retry.
      if (!created?.id || created.id === 'default-season') {
        setError('The season could not be created. Check your connection and try again.');
        return;
      }
      await setActiveSeason(String(created.id));
      setShowNew(false); setDraft(EMPTY_SEASON_DRAFT);
    } catch (err: any) {
      setError(err?.message || 'Could not create the season.');
    } finally { setBusy(false); }
  };

  const handleSwitch = async (id: string) => {
    setBusy(true); setError(null);
    try {
      await setActiveSeason(id);
    } catch (err: any) {
      // Surfaced rather than swallowed: this write is denied for a handover
      // director who does not own the league, and silently doing nothing is
      // exactly the confusing behaviour being removed.
      setError(err?.message || 'Could not switch season.');
    } finally { setBusy(false); }
  };

  const handleEnd = async () => {
    if (!endTarget) return;
    setBusy(true); setError(null);
    try { await updateSeason(endTarget, { status: 'completed' }); }
    catch (err: any) { setError(err?.message || 'Could not end the season.'); }
    finally { setBusy(false); setEndTarget(null); }
  };

  const handleDeleteSeason = async () => {
    if (!deleteTarget) return;
    setBusy(true); setError(null);
    try { await deleteSeason(deleteTarget); }
    catch (err: any) { setError(err?.message || 'Could not delete the season.'); }
    finally { setBusy(false); setDeleteTarget(null); }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
          {error}
        </div>
      )}

      {/* Season list */}
      <div className="space-y-2">
        {seasons.map(season => {
          const isCurrent = String(season.id) === String(currentSeason?.id);
          const isCompleted = (season as any).status === 'completed';
          return (
            <Card key={season.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{season.name}</span>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 text-caption uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 flex-shrink-0">
                        <Check className="h-3 w-3" />Current
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-caption uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                        Ended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {seasonSubtitle(formatSeasonDateRange(season), season.numberOfGames)}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {!isCurrent && (
                    <Button
                      size="sm" variant="outline" disabled={busy}
                      onClick={() => handleSwitch(String(season.id))}
                      title="New games will count toward this season"
                    >
                      Make current
                    </Button>
                  )}
                  {!isCompleted && (
                    <Button
                      size="sm" variant="ghost" disabled={busy}
                      onClick={() => setEndTarget(String(season.id))}
                      title="End this season"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                  {!readOnly && season.id !== 'default-season' && (
                    <Button
                      size="sm" variant="ghost" disabled={busy}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(String(season.id))}
                      title="Delete this season"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Create */}
      {!showNew ? (
        <Button
          variant="outline"
          className="w-full gap-1.5"
          onClick={() => {
            if (!isPro) { setError('Creating seasons requires a Pro subscription.'); return; }
            setShowNew(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New Season
        </Button>
      ) : (
        <Card className="p-4 space-y-3">
          <SeasonForm draft={draft} onChange={setDraft} />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={busy || !!seasonDraftProblem(draft)} onClick={handleCreate}>Create Season</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Delete League used to sit here. It is a league-level action and now
          lives on the League tab, beside renaming and switching. */}

      <AlertDialog open={!!endTarget} onOpenChange={o => !o && setEndTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End “{seasonName(endTarget)}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The season is marked finished and its standings are kept. You can start a new season afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnd}>End Season</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{seasonName(deleteTarget)}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the season and every tournament result recorded in it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/80" onClick={handleDeleteSeason} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete Season'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
