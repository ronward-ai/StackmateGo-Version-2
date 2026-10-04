import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import SeasonForm from '@/components/SeasonForm';
import { nextSeasonDraft, seasonDraftProblem, type SeasonDraft } from '@/lib/seasonProgress';

/**
 * Where every Start Next Season leads.
 *
 * It used to create the next season on the spot — the next period's dates and
 * the SAME number of games — which is wrong for a league whose seasons follow
 * the calendar, and gave nobody the chance to rename it. Now the director is
 * asked how the season runs, starting from a draft of the one that ended
 * (`nextSeasonDraft`), and nothing is created until they press Create.
 */
export default function NewSeasonDialog({
  open,
  onOpenChange,
  previousSeason,
  onCreate,
  busy = false,
  error = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The season this one follows; the draft is prefilled from it. */
  previousSeason: any;
  /** Resolves truthy once the season exists, which closes the dialog. */
  onCreate: (draft: SeasonDraft) => Promise<unknown>;
  busy?: boolean;
  error?: string | null;
}) {
  const [draft, setDraft] = useState<SeasonDraft>(() => nextSeasonDraft(previousSeason));

  // A fresh draft each time it opens, from whichever season it now follows.
  useEffect(() => {
    if (open) setDraft(nextSeasonDraft(previousSeason));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = seasonDraftProblem(draft);

  const create = async () => {
    if (problem) return;
    // The dialog stays open on failure so the answers survive the retry, and
    // the error is shown beneath them.
    if (await onCreate(draft)) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up the next season</DialogTitle>
          <DialogDescription>
            {previousSeason?.name
              ? `Following ${previousSeason.name}. Its standings stay exactly as they are.`
              : 'Its standings stay exactly as they are.'}
          </DialogDescription>
        </DialogHeader>
        <SeasonForm draft={draft} onChange={setDraft} />
        {error && <p className="text-caption text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !!problem} title={problem ?? undefined} onClick={create}>
            {busy ? 'Creating…' : 'Create season'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
