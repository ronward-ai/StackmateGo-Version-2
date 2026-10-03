import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Trash2, Check, X, EyeOff, Eye } from 'lucide-react';
import { useLeague, type LeaguePlayerDoc } from '@/hooks/useLeague';
import { rosterNameConflict, deleteBlockedReason } from '@/lib/leagueRoster';
import { useToast } from '@/hooks/use-toast';

/**
 * The league's roster, where a name can be corrected or taken out of the lists.
 *
 * **Reported as there being no way to remove a misspelt player**, and the
 * history is worth knowing: `useLeague.ts` once exported `removePlayer: () => {}`
 * as a no-op stub, which its own comment calls the worst shape of all — "a
 * real-looking name that silently does nothing and looks like it worked".
 *
 * ## The first version of this screen deleted the results, and that was wrong
 *
 * Reported immediately, and rightly: a director tidying the roster must not lose
 * the league's history to do it. `lib/leagueRoster.ts`'s header has the model —
 * the results join is roster-outer, so deleting a player either takes real
 * history with them or leaves rows that nothing can ever reach again. There is
 * no safe deletion for a player who has played.
 *
 * So the three actions here are what a director actually wants:
 *
 * - **Rename** fixes a misspelling and keeps every night, because a result
 *   carries `leaguePlayerId` and no name.
 * - **Hide** is what "remove from the roster" means: out of the Add Player
 *   lists, and out of a standings season they did not play. Every result stays
 *   exactly where it was. No confirmation, because nothing is lost and Show is
 *   right there.
 * - **Delete** is for a phantom with no results at all, and renders disabled
 *   carrying its reason otherwise — the `PlayerEntryActions` pattern, where a
 *   blocked action says why rather than being a dead or absent control.
 *
 * ## It lives HERE rather than on the League Roster chips
 *
 * Those chips are pressed to add a player mid-game. A destructive, irreversible
 * Firestore delete must not sit one tap from the name a director is reaching
 * for while the clock runs — the same argument that moved the league Danger
 * Zone into the Seasons tab. Fixing the roster here fixes the pickers anyway.
 *
 * ## And it reads the DOCUMENTS, which nothing else has
 *
 * `useLeague`'s `leaguePlayers` merges duplicate-named documents into one row
 * before any consumer sees them, so a stale duplicate has never been visible —
 * let alone removable. `leaguePlayerDocs` is the un-merged list, and `archived`
 * belongs to a document rather than to a name. A duplicate you cannot see is a
 * duplicate you cannot remove, and this is the screen for removing it.
 *
 * Merging two players is deliberately not offered: a merge that guesses which
 * results belong to whom is how a league loses its standings. Rename the one
 * that has the history and hide or delete the other.
 */
export default function LeaguePlayersTab() {
  const { leaguePlayerDocs, renameLeaguePlayer, setLeaguePlayerHidden, removeLeaguePlayer } = useLeague();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<LeaguePlayerDoc | null>(null);
  const [busy, setBusy] = useState(false);

  const byName = (a: LeaguePlayerDoc, b: LeaguePlayerDoc) => (a.name || '').localeCompare(b.name || '');

  /** Active names first, then the hidden ones — so the screen that exists to end
   *  a scrolling complaint does not reproduce it. */
  const { active, hidden } = useMemo(() => {
    const all = [...(leaguePlayerDocs ?? [])];
    return {
      active: all.filter(p => !p.archived).sort(byName),
      hidden: all.filter(p => p.archived).sort(byName),
    };
  }, [leaguePlayerDocs]);

  /** A HIDDEN namesake still blocks a rename, which is why the whole list is
   *  passed rather than the active half: `recordResultByName` matches by name
   *  over every document regardless of the flag. */
  const conflict = editingId ? rosterNameConflict(leaguePlayerDocs ?? [], draft, editingId) : null;

  const startEdit = (player: LeaguePlayerDoc) => {
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

  const toggleHidden = async (player: LeaguePlayerDoc) => {
    setBusy(true);
    try {
      await setLeaguePlayerHidden(String(player.id), !player.archived);
    } catch {
      toast({
        title: player.archived ? 'Could not show them again' : 'Could not hide them',
        description: 'The change was not saved.',
        variant: 'destructive',
      });
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
      toast({ title: 'Could not delete', description: 'The player is still in the league.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const row = (player: LeaguePlayerDoc) => {
    const editing = editingId === String(player.id);
    const games = player.resultCount;
    const blocked = deleteBlockedReason(player, games);

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
            {player.archived && (
              <span className="text-caption uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                Hidden
              </span>
            )}
            <span className="text-caption font-mono text-muted-foreground">
              {games} {games === 1 ? 'game' : 'games'}
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => startEdit(player)} aria-label={`Rename ${player.name}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => toggleHidden(player)}
              aria-label={player.archived ? `Show ${player.name}` : `Hide ${player.name}`}
              title={player.archived
                ? 'Offer this name again when adding players'
                : 'Stop offering this name when adding players. Their results are kept.'}
            >
              {player.archived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            {/* Disabled WITH THE REASON, never absent and never silent. A
                director who set out to delete a name needs to be told that the
                thing they want is Hide, and why. */}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !!blocked}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setPendingRemoval(player)}
              aria-label={`Delete ${player.name}`}
              title={blocked ?? 'Delete this player. They have no results, so nothing else goes with them.'}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    );
  };

  if (active.length === 0 && hidden.length === 0) {
    return (
      <p className="text-body text-muted-foreground py-6 text-center">
        No players yet. A player joins the league the first time a result is recorded for them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-label text-muted-foreground">
        Correcting a name keeps every game that player has played. Hiding one stops the name being
        offered when adding players — their results stay in the standings.
      </p>

      <div className="space-y-1">{active.map(row)}</div>

      {hidden.length > 0 && (
        <div className="space-y-1 pt-2">
          <p className="text-caption uppercase tracking-wide text-muted-foreground">
            Hidden ({hidden.length}) — not offered when adding players
          </p>
          {hidden.map(row)}
        </div>
      )}

      {/* The reason refused renames say so here rather than failing silently:
          two players sharing a name would send future results to whichever one
          `recordResultByName` finds first, and the roster picker de-dupes by
          name, so the clash would be invisible. */}
      {conflict && <p className="text-label text-destructive">{conflict}</p>}

      <AlertDialog open={!!pendingRemoval} onOpenChange={open => { if (!open) setPendingRemoval(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingRemoval?.name}?</AlertDialogTitle>
            {/* Only ever reached for a player with no results, so this says the
                one true thing. The old copy here warned how many recorded
                results it would delete — an action that no longer exists. */}
            <AlertDialogDescription>
              They have no recorded results, so nothing else goes with them. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={confirmRemoval}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
