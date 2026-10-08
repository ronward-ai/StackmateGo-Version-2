import { ordinal } from '@/lib/ordinal';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { NightSummaryList } from '@/components/NightSummary';
import { currencyOf } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { History, Trophy, Trash2, Users, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useCompletedTournaments } from '@/hooks/useCompletedTournaments';
import type { CompletedTournament } from '@/types';

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "4 rebuys · 1 re-entry · 2 add-ons", leaving out whatever is zero. */
export function entriesLine(entry: Pick<CompletedTournament, 'totalRebuys' | 'totalReEntries' | 'totalAddons'>): string {
  return [
    entry.totalRebuys ? plural(entry.totalRebuys, 'rebuy') : '',
    entry.totalReEntries ? plural(entry.totalReEntries, 're-entry', 're-entries') : '',
    entry.totalAddons ? plural(entry.totalAddons, 'add-on') : '',
  ].filter(Boolean).join(' · ');
}

/**
 * The live document a History record belongs to: said outright on records from
 * October 2026, and otherwise the localGameId — which IS the document id for
 * every game saved to an account (see lib/localGameId.ts).
 */
export function liveGameIdOf(entry: Pick<CompletedTournament, 'tournamentId' | 'localGameId'>): string | null {
  return entry.tournamentId || entry.localGameId || null;
}

/** Does the live document still exist? A read, once, when a row is opened. */
export async function liveGameExists(id: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, 'activeTournaments', id))).exists();
  } catch {
    return false;
  }
}

type GameCheck = 'checking' | 'present' | 'missing';

function HistoryRow({
  entry,
  onDelete,
  onReopen,
  checkGame,
}: {
  entry: CompletedTournament;
  onDelete: (id: string) => void;
  onReopen?: (entry: CompletedTournament, tournamentId: string) => void;
  checkGame: (id: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState<GameCheck>('checking');
  const sym = currencyOf({ currency: entry.currency });
  const gameId = liveGameIdOf(entry);

  // Asked only once the row is opened, so a long History costs no reads.
  useEffect(() => {
    if (!open || !onReopen) return;
    if (!gameId) { setGame('missing'); return; }
    let cancelled = false;
    checkGame(gameId).then(ok => { if (!cancelled) setGame(ok ? 'present' : 'missing'); });
    return () => { cancelled = true; };
  }, [open, gameId, onReopen, checkGame]);

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <button className="flex-1 text-left min-w-0" onClick={() => setOpen(v => !v)}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">
              {entry.name || (entry.type === 'standalone' ? 'Standalone Game' : entry.seasonName || 'League Game')}
            </span>
            {entry.type !== 'standalone' && (
              <span className="text-caption uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 flex-shrink-0">
                League
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{formatDate(entry.endTime)}</span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />{entry.playerCount}
            </span>
            {entry.winner && (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <Trophy className="h-3 w-3" />{entry.winner}
              </span>
            )}
            <span>{sym}{(entry.prizePool ?? 0).toLocaleString()} pool</span>
            {/* What was bought back in. Saved on every record and never shown, so
                a question like "how many rebuys did we have last night" could
                not be answered from History (reported). */}
            {entriesLine(entry) && <span>{entriesLine(entry)}</span>}
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setOpen(v => !v)} className="p-1 text-muted-foreground">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={() => entry.id && onDelete(entry.id)}
            className="p-1 text-muted-foreground hover:text-destructive"
            title="Delete this record"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && entry.results?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-1">
          {entry.correctedAt && (
            <p className="text-caption text-muted-foreground pb-1">Corrected {formatDate(entry.correctedAt)}</p>
          )}
          {entry.results.map(r => (
            <div key={r.playerId} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-8 text-muted-foreground font-mono">{r.position ? ordinal(r.position) : ''}</span>
                <span className="truncate">{r.playerName}</span>
              </span>
              <span className="flex items-center gap-3 flex-shrink-0 text-muted-foreground">
                {(r.knockouts ?? 0) > 0 && <span>{r.knockouts} KO</span>}
                {(r.rebuys ?? 0) > 0 && <span>{plural(r.rebuys!, 'rebuy')}</span>}
                {(r.reEntries ?? 0) > 0 && <span>{plural(r.reEntries!, 're-entry', 're-entries')}</span>}
                {(r.addons ?? 0) > 0 && <span>{plural(r.addons!, 'add-on')}</span>}
                {r.prizeMoney > 0 && (
                  <span className="text-green-400">{sym}{r.prizeMoney.toLocaleString()}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <div className="text-caption uppercase tracking-wide text-muted-foreground mb-2">Summary</div>
          <NightSummaryList
            log={entry.summary}
            emptyText="No summary was kept for this game — it was played before the Summary existed."
          />
        </div>
      )}

      {/* Reopen to correct: only for a game whose live record is still there.
          Not mounted while unknown or missing — a button that fails is worse
          than a line saying why it is not offered. */}
      {open && onReopen && (
        <div className="mt-3 pt-3 border-t border-border/40">
          {game === 'present' && gameId && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onReopen(entry, gameId)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen to correct
            </Button>
          )}
          {game === 'missing' && (
            <p className="text-caption text-muted-foreground">
              This game's live record no longer exists — only the summary is kept.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function TournamentHistoryDialog({
  onReopen,
  currentGameInPlay = false,
  checkGame = liveGameExists,
}: {
  /** Opens the game in the console. Absent where reopening is not offered. */
  onReopen?: (tournamentId: string) => void;
  /** The console holds a game that has not finished, so the confirm says it stays saved. */
  currentGameInPlay?: boolean;
  checkGame?: (id: string) => Promise<boolean>;
} = {}) {
  const { history, isLoading, deleteCompletedTournament } = useCompletedTournaments();
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingReopen, setPendingReopen] = useState<{ entry: CompletedTournament; id: string } | null>(null);
  const reopenName = pendingReopen
    ? pendingReopen.entry.name
      || (pendingReopen.entry.type === 'standalone' ? 'this game' : pendingReopen.entry.seasonName || 'this game')
    : '';

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            History
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Tournament History</DialogTitle>
            <DialogDescription>
              Finished games, most recent first. Tap one to see the final standings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {isLoading && (
              <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
            )}
            {!isLoading && history.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No finished tournaments yet. Games are saved here automatically once they end.
              </p>
            )}
            {history.map(entry => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                onDelete={id => setPendingDelete(id)}
                onReopen={onReopen ? (e, id) => setPendingReopen({ entry: e, id }) : undefined}
                checkGame={checkGame}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingReopen} onOpenChange={o => !o && setPendingReopen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen {reopenName}?</AlertDialogTitle>
            <AlertDialogDescription>
              It opens in the console exactly as it finished. Undo a bust-out to correct the
              result — then rebuy, re-enter or bust players out as normal. Changes update the
              league standings, and History keeps the game's original date.
              {currentGameInPlay && ' Your current game stays saved; you can return to it from the banner.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingReopen && onReopen) onReopen(pendingReopen.id);
                setPendingReopen(null);
                setOpen(false);
              }}
            >
              Reopen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={o => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              The tournament's final standings will be permanently removed from your history.
              League standings are stored separately and are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/80"
              onClick={async () => {
                if (pendingDelete) await deleteCompletedTournament(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
