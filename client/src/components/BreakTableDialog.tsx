import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TableProperties, Users } from 'lucide-react';
import type { Player } from '@/types';

/**
 * "The field fits fewer tables — break one?"
 *
 * The intermediate step the app never offered. Three tables of eight and sixteen
 * players left is plainly a two-table tournament, and the only question ever
 * asked was about the FINAL table, at eight.
 *
 * **It is not the final table's dialog with different numbers**, because it is
 * not the same action. A final table REDRAWS every seat at random, which is what
 * a final table draw is supposed to be; a break moves only the players at the
 * table that goes, and everybody else keeps the chair they were already in. That
 * difference is the whole reason a director will say yes to this without
 * hesitating, so the copy says it.
 *
 * One dialog for both doors: the prompt that fires on a bust-out, and the Break
 * icon in the Seating tab's table header. They used to be two — there was no
 * prompt at all, and the manual dialog said only that players "will be randomly
 * distributed" — and two descriptions of one action is how they drift.
 */
interface BreakTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** The table that goes, named as the director named it. */
  tableName: string;
  /** How many players are sitting at it. */
  movingCount: number;
  /** How many tables are left afterwards. */
  toTables: number;
  /** Whoever busted to bring the field down, when this was prompted. */
  triggeredBy?: Player | null;
  /** How many of them will have nowhere to sit. Zero on the prompted path. */
  overflow?: number;
  /** Stop asking for the rest of this tournament. Absent on the manual path. */
  onSilence?: () => void;
}

export default function BreakTableDialog({
  isOpen, onClose, onConfirm, tableName, movingCount, toTables, triggeredBy, overflow = 0, onSilence,
}: BreakTableDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TableProperties className="h-5 w-5 text-primary" />
            Break {tableName}?
          </DialogTitle>
          <DialogDescription>
            {triggeredBy
              ? `${triggeredBy.name} busting leaves enough room to play on ${toTables} tables.`
              : `The field now fits on ${toTables} tables.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/10">
            <Users className="h-6 w-6 text-primary flex-shrink-0" />
            <div>
              <div className="font-semibold font-mono text-title leading-none">{movingCount}</div>
              <div className="text-caption text-muted-foreground mt-1">
                {movingCount === 1 ? 'player moves' : 'players move'}
              </div>
            </div>
          </div>

          {/* NOT REFUSED, said out loud — the call lateEntryClosedReason makes.
              The prompted path can never reach this, because it only fires when
              the field fits; the Break icon in the table header has no such
              guard and never had one, so breaking a table on a full house left
              players standing with the copy still claiming everyone keeps their
              seat. */}
          {overflow > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="text-label font-semibold text-amber-200">
                {overflow === 1 ? '1 player has nowhere to sit' : `${overflow} players have nowhere to sit`}
              </div>
              <div className="text-caption text-amber-200/70 mt-1">
                The remaining tables do not have room for everyone at {tableName}. They stay in the
                tournament and can be seated by hand.
              </div>
            </div>
          )}

          {/* The fact a director decides on, and the one thing that makes this
              different from the final table: nobody else is disturbed. */}
          <div className="text-caption text-muted-foreground leading-relaxed">
            {movingCount === 0
              ? `${tableName} is empty, so nobody moves.`
              : `Only ${tableName} moves — everyone else keeps their seat.`}
            {' '}You can undo it.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:flex-col-reverse sm:space-x-0">
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Not yet
            </Button>
            <Button className="flex-1" onClick={handleConfirm}>
              Break {tableName}
            </Button>
          </div>
          {onSilence && (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => { onSilence(); onClose(); }}
            >
              Not this game — I’ll arrange it myself
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
