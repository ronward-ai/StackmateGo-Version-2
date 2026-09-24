import { statusChipFor } from '@/lib/statusChip';

/**
 * The ONE implementation of the console's status pill.
 *
 * Both badges used to be built inline in `QRCodeSection`'s header. They belong
 * at the top of the screen, where the director actually looks, and there must
 * be exactly one of each on the page — a fact stated twice is a fact that can
 * disagree with itself, which is how this codebase ended up with three
 * vocabularies for a knockout and two colours for one button class.
 *
 * `lib/statusChip.ts` owns WHICH one shows; this owns what it looks like.
 */
export default function TournamentStatusChip({
  syncBlocked,
  isLive,
  className = '',
}: {
  syncBlocked?: boolean;
  isLive?: boolean;
  className?: string;
}) {
  const chip = statusChipFor({ syncBlocked, isLive });
  if (!chip) return null;

  const notSyncing = chip === 'not-syncing';

  return (
    <span
      className={`flex items-center gap-1.5 text-caption font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
        notSyncing
          ? 'bg-red-400/15 text-red-400 border-red-400/30'
          : 'bg-green-500/20 text-green-400 border-green-500/30'
      } ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full inline-block ${
          notSyncing ? 'bg-red-400' : 'bg-green-400 animate-pulse'
        }`}
      />
      {notSyncing ? 'Not syncing' : 'Broadcasting'}
    </span>
  );
}
