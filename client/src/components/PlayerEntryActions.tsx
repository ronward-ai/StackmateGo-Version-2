import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { entryCosts } from '@/lib/prizePool';
import { currencyOf, money } from '@/lib/currency';
import { reEntryUnavailableReason } from '@/lib/entryLimits';
import { rebuyStillOpenFor } from '@/lib/rebuyOffer';
import type { Player, PrizeStructure, Settings } from '@/types';

/**
 * Getting a busted player back in: a re-entry, and — for exactly one player at
 * a time — a rebuy.
 *
 * In poker a rebuy is taken immediately: the player has just busted, is still
 * in their chair, and buys chips there and then, which is why `processRebuy`
 * returns them to the seat they never left. Coming back LATER, to a new seat,
 * is a re-entry. This drew a Rebuy button beside EVERY busted player's name for
 * the length of the rebuy period, so a director could bust someone in level 2
 * and "rebuy" them in level 6, which is not a rebuy in any cardroom.
 *
 * The rebuy is offered once, at the bust-out, by `components/RebuyOffer.tsx`.
 * The button that survives here is the **failsafe for a misclick** on that
 * offer, and `rebuyStillOpenFor` keeps it to the one player who busted most
 * recently: it goes the moment anyone else busts, or the period ends. Re-entry
 * is unconditional, because being available later is exactly what a re-entry
 * is for.
 *
 * ONE implementation, rendered wherever a busted player appears. The seating
 * screen and the players list had grown their own, which is the shape of every
 * drift this codebase has paid for — the rake formula at nine sites, the timer
 * drawn twice, `.btn-add-position` declared twice in different colours.
 *
 * The two screens had also diverged on the more interesting question of what to
 * do when a rebuy is NOT available: the players list drew a disabled button and
 * said nothing, the seating screen drew nothing at all. A director who had set
 * rebuys to 1 and used it got a greyed-out button on one screen, an absence on
 * the other, and no way to tell whether the rule was working or the app was
 * broken. Both now show the control disabled with the reason on it, which comes
 * from lib/entryLimits.ts so the wording lives with the rule.
 */

interface PlayerEntryActionsProps {
  player: Player;
  /** The roster, so the one live bust-out is decided here rather than at three
   *  call sites that would drift. */
  players?: Player[];
  prizeStructure?: PrizeStructure;
  settings?: Settings;
  currentLevel: number;
  onRebuy: (playerId: string) => void;
  onReEntry: (playerId: string) => void;
  /** `compact` is the single-letter treatment that fits inside a seat. */
  variant?: 'compact' | 'labelled';
}

export default function PlayerEntryActions({
  player, players, prizeStructure, settings, currentLevel, onRebuy, onReEntry, variant = 'labelled',
}: PlayerEntryActionsProps) {
  const sym = currencyOf(settings);
  const costs = entryCosts(prizeStructure);
  const compact = variant === 'compact';

  const reEntryBlocked = reEntryUnavailableReason(prizeStructure, player, currentLevel);

  const reEntryTotal = (prizeStructure?.buyIn || 0) + costs.reEntryRake + costs.reEntryBounty;
  const rebuyTotal = (prizeStructure?.rebuyAmount || 0) + costs.rebuyRake + costs.rebuyBounty;

  /**
   * Shown, never shown-disabled. Every other control here explains itself when
   * blocked, but "somebody else has since busted" is not a rule about THIS
   * player that a director could act on — it is simply no longer their turn,
   * and a permanently greyed Rebuy against every name is the noise this change
   * removed. The Busted strip says once, at the top, where the rebuy went.
   */
  const rebuyOpen = rebuyStillOpenFor(players, prizeStructure, currentLevel, player.id);

  const action = (
    key: 'rebuy' | 'reentry',
    blocked: string | null,
    label: string,
    title: string,
    costLabel: string,
    base: number,
    rake: number,
    bounty: number,
    total: number,
    confirmLabel: string,
    onConfirm: () => void,
  ) => {
    // Disabled and saying why, never hidden — an absent control is
    // indistinguishable from a broken one.
    if (blocked) {
      return (
        <Button
          key={key}
          variant="secondary"
          disabled
          onClick={e => e.stopPropagation()}
          className={compact ? 'h-7 px-1.5 text-caption font-bold' : 'h-8 px-2 text-caption'}
          title={blocked}
        >
          {compact ? label : blocked}
        </Button>
      );
    }

    return (
      <AlertDialog key={key}>
        <AlertDialogTrigger asChild>
          <Button
            variant="secondary"
            onClick={e => e.stopPropagation()}
            className={compact ? 'h-7 px-1.5 text-caption font-bold' : 'h-8 px-2 text-caption font-medium'}
          >
            {label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>{costLabel}</span><span>{money(base, sym)}</span></div>
                {rake > 0 && (
                  <div className="flex justify-between"><span>Rake</span><span>{money(rake, sym)}</span></div>
                )}
                {bounty > 0 && (
                  <div className="flex justify-between"><span>Bounty chip</span><span>{money(bounty, sym)}</span></div>
                )}
                <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                  <span>Total</span><span>{money(total, sym)}</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  // A feature switched OFF for the whole tournament is a setting, not a blocked
  // action — there is nothing for the director to do about it and a row of
  // "Rebuys are off" on every busted player is pure noise. Only a rule that
  // bit THIS player earns an explanation.
  const showReEntry = !!prizeStructure?.allowReEntry;

  return (
    <>
      {rebuyOpen && action(
        'rebuy', null, compact ? 'R' : 'Rebuy',
        `Re-buy for ${player.name}?`, 'Rebuy cost',
        prizeStructure?.rebuyAmount || 0, costs.rebuyRake, costs.rebuyBounty, rebuyTotal,
        'Confirm Re-buy', () => onRebuy(player.id),
      )}
      {showReEntry && action(
        'reentry', reEntryBlocked, compact ? 'RE' : 'Re-entry',
        `Re-entry for ${player.name}?`, 'Re-entry cost',
        prizeStructure?.buyIn || 0, costs.reEntryRake, costs.reEntryBounty, reEntryTotal,
        'Confirm Re-entry', () => onReEntry(player.id),
      )}
    </>
  );
}
