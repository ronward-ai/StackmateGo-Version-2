import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsGroupHeader } from '@/components/ui/setting-row';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { useAccountReset } from '@/hooks/useAccountReset';
import { describeWipe } from '@/lib/accountWipe';

/**
 * The two destructive controls, at the foot of Settings and nowhere else.
 *
 * They are separated because they cost completely different things. Reset puts
 * the app's idea of how a game is set up back to factory and keeps every
 * result; delete removes the results. Rolling them into one control would mean
 * anyone wanting a clean console had to give up their league's history to get
 * one.
 *
 * No new tint and no `.btn-*` class — `variant="destructive"` is what the app
 * already has for this, and the colour note in CLAUDE.md is explicit that a
 * tenth tint needs a reason that survives being written down.
 */
export default function DangerZone() {
  const { canDelete, isWorking, progress, error, resetDevice, countEverything, deleteEverything } =
    useAccountReset();

  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  const openDelete = async () => {
    setTyped('');
    setSummary(null);
    setDeleteOpen(true);
    try {
      setSummary(describeWipe(await countEverything()));
    } catch {
      // Say so rather than showing a confident blank. Agreeing to delete
      // "nothing" when the count simply failed would be the wrong impression
      // to give at exactly the wrong moment.
      setSummary('could not be counted — check your connection before continuing');
    }
  };

  return (
    <Card className="card-glass rounded-xl border-destructive/30">
      <CardContent className="p-4 space-y-4">
        <SettingsGroupHeader icon={AlertTriangle} title="Danger Zone" color="text-destructive" />

        <div className="space-y-2">
          <p className="text-label font-medium">Reset this device</p>
          <p className="text-caption text-muted-foreground leading-relaxed">
            Clears the blind structure, buy-in, payouts, branding and any game in progress on this
            device, and the saved setup on your account. Your leagues, seasons, players and results
            are not touched.
          </p>
          <Button
            variant="outline"
            className="w-full h-10 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setResetOpen(true)}
            disabled={isWorking}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset this device
          </Button>
        </div>

        <div className="space-y-2 pt-2 border-t border-border/30">
          <p className="text-label font-medium">Delete everything</p>
          <p className="text-caption text-muted-foreground leading-relaxed">
            Permanently deletes every league, season, player, result and saved game on this account.
            This cannot be undone and there is no backup.
          </p>
          <Button
            variant="destructive"
            className="w-full h-10"
            onClick={openDelete}
            disabled={isWorking || !canDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete everything
          </Button>
          {!canDelete && (
            <p className="text-caption text-muted-foreground">Sign in to manage your account data.</p>
          )}
        </div>

        {progress && (
          <p className="text-caption text-muted-foreground font-mono">
            Deleting {progress.stage}… {progress.done} of {progress.total}
          </p>
        )}
        {error && <p className="text-caption text-destructive">{error}</p>}
      </CardContent>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this device?</AlertDialogTitle>
            <AlertDialogDescription>
              The blind structure, buy-in, payouts, branding and any game in progress on this device
              will be cleared, along with the setup saved to your account. Your leagues, seasons,
              players and results stay exactly as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetDevice}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete everything on this account?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete{' '}
                  <span className="font-medium text-foreground">
                    {summary ?? 'counting…'}
                  </span>
                  .
                </p>
                <p>
                  It cannot be undone, and there is no backup. Your account and subscription are not
                  affected.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="danger-confirm" className="text-caption">
              Type <span className="font-mono font-medium">DELETE</span> to confirm
            </Label>
            <Input
              id="danger-confirm"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={typed !== 'DELETE' || isWorking}
              onClick={deleteEverything}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
