import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Archive, Trash2, Check } from 'lucide-react';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { useSubscription } from '@/hooks/useSubscription';
import { gamesInRange, seasonSubtitle } from '@/lib/seasonProgress';
import { cn } from '@/lib/utils';

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
/** Monday first, as a week of poker nights reads. */
const PLAY_NIGHTS = [
  { value: 1, short: 'M', name: 'Monday' },
  { value: 2, short: 'T', name: 'Tuesday' },
  { value: 3, short: 'W', name: 'Wednesday' },
  { value: 4, short: 'T', name: 'Thursday' },
  { value: 5, short: 'F', name: 'Friday' },
  { value: 6, short: 'S', name: 'Saturday' },
  { value: 0, short: 'S', name: 'Sunday' },
];

export default function LeagueSeasonsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { league, setActiveSeason } = useLeague();
  const {
    seasons, currentSeason, addSeason, updateSeason, deleteSeason, formatSeasonDateRange,
  } = useSeasons({ leagueId: league?.id });
  const { isPro } = useSubscription();

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [games, setGames] = useState<number | ''>(12);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>();

  // Which nights the league plays, for working the game count out of the dates.
  // Nothing is stored: this only fills the number, which stays editable.
  const [playNights, setPlayNights] = useState<number[]>([]);
  const [everyNWeeks, setEveryNWeeks] = useState(1);

  const [endTarget, setEndTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedGames = useMemo(
    () => gamesInRange(
      dateRange?.from?.toISOString().split('T')[0],
      dateRange?.to?.toISOString().split('T')[0],
      { weekdays: playNights, everyNWeeks },
    ),
    [dateRange?.from, dateRange?.to, playNights, everyNWeeks],
  );

  const seasonName = (id: string | null) =>
    seasons.find(s => String(s.id) === String(id))?.name ?? 'this season';

  const handleCreate = async () => {
    // A name is all that is required. Dates used to be compulsory here, and the
    // button was not disabled, so pressing Create with none did nothing at all
    // and said nothing — indistinguishable from a broken app.
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      // BOTH dates or neither. Half a range is worse than none: isSeasonComplete
      // would read an end date with no beginning.
      const hasRange = !!dateRange?.from && !!dateRange?.to;

      const created = await addSeason({
        name: name.trim(),
        ...(hasRange ? {
          startDate: dateRange!.from!.toISOString().split('T')[0],
          endDate: dateRange!.to!.toISOString().split('T')[0],
        } : {}),
        numberOfGames: typeof games === 'number' ? games : 12,
        status: 'active',
      });
      if (created?.id && created.id !== 'default-season') {
        await setActiveSeason(String(created.id));
      }
      setShowNew(false); setName(''); setGames(12); setDateRange(undefined);
      setPlayNights([]); setEveryNWeeks(1);
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
          <div>
            <Label className="text-xs text-muted-foreground">Season Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jan – Mar 2026" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Number of Games</Label>
            <Input
              type="text" inputMode="numeric" value={games}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setGames(raw === '' ? '' : Number(raw));
              }}
              onFocus={e => e.target.select()}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Date Range <span className="opacity-60">(optional)</span></Label>
            <DateRangePicker value={dateRange} onSelect={setDateRange} />
            {/* Not every league runs on a calendar: a quarterly season is a date
                range with a schedule inside it, while a 12-game season runs
                until the twelfth game is played, whenever that falls. */}
            <p className="text-caption text-muted-foreground mt-1">
              Leave blank for a season that simply runs until its games are played.
            </p>
          </div>

          {/* Counting Wednesdays on a calendar is arithmetic, and it is the kind
              people get wrong: 1 Jan to 31 Mar is thirteen WEEKS but twelve
              Wednesdays. The answer fills the games field and can be typed over
              — a cancelled week or a Christmas break is normal and unknowable
              from a pattern. */}
          {dateRange?.from && dateRange?.to && (
            <div className="card-glass rounded-lg p-3 space-y-2.5">
              <Label className="text-caption uppercase tracking-wide text-muted-foreground">
                Count the games for me
              </Label>

              <div className="flex gap-1">
                {PLAY_NIGHTS.map(night => {
                  const on = playNights.includes(night.value);
                  return (
                    <button
                      key={night.value}
                      type="button"
                      onClick={() => setPlayNights(prev =>
                        prev.includes(night.value)
                          ? prev.filter(d => d !== night.value)
                          : [...prev, night.value]
                      )}
                      className={cn(
                        'h-7 w-7 rounded-md border text-caption font-semibold transition-colors',
                        on
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      )}
                      title={night.name}
                      aria-pressed={on}
                    >
                      {night.short}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-1">
                {[{ n: 1, label: 'Every week' }, { n: 2, label: 'Every 2 weeks' }].map(option => (
                  <button
                    key={option.n}
                    type="button"
                    onClick={() => setEveryNWeeks(option.n)}
                    className={cn(
                      'h-7 px-2.5 rounded-md border text-caption font-medium transition-colors',
                      everyNWeeks === option.n
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {suggestedGames > 0 && (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-label text-muted-foreground">
                    <span className="font-mono font-bold text-foreground">{suggestedGames}</span>
                    {' '}games in that range
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-caption" onClick={() => setGames(suggestedGames)}>
                    Use {suggestedGames}
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={busy || !name.trim()} onClick={handleCreate}>Create Season</Button>
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
