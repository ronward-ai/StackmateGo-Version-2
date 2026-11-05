import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ordinal } from '@/lib/ordinal';
import { leagueCheck, type LeagueCheckResult } from '@/lib/leagueRecorder';
import { resultTime } from '@/lib/seasonProgress';

/**
 * The League check: what the league holds for the game on screen, read-only.
 *
 * Built after a night whose results were missing from the table could not be
 * explained by reasoning from the outside — two guesses at the cause were wrong.
 * This shows the data instead: the game's own ids, why the recorder last stopped,
 * and, per placed player, every league result for this game. Nothing here writes.
 */
export interface LeagueCheckDialogProps {
  open: boolean;
  onClose: () => void;
  players: readonly { name: string; position?: number | null }[];
  playerDocs: readonly any[];
  results: readonly any[];
  gameId: string | null;
  facts: { label: string; value: string }[];
  seasonName: (id: string | null) => string;
}

const day = (t: number | null) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'no date');
const short = (id: string | null) => (id ? (id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-3)}` : id) : '—');

export default function LeagueCheckDialog({ open, onClose, players, playerDocs, results, gameId, facts, seasonName }: LeagueCheckDialogProps) {
  const check = leagueCheck({ players, playerDocs, results, gameId, timeOf: (r: any) => resultTime(r) ?? (r?.createdAt?.toMillis?.() ?? null) });
  const describe = (r: LeagueCheckResult) =>
    `${r.position ? ordinal(r.position) : '?'} · ${day(r.time)} · ${seasonName(r.seasonId)} · as ${r.playerName}${r.pendingWrite ? ' · NOT SAVED YET' : ''}`;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto" data-testid="league-check">
        <DialogHeader>
          <DialogTitle>League check</DialogTitle>
          <DialogDescription>What the league holds for this game. Nothing here changes anything.</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
          {facts.map(f => (
            <div key={f.label} className="contents">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="font-mono break-all">{f.value}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">Results for this game</dt>
          <dd className="font-mono">
            {check.total} — {check.bySeason.map(s => `${seasonName(s.seasonId)}: ${s.count}`).join(' · ') || 'none'}
          </dd>
        </dl>

        <div className="space-y-2 pt-2">
          {check.rows.map(row => (
            <div key={`${row.name}-${row.position}`} className="border-t border-border/30 pt-2 text-caption" data-testid="league-check-row">
              <div className="font-semibold text-label">
                {ordinal(row.position)} {row.name}
                <span className="font-normal text-muted-foreground"> · {row.playerIds.length} league player{row.playerIds.length === 1 ? '' : 's'}</span>
              </div>
              {row.thisGame.length === 0
                ? <div className="text-amber-400">No league result for this game.</div>
                : row.thisGame.map(r => <div key={r.id} className="font-mono">{describe(r)}</div>)}
              {row.recentOther.length > 0 && (
                <div className="text-muted-foreground font-mono">
                  Other games: {row.recentOther.map(r => `${day(r.time)} ${short(r.tournamentId)}`).join(', ')}
                </div>
              )}
            </div>
          ))}
          {check.strays.length > 0 && (
            <div className="border-t border-border/30 pt-2 text-caption">
              <div className="font-semibold text-label text-amber-400">Results for this game under nobody on tonight's roster</div>
              {check.strays.map(r => <div key={r.id} className="font-mono">{describe(r)}</div>)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
