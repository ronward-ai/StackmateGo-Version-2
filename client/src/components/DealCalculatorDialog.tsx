import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Player } from "@/types";
import { Calculator } from "lucide-react";

interface DealCalculatorDialogProps {
  players: Player[];
  prizePool: number;
  payouts: number[];
  currencySymbol: string;
}

export default function DealCalculatorDialog({ players, prizePool, payouts, currencySymbol }: DealCalculatorDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activePlayers = players.filter(p => p.status === 'active');
  const [chipCounts, setChipCounts] = useState<Record<string, number>>({});
  const [dealType, setDealType] = useState<'icm' | 'chipChop'>('icm');
  const [results, setResults] = useState<Record<string, number>>({});

  // Initialize chip counts
  useEffect(() => {
    if (isOpen) {
      const initialCounts: Record<string, number> = {};
      activePlayers.forEach(p => {
        initialCounts[p.id] = chipCounts[p.id] || 0;
      });
      setChipCounts(initialCounts);
    }
  }, [isOpen, activePlayers]);

  const handleChipChange = (playerId: string, value: string) => {
    setChipCounts(prev => ({
      ...prev,
      [playerId]: parseInt(value) || 0
    }));
  };

  const calculateDeal = () => {
    const totalChips = Object.values(chipCounts).reduce((sum, chips) => sum + chips, 0);
    if (totalChips === 0) return;

    // Remaining payouts to distribute
    const remainingPayouts = payouts.slice(0, activePlayers.length);
    const totalRemainingPrize = remainingPayouts.reduce((sum, p) => sum + p, 0);

    const newResults: Record<string, number> = {};

    if (dealType === 'chipChop') {
      // Chip Chop: Distribute remaining prize pool proportionally to chip stacks
      activePlayers.forEach(p => {
        const playerChips = chipCounts[p.id] || 0;
        const proportion = playerChips / totalChips;
        newResults[p.id] = Math.round(totalRemainingPrize * proportion);
      });
    } else {
      // ICM (Malmuth-Harville)
      const playersWithChips = activePlayers.map(p => ({
        id: p.id,
        chips: chipCounts[p.id] || 0
      })).filter(p => p.chips > 0);

      // Initialize results with 0
      activePlayers.forEach(p => newResults[p.id] = 0);

      // If only one player has chips, they get everything
      if (playersWithChips.length === 1) {
        newResults[playersWithChips[0].id] = totalRemainingPrize;
      } else {
        // Calculate ICM using a recursive approach for permutations
        // Note: For large numbers of players, this can be slow. 
        // Usually deals are done with <= 9 players, so it's manageable.
        
        // Ensure payouts array matches number of players with chips
        const currentPayouts = remainingPayouts.slice(0, playersWithChips.length);
        
        // Helper to calculate probability of a specific finish order
        const calculateProbabilities = (
          remainingPlayers: {id: string, chips: number}[], 
          currentProb: number, 
          depth: number, 
          playerProbs: Record<string, number[]>
        ) => {
          if (depth >= currentPayouts.length || remainingPlayers.length === 0) return;
          
          const totalRemainingChips = remainingPlayers.reduce((sum, p) => sum + p.chips, 0);
          
          remainingPlayers.forEach((player, index) => {
            const probFirst = player.chips / totalRemainingChips;
            const newProb = currentProb * probFirst;
            
            // Add to this player's probability of finishing in 'depth' position
            if (!playerProbs[player.id]) playerProbs[player.id] = new Array(currentPayouts.length).fill(0);
            playerProbs[player.id][depth] += newProb;
            
            // Recurse for next position
            const nextRemaining = [...remainingPlayers];
            nextRemaining.splice(index, 1);
            calculateProbabilities(nextRemaining, newProb, depth + 1, playerProbs);
          });
        };

        const playerProbs: Record<string, number[]> = {};
        calculateProbabilities(playersWithChips, 1, 0, playerProbs);

        // Calculate expected value for each player
        playersWithChips.forEach(player => {
          let expectedValue = 0;
          const probs = playerProbs[player.id] || [];
          probs.forEach((prob, pos) => {
            expectedValue += prob * (currentPayouts[pos] || 0);
          });
          newResults[player.id] = Math.round(expectedValue);
        });
      }
    }

    setResults(newResults);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Deal Calculator
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Deal Calculator</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-muted-foreground">
              Remaining Prize Pool: <span className="font-bold text-foreground">{currencySymbol}{payouts.slice(0, activePlayers.length).reduce((a,b) => a+b, 0)}</span>
            </div>
            <div className="flex gap-2">
              <Button 
                variant={dealType === 'icm' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setDealType('icm')}
              >
                ICM
              </Button>
              <Button 
                variant={dealType === 'chipChop' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setDealType('chipChop')}
              >
                Chip Chop
              </Button>
            </div>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {activePlayers.map(player => (
              <div key={player.id} className="flex items-center justify-between gap-4">
                <Label className="flex-1 truncate">{player.name}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Chips"
                    className="w-24 text-right"
                    value={chipCounts[player.id] || ''}
                    onChange={(e) => handleChipChange(player.id, e.target.value)}
                  />
                  <div className="w-24 text-right font-medium text-green-500">
                    {results[player.id] ? `${currencySymbol}${results[player.id]}` : '-'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button onClick={calculateDeal} className="w-full mt-4">
            Calculate Deal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
