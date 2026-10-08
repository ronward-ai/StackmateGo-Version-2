import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isLeagueGame } from '@/lib/tournamentMode';
import { currencyOf } from '@/lib/currency';
import { resultRowsFor, type ResultRow } from '@/lib/resultRows';
import { resultsCsvTable } from '@/lib/resultColumns';
import { toCsv, csvFilename, downloadCsv } from '@/lib/csv';
import { eventNameOf } from '@/lib/eventName';
import { seasonLine } from '@/lib/seasonProgress';
import ResultsSheet from '@/components/export/ResultsSheet';
import ResultsTable from '@/components/ResultsTable';
import { captureSheet, sheetFilename } from '@/components/export/captureSheet';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import { useToast } from '@/hooks/use-toast';

/**
 * One game's results and their two exports — the image and the spreadsheet —
 * for ANY game: the one on the console, or a past night opened from the season
 * bar or History. It used to live inside `PlayerSection`, so a past night could
 * only be listed, never exported; reported from a phone wanting last night's
 * picture "exactly the same as the iPad". One implementation, so the two
 * screens cannot make different pictures of one night.
 */

export interface ResultsGame {
  players: any[];
  prizeStructure?: any;
  settings?: any;
  details?: { type?: string; ownerId?: string; leagueId?: string; createdAt?: unknown; startTime?: unknown } | null;
  /** A stored document carries the owner at the top level. */
  ownerId?: string;
  /** A stored document's creation time — the night it was played. */
  createdAt?: unknown;
}

/** The rows, columns and caption for a game, scored with its own league's points. */
export function useGameResults(game: ResultsGame) {
  const settings = game.settings ?? {};
  const leagueId = settings.leagueId ?? (game.details as any)?.leagueId ?? null;
  const { calculatePoints } = useLeagueSettings(
    (game.details as any)?.ownerId ?? game.ownerId,
    leagueId ? String(leagueId) : null,
  );
  const isLeagueMode = isLeagueGame({ details: game.details ?? undefined, settings });
  const rows = resultRowsFor(game.players ?? [], {
    prizeStructure: game.prizeStructure,
    settings,
    isLeagueMode,
    calculatePoints,
  });
  const columnContext = { prizeStructure: game.prizeStructure, isLeagueMode };
  const count = (game.players ?? []).length;
  // `Spring 2026 · Game 4 of 13 · 9 players` — the facts a picture loses once the night is over.
  const subtitle = [
    isLeagueMode ? seasonLine(settings) : '',
    `${count} player${count === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');
  // The night it was played: the console mirrors the document's createdAt onto
  // details; a past night's document carries it at the top level. A game never
  // saved has neither, and the sheet says today.
  const date = (game.details as any)?.createdAt ?? game.createdAt ?? (game.details as any)?.startTime;
  return { rows, columnContext, subtitle, isLeagueMode, date };
}

export function ResultsExportButtons({
  settings,
  rows,
  columnContext,
  subtitle,
  date,
}: {
  settings: any;
  rows: ResultRow<any>[];
  columnContext: { prizeStructure?: any; isLeagueMode: boolean };
  subtitle: string;
  date?: unknown;
}) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const exportImage = async () => {
    setIsExporting(true);
    try {
      await captureSheet(
        <ResultsSheet
          title={eventNameOf(settings) || 'Tournament results'}
          subtitle={subtitle}
          date={date}
          rows={rows}
          settings={settings}
          columnContext={columnContext}
          currencySymbol={currencyOf(settings)}
        />,
        { filename: sheetFilename(['tournament-results']) },
      );
    } catch (error) {
      console.error('Error exporting results:', error);
      toast({
        title: 'Could not save the image',
        description: 'The results image could not be created. Try again, or take a screenshot.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // The same rows and columns the table and the image draw, through
  // `resultsCsvTable`; escaping and formula defusing are `lib/csv.ts`'s.
  const exportCsv = () => {
    const { headers, rows: cells } = resultsCsvTable(
      rows, settings?.resultColumns, columnContext, currencyOf(settings),
    );
    const name = csvFilename([eventNameOf(settings) || 'tournament', 'results']);
    if (!downloadCsv(name, toCsv(headers, cells))) {
      toast({
        title: 'Could not save the file',
        description: 'The download was blocked. Try again, or use a different browser.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={e => { e.stopPropagation(); exportCsv(); }}
        title="Download the results as a spreadsheet"
        className="h-8 px-3 gap-1.5"
      >
        <FileSpreadsheet className="h-4 w-4" />
        <span className="text-xs">CSV</span>
      </Button>
      <Button
        variant="success"
        size="sm"
        onClick={e => { e.stopPropagation(); exportImage(); }}
        disabled={isExporting}
        title="Save the final rankings as an image you can share"
        className="h-8 px-3 gap-1.5"
      >
        <Download className={`h-4 w-4 ${isExporting ? 'animate-pulse' : ''}`} />
        <span className="text-xs">{isExporting ? 'Saving…' : 'Export Results'}</span>
      </Button>
    </>
  );
}

/**
 * A past night as the console shows it: the director's results table (no
 * controls — this is a record, not the game) with its two exports.
 *
 * `resultColumns` is the CONSOLE's current choice, and wins over the one stored
 * on the night. Which columns to show is the director's display preference, not
 * a fact about the night — reported as "I changed the stats in Settings and they
 * didn't change", because last night's panel kept last night's columns. One
 * `settings` value feeds the table and both exports, so they cannot differ. The
 * currency, payouts and league stay the game's own.
 */
export function PastGameResults({ game, resultColumns }: { game: ResultsGame; resultColumns?: string[] }) {
  const { rows, columnContext, subtitle, date } = useGameResults(game);
  if (rows.length === 0) return null;
  const settings = resultColumns ? { ...(game.settings ?? {}), resultColumns } : (game.settings ?? {});
  return (
    <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <ResultsExportButtons settings={settings} rows={rows} columnContext={columnContext} subtitle={subtitle} date={date} />
      </div>
      <ResultsTable rows={rows} settings={settings} columnContext={columnContext} />
    </div>
  );
}
