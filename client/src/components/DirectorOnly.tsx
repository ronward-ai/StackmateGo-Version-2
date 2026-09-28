import { Eye } from 'lucide-react';

/**
 * A region that only the device DRIVING the game may see.
 *
 * WHY NON-MOUNTING RATHER THAN DISABLING:
 *
 * A read-only console used to show the whole editor and skip the writes. The
 * screen responded to every press and nothing happened — reported, twice, as
 * crazy confusing. `lib/liveGameWrite.ts` stood the writes down correctly; the
 * problem was never the data layer, it was being offered a control at all.
 *
 * Disabling the controls was the obvious fix and is the wrong one. It means a
 * rule enforced at every button, which is the "three places out of twelve is not
 * a rule" trap this codebase has already paid for twice — and the next person to
 * add a control to the Buy-in tab has to remember. **A control that is not
 * rendered cannot be pressed, and needs no discipline from future code.** Same
 * argument the tab structure already leans on: `TabsContent` has no `forceMount`
 * anywhere in this app, which is what makes putting something in one tab
 * actually remove it from the others.
 *
 * It exists as a component rather than six inline ternaries so the wording is
 * written once, and so `git grep DirectorOnly` lists every director-only region
 * in the app on one screen.
 *
 * **A line of text, not a row of greyed-out buttons.** `TimerCard` already
 * replaces the transport this way and says why: greyed buttons read as "broken",
 * a sentence reads as what is actually true. Amber is not used here either —
 * nothing is broken and nothing is at risk, the game is being run properly, just
 * not on this device. The standing banner and the `Read-only` chip carry that
 * message; this is only the hole where a control was.
 *
 * Where a genuine read-only VIEW of the same thing exists, prefer passing it as
 * `instead` over the bare notice: `PlayerSectionReadOnly` and
 * `TablesSectionReadOnly` already exist for the participant view, and a second
 * screen showing the roster and the seating is the one thing it is good for.
 */
interface DirectorOnlyProps {
  /** This device is not driving the game. */
  readOnly: boolean;
  /** The controls, rendered only for the device that may use them. */
  children: React.ReactNode;
  /**
   * What to show in their place. Omitted, the standard line is used; pass a
   * read-only view of the same information where one exists.
   */
  instead?: React.ReactNode;
  /** Replaces the standard sentence, for a region that needs a sharper one. */
  notice?: string;
}

export default function DirectorOnly({ readOnly, children, instead, notice }: DirectorOnlyProps) {
  if (!readOnly) return <>{children}</>;
  if (instead !== undefined) return <>{instead}</>;

  return (
    <div className="flex items-start gap-2.5 py-6 text-body text-muted-foreground">
      <Eye className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <p>{notice || 'This game is being run on another device, and that is where it is set up. Take control above to change it from here.'}</p>
    </div>
  );
}
