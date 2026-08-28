import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { History, Trophy, Trash2, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { useCompletedTournaments } from '@/hooks/useCompletedTournaments';
import type { CompletedTournament } from '@/types';

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function HistoryRow({
  entry,
  onDelete,
}: {
  entry: CompletedTournament;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const sym = entry.currency || '£';

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <button className="flex-1 text-left min-w-0" onClick={() => setOpen(v => !v)}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">
              {entry.name || (entry.type === 'standalone' ? 'Standalone Game' : entry.seasonName || 'League Game')}
            </span>
            {entry.type !== 'standalone' && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 flex-shrink-0">
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
          {entry.results.map(r => (
            <div key={r.playerId} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-5 text-muted-foreground tabular-nums">{r.position}</span>
                <span className="truncate">{r.playerName}</span>
              </span>
              <span className="flex items-center gap-3 flex-shrink-0 text-muted-foreground">
                {(r.knockouts ?? 0) > 0 && <span>{r.knockouts} KO</span>}
                {r.prizeMoney > 0 && (
                  <span className="text-green-400">{sym}{r.prizeMoney.toLocaleString()}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function TournamentHistoryDialog() {
  const { history, isLoading, deleteCompletedTournament } = useCompletedTournaments();
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
