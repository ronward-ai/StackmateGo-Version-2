import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calculator, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chopBase, icmEquity, payingPlaces, proportionalChop } from '@/lib/chop';

interface Player { id: string; name: string; chipCount?: number; }

interface ChipChopCalculatorProps {
  open: boolean;
  onClose: () => void;
  players: Player[];          // active players only
  payouts: number[];          // payout structure [1st, 2nd, 3rd, ...]
  currencySymbol: string;
}

export default function ChipChopCalculator({
  open, onClose, players, payouts, currencySymbol,
}: ChipChopCalculatorProps) {
  // Everyone still in. This used to slice to nine and drop the rest silently,
  // which is wrong precisely in the big fields a chop is most likely in. The
  // ICM cost that cap existed for is now bounded by the paying places instead.
  const activePlayers = players;

  const [chips, setChips] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'icm' | 'prop'>('icm');

  // Start from empty every time the dialog opens.
  //
  // The inputs used to be seeded once for the life of the component, so a
  // director who chopped at five players, closed, busted down to three and
  // reopened was shown stale stacks — already "complete", so an authoritative
  // looking answer appeared immediately, for a table that no longer existed.
  useEffect(() => {
    if (open) setChips({});
  }, [open]);

  const chipValues = activePlayers.map(p => {
    const v = parseFloat(chips[p.id] || '0');
    return isNaN(v) ? 0 : v;
  });

  const totalChips = chipValues.reduce((s, c) => s + c, 0);
  const allFilled = activePlayers.length > 0 && chipValues.every(c => c > 0);

  // The places these players are actually competing for. Anyone already out has
  // taken their place and their money with them, so the lower places are not on
  // the table — and trailing zeros are trimmed, since ICM recurses once per
  // payout and padding to the player count made nine players enumerate every
  // ordering to compute equities that were zero anyway.
  const effectivePayouts = useMemo(
    () => payingPlaces(payouts.slice(0, activePlayers.length)),
    [payouts, activePlayers.length],
  );

  // Both methods split the same money, however differently. The proportional
  // chop used to divide the WHOLE prize pool while ICM competed for the top n
  // payouts, so with more paid places than players left it handed out the money
  // already owed to the finishers who were out.
  const base = useMemo(
    () => chopBase(payouts, activePlayers.length),
    [payouts, activePlayers.length],
  );

  const icmResults = useMemo(() =>
    allFilled ? icmEquity(chipValues, effectivePayouts) : null,
  [JSON.stringify(chipValues), JSON.stringify(effectivePayouts), allFilled]);

  const propResults = useMemo(() =>
    allFilled ? proportionalChop(chipValues, base) : null,
  [JSON.stringify(chipValues), base, allFilled]);

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
          <span>Still to be won</span>
          <span className="font-bold text-white">
            {currencySymbol}{Math.round(base).toLocaleString()}
          </span>
        </div>

        {/* Chip inputs */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {activePlayers.map((player, i) => (
            <div key={player.id} className="flex items-center gap-3">
              <div className="w-6 text-center text-xs text-gray-500 flex-shrink-0">{i + 1}</div>
              <div className="flex-1 text-sm font-medium truncate">{player.name}</div>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="chips"
                value={chips[player.id] || ''}
                onChange={e => setChips(prev => ({ ...prev, [player.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                onFocus={(e) => e.target.select()}
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
                  {currencySymbol}{Math.round(results[i]).toLocaleString()}
                </span>
              </div>
            ))}
            <p className="text-xs text-gray-500 text-right pt-1">
              Total: {currencySymbol}{Math.round(results.reduce((s, v) => s + v, 0)).toLocaleString()}
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
