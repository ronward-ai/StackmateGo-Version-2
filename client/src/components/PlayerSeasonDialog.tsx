import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { seasonGames, seasonSummary, type SeasonGame } from '@/lib/playerSeason';
import { money } from '@/lib/currency';
import { ordinal } from '@/lib/ordinal';
import { Trophy } from 'lucide-react';

/**
 * One player's season, game by game.
 *
 * The gap this fills, reported from a director using other software: answering
 * "how many hits has Dave had?" meant opening every game of the season one at a
 * time and adding them up. The standings table already answers that for the
 * season; this answers the follow-up nobody could answer at all — WHICH night.
 *
 * `lib/playerSeason.ts` owns the arithmetic, so the totals here and the league
 * table's columns cannot drift: two places deriving what a player spent is how
 * Invested, Profit and ROI all read zero for a year.
 */

interface PlayerSeasonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  seasonName?: string;
  results: SeasonGame[];
  currencySymbol: string;
}

export default function PlayerSeasonDialog({
  isOpen, onClose, playerName, seasonName, results, currencySymbol,
}: PlayerSeasonDialogProps) {
  const rows = seasonGames(results);
  const summary = seasonSummary(results);

  const figure = (label: string, value: string) => (
    <div className="flex flex-col">
      <span className="font-mono text-label font-semibold leading-none">{value}</span>
      <span className="text-caption text-muted-foreground mt-1">{label}</span>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            {playerName}
          </DialogTitle>
          <DialogDescription>
            {seasonName ? `${seasonName} · ` : ''}
            {summary.games} game{summary.games === 1 ? '' : 's'} played
          </DialogDescription>
        </DialogHeader>

        {/* The strip treatment the Payouts panel and SeasonDashboard use: mono
            numerals, caption labels, no boxes. */}
        <div className="flex flex-wrap gap-x-6 gap-y-3 py-2 border-y border-border/30">
          {figure('Points', String(summary.points))}
          {figure('Hits', String(summary.hits))}
          {figure('Wins', String(summary.wins))}
          {figure('Best', summary.bestFinish ? ordinal(summary.bestFinish) : '—')}
          {figure('Average', summary.averagePosition !== null ? ordinal(Math.round(summary.averagePosition)) : '—')}
          {figure('In', money(summary.invested, currencySymbol))}
          {figure('Out', money(summary.cash, currencySymbol))}
          {figure('Net', `${summary.net >= 0 ? '+' : '−'}${money(Math.abs(summary.net), currencySymbol)}`)}
        </div>

        <div className="overflow-y-auto -mx-1 px-1">
          {rows.length === 0 ? (
            <p className="text-body text-muted-foreground py-6 text-center">
              No games recorded for {playerName} this season yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-caption">Date</TableHead>
                  <TableHead className="text-caption">Finish</TableHead>
                  <TableHead className="text-caption text-right">Points</TableHead>
                  <TableHead className="text-caption text-right">Hits</TableHead>
                  <TableHead className="text-caption text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="text-label whitespace-nowrap">
                      {row.playedAt
                        ? row.playedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-label whitespace-nowrap">
                      {row.position ? ordinal(row.position) : '—'}
                      {row.totalPlayers ? (
                        <span className="text-caption text-muted-foreground"> of {row.totalPlayers}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-label text-right">{row.points}</TableCell>
                    <TableCell className="font-mono text-label text-right">{row.hits}</TableCell>
                    <TableCell
                      className={`font-mono text-label text-right ${
                        row.net > 0 ? 'text-emerald-400' : row.net < 0 ? 'text-muted-foreground' : ''
                      }`}
                    >
                      {row.net >= 0 ? '+' : '−'}{money(Math.abs(row.net), currencySymbol)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
