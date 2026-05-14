import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calculator, Trophy, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// ICM calculation (recursive, memoised)
// ---------------------------------------------------------------------------
function icmEquity(chips: number[], payouts: number[]): number[] {
  if (chips.length === 0 || payouts.length === 0) return chips.map(() => 0);

  const total = chips.reduce((s, c) => s + c, 0);
  if (total === 0) return chips.map(() => 0);

  const equity = chips.map(() => 0);

  for (let i = 0; i < chips.length; i++) {
    const pFirst = chips[i] / total;
    equity[i] += pFirst * payouts[0];

    if (payouts.length > 1) {
      const rest = chips.filter((_, j) => j !== i);
      const restEq = icmEquity(rest, payouts.slice(1));
      let k = 0;
      for (let j = 0; j < chips.length; j++) {
        if (j !== i) { equity[j] += pFirst * restEq[k]; k++; }
      }
    }
  }
  return equity;
}

function proportionalChop(chips: number[], remainingPool: number): number[] {
  const total = chips.reduce((s, c) => s + c, 0);
  if (total === 0) return chips.map(() => 0);
  return chips.map(c => (c / total) * remainingPool);
}

// ---------------------------------------------------------------------------

interface Player { id: string; name: string; chipCount?: number; }

interface ChipChopCalculatorProps {
  open: boolean;
  onClose: () => void;
  players: Player[];          // active players only
  payouts: number[];          // payout structure [1st, 2nd, 3rd, ...]
  prizePool: number;
}

export default function ChipChopCalculator({
  open, onClose, players, payouts, prizePool,
}: ChipChopCalculatorProps) {
  const activePlayers = players.filter(p => p.chipCount !== undefined || true).slice(0, 9);

  const [chips, setChips] = useState<Record<string, string>>(() =>
    Object.fromEntries(activePlayers.map(p => [p.id, p.chipCount != null ? String(p.chipCount) : '']))
  );
  const [tab, setTab] = useState<'icm' | 'prop'>('icm');

  const chipValues = activePlayers.map(p => {
    const v = parseFloat(chips[p.id] || '0');
    return isNaN(v) ? 0 : v;
  });

  const totalChips = chipValues.reduce((s, c) => s + c, 0);
  const allFilled = chipValues.every(c => c > 0);

  // Pad or trim payouts to match active player count
  const effectivePayouts = useMemo(() => {
    const n = activePlayers.length;
    if (payouts.length >= n) return payouts.slice(0, n);
    // If fewer payouts than players, remaining get 0
    return [...payouts, ...Array(n - payouts.length).fill(0)];
  }, [payouts, activePlayers.length]);

  const icmResults = useMemo(() =>
    allFilled ? icmEquity(chipValues, effectivePayouts) : null,
  [JSON.stringify(chipValues), JSON.stringify(effectivePayouts), allFilled]);

  const propResults = useMemo(() =>
    allFilled ? proportionalChop(chipValues, prizePool) : null,
  [JSON.stringify(chipValues), prizePool, allFilled]);

  const results = tab === 'icm' ? icmResults : propResults;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-orange-400" />
            Chip Chop Calculator
          </DialogTitle>
        </DialogHeader>

        {/* Method toggle */}
        <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
          {(['icm', 'prop'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-1.5 rounded-md text-sm font-medium transition-all',
                tab === t ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'
              )}
            >
              {t === 'icm' ? 'ICM' : 'Proportional'}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 -mt-1">
          {tab === 'icm'
            ? 'ICM accounts for tournament pressure — finishing 2nd beats going bust.'
            : 'Each player gets a share of the prize pool proportional to their chips.'}
        </p>

        {/* Prize pool summary */}
        <div className="flex justify-between text-sm text-gray-300 bg-gray-800/50 rounded-lg px-3 py-2">
          <span>Prize pool</span>
          <span className="font-bold text-white">${prizePool.toLocaleString()}</span>
        </div>

        {/* Chip inputs */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {activePlayers.map((player, i) => (
            <div key={player.id} className="flex items-center gap-3">
              <div className="w-6 text-center text-xs text-gray-500 flex-shrink-0">{i + 1}</div>
              <div className="flex-1 text-sm font-medium truncate">{player.name}</div>
              <Input
                type="number"
                min={0}
                placeholder="chips"
                value={chips[player.id] || ''}
                onChange={e => setChips(prev => ({ ...prev, [player.id]: e.target.value }))}
                className="w-28 h-8 text-right bg-gray-800 border-gray-700 text-white text-sm"
              />
              {totalChips > 0 && chipValues[i] > 0 && (
                <div className="w-10 text-right text-xs text-gray-400">
                  {Math.round((chipValues[i] / totalChips) * 100)}%
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Results */}
        {results ? (
          <div className="space-y-1.5 border-t border-gray-700 pt-3">
            <p className="text-xs text-gray-400 mb-2">Suggested payouts</p>
            {activePlayers.map((player, i) => (
              <div
                key={player.id}
                className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {i === 0 && <Trophy className="h-3.5 w-3.5 text-yellow-400" />}
                  <span className="text-sm font-medium">{player.name}</span>
                </div>
                <span className="font-bold text-green-400">
                  ${Math.round(results[i]).toLocaleString()}
                </span>
              </div>
            ))}
            <p className="text-xs text-gray-500 text-right pt-1">
              Total: ${Math.round(results.reduce((s, v) => s + v, 0)).toLocaleString()}
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-500 text-center py-2">
            Enter chip counts above to calculate
          </p>
        )}

        <Button variant="outline" className="w-full border-gray-700 text-gray-300" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
