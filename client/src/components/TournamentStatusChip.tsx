import { statusChipFor, type StatusChip } from '@/lib/statusChip';

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

/**
 * Three states, three tones, and the tones are the app's existing semantics:
 * red for a fault the director must fix, amber for a condition that is nobody's
 * mistake, green for a thing working as intended. Read-only is amber for that
 * reason — the game is being run properly, just not on this device.
 */
const TONES: Record<Exclude<StatusChip, null>, { label: string; pill: string; dot: string }> = {
  'not-syncing': {
    label: 'Not syncing',
    pill: 'bg-red-400/15 text-red-400 border-red-400/30',
    dot: 'bg-red-400',
  },
  'read-only': {
    label: 'Read-only',
    pill: 'bg-amber-400/15 text-amber-400 border-amber-400/30',
    dot: 'bg-amber-400',
  },
  broadcasting: {
    label: 'Broadcasting',
    pill: 'bg-green-500/20 text-green-400 border-green-500/30',
    dot: 'bg-green-400 animate-pulse',
  },
};

export default function TournamentStatusChip({
  syncBlocked,
  isLive,
  readOnly,
  className = '',
}: {
  syncBlocked?: boolean;
  isLive?: boolean;
  /** Another device holds control of this game. */
  readOnly?: boolean;
  className?: string;
}) {
  const chip = statusChipFor({ syncBlocked, isLive, readOnly });
  if (!chip) return null;

  const tone = TONES[chip];

  return (
    <span
      className={`flex items-center gap-1.5 text-caption font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${tone.pill} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${tone.dot}`} />
      {tone.label}
    </span>
  );
}
