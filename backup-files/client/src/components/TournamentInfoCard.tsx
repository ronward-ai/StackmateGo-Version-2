import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { } from 'lucide-react';
import { Plus, Database } from 'lucide-react';

interface TournamentInfoCardProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function TournamentInfoCard({ tournament }: TournamentInfoCardProps) {
  const { 
    addBlindLevel, 
    getNextLevelInfo,
    isComplete,
    completeTournament,
    state,
    updateTournamentDetails
  } = tournament;
  const [isCreating, setIsCreating] = useState(false);

  const createTournament = async () => {
    setIsCreating(true);
    try {
      // Generate random access codes
      const participantCode = Math.random().toString(36).substr(2, 6).toUpperCase();
      const directorCode = Math.random().toString(36).substr(2, 6).toUpperCase();

      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Tournament ${new Date().toLocaleDateString()}`,
          currentLevel: state.currentLevel,
          secondsLeft: state.secondsLeft,
          isRunning: state.isRunning,
          buyIn: state.prizeStructure?.buyIn || 10,
          enableSounds: state.settings.enableSounds,
          enableVoice: state.settings.enableVoice,
          showSeconds: state.settings.showSeconds,
          showNextLevel: state.settings.showNextLevel,
          participantCode,
          directorCode
        })
      });

      if (response.ok) {
        const tournament = await response.json();
        updateTournamentDetails({
          id: tournament.id,
          type: 'database',
          participantCode,
          directorCode
        });
      }
    } catch (error) {
      console.error('Failed to create tournament:', error);
    } finally {
      setIsCreating(false);
    }
  };

  // Calculate total prize pool including buy-ins and rebuys
  const buyInAmount = state.prizeStructure?.buyIn || 0;
  const rebuyAmount = state.prizeStructure?.rebuyAmount || 0;
  const addonAmount = state.prizeStructure?.addonAmount || 0;

  // Calculate total rebuys, add-ons and prize pool
  const totalRebuys = state.players.reduce((sum, player) => sum + (player.rebuys || 0), 0);
  const totalAddons = state.players.reduce((sum, player) => sum + (player.addons || 0), 0);
  const totalPrizePool = (buyInAmount * state.players.length) + (rebuyAmount * totalRebuys) + (addonAmount * totalAddons);
  const currencySymbol = state.settings.currency || '£';

  // Automatically complete the tournament when only one player remains
  // DISABLED: This was causing all players to be marked as inactive
  // useEffect(() => {
  //   const activePlayers = state.players.filter(p => p.isActive !== false);
  //   // If there's exactly one active player and they haven't been assigned position 1 yet
  //   if (activePlayers.length === 1 && activePlayers[0].position !== 1) {
  //     // Complete the tournament automatically
  //     completeTournament();
  //   }
  // }, [state.players]);

  // Player management moved to PlayerSection

  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Card className="p-4 bg-gradient-to-r from-purple-600/10 to-pink-600/10 border border-purple-500/20">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-secondary">info</span>
          Tournament Info
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'unfold_less' : 'unfold_more'}
        </span>
      </div>
      {isExpanded && (
        <div className="p-4 pt-0 border-t border-[#2a2a2a]">


            {/* Prize Pool Info */}
            <div className="bg-background bg-opacity-40 rounded-lg p-4 mt-4">
              <h3 className="text-xl font-medium mb-3">
                Total Players: {state.players.length} | Prize Pool: {currencySymbol}{totalPrizePool}
              </h3>

            {/* Prize Pool Breakdown */}
            <div className="text-muted-foreground text-sm space-y-2">
              <div className="flex justify-between">
                <span>Buy-in per player:</span>
                <span>{currencySymbol}{buyInAmount}</span>
              </div>
              <div className="flex justify-between">
                <span>Initial buy-ins ({state.players.length} players):</span>
                <span>{currencySymbol}{buyInAmount * state.players.length}</span>
              </div>
              {state.prizeStructure?.enableBounties && state.prizeStructure?.bountyAmount > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Bounty per knockout:</span>
                    <span>{currencySymbol}{state.prizeStructure.bountyAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total bounties available:</span>
                    <span>{currencySymbol}{state.prizeStructure.bountyAmount * state.players.length}</span>
                  </div>
                </>
              )}
              {totalRebuys > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Rebuy amount:</span>
                    <span>{currencySymbol}{rebuyAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total rebuys ({totalRebuys}):</span>
                    <span>{currencySymbol}{rebuyAmount * totalRebuys}</span>
                  </div>
                </>
              )}
              {totalAddons > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Add-on amount:</span>
                    <span>{currencySymbol}{addonAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total add-ons ({totalAddons}):</span>
                    <span>{currencySymbol}{addonAmount * totalAddons}</span>
                  </div>
                </>
              )}
              <div className="border-t border-muted pt-2 mt-2">
                <div className="flex justify-between font-medium">
                  <span>Total Prize Pool:</span>
                  <span>{currencySymbol}{totalPrizePool}</span>
                </div>
              </div>

              {/* Chip Information below total prize pool */}
              <div className="flex justify-between">
                <span>Total Chips:</span>
                <span>
                  {(() => {
                    const startingChips = state.prizeStructure?.startingChips || 10000;
                    const totalRebuys = state.players.reduce((sum, player) => sum + (player.rebuys || 0), 0);
                    const totalAddons = state.players.reduce((sum, player) => sum + (player.addons || 0), 0);
                    const rebuyChips = state.prizeStructure?.rebuyChips || startingChips;
                    const addonChips = state.prizeStructure?.addonChips || startingChips;

                    const totalChips = (startingChips * state.players.length) + (rebuyChips * totalRebuys) + (addonChips * totalAddons);
                    return totalChips.toLocaleString();
                  })()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Average Stack:</span>
                <span>
                  {(() => {
                    const startingChips = state.prizeStructure?.startingChips || 10000;
                    const totalRebuys = state.players.reduce((sum, player) => sum + (player.rebuys || 0), 0);
                    const totalAddons = state.players.reduce((sum, player) => sum + (player.addons || 0), 0);
                    const rebuyChips = state.prizeStructure?.rebuyChips || startingChips;
                    const addonChips = state.prizeStructure?.addonChips || startingChips;

                    const totalChips = (startingChips * state.players.length) + (rebuyChips * totalRebuys) + (addonChips * totalAddons);
                    const activePlayers = state.players.filter(p => p.isActive !== false).length;
                    const avgStack = activePlayers > 0 ? Math.floor(totalChips / activePlayers) : 0;
                    return avgStack.toLocaleString();
                  })()}
                </span>
              </div>

              {state.prizeStructure?.manualPayouts && state.prizeStructure.manualPayouts.length > 0 && (
                <div className="border-t border-muted mt-3 pt-3">
                  <div className="font-medium mb-2">
                    Prize Distribution{state.prizeStructure?.enableBounties ? ' (excluding bounties)' : ''}:
                  </div>
                  <div className="space-y-1">
                    {state.prizeStructure.manualPayouts.map((payout, index) => (
                      <div key={index} className="flex justify-between">
                        <span>
                          {index === 0 ? "1st" : index === 1 ? "2nd" : index === 2 ? "3rd" : `${index + 1}th`} Place ({payout.percentage}%):
                        </span>
                        <span>{currencySymbol}{Math.floor((totalPrizePool * payout.percentage) / 100)}</span>
                      </div>
                    ))}
                  </div>
                  
                </div>
              )}
            </div>

            {/* Show winner notification only after actual eliminations have occurred */}
            {state.players.filter(p => p.isActive !== false).length === 1 && 
             state.players.filter(p => p.isActive === false).length > 0 && (
              <div className="mt-4 bg-[#2a2a2a] rounded-lg p-4">
                <h3 className="font-medium text-secondary mb-2">Tournament Winner!</h3>
                <div className="text-foreground">
                  {state.players.find(p => p.isActive !== false)?.name} is the last player standing!
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}