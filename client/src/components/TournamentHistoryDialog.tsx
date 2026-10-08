import { ordinal } from '@/lib/ordinal';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { NightSummaryList } from '@/components/NightSummary';
import { PastGameResults } from '@/components/ResultsExport';
import { mergeLog } from '@/lib/nightLog';
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

/**
 * The game's live document, or null when it is gone — a read, once, when a row
 * is opened. It carries the whole roster, which is what lets a past night be
 * shown and exported exactly as the console shows it.
 */
export async function loadLiveGame(id: string): Promise<Record<string, any> | null> {
  try {
    const snap = await getDoc(doc(db, 'activeTournaments', id));
    return snap.exists() ? (snap.data() as Record<string, any>) : null;
  } catch {
    return null;
  }
}

type GameCheck = { state: 'checking' } | { state: 'present'; data: Record<string, any> } | { state: 'missing' };

/** One row of a game's results — a History record's, or the league's own for an older game. */
export interface GameRecordRow {
  key: string;
  name: string;
  position?: number;
  knockouts?: number;
  rebuys?: number;
  reEntries?: number;
  addons?: number;
  prizeMoney?: number;
}

/**
 * One past game: its results, its Summary and the way to reopen it. The ONE
 * rendering of a past game — History's expanded row and the Players tab's
 * season bar both draw this, so the two cannot describe one night differently.
 *
 * `rows` defaults to the History record's results; the season bar passes the
 * league's own for a game played before History kept a record of it. Mounted
 * only when shown, so the existence check is one read per opening.
 */
export function GameRecord({
  gameId,
  entry,
  rows,
  currency,
  onReopen,
  loadGame = loadLiveGame,
}: {
  gameId: string | null;
  entry?: CompletedTournament | null;
  rows?: GameRecordRow[];
  currency?: string;
  onReopen?: (tournamentId: string) => void;
  loadGame?: (id: string) => Promise<Record<string, any> | null>;
}) {
  const [game, setGame] = useState<GameCheck>({ state: 'checking' });
  const sym = currencyOf({ currency: currency ?? entry?.currency });
  const resultRows: GameRecordRow[] = rows ?? (entry?.results ?? []).map(r => ({
    key: r.playerId, name: r.playerName, position: r.position, knockouts: r.knockouts,
    rebuys: r.rebuys, reEntries: r.reEntries, addons: r.addons, prizeMoney: r.prizeMoney,
  }));

  useEffect(() => {
    if (!gameId) { setGame({ state: 'missing' }); return; }
    let cancelled = false;
    setGame({ state: 'checking' });
    loadGame(gameId).then(data => {
      if (!cancelled) setGame(data ? { state: 'present', data } : { state: 'missing' });
    });
    return () => { cancelled = true; };
  }, [gameId, loadGame]);

  // With the live document, the night is drawn exactly as the console draws it
  // — the director's table and both exports — instead of a plain list.
  const live = game.state === 'present' && Array.isArray(game.data.players) && game.data.players.length > 0
    ? game.data
    : null;
  const summary = live ? mergeLog(live.nightLog, entry?.summary) : entry?.summary;

  return (
    <>
      {live && <PastGameResults game={live as any} />}

      {!live && resultRows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-1">
          {entry?.correctedAt && (
            <p className="text-caption text-muted-foreground pb-1">Corrected {formatDate(entry.correctedAt)}</p>
          )}
          {resultRows.map(r => (
            <div key={r.key} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-8 text-muted-foreground font-mono">{r.position ? ordinal(r.position) : ''}</span>
                <span className="truncate">{r.name}</span>
              </span>
              <span className="flex items-center gap-3 flex-shrink-0 text-muted-foreground">
                {(r.knockouts ?? 0) > 0 && <span>{r.knockouts} KO</span>}
                {(r.rebuys ?? 0) > 0 && <span>{plural(r.rebuys!, 'rebuy')}</span>}
                {(r.reEntries ?? 0) > 0 && <span>{plural(r.reEntries!, 're-entry', 're-entries')}</span>}
                {(r.addons ?? 0) > 0 && <span>{plural(r.addons!, 'add-on')}</span>}
                {(r.prizeMoney ?? 0) > 0 && (
                  <span className="text-green-400">{sym}{r.prizeMoney!.toLocaleString()}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border/40">
        <div className="text-caption uppercase tracking-wide text-muted-foreground mb-2">Summary</div>
        <NightSummaryList
          log={summary}
          emptyText="No summary was kept for this game — it was played before the Summary existed."
        />
      </div>

      {/* Reopen to correct: only for a game whose live record is still there.
          Not mounted while unknown or missing — a button that fails is worse
          than a line saying why it is not offered. */}
      {onReopen && (
        <div className="mt-3 pt-3 border-t border-border/40">
          {game.state === 'present' && gameId && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onReopen(gameId)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen to correct
            </Button>
          )}
          {game.state === 'missing' && (
            <p className="text-caption text-muted-foreground">
              This game's live record no longer exists — only the summary is kept.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** The one confirm before reopening a finished game, shared by History and the season bar. */
export function ReopenConfirm({
  name,
  open,
  currentGameInPlay,
  onCancel,
  onConfirm,
}: {
  name: string;
  open: boolean;
  currentGameInPlay?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={o => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reopen {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It opens in the console exactly as it finished. Undo a bust-out to correct the
            result — then rebuy, re-enter or bust players out as normal. Changes update the
            league standings, and History keeps the game's original date.
            {currentGameInPlay && ' Your current game stays saved; you can return to it from the banner.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Reopen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function HistoryRow({
  entry,
  onDelete,
  onReopen,
  loadGame,
}: {
  entry: CompletedTournament;
  onDelete: (id: string) => void;
  onReopen?: (entry: CompletedTournament, tournamentId: string) => void;
  loadGame: (id: string) => Promise<Record<string, any> | null>;
}) {
  const [open, setOpen] = useState(false);
  const sym = currencyOf({ currency: entry.currency });

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

      {open && (
        <GameRecord
          gameId={liveGameIdOf(entry)}
          entry={entry}
          onReopen={onReopen ? id => onReopen(entry, id) : undefined}
          loadGame={loadGame}
        />
      )}
    </Card>
  );
}

export default function TournamentHistoryDialog({
  onReopen,
  currentGameInPlay = false,
  loadGame = loadLiveGame,
}: {
  /** Opens the game in the console. Absent where reopening is not offered. */
  onReopen?: (tournamentId: string) => void;
  /** The console holds a game that has not finished, so the confirm says it stays saved. */
  currentGameInPlay?: boolean;
  loadGame?: (id: string) => Promise<Record<string, any> | null>;
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
                loadGame={loadGame}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ReopenConfirm
        name={reopenName}
        open={!!pendingReopen}
        currentGameInPlay={currentGameInPlay}
        onCancel={() => setPendingReopen(null)}
        onConfirm={() => {
          if (pendingReopen && onReopen) onReopen(pendingReopen.id);
          setPendingReopen(null);
          setOpen(false);
        }}
      />

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
