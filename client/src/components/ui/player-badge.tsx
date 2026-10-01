import { cn } from '@/lib/utils';
import type { BadgeTone, PlayerBadge as Badge } from '@/lib/playerBadges';

/**
 * One chip beside a player's name.
 *
 * What it says comes from `lib/playerBadges.ts`; this decides only how it looks.
 * The figure is set in the mono face — the same face as every other number in
 * the app — which is what lets these read without an icon beside them.
 */

/**
 * Tone to colour. Five tones, each meaning one thing.
 *
 * Facts about the game share `neutral` on purpose. When the seat number, the
 * knockout count and the rebuy count each had a hue of their own, a busy row
 * carried six colours and none of them meant anything — so the money did not
 * stand out either.
 */
const TONES: Record<BadgeTone, string> = {
  neutral:    'bg-white/5 border-white/10 text-muted-foreground',
  money:      'bg-green-400/10 border-green-400/30 text-green-400',
  bounty:     'bg-amber-400/10 border-amber-400/30 text-amber-400',
  eliminated: 'bg-red-400/[0.08] border-red-400/25 text-red-400',
  points:     'bg-primary/10 border-primary/30 text-primary',
};

/*
 * There was a SECOND copy of the table above, `TONE_STYLES` — the same five
 * tones spelled again as inline styles, kept in step with it by hand — because
 * the results PNG was built from `document.createElement` nodes that could not
 * carry a class. The exports render real JSX now, so the mirror is gone.
 *
 * Do not bring it back. html2canvas reads COMPUTED styles from a node that is in
 * the document, which is why capturing Tailwind markup has always worked; a
 * second palette buys nothing and is a drift waiting to happen. An export that
 * wants a different LOOK changes `components/export/exportStyle.ts`, which owns
 * the frame, the type and the rank colours and deliberately not the chips.
 */

export function PlayerBadge({ badge, className }: { badge: Badge; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0',
        'text-caption font-medium px-1.5 py-0.5 rounded border',
        TONES[badge.tone],
        className
      )}
    >
      {badge.figure && <span className="font-mono font-bold">{badge.figure}</span>}
      {badge.label}
    </span>
  );
}

export default PlayerBadge;
