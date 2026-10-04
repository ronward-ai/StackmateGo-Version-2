import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { gamesInRange, type SeasonDraft, type SeasonKind } from '@/lib/seasonProgress';
import { cn } from '@/lib/utils';

/**
 * The ONE season set-up form — Manage League → Seasons and every Start Next
 * Season both render it. It used to live inline in `LeagueSeasonsTab`, while the
 * rollover created the next season silently with the same game count; two ways
 * to describe a season is how they would have drifted.
 *
 * It asks first how the season runs, because the two kinds want different
 * fields: a set number of games needs a count and nothing else, a calendar
 * season needs dates and works its count out from them. `lib/seasonProgress.ts`
 * (`seasonDraftProblem`, `seasonFromDraft`) owns what makes a draft valid and
 * what is stored.
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

const KINDS: { value: SeasonKind; title: string; detail: string }[] = [
  {
    value: 'games',
    title: 'A set number of games',
    detail: 'Runs until the last game is played, whenever that is.',
  },
  {
    value: 'calendar',
    title: 'Between two dates',
    detail: 'e.g. January to March — the number of games follows the calendar.',
  },
];

const isoOf = (d: Date | undefined) => (d ? d.toISOString().split('T')[0] : undefined);
const dateOf = (iso: string | undefined) => (iso ? new Date(`${iso}T00:00:00Z`) : undefined);

export default function SeasonForm({
  draft,
  onChange,
}: {
  draft: SeasonDraft;
  onChange: (next: SeasonDraft) => void;
}) {
  const set = (patch: Partial<SeasonDraft>) => onChange({ ...draft, ...patch });

  // Which nights the league plays, for working the count out of the dates.
  // Nothing is stored: this only fills the number, which stays editable.
  const [playNights, setPlayNights] = useState<number[]>([]);
  const [everyNWeeks, setEveryNWeeks] = useState(1);

  const suggestedGames = useMemo(
    () => gamesInRange(draft.startDate, draft.endDate, { weekdays: playNights, everyNWeeks }),
    [draft.startDate, draft.endDate, playNights, everyNWeeks],
  );

  // In a calendar season the count FOLLOWS the calendar, so picking nights fills
  // it in. Only when the nights or the dates change — never on every render, or
  // a number typed over the suggestion would be snapped straight back.
  useEffect(() => {
    if (draft.kind === 'calendar' && suggestedGames > 0) set({ numberOfGames: suggestedGames });
  }, [suggestedGames]); // eslint-disable-line react-hooks/exhaustive-deps

  const calendar = draft.kind === 'calendar';

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">How does this season run?</Label>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {KINDS.map(k => {
            const on = draft.kind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ kind: k.value })}
                className={cn(
                  'text-left rounded-lg border p-2.5 transition-colors',
                  on
                    ? 'bg-primary/10 border-primary/30'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                <span className={cn('block text-label font-medium', on ? 'text-primary' : 'text-foreground')}>
                  {k.title}
                </span>
                <span className="block text-caption text-muted-foreground mt-0.5">{k.detail}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label htmlFor="season-name" className="text-xs text-muted-foreground">Season Name</Label>
        <Input
          id="season-name"
          value={draft.name}
          onChange={e => set({ name: e.target.value })}
          placeholder={calendar ? 'e.g. Jan – Mar 2026' : 'e.g. Season 4'}
          className="mt-1 h-8 text-sm"
        />
      </div>

      {calendar && (
        <div>
          <Label className="text-xs text-muted-foreground">Runs between</Label>
          <DateRangePicker
            value={{ from: dateOf(draft.startDate), to: dateOf(draft.endDate) }}
            onSelect={r => set({ startDate: isoOf(r?.from), endDate: isoOf(r?.to) })}
          />
        </div>
      )}

      {/* Counting Wednesdays on a calendar is arithmetic, and it is the kind
          people get wrong: 1 Jan to 31 Mar is thirteen WEEKS but twelve
          Wednesdays. */}
      {calendar && draft.startDate && draft.endDate && (
        <div className="card-glass rounded-lg p-3 space-y-2.5">
          <Label className="text-caption uppercase tracking-wide text-muted-foreground">
            Which nights do you play?
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
                      : [...prev, night.value],
                  )}
                  className={cn(
                    'h-7 w-7 rounded-md border text-caption font-semibold transition-colors',
                    on
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                  title={night.name}
                  aria-label={night.name}
                  aria-pressed={on}
                >
                  {night.short}
                </button>
              );
            })}
          </div>
          {/* A number, not a set of buttons: if fortnightly earns a button then
              so does every three weeks, or monthly. */}
          <div className="flex items-center gap-2">
            <span className="text-label text-muted-foreground">Every</span>
            <Input
              type="text"
              inputMode="numeric"
              aria-label="Weeks between games"
              value={everyNWeeks}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                // Empty reads as weekly: gamesInRange clamps below 1 anyway.
                setEveryNWeeks(raw === '' ? 1 : Number(raw));
              }}
              onFocus={e => e.target.select()}
              className="h-7 w-12 text-center text-label px-1"
            />
            <span className="text-label text-muted-foreground">
              {everyNWeeks === 1 ? 'week' : 'weeks'}
            </span>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="season-games" className="text-xs text-muted-foreground">Number of Games</Label>
        <Input
          id="season-games"
          type="text"
          inputMode="numeric"
          value={draft.numberOfGames}
          onChange={e => {
            const raw = e.target.value.replace(/[^0-9]/g, '');
            set({ numberOfGames: raw === '' ? '' : Number(raw) });
          }}
          onFocus={e => e.target.select()}
          className="mt-1 h-8 text-sm"
        />
        {calendar && (
          <p className="text-caption text-muted-foreground mt-1">
            {suggestedGames > 0
              ? `${suggestedGames} games between those dates. Change it for a break or a double-header.`
              : 'Pick the nights you play and this is counted for you. It can be changed.'}
          </p>
        )}
      </div>
    </div>
  );
}
