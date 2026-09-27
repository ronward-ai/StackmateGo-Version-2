import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { entryCosts } from '@/lib/prizePool';
import { currencyOf, money } from '@/lib/currency';
import { ordinal } from '@/lib/ordinal';

/**
 * "They are out. Rebuy?" — asked once, at the bust-out, and never again.
 *
 * **In poker a rebuy is taken immediately.** The player has just busted, they
 * are still in their chair, and they buy chips there and then — which is why
 * `processRebuy` puts them back in the seat they never left. Coming back later,
 * to a new seat, is a re-entry. The app used to draw a Rebuy button beside every
 * busted player's name for as long as the rebuy period ran, so a director could
 * bust someone in level 2 and "rebuy" them in level 6.
 *
 * Mounted at PAGE level, not in either bust-out dialog, for the reason
 * `FinalTablePrompt` is: this app unmounts inactive tab content, and the two KO
 * dialogs live in different tabs. A prompt inside one of them would only ever
 * fire for bust-outs done from that tab — which is exactly how the final-table
 * prompt was invisible from the Players tab for as long as it was.
 *
 * It also means one implementation rather than one per KO dialog, and the offer
 * arrives the same way whichever screen the director is standing on.
 */
interface RebuyOfferProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  /**
   * From `useRebuyOffer`, which the PAGE owns so that the prompts which must
   * stand down for this one see the same answer in the same render. Holding it
   * here instead cost exactly that: the final-table prompt opened on top.
   */
  offer: ReturnType<typeof import('@/hooks/useRebuyOffer').useRebuyOffer>;
}

export default function RebuyOffer({ tournament, offer }: RebuyOfferProps) {
  const { state } = tournament;
  const { player, answer } = offer;

  if (!player) return null;

  const sym = currencyOf(state.settings);
  const costs = entryCosts(state.prizeStructure);
  const total = (state.prizeStructure?.rebuyAmount || 0) + costs.rebuyRake + costs.rebuyBounty;

  return (
    <AlertDialog open onOpenChange={o => { if (!o) answer(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {player.name} is out{player.position ? ` in ${ordinal(player.position)}` : ''} — rebuy?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {/* The cost, because this replaces a control that always showed it
                  before committing. A director should not have to remember what
                  a rebuy costs at the busiest moment of the night. */}
              <div className="flex justify-between">
                <span>Rebuy cost</span><span className="font-mono">{money(state.prizeStructure?.rebuyAmount || 0, sym)}</span>
              </div>
              {costs.rebuyRake > 0 && (
                <div className="flex justify-between"><span>Rake</span><span className="font-mono">{money(costs.rebuyRake, sym)}</span></div>
              )}
              {costs.rebuyBounty > 0 && (
                <div className="flex justify-between"><span>Bounty chip</span><span className="font-mono">{money(costs.rebuyBounty, sym)}</span></div>
              )}
              <div className="flex justify-between font-semibold border-t border-border pt-1">
                <span>Total</span><span className="font-mono">{money(total, sym)}</span>
              </div>
              {/* Said plainly, because it is the whole rule and the director is
                  about to lose the option. Re-entry is named as the way back in
                  so "No" does not read as "they can never return". */}
              <p className="text-muted-foreground pt-1">
                A rebuy is taken now, in the same seat. Later they would have to re-enter.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => answer(false)}>No — they are out</AlertDialogCancel>
          <AlertDialogAction onClick={() => answer(true)}>Rebuy {money(total, sym)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
