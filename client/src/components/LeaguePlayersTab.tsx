import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { useLeague } from '@/hooks/useLeague';
import { rosterNameConflict } from '@/lib/leagueRoster';
import { useToast } from '@/hooks/use-toast';

/**
 * The league's roster, where a name can be corrected or taken out.
 *
 * **Reported as there being no way to remove a misspelt player**, and the
 * history is worth knowing: `useLeague.ts` once exported `removePlayer: () => {}`
 * as a no-op stub, which its own comment calls the worst shape of all — "a
 * real-looking name that silently does nothing and looks like it worked". This
 * is that feature, built.
 *
 * ## Rename is the headline; remove is the escape hatch
 *
 * A result carries `leaguePlayerId` and NO player name, so correcting the
 * player document fixes every past night in the standings and in the drill-down
 * at once, and future games match the new spelling. Nothing is lost — which is
 * what makes it the right answer for the ordinary misspelling.
 *
 * Removing is different, and cannot be made safe by a guard: a player reaches
 * this collection ONLY through `recordResultByName`, which creates one on their
 * first result, so every name here has history behind it and "remove the ones
 * with no results" would be disabled on all of them. So it says how many nights
 * go with them and asks first.
 *
 * ## It lives HERE rather than on the League Roster chips
 *
 * Those chips are pressed to add a player mid-game. A destructive, irreversible
 * Firestore delete must not sit one tap from the name a director is reaching
 * for while the clock runs — the same argument that moved the league Danger
 * Zone into the Seasons tab. Fixing the roster here fixes the picker anyway,
 * since the chips read the same `leaguePlayers`.
 *
 * ## And this list does NOT de-dupe by name
 *
 * The picker does, with a comment reading "Firestore may have stale duplicate
 * docs" — so a duplicate is invisible there. A duplicate you cannot see is a
 * duplicate you cannot remove, and this is the screen for removing it.
 *
 * Merging two players is deliberately not offered: a merge that guesses which
 * results belong to whom is how a league loses its standings. Rename the one
 * that has the history and remove the other.
 */
export default function LeaguePlayersTab() {
  const { leaguePlayers, renameLeaguePlayer, removeLeaguePlayer } = useLeague();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const players = useMemo(
    () => [...(leaguePlayers as any[])].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [leaguePlayers],
  );

  const conflict = editingId ? rosterNameConflict(players, draft, editingId) : null;

  const startEdit = (player: any) => {
    setEditingId(String(player.id));
    setDraft(player.name || '');
  };

  const commitEdit = async () => {
    if (!editingId || conflict) return;
    setBusy(true);
    try {
      await renameLeaguePlayer(editingId, draft);
      setEditingId(null);
    } catch {
      toast({ title: 'Could not rename', description: 'The change was not saved.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;
    setBusy(true);
    try {
      await removeLeaguePlayer(String(pendingRemoval.id));
      setPendingRemoval(null);
    } catch {
      toast({ title: 'Could not remove', description: 'The player is still in the league.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  /** How many nights go with them, which is what the confirmation has to say. */
  const resultCount = (player: any) => (player?.tournamentResults?.length ?? 0);

  if (players.length === 0) {
    return (
      <p className="text-body text-muted-foreground py-6 text-center">
        No players yet. A player joins the league the first time a result is recorded for them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-label text-muted-foreground">
        Correcting a name keeps every game that player has played. Removing one deletes their results.
      </p>

      <div className="space-y-1">
        {players.map((player: any) => {
          const games = resultCount(player);
          const editing = editingId === String(player.id);
          return (
            <div
              key={player.id}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
            >
              {editing ? (
                <>
                  <Input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    className="h-8 text-label"
                    aria-label={`New name for ${player.name}`}
                  />
                  <Button size="sm" variant="ghost" disabled={!!conflict || busy} onClick={commitEdit} aria-label="Save name">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel rename">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-body text-foreground truncate">{player.name}</span>
                  <span className="text-caption font-mono text-muted-foreground">
                    {games} {games === 1 ? 'game' : 'games'}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(player)} aria-label={`Rename ${player.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setPendingRemoval(player)}
                    aria-label={`Remove ${player.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* The reason refused renames say so here rather than failing silently:
          two players sharing a name would send future results to whichever one
          `recordResultByName` finds first, and the roster picker de-dupes by
          name, so the clash would be invisible. */}
      {conflict && <p className="text-label text-destructive">{conflict}</p>}

      <AlertDialog open={!!pendingRemoval} onOpenChange={open => { if (!open) setPendingRemoval(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemoval?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {resultCount(pendingRemoval) > 0 ? (
                <>
                  This deletes {resultCount(pendingRemoval)}{' '}
                  {resultCount(pendingRemoval) === 1 ? 'recorded result' : 'recorded results'} from the
                  standings, and cannot be undone. If the name is just misspelt, rename them instead —
                  that keeps every game.
                </>
              ) : (
                <>They have no recorded results, so nothing else goes with them.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={confirmRemoval}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
