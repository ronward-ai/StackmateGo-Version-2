import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hitmanCandidates } from '@/lib/eliminationOrder';
import type { Player } from '@/types';

/**
 * The one bust-out dialog, for the Players tab and the Seating tab alike
 * (October audit, Low).
 *
 * There were two. The Players tab's had been fixed to offer everybody still in
 * and to close out the tournament when nobody was; the Seating tab's offered
 * only the busted player's own table and required a pick — so a lone player on
 * a table, or heads-up across two, could never be knocked out there. A fix at
 * one door out of two is the fault this codebase keeps recording, and the cure
 * is that there stops being a second door.
 *
 * Owns the hitman choice; the caller owns what a bust-out DOES, because the
 * Seating tab passes the chair it is leaving and the Players tab lets the hook
 * take it.
 */
export default function BustOutDialog({
  open,
  onOpenChange,
  player,
  players,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: Player | null;
  players: Player[];
  onConfirm: (hitmanId: string | undefined) => void;
}) {
  const [hitmanId, setHitmanId] = useState<string | null>(null);
  const candidates = hitmanCandidates(players, player);
  const table = player?.tableAssignment?.tableIndex;

  useEffect(() => { if (!open) setHitmanId(null); }, [open]);

  // Heads-up: there is only one person it could have been, so pick them. Making
  // the director tap a single-item list before Confirm KO would enable reads as
  // a dead button — which is exactly how it was misread mid-game.
  useEffect(() => {
    if (open && !hitmanId && candidates.length === 1) setHitmanId(candidates[0].id);
  }, [open, hitmanId, candidates]);

  const lastStanding = candidates.length === 0;
  const blocked = !lastStanding && !hitmanId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {lastStanding ? `Finish Tournament — ${player?.name}` : `Bust Out — ${player?.name}`}
          </DialogTitle>
          <DialogDescription>
            {lastStanding
              ? 'No one left to attribute a knockout to — this closes out the tournament.'
              : 'Who knocked them out?'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-3 space-y-2 max-h-64 overflow-y-auto">
          {candidates.map(c => (
            <div
              key={c.id}
              role="option"
              aria-selected={hitmanId === c.id}
              onClick={() => setHitmanId(c.id)}
              className={cn(
                'p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between',
                hitmanId === c.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/30',
              )}
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">
                {table !== undefined && c.tableAssignment && c.tableAssignment.tableIndex !== table
                  ? 'Other table · '
                  : ''}
                {c.knockouts || 0} KOs
              </span>
            </div>
          ))}
          {lastStanding && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Last player standing — no knockout to record.
            </p>
          )}
        </div>
        {/* Say why the button is unavailable. A silently disabled button reads
            as broken, which is how this was misread during a live game. */}
        {blocked && (
          <p className="text-center text-xs text-amber-400/90">Tap who knocked them out to continue</p>
        )}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1" disabled={blocked} onClick={() => onConfirm(hitmanId ?? undefined)}>
            {lastStanding ? 'Finish Tournament' : 'Confirm KO'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
