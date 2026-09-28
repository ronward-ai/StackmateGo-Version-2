import { useEffect, useState } from 'react';
import FinalTableDialog from './FinalTableDialog';
import { activeCount, dismissalIsStale, promptDismissedFor } from '@/lib/finalTable';
import { mostRecentlyBusted } from '@/lib/eliminationOrder';

/**
 * "Is this the final table?" — asked from wherever the director is standing.
 *
 * It used to live inside `TablesSection`, which is the SEATING TAB, and this
 * app unmounts inactive tab content (no `forceMount` anywhere). So the effect
 * that opens this dialog could only run while that one tab was on screen: a
 * director knocking players out from the Players tab — which is where the
 * roster and its KO buttons are — got no prompt at all, at any player count.
 * Verified by driving it, not deduced: three bust-outs from the Players tab,
 * no dialog, the same symptom as the bug it was mistaken for.
 *
 * Mounted at page level it is tab-independent, and two things that were
 * already meant to last now actually do. "Not this game" survives a tab
 * switch, as its own comment always claimed, and so does a "Not yet"
 * dismissal, instead of being quietly rearmed by wandering off to Buy-ins and
 * back.
 *
 * It renders nothing until the question is due, so mounting it unconditionally
 * costs a predicate over the roster.
 */
interface FinalTablePromptProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  /** So the seating screen can hold its own prompts back while this one is up. */
  onOpenChange?: (open: boolean) => void;
  /**
   * The rebuy offer is up. Hold back: it asks about the bust-out that just
   * happened, and this asks about what that bust-out caused — so answering it
   * first may remove the need for this question entirely.
   */
  standDown?: boolean;
  /**
   * This device is not driving the game.
   *
   * It stays MOUNTED while read-only rather than being left out, so that it can
   * watch: a prompt that starts blind the moment control is taken opens on a
   * condition it has never had the chance to answer, which is how taking control
   * ambushed a director twice. While read-only it opens nothing and instead keeps
   * the dismissal latched to the field size as it stands, so takeover is silent —
   * and `dismissalIsStale` drops that latch the moment the field changes, which is
   * what makes the next bust-out ask normally. Nothing is lost; you are just not
   * asked the second you pick the device up.
   */
  readOnly?: boolean;
}

export default function FinalTablePrompt({ tournament, onOpenChange, standDown = false, readOnly = false }: FinalTablePromptProps) {
  const {
    state, shouldPromptForFinalTable, goToFinalTable,
  } = tournament;

  const [isOpen, setIsOpen] = useState(false);
  /**
   * "Not yet" has to STICK. The prompt is driven off a predicate over
   * state.players, so a bare boolean was cleared by the next render that
   * touched the roster — a chip edit, a knockout — and the dialog reopened
   * behind a director who had gone to sell the busted player a rebuy.
   * Latching against the count it was dismissed at keeps it shut while the
   * field is that size; `dismissalIsStale` drops it when the field grows back.
   */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  /**
   * "Not this game" — the prompt is due on every bust-out once the field fits
   * one table, which is right, but a director who means to collapse the table
   * by hand should be able to say so once.
   *
   * Component state rather than tournament state, deliberately: a preference
   * about a QUESTION, not a fact about the game, and in `state` it would sync
   * to Firestore and out to every participant device.
   */
  const [silenced, setSilenced] = useState(false);

  const open = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };

  // A dismissal is spent once the field grows back past one table — a rebuy
  // makes the next bust-out a new question. See lib/finalTable.ts.
  useEffect(() => {
    if (!dismissalIsStale(dismissedAt, state.players, state.settings.tables?.seatsPerTable || 6)) return;
    setDismissedAt(null);
  }, [dismissedAt, state.players, state.settings.tables?.seatsPerTable]);

  // While another device drives, stay silent AND stay current: latch the
  // dismissal to the field as it stands, so the instant control is taken there is
  // nothing outstanding to open. Re-armed by dismissalIsStale above the moment the
  // field changes.
  useEffect(() => {
    if (!readOnly) return;
    if (!shouldPromptForFinalTable()) return;
    setDismissedAt(activeCount(state.players));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, shouldPromptForFinalTable, state.players]);

  useEffect(() => {
    if (readOnly) return;
    if (silenced) return;
    if (standDown) return;
    if (!shouldPromptForFinalTable()) return;
    if (promptDismissedFor(dismissedAt, state.players)) return;
    open(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPromptForFinalTable, dismissedAt, silenced, standDown, readOnly, state.players]);

  const justBusted = mostRecentlyBusted(state.players);

  return (
    <FinalTableDialog
      isOpen={isOpen}
      onClose={() => {
        open(false);
        // Rebuy and close fire in the same tick, so on that path this records
        // the count from BEFORE the rebuy. Deliberately left alone: the
        // staleness effect above drops the latch the moment the field grows,
        // so the value stops mattering — and "the number it holds" is exactly
        // what must not be relied on to mean anything later.
        setDismissedAt(activeCount(state.players));
      }}
      playerCount={activeCount(state.players)}
      onConfirm={goToFinalTable}
      triggeredBy={justBusted}
      onSilence={() => setSilenced(true)}
    />
  );
}
