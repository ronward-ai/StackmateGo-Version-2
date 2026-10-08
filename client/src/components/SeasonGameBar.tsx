import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { seasonGameSlots, leagueResultsForGame, type GameSlot } from '@/lib/seasonGames';
import { GameRecord, ReopenConfirm, liveGameIdOf, loadLiveGame } from '@/components/TournamentHistoryDialog';
import type { CompletedTournament } from '@/types';

function shortDate(d: Date | null): string {
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
}

/**
 * The season's games as a segmented bar — the season panel's orange progress
 * bar, cut into one segment per game. Played games are orange and open that
 * night's results, Summary and Reopen underneath; tonight's game is outlined;
 * games still to come are uncoloured and are not controls at all (the
 * DirectorOnly rule: not mounted as a button, rather than disabled).
 *
 * Replaces History in league mode: a league night's history IS its season.
 * Standalone games, which have no season, keep the History button.
 */
export default function SeasonGameBar({
  season,
  leaguePlayers,
  currentGameId,
  history,
  currency,
  onReopen,
  currentGameInPlay = false,
  loadGame = loadLiveGame,
  resultColumns,
}: {
  season: { id?: unknown; name?: string; numberOfGames?: number | null } | null | undefined;
  leaguePlayers: any[] | null | undefined;
  currentGameId?: string | null;
  history: CompletedTournament[];
  currency?: string;
  onReopen?: (tournamentId: string) => void;
  currentGameInPlay?: boolean;
  loadGame?: (id: string) => Promise<Record<string, any> | null>;
  /** The console's current results columns — a past night draws with them. */
  resultColumns?: string[];
}) {
  const slots = useMemo(
    () => seasonGameSlots({
      seasonId: season?.id,
      numberOfGames: season?.numberOfGames,
      leaguePlayers,
      currentGameId,
    }),
    [season?.id, season?.numberOfGames, leaguePlayers, currentGameId],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // On a phone the panel opens below the fold; bring it into view.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected) return;
    const el = panelRef.current as (HTMLDivElement & { scrollIntoView?: (o: object) => void }) | null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  if (slots.length === 0) return null;

  const scheduled = season?.numberOfGames && season.numberOfGames > 0 ? season.numberOfGames : null;
  const slot = slots.find(s => s.gameId === selected && s.state === 'played') ?? null;
  const record = slot ? history.find(h => liveGameIdOf(h) === slot.gameId) ?? null : null;
  const fallback = slot && !record
    ? leagueResultsForGame(leaguePlayers, slot.gameId!).map(r => ({ key: r.name, ...r }))
    : undefined;
  const current = slots.find(s => s.state === 'current');

  const caption = slot
    ? `Game ${slot.number}${scheduled ? ` of ${scheduled}` : ''}${slot.playedAt ? ` · ${shortDate(slot.playedAt)}` : ''}`
    : current
      ? `Tonight is game ${current.number}${scheduled ? (current.beyond ? ` — beyond the ${scheduled} scheduled` : ` of ${scheduled}`) : ''}`
      : `${slots.filter(s => s.state === 'played').length}${scheduled ? ` of ${scheduled}` : ''} played`;

  /**
   * Each segment is a 28px touch target with the bar drawn inside it — the bar
   * itself was 8px tall and reported as clunky on a phone, which it was: too
   * small to tap. Played and tonight's games carry their number; games still to
   * come are unlabelled and are not controls at all.
   */
  const segment = (s: GameSlot) => {
    const isSelected = s.gameId !== null && s.gameId === selected;
    const box = 'h-7 flex-1 min-w-[20px] rounded-md flex items-center justify-center font-mono text-caption transition-colors';
    if (s.state === 'played') {
      const label = `Game ${s.number}${s.playedAt ? ` — ${shortDate(s.playedAt)}` : ''}`;
      return (
        <button
          key={`${s.number}-${s.gameId}`}
          type="button"
          aria-label={label}
          aria-pressed={isSelected}
          title={label}
          onClick={() => setSelected(isSelected ? null : s.gameId)}
          className={cn(
            box,
            'bg-primary text-primary-foreground hover:bg-primary/85 cursor-pointer',
            isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
          )}
        >
          {s.number}
        </button>
      );
    }
    if (s.state === 'current') {
      return (
        <div
          key={`${s.number}-current`}
          data-slot="current"
          title={`Game ${s.number} — tonight`}
          className={cn(box, 'bg-primary/20 ring-1 ring-primary text-primary')}
        >
          {s.number}
        </div>
      );
    }
    return <div key={`${s.number}-future`} data-slot="future" className={cn(box, 'bg-white/[0.07]')} />;
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline text-caption text-muted-foreground mb-1.5">
        <span className="font-mono">{caption}</span>
        {season?.name && <span className="truncate ml-3">{season.name}</span>}
      </div>
      <div className="flex flex-wrap gap-1 items-center py-1" role="group" aria-label="Games this season">
        {slots.map(segment)}
      </div>

      {slot && (
        <div ref={panelRef} className="mt-3 rounded-lg border border-border/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-label font-medium">
              Game {slot.number}{slot.playedAt ? ` · ${shortDate(slot.playedAt)}` : ''}
            </span>
            <button
              type="button"
              aria-label="Close"
              className="p-1 text-muted-foreground hover:text-foreground"
              onClick={() => setSelected(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <GameRecord
            key={slot.gameId!}
            gameId={slot.gameId}
            entry={record}
            rows={fallback}
            currency={currency}
            onReopen={onReopen ? id => setConfirming(id) : undefined}
            loadGame={loadGame}
            resultColumns={resultColumns}
          />
        </div>
      )}

      <ReopenConfirm
        name={`game ${slots.find(s => s.gameId === confirming)?.number ?? ''}`.trim()}
        open={!!confirming}
        currentGameInPlay={currentGameInPlay}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming && onReopen) onReopen(confirming);
          setConfirming(null);
        }}
      />
    </div>
  );
}
