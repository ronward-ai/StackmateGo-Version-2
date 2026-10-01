import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import PlayerBadge from '@/components/ui/player-badge';
import type { RankTone, ResultRow as Row } from '@/lib/resultRows';
import type { ResultPlayerLike } from '@/lib/resultRows';

/**
 * One player's line in the finishing order, on screen.
 *
 * **The only screen implementation of it.** There were two, and the one nobody
 * on the director's side ever looks at had drifted furthest: the participant's
 * phone (`PlayerSectionReadOnly`) printed `#9` rather than an ordinal, gave 1st
 * the same red as 9th, and hand-rolled `3 KOs` in red beside raw `prizeMoney` in
 * green — bypassing `lib/playerBadges.ts` entirely to rebuild the exact third
 * vocabulary that module was written to end. It survived because it is invisible
 * from the console.
 *
 * What it says comes from `lib/resultRows.ts`; this decides only how it looks,
 * the same division `PlayerBadge` and `lib/playerBadges.ts` already keep.
 *
 * It is NOT shared with the exported image, deliberately. An export is a
 * different medium — flat and high-contrast so it survives being posted to a
 * group chat, where this is glass over a dark page — so what the two share is
 * the row DATA and the named `rankTone`, never a hex value. See
 * `components/export/exportStyle.ts`.
 */

/**
 * Tone to colour, on screen.
 *
 * These are the console's existing medal colours, kept exactly, so fixing the
 * ordinal does not quietly restyle a screen nobody asked to have restyled. The
 * export's palette lives beside the rest of the print style and is free to
 * differ, because `rankTone` is a name rather than a colour.
 */
const RANK_TONES: Record<RankTone, string> = {
  gold:   'bg-yellow-500 text-black',
  silver: 'bg-gray-300 text-black',
  bronze: 'bg-amber-600 text-white',
  out:    'bg-red-900 text-white',
  active: 'bg-green-600 text-white',
};

interface ResultRowProps<T extends ResultPlayerLike> {
  row: Row<T>;
  /** Controls for this player, when the viewer is allowed any. */
  actions?: ReactNode;
  className?: string;
}

export default function ResultRow<T extends ResultPlayerLike>({
  row, actions, className,
}: ResultRowProps<T>) {
  return (
    <div
      className={cn(
        'flex items-center p-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]',
        'hover:bg-[#1e1e1e] transition-colors gap-2',
        className,
      )}
    >
      {/* Rank, name and chips wrap together on a narrow screen; the controls do
          not, so a phone never pushes a button off the row. */}
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={cn(
            'px-2 py-0.5 rounded text-caption font-medium whitespace-nowrap flex-shrink-0',
            RANK_TONES[row.rankTone],
          )}
        >
          {row.rankLabel}
        </span>
        <span className="font-bold text-white text-body truncate" title={row.player.name}>
          {row.player.name}
        </span>
        {row.badges.map(badge => (
          <PlayerBadge key={badge.key} badge={badge} />
        ))}
      </div>

      {actions && <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>}
    </div>
  );
}
