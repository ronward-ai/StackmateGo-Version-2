import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { eventNameOfTournament } from '@/lib/eventName';
import type { AccountLiveGame } from '@/hooks/useAccountLiveGame';

/**
 * "You are already running a game. Start a second one?"
 *
 * The banner explains; this is what actually stands between a director and the
 * thing that was reported — game 5 running on a phone while a laptop starts
 * another game 5. A director who does not read the banner presses Next Game and
 * gets here instead.
 *
 * **It warns and never refuses.** Two genuine tournaments in one evening is
 * completely normal — a league night and a cash game after it, or a second
 * league at another venue — and the director is the one standing there. Same
 * call `lateEntryClosedReason()` makes: state the fact, let them decide.
 *
 * The wording names the other game rather than saying "a game", because "which
 * one?" is the question a director has when they meet this, and the honest
 * answer is the one thing that makes the choice easy.
 */
export default function NewGameGuardDialog({
  game,
  open,
  leagueName,
  onCancel,
  onOpenOther,
  onProceed,
}: {
  game: AccountLiveGame | null;
  open: boolean;
  leagueName?: string | null;
  onCancel: () => void;
  onOpenOther: (id: string) => void;
  onProceed: () => void;
}) {
  if (!game) return null;

  // The document-level resolver, never `doc.name` — see lib/eventName.ts.
  const name = eventNameOfTournament(game, leagueName) || 'A tournament';
  const gameNumber = Number(game.settings?.gameNumber) || null;
  const label = gameNumber ? `Game ${gameNumber} (${name})` : name;

  return (
    <AlertDialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You are already running a game</AlertDialogTitle>
          <AlertDialogDescription>
            {label} is open on another device. Starting a new game here leaves that one running
            separately — two games, on two devices, for the same night.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-muted text-foreground hover:bg-muted/80"
            onClick={() => onOpenOther(String(game.id))}
          >
            Open that game
          </AlertDialogAction>
          <AlertDialogAction onClick={onProceed}>Start a new one anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
