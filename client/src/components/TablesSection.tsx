import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Pencil, X, ArrowUpDown } from "lucide-react";
import { TableConfig, Player } from "@/types";
import SeatPlayersDialog from "./SeatPlayersDialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import FinalTableDialog from "./FinalTableDialog";
import { cn } from "@/lib/utils";


interface TablesSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function TablesSection({ tournament }: TablesSectionProps) {
  const { state, updateSettings, updatePlayers, addKnockout, eliminatePlayer, undoBustOut, shouldPromptForFinalTable, goToFinalTable } = tournament;

  // State for the bust out dialog
  const [bustOutDialogOpen, setBustOutDialogOpen] = useState(false);
  const [playerToBustOut, setPlayerToBustOut] = useState<Player | null>(null);
  const [hitmanId, setHitmanId] = useState<string | null>(null);

  // State for the undo bust out dialog
  const [undoBustOutDialogOpen, setUndoBustOutDialogOpen] = useState(false);

  // State for player movement (mobile-friendly)
  const [selectedPlayerToMove, setSelectedPlayerToMove] = useState<Player | null>(null);
  const [moveMode, setMoveMode] = useState(false);

  // Set default table values in case it doesn't exist yet
  const tables = state.settings.tables || { 
    numberOfTables: 3, 
    seatsPerTable: 6,
    tableNames: ["Table 1", "Table 2", "Table 3"]
  };



  const [numberOfTables, setNumberOfTables] = useState(tables.numberOfTables);
  const [seatsPerTable, setSeatsPerTable] = useState(tables.seatsPerTable);

  // State for table names
  const [tableNames, setTableNames] = useState<string[]>(tables.tableNames || 
    Array.from({ length: tables.numberOfTables }).map((_, i) => `Table ${i + 1}`));

  // State for editing table names
  const [editingTableIndex, setEditingTableIndex] = useState<number | null>(null);
  const [editTableName, setEditTableName] = useState("");

  // State for the seating dialog
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);
    // State for final table dialog
  const [isFinalTableDialogOpen, setIsFinalTableDialogOpen] = useState(false);

  // State for table balancing
  const [tableBalanceDialogOpen, setTableBalanceDialogOpen] = useState(false);
  const [balanceOptions, setBalanceOptions] = useState<{
    overloadedTable: number;
    underloadedTable: number;
    playersToMove: Player[];
  } | null>(null);

  // State for table background colors/felt textures - use existing backgrounds from state
  const [tableBackgrounds, setTableBackgrounds] = useState<string[]>(
    state.settings?.tableBackgrounds?.length === tables.numberOfTables 
      ? state.settings.tableBackgrounds 
      : Array(tables.numberOfTables).fill('felt-green')
  );

  // Removed balance tables mode and drag/drop functionality

  // Initialize from settings once when component mounts
  useEffect(() => {
    if (state.settings.tables) {
      const config = state.settings.tables;
      setNumberOfTables(config.numberOfTables);
      setSeatsPerTable(config.seatsPerTable);

      if (config.tableNames && config.tableNames.length === config.numberOfTables) {
        setTableNames(config.tableNames);
      } else {
        setTableNames(Array.from({ length: config.numberOfTables }, (_, i) => `Table ${i + 1}`));
      }

      // Use existing table backgrounds from settings if available
      if (state.settings.tableBackgrounds && state.settings.tableBackgrounds.length === config.numberOfTables) {
        setTableBackgrounds(state.settings.tableBackgrounds);
      } else {
        setTableBackgrounds(Array(config.numberOfTables).fill('felt-green'));
      }
    }
  }, [state.settings.tables, state.settings.tableBackgrounds]); // Watch both tables and tableBackgrounds

  // Update table names when numberOfTables changes (user interaction only)
  const updateTableNamesForCount = (newCount: number) => {
    if (newCount > tableNames.length) {
      const newNames = [...tableNames];
      for (let i = tableNames.length; i < newCount; i++) {
        newNames.push(`Table ${i + 1}`);
      }
      setTableNames(newNames);
    } else {
      setTableNames(tableNames.slice(0, newCount));
    }
  };

  // Update table backgrounds when numberOfTables changes (user interaction only)
  const updateTableBackgroundsForCount = (newCount: number) => {
    if (newCount > tableBackgrounds.length) {
      const newBackgrounds = [...tableBackgrounds];
      for (let i = tableBackgrounds.length; i < newCount; i++) {
        newBackgrounds.push('felt-green');
      }
      setTableBackgrounds(newBackgrounds);
    } else {
      setTableBackgrounds(tableBackgrounds.slice(0, newCount));
    }
  };

  // Change table background color
  const changeTableBackground = (tableIndex: number, backgroundClass: string) => {
    const newBackgrounds = [...tableBackgrounds];
    newBackgrounds[tableIndex] = backgroundClass;
    setTableBackgrounds(newBackgrounds);

    // Update tournament settings with table backgrounds
    const updatedTableSettings = {
      ...state.settings.tables,
      tableBackgrounds: newBackgrounds
    };

    updateSettings({ 
      tables: updatedTableSettings,
      tableBackgrounds: newBackgrounds 
    });

    // Broadcast table background changes to participant view for database tournaments
    if (state.details?.type === 'database' && state.details?.id) {
      setTimeout(async () => {
        try {
          const { doc, updateDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const { sanitizeForFirestore } = await import('@/lib/utils');
          const docRef = doc(db, 'activeTournaments', state.details!.id.toString());
          
          await updateDoc(docRef, sanitizeForFirestore({
            currentLevel: state.currentLevel,
            secondsLeft: state.secondsLeft,
            isRunning: state.isRunning,
            smallBlind: state.levels[state.currentLevel]?.small || 0,
            bigBlind: state.levels[state.currentLevel]?.big || 0,
            ante: state.levels[state.currentLevel]?.ante || 0,
            players: state.players || [],
            blindLevels: state.levels || [],
            settings: {
              ...state.settings,
              tables: updatedTableSettings,
              tableBackgrounds: newBackgrounds
            }
          }));
        } catch (error) {
          console.error('Failed to broadcast table background changes:', error);
        }
      }, 100);
    }
  };

  // Check for final table condition
  useEffect(() => {
    if (shouldPromptForFinalTable()) {
      setIsFinalTableDialogOpen(true);
    }
  }, [shouldPromptForFinalTable]);

  // Check for table imbalance after each elimination
  useEffect(() => {
    // Don't show table balance dialog if final table dialog is already open
    if (isFinalTableDialogOpen) return;

    const seatedPlayers = state.players.filter(p => p.seated && p.isActive !== false);
    if (seatedPlayers.length < 2) return; // Need at least 2 players to balance

    // Don't show balance dialog if we're at final table player count
    if (shouldPromptForFinalTable()) return;

    // Group players by table
    const playersByTable: { [key: number]: Player[] } = {};
    seatedPlayers.forEach(player => {
      if (player.tableAssignment) {
        const tableIndex = player.tableAssignment.tableIndex;
        if (!playersByTable[tableIndex]) {
          playersByTable[tableIndex] = [];
        }
        playersByTable[tableIndex].push(player);
      }
    });

    // Find tables with players
    const activeTables = Object.keys(playersByTable).map(k => parseInt(k));
    if (activeTables.length < 2) return; // Need at least 2 active tables

    // Check for imbalance (difference of 2 or more players between tables)
    const tableCounts = activeTables.map(tableIndex => ({
      tableIndex,
      count: playersByTable[tableIndex].length,
      players: playersByTable[tableIndex]
    }));

    const maxTable = tableCounts.reduce((max, table) => table.count > max.count ? table : max);
    const minTable = tableCounts.reduce((min, table) => table.count < min.count ? table : min);

    if (maxTable.count - minTable.count >= 2) {
      // Table imbalance detected
      setBalanceOptions({
        overloadedTable: maxTable.tableIndex,
        underloadedTable: minTable.tableIndex,
        playersToMove: maxTable.players
      });
      setTableBalanceDialogOpen(true);
    }
  }, [state.players, isFinalTableDialogOpen]);

  // NO AUTOMATIC TABLE BALANCING OR PLAYER SWAPPING - MANUAL SEATING ONLY

  // Calculate maximum capacity
  const maxCapacity = numberOfTables * seatsPerTable;

  // Start editing a table name
  const startEditingTableName = (index: number) => {
    setEditingTableIndex(index);
    setEditTableName(tableNames[index] || `Table ${index + 1}`);
  };

  // Save the edited table name
  const saveEditedTableName = () => {
    if (editingTableIndex !== null) {
      const newTableNames = [...tableNames];
      newTableNames[editingTableIndex] = editTableName || `Table ${editingTableIndex + 1}`;
      setTableNames(newTableNames);
      setEditingTableIndex(null);

      // Manually save the updated table names
      const newConfig: TableConfig = {
        numberOfTables,
        seatsPerTable,
        tableNames: newTableNames
      };
      updateSettings({ tables: newConfig });
    }
  };

  // Manually seat selected players at tables - MANUAL ONLY, NO AUTOMATIC DISTRIBUTION
  const seatPlayersManually = (selectedPlayers: Player[]) => {
    const { updatePlayers } = tournament;
    const currentPlayers = [...state.players];

    // Create a set of IDs of players to seat
    const playersToSeatIds = new Set(selectedPlayers.map(p => p.id));

    // Get currently occupied seats to avoid conflicts
    const occupiedSeats = new Set();
    currentPlayers.forEach(player => {
      if (player.seated && player.tableAssignment && !playersToSeatIds.has(player.id)) {
        occupiedSeats.add(`${player.tableAssignment.tableIndex}-${player.tableAssignment.seatIndex}`);
      }
    });

    // Smart seating algorithm based on player count and table capacity
    const shuffledPlayers = [...selectedPlayers].sort(() => Math.random() - 0.5);
    const playerCount = shuffledPlayers.length;

    let assignedSeats: { tableIndex: number; seatIndex: number }[] = [];

    if (playerCount <= seatsPerTable) {
      // If players fit at one table, seat them all at Table 1 (index 0)

      // Get available seats at Table 1 first
      const table1Seats: { tableIndex: number; seatIndex: number }[] = [];
      for (let seatIndex = 0; seatIndex < seatsPerTable; seatIndex++) {
        const seatKey = `0-${seatIndex}`;
        if (!occupiedSeats.has(seatKey)) {
          table1Seats.push({ tableIndex: 0, seatIndex });
        }
      }

      // If Table 1 doesn't have enough space, use other tables
      if (table1Seats.length < playerCount) {
        for (let tableIndex = 0; tableIndex < numberOfTables; tableIndex++) {
          for (let seatIndex = 0; seatIndex < seatsPerTable; seatIndex++) {
            const seatKey = `${tableIndex}-${seatIndex}`;
            if (!occupiedSeats.has(seatKey) && assignedSeats.length < playerCount) {
              assignedSeats.push({ tableIndex, seatIndex });
            }
          }
        }
      } else {
        assignedSeats = table1Seats.slice(0, playerCount);
      }
    } else {
      // Distribute players evenly across all tables

      // Calculate players per table
      const basePlayersPerTable = Math.floor(playerCount / numberOfTables);
      const extraPlayers = playerCount % numberOfTables;

      let playerIndex = 0;

      for (let tableIndex = 0; tableIndex < numberOfTables && playerIndex < playerCount; tableIndex++) {
        // Calculate how many players this table should get
        const playersForThisTable = basePlayersPerTable + (tableIndex < extraPlayers ? 1 : 0);

        // Get available seats for this table
        const tableSeatCount = Math.min(playersForThisTable, seatsPerTable);
        let seatedAtThisTable = 0;

        for (let seatIndex = 0; seatIndex < seatsPerTable && seatedAtThisTable < tableSeatCount && playerIndex < playerCount; seatIndex++) {
          const seatKey = `${tableIndex}-${seatIndex}`;
          if (!occupiedSeats.has(seatKey)) {
            assignedSeats.push({ tableIndex, seatIndex });
            seatedAtThisTable++;
            playerIndex++;
          }
        }
      }
    }

    // Shuffle the assigned seats for randomness within the distribution
    const shuffledAssignedSeats = assignedSeats.sort(() => Math.random() - 0.5);

    // Assign seats to players
    const newlySeatedPlayers = shuffledPlayers.map((player, index) => ({
      ...player,
      seated: true,
      tableAssignment: shuffledAssignedSeats[index] || { tableIndex: 0, seatIndex: index }
    }));

    // Update all players: preserve existing seating, update selected players
    const updatedPlayers = currentPlayers.map(player => {
      if (playersToSeatIds.has(player.id)) {
        // Find the newly seated version of this player
        return newlySeatedPlayers.find(newPlayer => newPlayer.id === player.id) || player;
      }
      // Keep existing players as they are (preserve their seating)
      return player;
    });

    // Update the players with the new arrangement
    updatePlayers(updatedPlayers);
    
    // Force a UI refresh after seating
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('seatingComplete', { 
        detail: { seatedPlayers: updatedPlayers.filter(p => p.seated) }
      }));
    }, 200);
  };

  // Save table configuration
  const saveTableConfig = () => {
    const newConfig: TableConfig = {
      numberOfTables,
      seatsPerTable,
      tableNames
    };
    updateSettings({ tables: newConfig });
  };

  // Manual save function for table configuration
  const saveTableConfiguration = () => {
    const newConfig: TableConfig = {
      numberOfTables,
      seatsPerTable,
      tableNames
    };
    updateSettings({ tables: newConfig });
  };

  // Open the bust out dialog for a player
  const openBustOutDialog = (player: Player) => {
    setPlayerToBustOut(player);
    setHitmanId(null);
    setBustOutDialogOpen(true);
  };

  // Handle the bust out process
  const handleBustOut = () => {
    if (!playerToBustOut || !hitmanId) return;

    // Find the hitman player
    const hitman = state.players.find(p => p.id === hitmanId);
    if (!hitman) return;

    // Get seat information from manual table assignment
    const seatInfo = playerToBustOut.tableAssignment ? {
      tableIndex: playerToBustOut.tableAssignment.tableIndex,
      seatIndex: playerToBustOut.tableAssignment.seatIndex,
      totalSeatedPlayers: state.players.filter(p => p.seated).length
    } : undefined;

    // First eliminate the player (this will also handle the position assignment)
    eliminatePlayer(playerToBustOut.id, hitmanId, seatInfo);
    
    // Then immediately add the knockout to the hitman
    setTimeout(() => {
      addKnockout(hitmanId);
    }, 100); // Small delay to ensure elimination is processed first

    // Close the dialog
    setBustOutDialogOpen(false);
    setPlayerToBustOut(null);
    setHitmanId(null);
  };

  // Handle undo bust out for a specific player
  const handleUndoBustOut = (playerId: string) => {
    undoBustOut(playerId);
    setUndoBustOutDialogOpen(false);
  };

  // Table balancing functions
  const balanceTablesRandomly = () => {
    if (!balanceOptions) return;

    // Randomly select a player from the overloaded table
    const randomIndex = Math.floor(Math.random() * balanceOptions.playersToMove.length);
    const playerToMove = balanceOptions.playersToMove[randomIndex];

    // Find first available seat in the underloaded table
    const underloadedTablePlayers = state.players.filter(p => 
      p.seated && p.tableAssignment?.tableIndex === balanceOptions.underloadedTable
    );

    let targetSeat = null;
    for (let seatIndex = 0; seatIndex < seatsPerTable; seatIndex++) {
      const seatTaken = underloadedTablePlayers.some(p => p.tableAssignment?.seatIndex === seatIndex);
      if (!seatTaken) {
        targetSeat = { tableIndex: balanceOptions.underloadedTable, seatIndex };
        break;
      }
    }

    if (targetSeat) {
      // Move the player
      const updatedPlayers = state.players.map(player =>
        player.id === playerToMove.id
          ? { ...player, tableAssignment: targetSeat }
          : player
      );

      updatePlayers(updatedPlayers);
    }

    setTableBalanceDialogOpen(false);
    setBalanceOptions(null);
  };

  const balanceTablesManually = () => {
    if (!balanceOptions) return;

    // Enter move mode and pre-select the overloaded table for manual selection
    setMoveMode(true);
    setSelectedPlayerToMove(null);
    setTableBalanceDialogOpen(false);
    setBalanceOptions(null);
  };

  // Mobile-friendly player movement functions
  const startMoveMode = () => {
    setMoveMode(true);
    setSelectedPlayerToMove(null);
  };

  const cancelMoveMode = () => {
    setMoveMode(false);
    setSelectedPlayerToMove(null);
  };

  const selectPlayerToMove = (player: Player) => {
    if (!moveMode) return;
    setSelectedPlayerToMove(player);
  };

  const movePlayerToSeat = (targetTableIndex: number, targetSeatIndex: number) => {
    if (!moveMode || !selectedPlayerToMove || !selectedPlayerToMove.tableAssignment) return;

    // Check if the target seat is occupied
    const targetSeatOccupied = state.players.find(p => 
      p.seated && 
      p.tableAssignment?.tableIndex === targetTableIndex && 
      p.tableAssignment?.seatIndex === targetSeatIndex
    );

    if (targetSeatOccupied) {
      return;
    }

    // Update the player's table assignment
    const updatedPlayers = state.players.map(player =>
      player.id === selectedPlayerToMove.id
        ? {
            ...player,
            tableAssignment: { tableIndex: targetTableIndex, seatIndex: targetSeatIndex }
          }
        : player
    );

    updatePlayers(updatedPlayers);

    // Exit move mode
    setMoveMode(false);
    setSelectedPlayerToMove(null);
  };

  // Removed all drag and drop functionality

  // Helper function for table felt classes
  const feltBackgroundClass = (background: string) => {
    const backgrounds: Record<string, string> = {
      'felt-green': 'table-felt-base table-felt-green',
      'felt-blue': 'table-felt-base table-felt-blue',
      'felt-red': 'table-felt-base table-felt-red',
      'felt-purple': 'table-felt-base table-felt-purple',
      'felt-orange': 'table-felt-base table-felt-orange',
      'felt-pink': 'table-felt-base table-felt-pink',
      'felt-teal': 'table-felt-base table-felt-teal',
      'felt-yellow': 'table-felt-base table-felt-yellow',
      'felt-black': 'table-felt-base table-felt-black',
      'felt-burgundy': 'table-felt-base table-felt-burgundy',
    };
    return backgrounds[background] || backgrounds['felt-green'];
  };

  return (
    <Card className="p-4 bg-gradient-to-r from-slate-800/50 to-slate-700/50 border border-slate-600/30 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-orange-500">table_chart</span>
          Seating & Tables
        </h2>
      </div>

      <div className="p-5 pt-0 border-t border-[#2a2a2a]">
          <div className="flex flex-wrap justify-center gap-6 mb-4 max-w-lg mx-auto">
            <div className="w-36">
              <Label htmlFor="numberOfTables" className="block mb-2">Number of Tables</Label>
              <Input
                id="numberOfTables"
                type="text"
                value={numberOfTables.toString()}
                onChange={(e) => {
                        const value = e.target.value;
                        // Allow complete deletion and typing
                        if (value === '' || /^\d+$/.test(value)) {
                          const numValue = value === '' ? 0 : parseInt(value, 10);
                          if (numValue >= 0 && numValue <= 20) {
                            setNumberOfTables(numValue);
                          }
                        }
                      }}
                onBlur={(e) => {
                  // Ensure valid value on blur
                  const value = parseInt(e.target.value, 10);
                  let finalValue = numberOfTables;
                  if (isNaN(value) || value < 1) {
                    finalValue = 1;
                    setNumberOfTables(1);
                  } else if (value > 20) {
                    finalValue = 20;
                    setNumberOfTables(20);
                  }
                  updateTableNamesForCount(finalValue);
                  updateTableBackgroundsForCount(finalValue);

                  // Save configuration after user interaction
                  const newConfig = {
                    numberOfTables: finalValue,
                    seatsPerTable,
                    tableNames: tableNames.slice(0, finalValue)
                  };
                  updateSettings({ tables: newConfig });
                }}
                className="w-full text-center"
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>

            <div className="w-36">
              <Label htmlFor="seatsPerTable" className="block mb-2">Seats Per Table</Label>
              <Input
                id="seatsPerTable"
                type="text"
                value={seatsPerTable.toString()}
                onChange={(e) => {
                        const value = e.target.value;
                        // Allow complete deletion and typing
                        if (value === '' || /^\d+$/.test(value)) {
                          const numValue = value === '' ? 0 : parseInt(value, 10);
                          if (numValue >= 0 && numValue <= 12) {
                            setSeatsPerTable(numValue);
                          }
                        }
                      }}
                onBlur={(e) => {
                  // Ensure valid value on blur
                  const value = parseInt(e.target.value, 10);
                  let finalValue = seatsPerTable;
                  if (isNaN(value) || value < 2) {
                    finalValue = 2;
                    setSeatsPerTable(2);
                  } else if (value > 12) {
                    finalValue = 12;
                    setSeatsPerTable(12);
                  }

                  // Save configuration after user interaction
                  const newConfig = {
                    numberOfTables,
                    seatsPerTable: finalValue,
                    tableNames
                  };
                  updateSettings({ tables: newConfig });
                }}
                className="w-full text-center"
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-4">


            <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
              <Button 
                onClick={() => setSeatDialogOpen(true)}
                disabled={state.players.length === 0}
                variant="outline"
                className="btn-seat-players flex items-center justify-center gap-1 font-medium text-sm w-full sm:w-auto py-3 sm:py-2 min-h-[3rem] sm:min-h-auto touch-manipulation transition-all duration-200"
                title={state.players.filter(p => p.seated).length > 0 ? "Re-seat all players (complete reset)" : "Seat players at tables"}
              >
                <span className="material-icons text-sm">event_seat</span>
                <span>Seat Players/Randomize</span>
              </Button>

              {state.players.filter(p => p.seated).length > 0 && (
                <Button 
                  variant="outline"
                  onClick={moveMode ? cancelMoveMode : startMoveMode}
                  className={`flex items-center justify-center gap-1 font-medium text-sm w-full sm:w-auto py-3 sm:py-2 min-h-[3rem] sm:min-h-auto touch-manipulation transition-all duration-200 ${
                    moveMode 
                      ? 'bg-card border border-red-500 text-red-500 hover:bg-red-500 hover:bg-opacity-10' 
                      : 'bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10'
                  }`}
                >
                  {moveMode ? (
                    <>
                      <X className="w-4 h-4" />
                      <span>Cancel Move Mode</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpDown className="w-4 h-4" />
                      <span>Move Players</span>
                    </>
                  )}
                </Button>
              )}

              <Button 
                variant="outline"
                onClick={() => setUndoBustOutDialogOpen(true)}
                disabled={state.players.filter(p => p.isActive === false && p.position).length === 0}
                className="btn-undo-bust-out flex items-center justify-center gap-1 font-medium text-sm w-full sm:w-auto py-3 sm:py-2 min-h-[3rem] sm:min-h-auto touch-manipulation transition-all duration-200"
              >
                <span className="material-icons text-sm">undo</span>
                <span>Undo Bust Out</span>
              </Button>
            </div>

            {/* Move Mode Instructions - Enhanced Visual Feedback */}
            {moveMode && (
              <div className="mt-4 p-4 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-2 border-blue-400/60 rounded-lg shadow-lg animate-pulse">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                  <div className="text-lg font-bold text-blue-300">🔄 MOVE MODE ACTIVE</div>
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                </div>
                <div className="text-sm text-blue-200 font-medium">
                  {selectedPlayerToMove 
                    ? `✅ ${selectedPlayerToMove.name} selected - Click an empty seat to move them` 
                    : '👆 Click a player to select them for moving'
                  }
                </div>
              </div>
            )}

            {/* Player Seating Dialog */}
            <SeatPlayersDialog
              isOpen={seatDialogOpen}
              onClose={() => setSeatDialogOpen(false)}
              players={state.players}
              onSeatPlayers={(selectedPlayers) => {
                seatPlayersManually(selectedPlayers);
              }}
            />

            {/* Bust Out Dialog */}
            <Dialog open={bustOutDialogOpen} onOpenChange={setBustOutDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Bust Out Player</DialogTitle>
                  <DialogDescription>
                    Select the player who knocked out {playerToBustOut?.name}
                  </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {state.players
                      .filter(p => {
                        if (!p.seated || p.isActive === false || !playerToBustOut || p.id === playerToBustOut.id) return false;

                        // Check if both players have table assignments
                        if (!p.tableAssignment || !playerToBustOut.tableAssignment) return false;

                        // Only allow players from the same table (manual seating)
                        return p.tableAssignment.tableIndex === playerToBustOut.tableAssignment.tableIndex;
                      })
                      .map(player => (
                        <div 
                          key={player.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            hitmanId === player.id 
                              ? 'bg-secondary/20 border-secondary' 
                              : 'border-border hover:bg-muted'
                          }`}
                          onClick={() => setHitmanId(player.id)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{player.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {typeof player.knockouts === 'number' ? player.knockouts : 0} eliminations
                            </span>
                          </div>
                        </div>
                      ))}

                    {state.players
                      .filter(p => {
                        if (!p.seated || p.isActive === false || !playerToBustOut || p.id === playerToBustOut.id) return false;
                        if (!p.tableAssignment || !playerToBustOut.tableAssignment) return false;
                        return p.tableAssignment.tableIndex === playerToBustOut.tableAssignment.tableIndex;
                      }).length === 0 && (
                      <div className="p-4 text-center text-muted-foreground">
                        No other players at the same table
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row justify-between gap-3">
                    <Button 
                      variant="outline" 
                      onClick={() => setBustOutDialogOpen(false)}
                      className="py-3 px-6 text-lg sm:text-base min-h-[3rem] sm:min-h-auto"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleBustOut}
                      disabled={!hitmanId}
                      className="py-3 px-6 text-lg sm:text-base min-h-[3rem] sm:min-h-auto"
                    >
                      Confirm Bust Out
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Undo Bust Out Dialog */}
            <Dialog open={undoBustOutDialogOpen} onOpenChange={setUndoBustOutDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Undo Bust Out</DialogTitle>
                  <DialogDescription>
                    Select a player to restore back into the tournament
                  </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {state.players
                      .filter(p => p.isActive === false && p.position)
                      .sort((a, b) => (b.position || 0) - (a.position || 0)) // Sort by position, most recent first
                      .map(player => (
                        <div 
                          key={player.id}
                          className="p-3 rounded-lg border border-border hover:bg-muted cursor-pointer transition-colors"
                          onClick={() => handleUndoBustOut(player.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="font-medium">{player.name}</span>
                              <span className="text-xs text-muted-foreground">
                                Eliminated in {player.position}
                                {player.position === 1 ? 'st' : 
                                 player.position === 2 ? 'nd' : 
                                 player.position === 3 ? 'rd' : 'th'} place
                                {player.eliminatedBy && (
                                  <>
                                    {' '}by {state.players.find(p => p.id === player.eliminatedBy)?.name || 'Unknown'}
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">
                                {player.knockouts || 0} KOs
                              </div>
                              {player.prizeMoney && player.prizeMoney > 0 && (
                                <div className="text-xs text-green-400">
                                  £{player.prizeMoney}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                    {state.players.filter(p => p.isActive === false && p.position).length === 0 && (
                      <div className="p-4 text-center text-muted-foreground">
                        No players have been eliminated yet
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Button 
                      variant="outline" 
                      onClick={() => setUndoBustOutDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Table Balance Dialog */}
            <Dialog open={tableBalanceDialogOpen} onOpenChange={setTableBalanceDialogOpen}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="material-icons text-yellow-500">warning</span>
                    Table Imbalance Detected
                  </DialogTitle>
                  <DialogDescription>
                    Tables are unbalanced. Would you like to move a player to balance them?
                  </DialogDescription>
                </DialogHeader>

                {balanceOptions && (
                  <div className="py-4">
                    <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <div className="text-sm">
                        <div className="font-medium mb-2">Current Imbalance:</div>
                        <div className="space-y-1">
                          <div>
                            <span className="font-medium">
                              {tableNames[balanceOptions.overloadedTable] || `Table ${balanceOptions.overloadedTable + 1}`}:
                            </span>
                            <span className="ml-2">{balanceOptions.playersToMove.length} players</span>
                          </div>
                          <div>
                            <span className="font-medium">
                              {tableNames[balanceOptions.underloadedTable] || `Table ${balanceOptions.underloadedTable + 1}`}:
                            </span>
                            <span className="ml-2">
                              {state.players.filter(p => 
                                p.seated && p.isActive !== false && 
                                p.tableAssignment?.tableIndex === balanceOptions.underloadedTable
                              ).length} players
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-sm font-medium">Choose how to balance:</div>

                      <Button 
                        onClick={balanceTablesRandomly}
                        className="w-full justify-start h-auto p-4"
                        variant="outline"
                      >
                        <div className="text-left">
                          <div className="font-medium">🎲 Random Selection</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Automatically move a random player from the overloaded table
                          </div>
                        </div>
                      </Button>

                      <Button 
                        onClick={balanceTablesManually}
                        className="w-full justify-start h-auto p-4"
                        variant="outline"
                      >
                        <div className="text-left">
                          <div className="font-medium">👆 Manual Selection</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Choose which player to move using the Move Players tool
                          </div>
                        </div>
                      </Button>
                    </div>

                    <div className="mt-6 flex justify-between">
                      <Button 
                        variant="ghost" 
                        onClick={() => {
                          setTableBalanceDialogOpen(false);
                          setBalanceOptions(null);
                        }}
                      >
                        Ignore for now
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>

          {/* Visual representation of tables - List Format */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: Math.min(6, numberOfTables) }).map((_, tableIndex) => {
              const seatedPlayers = state.players.filter(p => p.seated);
              const tablePlayers = seatedPlayers.filter(p => 
                p.tableAssignment?.tableIndex === tableIndex
              ).sort((a, b) => (a.tableAssignment?.seatIndex || 0) - (b.tableAssignment?.seatIndex || 0));

              return (
                <div 
                  key={tableIndex} 
                  className={`relative ${feltBackgroundClass(tableBackgrounds[tableIndex])} rounded-2xl p-5 border shadow-xl transition-all duration-300 ${
                    moveMode 
                      ? 'border-blue-400/60 shadow-blue-500/20 shadow-2xl' 
                      : 'border-slate-600/40'
                  }`}
                >
                  {/* Table Header */}
                  <div className="flex items-center justify-between mb-4">
                    {editingTableIndex === tableIndex ? (
                      <div className="flex items-center space-x-2">
                        <Input 
                          value={editTableName}
                          onChange={(e) => setEditTableName(e.target.value)}
                          className="h-8 text-sm bg-slate-700/50 border-slate-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditedTableName();
                            if (e.key === 'Escape') setEditingTableIndex(null);
                          }}
                        />
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={saveEditedTableName}
                          className="h-8 px-3 bg-slate-700 border-slate-500 hover:bg-slate-600"
                        >
                          Save
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-orange-400 tracking-wide">
                            {tableNames[tableIndex] || `Table ${tableIndex + 1}`}
                          </h3>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => startEditingTableName(tableIndex)}
                            className="h-8 px-2 text-orange-300 hover:text-orange-200 hover:bg-orange-500/10"
                            title="Edit table name"
                          >
                            <Pencil size={14} />
                          </Button>
                        </div>

                        {/* Felt Color Selector */}
                        <div className="relative">
                          <Select
                            value={tableBackgrounds[tableIndex] || 'felt-green'}
                            onValueChange={(value) => changeTableBackground(tableIndex, value)}
                          >
                            <SelectTrigger className="h-8 w-auto min-w-[100px] bg-slate-700/50 border-slate-500 hover:bg-slate-600 text-slate-200">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-4 h-4 rounded-full border-2 border-white/70 shadow-sm flex-shrink-0" 
                                  style={{ 
                                    backgroundColor: {
                                      'felt-green': '#22c55e',
                                      'felt-blue': '#3b82f6',
                                      'felt-red': '#ef4444',
                                      'felt-purple': '#a855f7',
                                      'felt-black': '#374151',
                                      'felt-burgundy': '#dc2626'
                                    }[tableBackgrounds[tableIndex]] || '#22c55e'
                                  }}
                                />
                                <span className="text-xs hidden sm:inline">Felt</span>
                              </div>
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-600 min-w-[160px]">
                              {[
                                { name: 'Green', class: 'felt-green', color: '#22c55e', preview: '#2a3d2e' },
                                { name: 'Blue', class: 'felt-blue', color: '#3b82f6', preview: '#253038' },
                                { name: 'Red', class: 'felt-red', color: '#ef4444', preview: '#3d2a2a' },
                                { name: 'Purple', class: 'felt-purple', color: '#a855f7', preview: '#352a3d' },
                                { name: 'Black', class: 'felt-black', color: '#374151', preview: '#1f2022' },
                                { name: 'Burgundy', class: 'felt-burgundy', color: '#dc2626', preview: '#3d2a25' }
                              ].map((felt) => (
                                <SelectItem 
                                  key={felt.class} 
                                  value={felt.class}
                                  className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700 py-3 sm:py-2"
                                >
                                  <div className="flex items-center gap-3 w-full">
                                    <div className="flex items-center gap-2">
                                      <div 
                                        className="w-5 h-5 rounded-full border-2 border-white/50 shadow-lg flex-shrink-0" 
                                        style={{ backgroundColor: felt.color }}
                                      />
                                      <div 
                                        className="w-8 h-5 rounded border border-white/30 shadow-sm flex-shrink-0" 
                                        style={{ backgroundColor: felt.preview }}
                                      />
                                    </div>
                                    <span className="text-sm font-medium text-slate-200">
                                      {felt.name}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Table Info Bar */}
                  <div className="flex items-center justify-between mb-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full border border-white/50" 
                        style={{ 
                          backgroundColor: {
                            'felt-green': '#22c55e',
                            'felt-blue': '#3b82f6', 
                            'felt-red': '#ef4444',
                            'felt-purple': '#a855f7',
                            'felt-black': '#374151',
                            'felt-burgundy': '#dc2626'
                          }[tableBackgrounds[tableIndex]] || '#22c55e'
                        }}
                      ></div>
                      <span className="text-slate-300">
                        {tablePlayers.length}/{seatsPerTable} seated
                      </span>
                    </div>
                    <span className="text-slate-400 text-xs">
                      {seatsPerTable - tablePlayers.length} empty seats
                    </span>
                  </div>

                  {/* Players and Empty Seats List */}
                  <div className="space-y-2 min-h-[200px]">
                    {Array.from({ length: seatsPerTable }).map((_, seatIndex) => {
                      const player = tablePlayers.find(p => p.tableAssignment?.seatIndex === seatIndex);
                      const isSelectedForMove = selectedPlayerToMove?.id === player?.id;
                      const isClickable = moveMode && player && player.isActive !== false;
                      const isEmptySeat = !player;
                      const canMoveToSeat = moveMode && selectedPlayerToMove && isEmptySeat;

                      if (isEmptySeat) {
                        return (
                          <div
                            key={`empty-${seatIndex}`}
                            className={`relative flex items-center justify-between p-3 rounded-lg border border-dashed transition-all duration-200 ${
                              canMoveToSeat 
                                ? 'border-green-400/60 bg-green-500/10 hover:bg-green-500/20 cursor-pointer' 
                                : 'border-slate-600/30 bg-slate-800/20'
                            }`}
                            onClick={() => {
                              if (canMoveToSeat) movePlayerToSeat(tableIndex, seatIndex);
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-slate-300 text-xs font-bold">
                                {seatIndex + 1}
                              </div>
                              <div className="text-slate-400 text-sm">
                                {canMoveToSeat ? `Move ${selectedPlayerToMove.name} here` : 'Empty seat'}
                              </div>
                            </div>
                            {canMoveToSeat && (
                              <div className="text-green-400 text-xs">Click to move</div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={player.id}
                          className={`relative group flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${
                            isSelectedForMove 
                              ? 'border-blue-400 bg-blue-500/20 text-blue-100' 
                              : moveMode && isClickable
                                ? 'border-dashed border-blue-400/60 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-400'
                                : 'border-slate-600/50 bg-slate-700/30 hover:bg-slate-600/30 hover:border-slate-500'
                          } ${isClickable ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (isClickable) selectPlayerToMove(player);
                          }}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                {seatIndex + 1}
                              </div>
                              <div>
                                <div className="font-medium text-white text-base">
                                  {player.name}
                                </div>
                              </div>
                            </div>
                            {isSelectedForMove && (
                              <div className="ml-auto">
                                <div className="w-6 h-6 bg-blue-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                  ✓
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Bust Out Button - Always Visible */}
                          {!moveMode && (
                            <button
                              className="w-12 h-8 bg-red-500 hover:bg-red-600 text-white rounded font-bold text-xs flex items-center justify-center shadow-lg transition-colors duration-200 flex-shrink-0"
                              title={`Bust out ${player.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openBustOutDialog(player);
                              }}
                            >
                              K.O.
                            </button>
                          )}
                        </div>
                      );
                    })}


                  </div>
                </div>
              );
            })}

            {numberOfTables > 6 && (
              <div className="border border-[#3a3a3a] rounded-lg p-3 bg-card flex items-center justify-center text-muted-foreground">
                +{numberOfTables - 6} more tables
              </div>
            )}
          </div>
<FinalTableDialog
        isOpen={isFinalTableDialogOpen}
        onClose={() => setIsFinalTableDialogOpen(false)}
        playerCount={state.players.filter(p => p.isActive !== false).length}
        onConfirm={goToFinalTable}
      />
        </div>
    </Card>
  );
}