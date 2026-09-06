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

/** The same colours as inline styles, for the PNG export — html2canvas gets
 *  plain DOM nodes rather than JSX, so it cannot use the classes above. */
export const TONE_STYLES: Record<BadgeTone, { bg: string; border: string; fg: string }> = {
  neutral:    { bg: 'rgba(255,255,255,0.05)',  border: 'rgba(255,255,255,0.10)', fg: '#94A3B8' },
  money:      { bg: 'rgba(74,222,128,0.10)',   border: 'rgba(74,222,128,0.30)',  fg: '#4ADE80' },
  bounty:     { bg: 'rgba(251,191,36,0.10)',   border: 'rgba(251,191,36,0.30)',  fg: '#FBBF24' },
  eliminated: { bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.25)', fg: '#F87171' },
  points:     { bg: 'rgba(249,115,22,0.10)',   border: 'rgba(249,115,22,0.30)',  fg: '#F97316' },
};

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
