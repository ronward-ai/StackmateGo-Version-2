import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { buttonCombinations, getButtonVariant } from "@/lib/buttonUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Player } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SeatPlayersDialogProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  onSeatPlayers: (selectedPlayers: Player[]) => void;
}

export default function SeatPlayersDialog({
  isOpen,
  onClose,
  players,
  onSeatPlayers,
}: SeatPlayersDialogProps) {
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [showOnlyUnseated, setShowOnlyUnseated] = useState(false);
  
  // Reset selection when dialog is opened
  useEffect(() => {
    if (isOpen) {
      setSelectedPlayers([]);
    }
  }, [isOpen]);
  
  // Get filtered players based on the filter setting
  const filteredPlayers = showOnlyUnseated
    ? players.filter(player => !player.seated)
    : players;
    
  // Counts for stats display
  const totalPlayers = players.length;
  const seatedCount = players.filter(player => player.seated).length;
  const unseatedCount = totalPlayers - seatedCount;
  
  // Select or deselect all filtered players
  const toggleSelectAll = () => {
    if (selectedPlayers.length === filteredPlayers.length) {
      setSelectedPlayers([]);
    } else {
      setSelectedPlayers(filteredPlayers.map(player => player.id));
    }
  };
  
  // Toggle selection of a single player
  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayers(prev => 
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };
  
  // Get only the selected players
  const getSelectedPlayerObjects = () => {
    return players.filter(player => selectedPlayers.includes(player.id));
  };
  
  // Handle the seating process
  const handleSeatPlayers = () => {
    onSeatPlayers(getSelectedPlayerObjects());
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Seat Players</DialogTitle>
          <DialogDescription>
            Select the players you want to randomly seat at tables.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="flex flex-col space-y-3 mb-4">
            {/* Player count summary */}
            <div className="flex justify-between items-center text-sm px-2">
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1">
                  <span className="text-xs rounded-full bg-green-700/30 px-2 py-0.5 text-green-400">
                    {seatedCount} seated
                  </span>
                  <span className="text-xs rounded-full bg-gray-700/30 px-2 py-0.5 text-gray-400">
                    {unseatedCount} unseated
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="show-unseated" 
                  checked={showOnlyUnseated}
                  onCheckedChange={() => setShowOnlyUnseated(!showOnlyUnseated)}
                />
                <Label 
                  htmlFor="show-unseated" 
                  className="text-xs font-medium cursor-pointer"
                >
                  Show only unseated
                </Label>
              </div>
            </div>
            
            {/* Select all checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="select-all" 
                checked={selectedPlayers.length === filteredPlayers.length && filteredPlayers.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <Label 
                htmlFor="select-all" 
                className="text-sm font-medium cursor-pointer"
              >
                Select All {showOnlyUnseated ? "Unseated " : ""}Players
              </Label>
            </div>
          </div>
          
          <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map(player => (
                <div 
                  key={player.id} 
                  className="flex items-center p-3 hover:bg-secondary/10"
                >
                  <Checkbox 
                    id={`player-${player.id}`}
                    checked={selectedPlayers.includes(player.id)}
                    onCheckedChange={() => togglePlayerSelection(player.id)}
                    className="mr-3"
                  />
                  <Label 
                    htmlFor={`player-${player.id}`}
                    className="flex-1 flex justify-between items-center cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      {player.name}
                      {player.seated && (
                        <span className="text-xs bg-green-700/50 text-white px-2 py-0.5 rounded-full">
                          Seated
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Knockouts: {player.knockouts}
                    </span>
                  </Label>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                No players have been added yet
              </div>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground mt-2">
            {selectedPlayers.length} of {filteredPlayers.length} {showOnlyUnseated ? "unseated " : ""}players selected
            {selectedPlayers.length > 0 && (
              <div className="mt-1 text-xs text-blue-400">
                {(() => {
                  const playerCount = selectedPlayers.length;
                  const maxTables = 3; // Maximum number of tables we support
                  const maxSeatsPerTable = 6; // Default seats per table
                  
                  // Find perfect distribution (if possible)
                  let optimalTables = 1;
                  let isPerfectDistribution = false;
                  
                  // First try to find an even distribution
                  for (let tables = 1; tables <= maxTables; tables++) {
                    if (playerCount % tables === 0) {
                      const playersPerTable = playerCount / tables;
                      if (playersPerTable <= maxSeatsPerTable) {
                        optimalTables = tables;
                        isPerfectDistribution = true;
                        break;
                      }
                    }
                  }
                  
                  // If no perfect distribution found, try to find the most even one
                  if (!isPerfectDistribution) {
                    let bestDifference = Number.MAX_SAFE_INTEGER;
                    
                    for (let tables = 1; tables <= maxTables; tables++) {
                      const basePlayersPerTable = Math.floor(playerCount / tables);
                      const tablesWithExtra = playerCount % tables;
                      
                      // This configuration is valid if the number of players per table
                      // doesn't exceed the maximum
                      if (basePlayersPerTable + 1 <= maxSeatsPerTable) {
                        // Calculate the "evenness" - the difference between min and max players per table
                        const difference = tablesWithExtra > 0 ? 1 : 0;
                        
                        if (difference < bestDifference) {
                          bestDifference = difference;
                          optimalTables = tables;
                          
                          // If we found a perfectly even distribution, we're done
                          if (difference === 0) break;
                        }
                      }
                    }
                  }
                  
                  // Calculate base players per table and extras
                  const basePlayersPerTable = Math.floor(playerCount / optimalTables);
                  const tablesWithExtra = playerCount % optimalTables;
                  
                  // Create distribution message
                  if (isPerfectDistribution || tablesWithExtra === 0) {
                    return `Will seat ${playerCount} players evenly on ${optimalTables} ${optimalTables === 1 ? 'table' : 'tables'} (${basePlayersPerTable} per table)`;
                  } else {
                    return `Will seat ${playerCount} players on ${optimalTables} ${optimalTables === 1 ? 'table' : 'tables'} (${basePlayersPerTable}-${basePlayersPerTable+1} per table)`;
                  }
                })()}
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="mt-2">
            Cancel
          </Button>
          <Button 
            onClick={handleSeatPlayers} 
            disabled={selectedPlayers.length === 0}
            className="mt-2"
          >
            Seat Selected Players
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}