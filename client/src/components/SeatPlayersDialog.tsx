import { useState, useEffect } from "react";
import { seatablePlayers, allSeated, planSeating, tablesNeededFor } from '@/lib/seating';
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
  /* The director's REAL table configuration. Without it this dialog invented
     its own from `maxTables = 3` and `maxSeatsPerTable = 6`, so the line under
     the list described a seating the app was never going to perform. */
  numberOfTables: number;
  seatsPerTable: number;
  /**
   * Add tables and seat everyone, for the overflow offer.
   *
   * The dialog cannot do it itself: `numberOfTables` is state in `TablesSection`
   * synced from settings by an effect, so a write made in the same tick reads the
   * OLD count. The owner takes the new count explicitly.
   */
  onAddTables?: (tables: number, selected: Player[]) => void;
}

export default function SeatPlayersDialog({
  isOpen,
  onClose,
  players: allPlayers,
  onSeatPlayers,
  numberOfTables,
  seatsPerTable,
  onAddTables,
}: SeatPlayersDialogProps) {
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [showOnlyUnseated, setShowOnlyUnseated] = useState(false);
  
  // Reset selection when dialog is opened
  useEffect(() => {
    if (isOpen) {
      setSelectedPlayers([]);
    }
  }, [isOpen]);
  
  // Only players still IN the game can be given a chair. This used to take the
  // whole roster and filter on `seated` alone, so eliminated players were
  // tickable rows and Select All took them straight into seats — see
  // lib/seating.ts for what that cost.
  const players = seatablePlayers(allPlayers);

  // Everyone still in already has a chair, so the only thing this dialog can do
  // is redraw. The tab button that opens it uses the same predicate, so the two
  // cannot say different things about the same action.
  const redrawOnly = allSeated(allPlayers);

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
    const selectedPlayerObjects = getSelectedPlayerObjects();
    console.log('Manual seating triggered from dialog');
    console.log('Selected players for seating:', selectedPlayerObjects.map(p => p.name));
    onSeatPlayers(selectedPlayerObjects);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{redrawOnly ? 'Randomize Seats' : 'Seat Players'}</DialogTitle>
          <DialogDescription>
            {redrawOnly
              ? 'Choose whose seats to redraw.'
              : 'Select the players you want to randomly seat at tables.'}
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
            {selectedPlayers.length > 0 && (() => {
              /* From lib/seating.ts, the SAME split seatPlayersManually uses.
                 This block used to work its own out from `maxTables = 3` and
                 `maxSeatsPerTable = 6`, hard-coded, having never been told the
                 director's configuration — so it described a seating that was
                 not going to happen, and at a final table it rarely said the
                 one thing that matters: one table. */
              const { perTable, overflow } = planSeating(selectedPlayers.length, {
                numberOfTables,
                seatsPerTable,
              });
              const low = Math.min(...perTable);
              const high = Math.max(...perTable);
              const spread = low === high ? `${low} per table` : `${low}–${high} per table`;
              const needed = tablesNeededFor(selectedPlayers.length, seatsPerTable);
              const extra = needed - numberOfTables;
              return (
                <>
                  <div className="mt-1 text-xs text-blue-400">
                    {perTable.length === 1
                      ? `Will seat ${perTable[0]} ${perTable[0] === 1 ? 'player' : 'players'} on one table`
                      : `Will seat ${perTable.reduce((a, b) => a + b, 0)} players across ${perTable.length} tables (${spread})`}
                  </div>
                  {overflow > 0 && (
                    /* A PANEL, not a 12px line under a count — this was missed at
                       the busiest moment of the night, and the em-dash was written
                       as a \u escape in a JSX TEXT node, where it is not an escape:
                       it printed the seven characters on screen.

                       It warns and never refuses, the call lateEntryClosedReason
                       makes: seating 16 of 17 while you find another table is a
                       perfectly reasonable thing to want. */
                    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                      <p className="text-label text-amber-300">
                        {overflow} {overflow === 1 ? 'player has' : 'players have'} nowhere to sit
                      </p>
                      <p className="text-caption text-amber-200/80">
                        {numberOfTables} {numberOfTables === 1 ? 'table' : 'tables'} of {seatsPerTable}
                        {' '}{seatsPerTable === 1 ? 'seat' : 'seats'} {numberOfTables === 1 ? 'holds' : 'hold'}
                        {' '}{numberOfTables * seatsPerTable}. Seat them anyway and the rest stay unseated.
                      </p>
                      {onAddTables && extra > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => { onAddTables(needed, getSelectedPlayerObjects()); onClose(); }}
                        >
                          Add {extra === 1 ? 'a table' : `${extra} tables`} and seat everyone
                        </Button>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
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
            {(() => {
              // The number, at the moment the button is pressed. "Seat 16 of 17"
              // is the one place a director cannot miss it.
              if (redrawOnly) return 'Randomize Selected';
              const { overflow } = planSeating(selectedPlayers.length, { numberOfTables, seatsPerTable });
              return overflow > 0
                ? `Seat ${selectedPlayers.length - overflow} of ${selectedPlayers.length}`
                : 'Seat Selected Players';
            })()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}