import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { describeEvent, logOf, logTime, type LogEvent } from '@/lib/nightLog';

/**
 * The night's Summary as a list — `lib/nightLog.ts` owns what each row says.
 * Most recent first, because the question is nearly always about what just
 * happened. Director-facing: mounted on the console and in History, never on a
 * player's screen.
 */
export function NightSummaryList({ log, emptyText }: { log: unknown; emptyText?: string }) {
  const events: LogEvent[] = [...logOf(log)].reverse();
  if (events.length === 0) {
    return (
      <p className="text-body text-muted-foreground text-center py-4">
        {emptyText ?? 'Nothing has happened yet. Bust-outs, rebuys, re-entries and add-ons appear here as they happen.'}
      </p>
    );
  }
  return (
    <ol className="space-y-1" aria-label="Summary">
      {events.map(e => (
        <li key={e.id} className="flex items-baseline gap-3 text-label">
          <span className="font-mono text-muted-foreground w-11 flex-shrink-0">{logTime(e.at)}</span>
          <span className="font-mono text-caption text-muted-foreground w-8 flex-shrink-0">
            {e.level ? `L${e.level}` : ''}
          </span>
          <span className={
            e.kind === 'rebuyRefused' || e.kind === 'reEntryRefused' ? 'text-destructive' : ''
          }>
            {describeEvent(e)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The console's Summary button and dialog. */
export default function NightSummaryDialog({ log, hasPlayers = false }: { log: unknown; hasPlayers?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ScrollText className="h-3.5 w-3.5" />
          Summary
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Summary</DialogTitle>
          <DialogDescription>
            Everything that happened tonight, with the time and the level — most recent first.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {/* An empty log on a game that already has players means the game began
              before the Summary existed — "nothing has happened yet" said that about
              a finished game (reported). */}
          <NightSummaryList
            log={log}
            emptyText={hasPlayers
              ? 'No summary was kept for this game — it was started before the Summary existed. Your next game will have one.'
              : undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
