import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, Plus, Trash2, Trophy } from 'lucide-react';
import { useLeague } from '@/hooks/useLeague';

/**
 * The league itself: name it, switch between leagues, make new ones, delete one.
 *
 * Multiple leagues were always supported by the data model and the security
 * rules, but there had never been any way to create a second one — leagues were
 * only ever auto-created as "Main League" on first sign-in, and switching only
 * appeared as a bare dropdown in the header when you happened to have more than
 * one. So "can a user have multiple leagues?" was answerable only by editing
 * Firestore by hand.
 */
export default function LeagueDetailsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { league, userLeagues, switchLeague, createLeague, renameLeague, deleteLeague } = useLeague();

  const [name, setName] = useState(league?.name ?? '');
  const [newLeagueName, setNewLeagueName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Follow the league when it changes underneath us (switching, or a rename
  // arriving from another device).
  useEffect(() => { setName(league?.name ?? ''); }, [league?.id, league?.name]);

  const nameChanged = name.trim() !== (league?.name ?? '') && name.trim().length > 0;

  const handleRename = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      await renameLeague(name);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err?.message || 'Could not rename the league.');
    } finally { setBusy(false); }
  };

  const handleCreate = async () => {
    const trimmed = newLeagueName.trim();
    if (!trimmed) return;
    setBusy(true); setError(null);
    try {
      // createLeague switches to the new league on success.
      await createLeague(trimmed);
      setNewLeagueName('');
      setShowNew(false);
    } catch (err: any) {
      setError(err?.message || 'Could not create the league.');
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!league?.id || deleteConfirm !== league?.name) return;
    setBusy(true); setError(null);
    try {
      await deleteLeague(String(league.id));
    } catch (err: any) {
      setError(err?.message || 'Could not delete the league.');
    } finally {
      setBusy(false); setShowDelete(false); setDeleteConfirm('');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
          {error}
        </div>
      )}

      {/* Name */}
      <Card className="p-4 space-y-2">
        <Label className="text-xs text-muted-foreground">League name</Label>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={readOnly || busy}
            maxLength={99}
            className="h-9 text-sm"
          />
          <Button size="sm" className="h-9" disabled={readOnly || busy || !nameChanged} onClick={handleRename}>
            {saved ? 'Saved' : 'Save'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Shown on the standings your players see.
        </p>
      </Card>

      {/* Switch */}
      {userLeagues.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Your leagues</p>
          {userLeagues.map((l: any) => {
            const isCurrent = String(l.id) === String(league?.id);
            return (
              <Card key={l.id} className="p-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <Trophy className="h-4 w-4 text-orange-400 flex-shrink-0" />
                  <span className="font-medium truncate">{l.name}</span>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 flex-shrink-0">
                      <Check className="h-3 w-3" />Current
                    </span>
                  )}
                </span>
                {!isCurrent && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => switchLeague(String(l.id))}>
                    Switch to
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create */}
      {!readOnly && (showNew ? (
        <Card className="p-4 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">New league name</Label>
            <Input
              value={newLeagueName}
              onChange={e => setNewLeagueName(e.target.value)}
              placeholder="e.g. Thursday Night League"
              maxLength={99}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A separate league with its own players, seasons, standings and points system.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={busy || !newLeagueName.trim()} onClick={handleCreate}>
              Create League
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowNew(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Button variant="outline" className="w-full gap-1.5" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" />
          New League
        </Button>
      ))}

      {/* Danger zone — league-level, so it belongs here rather than in Seasons. */}
      {!readOnly && (
        <div className="pt-4 mt-2 border-t border-border/40">
          <p className="text-xs text-muted-foreground mb-2">Danger zone</p>
          <Button
            variant="outline"
            className="w-full gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete “{league?.name || 'this league'}”
          </Button>
        </div>
      )}

      <AlertDialog open={showDelete} onOpenChange={o => { if (!o) { setShowDelete(false); setDeleteConfirm(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete league?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{league?.name}</strong> including every season, player and
              tournament result. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label className="text-xs text-muted-foreground">Type the league name to confirm</Label>
            <Input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={league?.name}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/80"
              onClick={handleDelete}
              disabled={busy || deleteConfirm !== league?.name}
            >
              {busy ? 'Deleting…' : 'Delete League'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
