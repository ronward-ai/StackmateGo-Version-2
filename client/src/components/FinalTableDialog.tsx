import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, Users } from "lucide-react";
import type { Player } from "@/types";

/**
 * Asking whether this is the final table — and first, whether the player who
 * just busted is coming back.
 *
 * The collapse moves every remaining player and REDRAWS their seats at random,
 * so it is not a thing to do speculatively. The dialog already asked before
 * acting; what it never did was name the one fact the answer turns on. A
 * director who had just knocked someone out and was about to sell them a rebuy
 * got "There are now 8 players remaining!" and no way to say "he's buying back
 * in" — so they dismissed it, went to the players list to do the rebuy, and the
 * prompt reopened behind them, because "Not Yet" lasted exactly until the next
 * change to the roster.
 *
 * Rebuys do not decide whether a final table is DUE — nothing else can grow the
 * field, since late entry does not exist here. They decide whether this
 * particular bust-out counted.
 */

interface FinalTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  playerCount: number;
  onConfirm: () => void;
  /** Whoever busted to bring the field down to one table, when known. */
  triggeredBy?: Player | null;
  /** Shown only when that player may actually still rebuy. */
  onRebuyTrigger?: () => void;
}

export default function FinalTableDialog({
  isOpen,
  onClose,
  playerCount,
  onConfirm,
  triggeredBy,
  onRebuyTrigger,
}: FinalTableDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Final table?
          </DialogTitle>
          <DialogDescription>
            {triggeredBy
              ? `${triggeredBy.name} busting leaves ${playerCount} players — one table's worth.`
              : `There are ${playerCount} players left — one table's worth.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/10">
            <Users className="h-6 w-6 text-primary flex-shrink-0" />
            <div>
              <div className="font-semibold font-mono text-title leading-none">{playerCount}</div>
              <div className="text-caption text-muted-foreground mt-1">players remaining</div>
            </div>
          </div>

          {onRebuyTrigger && triggeredBy && (
            <p className="text-label text-muted-foreground leading-relaxed">
              If {triggeredBy.name} is buying back in, do that first — nobody needs to move.
            </p>
          )}

          <div className="text-caption text-muted-foreground leading-relaxed">
            Going to the final table moves everyone to Table 1 and redraws the seats at random.
            You can undo it.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:flex-col-reverse sm:space-x-0">
          {onRebuyTrigger && triggeredBy && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => { onRebuyTrigger(); onClose(); }}
            >
              {triggeredBy.name} is rebuying
            </Button>
          )}
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Not yet
            </Button>
            <Button className="flex-1" onClick={handleConfirm}>
              Go to final table
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
