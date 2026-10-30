import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEffect, useState } from 'react';
import { seasonGames, seasonSummary, type SeasonGame, type GamePrices } from '@/lib/playerSeason';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money } from '@/lib/currency';
import { ordinal } from '@/lib/ordinal';
import { Trophy, Pencil } from 'lucide-react';

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
  /** What each game charged in rake and bounty per entry — see hooks/useGamePrices. */
  prices?: GamePrices;
  /**
   * Rename this player. Passed ONLY on a director's console that holds control —
   * absent, the pencil is not rendered at all (the DirectorOnly rule). Rejects
   * with the reason to show.
   */
  onRename?: (next: string) => Promise<void>;
  /** Why a rename to `next` is refused, or null — lib/leaguePlayerRename.ts. */
  renameRefusal?: (next: string) => string | null;
}

export default function PlayerSeasonDialog({
  isOpen, onClose, playerName, seasonName, results, currencySymbol, prices, onRename, renameRefusal,
}: PlayerSeasonDialogProps) {
  const rows = seasonGames(results, prices);
  const summary = seasonSummary(results, prices);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(playerName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setEditing(false); setError(null); setDraft(playerName); }, [playerName, isOpen]);

  const save = async () => {
    if (!onRename) return;
    const refusal = renameRefusal?.(draft) ?? (draft.trim() ? null : 'A name cannot be empty.');
    if (refusal) { setError(refusal); return; }
    setSaving(true);
    try {
      await onRename(draft.trim());
      setEditing(false);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not rename this player.');
    } finally {
      setSaving(false);
    }
  };

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
            {editing ? (
              <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); void save(); }}>
                <Input
                  aria-label="Player name"
                  value={draft}
                  autoFocus
                  onChange={e => { setDraft(e.target.value); setError(null); }}
                  className="h-8 w-48"
                />
                <Button type="submit" size="sm" disabled={saving}>Save</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setError(null); setDraft(playerName); }}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                {playerName}
                {onRename && (
                  <button
                    type="button"
                    aria-label={`Rename ${playerName}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </DialogTitle>
          {error && <p role="alert" className="text-caption text-destructive">{error}</p>}
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
          {figure('Paid in', money(summary.paid, currencySymbol))}
          {figure('Out', money(summary.cash, currencySymbol))}
          {figure('Net', `${summary.net >= 0 ? '+' : '−'}${money(Math.abs(summary.net), currencySymbol)}`)}
        </div>
        <p className="text-caption text-muted-foreground -mt-1">
          Paid in includes the rake and bounty paid on every entry, rebuy and re-entry.
        </p>

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
