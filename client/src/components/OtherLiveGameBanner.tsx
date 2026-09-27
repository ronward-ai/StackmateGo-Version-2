import { MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { eventNameOfTournament } from '@/lib/eventName';
import { timestampMs } from '@/lib/liveTournament';
import type { AccountLiveGame } from '@/hooks/useAccountLiveGame';

/**
 * "Your account is already running a game, and it is not this one."
 *
 * The other half of the control lock. That lock keeps two consoles off ONE
 * game; this is what stops a director making a SECOND one — two devices mint
 * two `localGameId`s, so they write two documents, and a lock on one document
 * says nothing about the other. A director ran game 5 on a phone and started a
 * second game 5 on a laptop with nothing on screen to say so.
 *
 * **It offers; it never jumps.** The console stays exactly where it is. That is
 * the rule `recoverableProgress()` already follows for the local mirror, for
 * the reason this codebase learned the hard way: the automatic restore lost a
 * game precisely because nobody was asked.
 *
 * Amber rather than red, like the read-only banner: nothing is broken and
 * nothing is at risk. It is information, and acting on it is optional.
 */
export default function OtherLiveGameBanner({
  game,
  leagueName,
  onOpen,
}: {
  game: AccountLiveGame | null;
  leagueName?: string | null;
  onOpen: (id: string) => void;
}) {
  if (!game) return null;

  // Through the document-level resolver, never `doc.name`. That field is set
  // ONCE at creation from a value `useTournament` never writes, which is how
  // every player's phone once read "Tournament 25/09/2026".
  const name = eventNameOfTournament(game, leagueName) || 'A tournament';

  const playerCount = Array.isArray(game.players) ? game.players.length : null;

  // Only when it is actually there: buildTournamentDocument's whitelist does
  // not write gameNumber at creation, and it arrives later with the wholesale
  // settings sync. Inventing one would be worse than omitting it.
  const gameNumber = Number(game.settings?.gameNumber) || null;

  // timestampMs, never String(value) — a Firestore Timestamp stringifies to
  // "[object Object]", which this module has already been bitten by once.
  const startedMs = timestampMs(game.createdAt);
  const started = startedMs
    ? new Date(startedMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '';

  const detail = [
    gameNumber ? `Game ${gameNumber}` : null,
    name,
    playerCount !== null ? `${playerCount} player${playerCount === 1 ? '' : 's'}` : null,
    started ? `started ${started}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-4 flex items-start gap-3">
      <MonitorSmartphone className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-body text-foreground/90">
        <div className="font-semibold text-amber-400 mb-1">Your account is running a game</div>
        <div className="font-mono text-label">{detail}</div>
        <div className="mt-1 text-muted-foreground">
          It is open on another device. Anything you start here will be a separate game.
        </div>
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => onOpen(String(game.id))}>
            Open it
          </Button>
        </div>
      </div>
    </div>
  );
}
