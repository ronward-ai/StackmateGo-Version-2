import { useEffect, useState } from 'react';
import FinalTableDialog from './FinalTableDialog';
import BreakTableDialog from './BreakTableDialog';
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
    tableBreakDue, tableToBreak, breakTable,
  } = tournament;

  /**
   * The two questions, asked in order of size.
   *
   * The final table wins when both could apply, because it is the more specific
   * one and owns everything at or below a single table's worth. `consolidationDue`
   * deliberately returns null there so the two cannot both be true — but reading
   * them in this order means that even if it ever did, one bust-out still gets
   * one dialog.
   */
  const finalTableDue = shouldPromptForFinalTable();
  const breakTo = finalTableDue ? null : tableBreakDue();
  const questionIsDue = finalTableDue || breakTo !== null;

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

  // A dismissal is spent once the question stops being due — a rebuy makes the
  // next bust-out a new question. It takes the QUESTION rather than the field
  // size now there is more than one: a break is dismissed far above one table's
  // worth, and the old test read every such dismissal as stale immediately,
  // dropping the latch on the next render and reopening the dialog. See
  // lib/finalTable.ts.
  useEffect(() => {
    if (!dismissalIsStale(dismissedAt, questionIsDue)) return;
    setDismissedAt(null);
  }, [dismissedAt, questionIsDue]);

  // While another device drives, stay silent AND stay current: latch the
  // dismissal to the field as it stands, so the instant control is taken there is
  // nothing outstanding to open. Re-armed by dismissalIsStale above the moment the
  // field changes.
  useEffect(() => {
    if (!readOnly) return;
    if (!questionIsDue) return;
    setDismissedAt(activeCount(state.players));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, questionIsDue, state.players]);

  useEffect(() => {
    if (readOnly) return;
    if (silenced) return;
    if (standDown) return;
    if (!questionIsDue) return;
    if (promptDismissedFor(dismissedAt, state.players)) return;
    open(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIsDue, dismissedAt, silenced, standDown, readOnly, state.players]);

  const justBusted = mostRecentlyBusted(state.players);

  const closing = () => {
    open(false);
    // Rebuy and close fire in the same tick, so on that path this records
    // the count from BEFORE the rebuy. Deliberately left alone: the
    // staleness effect above drops the latch the moment the question stops
    // being due, so the value stops mattering — and "the number it holds" is
    // exactly what must not be relied on to mean anything later.
    setDismissedAt(activeCount(state.players));
  };

  if (breakTo !== null) {
    const broken = tableToBreak();
    const names = state.settings.tables?.tableNames;
    const tableName = (broken !== null && names?.[broken]) || `Table ${(broken ?? 0) + 1}`;
    const movingCount = state.players.filter(
      p => p.isActive !== false && p.seated && p.tableAssignment?.tableIndex === broken,
    ).length;
    return (
      <BreakTableDialog
        isOpen={isOpen}
        onClose={closing}
        onConfirm={() => breakTable()}
        tableName={tableName}
        movingCount={movingCount}
        toTables={breakTo}
        triggeredBy={justBusted}
        onSilence={() => setSilenced(true)}
      />
    );
  }

  return (
    <FinalTableDialog
      isOpen={isOpen}
      onClose={closing}
      playerCount={activeCount(state.players)}
      onConfirm={goToFinalTable}
      triggeredBy={justBusted}
      onSilence={() => setSilenced(true)}
    />
  );
}
