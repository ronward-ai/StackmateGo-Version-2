import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { useLeague } from '@/hooks/useLeague';

/**
 * Deleting the league.
 *
 * Sits at the foot of the dialog, outside the tabs, because it applies to the
 * whole league regardless of which tab is open. It previously lived inside a
 * menu titled "Season actions", which is how a league gets deleted by mistake.
 */
export default function LeagueDangerZone() {
  const { league, deleteLeague } = useLeague();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!league?.id || confirm !== league?.name) return;
    setBusy(true); setError(null);
    try {
      await deleteLeague(String(league.id));
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Could not delete the league.');
    } finally {
      setBusy(false); setConfirm('');
    }
  };

  return (
    <div className="pt-4 mt-4 border-t border-border/40">
      <p className="text-xs text-muted-foreground mb-2">Danger zone</p>
      {error && <p className="text-xs text-destructive mb-2">{error}</p>}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="text-xs">Delete “{league?.name || 'this league'}”</span>
      </Button>

      <AlertDialog open={open} onOpenChange={o => { if (!o) { setOpen(false); setConfirm(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete league?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{league?.name}</strong> including every season, player
              and tournament result. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label className="text-xs text-muted-foreground">Type the league name to confirm</Label>
            <Input
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder={league?.name}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirm('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/80"
              onClick={handleDelete}
              disabled={busy || confirm !== league?.name}
            >
              {busy ? 'Deleting…' : 'Delete League'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
