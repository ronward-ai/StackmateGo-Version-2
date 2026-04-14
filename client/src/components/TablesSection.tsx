import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Pencil, X, ArrowUpDown, LayoutGrid, Shuffle, RotateCcw, TableProperties } from "lucide-react";
import { TableConfig, Player } from "@/types";
import SeatPlayersDialog from "./SeatPlayersDialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import FinalTableDialog from "./FinalTableDialog";
import { cn } from "@/lib/utils";

interface TablesSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

// Felt color config — single source of truth
const FELT_COLORS = [
  { key: 'felt-green',   label: 'Green',    hex: '#22c55e', tableClass: 'table-felt-green' },
  { key: 'felt-blue',    label: 'Blue',     hex: '#3b82f6', tableClass: 'table-felt-blue' },
  { key: 'felt-red',     label: 'Red',      hex: '#ef4444', tableClass: 'table-felt-red' },
  { key: 'felt-purple',  label: 'Purple',   hex: '#a855f7', tableClass: 'table-felt-purple' },
  { key: 'felt-orange',  label: 'Orange',   hex: '#f59e0b', tableClass: 'table-felt-orange' },
  { key: 'felt-teal',    label: 'Teal',     hex: '#14b8a6', tableClass: 'table-felt-teal' },
  { key: 'felt-pink',    label: 'Pink',     hex: '#ec4899', tableClass: 'table-felt-pink' },
  { key: 'felt-yellow',  label: 'Yellow',   hex: '#eab308', tableClass: 'table-felt-yellow' },
  { key: 'felt-black',   label: 'Black',    hex: '#374151', tableClass: 'table-felt-black' },
  { key: 'felt-burgundy',label: 'Burgundy', hex: '#dc2626', tableClass: 'table-felt-burgundy' },
];

const feltHex = (key: string) => FELT_COLORS.find(f => f.key === key)?.hex || '#22c55e';
const feltClass = (key: string) => `table-felt-base ${FELT_COLORS.find(f => f.key === key)?.tableClass || 'table-felt-green'}`;

export default function TablesSection({ tournament }: TablesSectionProps) {
  const {
    state, updateSettings, updatePlayers,
    addKnockout, eliminatePlayer, undoBustOut,
    processRebuy, processReEntry,
    shouldPromptForFinalTable, goToFinalTable
  } = tournament;

  const tables = state.settings.tables || { numberOfTables: 3, seatsPerTable: 6, tableNames: ['Table 1','Table 2','Table 3'] };

  const [numberOfTables, setNumberOfTables] = useState(tables.numberOfTables);
  const [seatsPerTable, setSeatsPerTable]   = useState(tables.seatsPerTable);
  const [tableNames, setTableNames]         = useState<string[]>(tables.tableNames || Array.from({ length: tables.numberOfTables }, (_, i) => `Table ${i + 1}`));
  const [tableBackgrounds, setTableBackgrounds] = useState<string[]>(
    state.settings?.tableBackgrounds?.length === tables.numberOfTables
      ? state.settings.tableBackgrounds
      : Array(tables.numberOfTables).fill('felt-green')
  );

  const [editingTableIndex, setEditingTableIndex] = useState<number | null>(null);
  const [editTableName, setEditTableName]         = useState('');
  const [seatDialogOpen, setSeatDialogOpen]       = useState(false);
  const [isFinalTableDialogOpen, setIsFinalTableDialogOpen] = useState(false);

  const [bustOutDialogOpen, setBustOutDialogOpen] = useState(false);
  const [playerToBustOut, setPlayerToBustOut]     = useState<Player | null>(null);
  const [hitmanId, setHitmanId]                   = useState<string | null>(null);

  const [undoBustOutDialogOpen, setUndoBustOutDialogOpen] = useState(false);

  const [moveMode, setMoveMode]                         = useState(false);
  const [selectedPlayerToMove, setSelectedPlayerToMove] = useState<Player | null>(null);

  const [tableBalanceDialogOpen, setTableBalanceDialogOpen] = useState(false);
  const [balanceOptions, setBalanceOptions] = useState<{
    overloadedTable: number; underloadedTable: number; playersToMove: Player[];
  } | null>(null);

  const [breakTableDialogOpen, setBreakTableDialogOpen] = useState(false);
  const [tableToBreak, setTableToBreak]                 = useState<number | null>(null);

  // Sync from state
  useEffect(() => {
    if (state.settings.tables) {
      const c = state.settings.tables;
      setNumberOfTables(c.numberOfTables);
      setSeatsPerTable(c.seatsPerTable);
      setTableNames(c.tableNames?.length === c.numberOfTables
        ? c.tableNames
        : Array.from({ length: c.numberOfTables }, (_, i) => `Table ${i + 1}`)
      );
      setTableBackgrounds(
        state.settings.tableBackgrounds?.length === c.numberOfTables
          ? state.settings.tableBackgrounds
          : Array(c.numberOfTables).fill('felt-green')
      );
    }
  }, [state.settings.tables, state.settings.tableBackgrounds]);

  // Final table prompt
  useEffect(() => {
    if (shouldPromptForFinalTable()) setIsFinalTableDialogOpen(true);
  }, [shouldPromptForFinalTable]);

  // Table balance check
  useEffect(() => {
    if (isFinalTableDialogOpen || moveMode || tableBalanceDialogOpen || shouldPromptForFinalTable()) return;
    const seated = state.players.filter(p => p.seated && p.isActive !== false);
    if (seated.length < 2) return;
    const byTable: Record<number, Player[]> = {};
    seated.forEach(pl => {
      if (pl.tableAssignment) {
        const t = pl.tableAssignment.tableIndex;
        byTable[t] = [...(byTable[t] || []), pl];
      }
    });
    const tabs = Object.entries(byTable).map(([k, v]) => ({ idx: parseInt(k), players: v }));
    if (tabs.length < 2) return;
    const max = tabs.reduce((a, b) => b.players.length > a.players.length ? b : a);
    const min = tabs.reduce((a, b) => b.players.length < a.players.length ? b : a);
    if (max.players.length - min.players.length >= 2) {
      setBalanceOptions({ overloadedTable: max.idx, underloadedTable: min.idx, playersToMove: max.players });
      setTableBalanceDialogOpen(true);
    }
  }, [state.players, isFinalTableDialogOpen, moveMode, tableBalanceDialogOpen]);

  const expandTableNames = (n: number) => {
    setTableNames(prev => n > prev.length
      ? [...prev, ...Array.from({ length: n - prev.length }, (_, i) => `Table ${prev.length + i + 1}`)]
      : prev.slice(0, n)
    );
    setTableBackgrounds(prev => n > prev.length
      ? [...prev, ...Array(n - prev.length).fill('felt-green')]
      : prev.slice(0, n)
    );
  };

  const saveTableConfig = (nt = numberOfTables, spt = seatsPerTable, tn = tableNames) => {
    updateSettings({ tables: { numberOfTables: nt, seatsPerTable: spt, tableNames: tn } });
  };

  const changeTableBackground = (idx: number, bg: string) => {
    const updated = tableBackgrounds.map((b, i) => i === idx ? bg : b);
    setTableBackgrounds(updated);
    updateSettings({ tables: { ...tables, tableNames }, tableBackgrounds: updated });
    if (state.details?.type === 'database' && state.details?.id) {
      setTimeout(async () => {
        try {
          const { doc, updateDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const { sanitizeForFirestore } = await import('@/lib/utils');
          await updateDoc(doc(db, 'activeTournaments', state.details!.id.toString()), sanitizeForFirestore({
            settings: { ...state.settings, tableBackgrounds: updated }
          }));
        } catch (e) { console.error(e); }
      }, 100);
    }
  };

  const saveTableName = () => {
    if (editingTableIndex === null) return;
    const updated = tableNames.map((n, i) => i === editingTableIndex ? (editTableName || `Table ${editingTableIndex + 1}`) : n);
    setTableNames(updated);
    setEditingTableIndex(null);
    saveTableConfig(numberOfTables, seatsPerTable, updated);
  };

  const seatPlayersManually = (selectedPlayers: Player[]) => {
    const current = [...state.players];
    const ids = new Set(selectedPlayers.map(p => p.id));
    const occupied = new Set<string>();
    current.forEach(p => {
      if (p.seated && p.tableAssignment && !ids.has(p.id)) {
        occupied.add(`${p.tableAssignment.tableIndex}-${p.tableAssignment.seatIndex}`);
      }
    });

    const shuffled = [...selectedPlayers].sort(() => Math.random() - 0.5);
    const seats: { tableIndex: number; seatIndex: number }[] = [];

    if (shuffled.length <= seatsPerTable) {
      for (let s = 0; s < seatsPerTable && seats.length < shuffled.length; s++) {
        if (!occupied.has(`0-${s}`)) seats.push({ tableIndex: 0, seatIndex: s });
      }
      if (seats.length < shuffled.length) {
        for (let t = 0; t < numberOfTables && seats.length < shuffled.length; t++) {
          for (let s = 0; s < seatsPerTable && seats.length < shuffled.length; s++) {
            if (!occupied.has(`${t}-${s}`)) seats.push({ tableIndex: t, seatIndex: s });
          }
        }
      }
    } else {
      const base = Math.floor(shuffled.length / numberOfTables);
      const extra = shuffled.length % numberOfTables;
      let pi = 0;
      for (let t = 0; t < numberOfTables && pi < shuffled.length; t++) {
        const need = base + (t < extra ? 1 : 0);
        let got = 0;
        for (let s = 0; s < seatsPerTable && got < need && pi < shuffled.length; s++) {
          if (!occupied.has(`${t}-${s}`)) { seats.push({ tableIndex: t, seatIndex: s }); got++; pi++; }
        }
      }
    }

    const shuffledSeats = seats.sort(() => Math.random() - 0.5);
    const nowSeated = shuffled.map((p, i) => ({ ...p, seated: true, tableAssignment: shuffledSeats[i] || { tableIndex: 0, seatIndex: i } }));
    updatePlayers(current.map(p => ids.has(p.id) ? (nowSeated.find(s => s.id === p.id) || p) : p));
  };

  const handleBustOut = () => {
    if (!playerToBustOut || !hitmanId) return;
    const seatInfo = playerToBustOut.tableAssignment ? {
      tableIndex: playerToBustOut.tableAssignment.tableIndex,
      seatIndex: playerToBustOut.tableAssignment.seatIndex,
      totalSeatedPlayers: state.players.filter(p => p.seated).length
    } : undefined;
    eliminatePlayer(playerToBustOut.id, hitmanId, seatInfo);
    setTimeout(() => addKnockout(hitmanId), 100);
    setBustOutDialogOpen(false);
    setPlayerToBustOut(null);
    setHitmanId(null);
  };

  const balanceRandomly = () => {
    if (!balanceOptions) return;
    // Random player from the overloaded table
    const player = balanceOptions.playersToMove[Math.floor(Math.random() * balanceOptions.playersToMove.length)];
    // Collect all empty seats at the underloaded table, pick one at random
    const occupiedAtTarget = new Set(
      state.players
        .filter(p => p.seated && p.tableAssignment?.tableIndex === balanceOptions.underloadedTable)
        .map(p => p.tableAssignment!.seatIndex)
    );
    const emptySeats: number[] = [];
    for (let s = 0; s < seatsPerTable; s++) {
      if (!occupiedAtTarget.has(s)) emptySeats.push(s);
    }
    if (emptySeats.length > 0) {
      const seatIndex = emptySeats[Math.floor(Math.random() * emptySeats.length)];
      updatePlayers(state.players.map(p => p.id === player.id
        ? { ...p, tableAssignment: { tableIndex: balanceOptions.underloadedTable, seatIndex } }
        : p
      ));
    }
    setTableBalanceDialogOpen(false);
    setBalanceOptions(null);
  };

  // Break a table — distribute its active players to the emptiest remaining tables.
  const breakTable = (breakIdx: number) => {
    const current = [...state.players];
    const { seatsPerTable: spt = 9 } = tables;

    // Players to redistribute (active, seated at the broken table)
    const toRedistribute = current
      .filter(p => p.seated && p.isActive !== false && p.tableAssignment?.tableIndex === breakIdx)
      .sort(() => Math.random() - 0.5); // shuffle so assignment order is random

    // Remove their seat assignments
    let updated = current.map(p =>
      toRedistribute.some(r => r.id === p.id)
        ? { ...p, seated: false, tableAssignment: undefined }
        : p
    );

    // Assign each player to the emptiest table that still has a free seat
    for (const player of toRedistribute) {
      const occupied = new Set(
        updated.filter(p => p.seated && p.tableAssignment)
               .map(p => `${p.tableAssignment!.tableIndex}-${p.tableAssignment!.seatIndex}`)
      );

      // Count occupancy per table (skip the broken one)
      const tableCount: Record<number, number> = {};
      for (let t = 0; t < numberOfTables; t++) {
        if (t !== breakIdx) tableCount[t] = 0;
      }
      updated.forEach(p => {
        if (p.seated && p.isActive !== false && p.tableAssignment && p.tableAssignment.tableIndex !== breakIdx) {
          tableCount[p.tableAssignment.tableIndex] = (tableCount[p.tableAssignment.tableIndex] || 0) + 1;
        }
      });

      const sorted = Object.entries(tableCount)
        .map(([t, count]) => ({ tableIndex: parseInt(t), count }))
        .sort((a, b) => a.count - b.count);

      let assignedSeat: { tableIndex: number; seatIndex: number } | null = null;
      for (const { tableIndex } of sorted) {
        const emptySeats: number[] = [];
        for (let s = 0; s < spt; s++) {
          if (!occupied.has(`${tableIndex}-${s}`)) emptySeats.push(s);
        }
        if (emptySeats.length > 0) {
          const seatIndex = emptySeats[Math.floor(Math.random() * emptySeats.length)];
          assignedSeat = { tableIndex, seatIndex };
          break;
        }
      }

      if (assignedSeat) {
        const seat = assignedSeat;
        updated = updated.map(p => p.id === player.id ? { ...p, seated: true, tableAssignment: seat } : p);
      }
    }

    updatePlayers(updated);
    setBreakTableDialogOpen(false);
    setTableToBreak(null);
  };

  const movePlayerToSeat = (ti: number, si: number) => {
    if (!selectedPlayerToMove) return;
    const taken = state.players.find(p => p.seated && p.tableAssignment?.tableIndex === ti && p.tableAssignment?.seatIndex === si);
    if (taken) return;
    updatePlayers(state.players.map(p => p.id === selectedPlayerToMove.id
      ? { ...p, tableAssignment: { tableIndex: ti, seatIndex: si } }
      : p
    ));
    setMoveMode(false);
    setSelectedPlayerToMove(null);
  };

  return (
    <div className="space-y-4">
      <Card className="card-glass-orange rounded-xl">
        <CardContent className="p-5">

          {/* Header */}
          <div className="flex items-center gap-2 mb-5">
            <LayoutGrid className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Seating & Tables</span>
          </div>

          {/* Config row */}
          <div className="flex flex-wrap gap-6 mb-5">
            <div className="space-y-1.5">
              <Label htmlFor="numberOfTables" className="text-xs text-muted-foreground">Tables</Label>
              <Input
                id="numberOfTables"
                type="text"
                value={numberOfTables}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 1 && v <= 20) {
                    setNumberOfTables(v);
                    expandTableNames(v);
                  }
                }}
                onBlur={() => saveTableConfig()}
                className="w-20 h-9 text-center"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seatsPerTable" className="text-xs text-muted-foreground">Seats / Table</Label>
              <Input
                id="seatsPerTable"
                type="text"
                value={seatsPerTable}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 2 && v <= 12) setSeatsPerTable(v);
                }}
                onBlur={() => saveTableConfig()}
                className="w-20 h-9 text-center"
                inputMode="numeric"
              />
            </div>
            <div className="flex items-end">
              <Badge variant="outline" className="h-9 px-3 border-amber-500/30 text-amber-300 font-mono">
                Max {numberOfTables * seatsPerTable} players
              </Badge>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-5">
            <Button
              variant="outline"
              size="sm"
              className="btn-seat-players gap-1.5 h-9 text-xs"
              disabled={state.players.length === 0}
              onClick={() => setSeatDialogOpen(true)}
            >
              <Shuffle className="h-3.5 w-3.5" />
              Seat / Randomize
            </Button>

            {state.players.some(p => p.seated) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setMoveMode(!moveMode); setSelectedPlayerToMove(null); }}
                className={cn(
                  "gap-1.5 h-9 text-xs",
                  moveMode
                    ? "border-destructive/50 text-destructive hover:bg-destructive/10"
                    : "border-primary/30 text-primary"
                )}
              >
                {moveMode ? <><X className="h-3.5 w-3.5" />Cancel Move</> : <><ArrowUpDown className="h-3.5 w-3.5" />Move Players</>}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="btn-undo-bust-out gap-1.5 h-9 text-xs"
              disabled={!state.players.some(p => p.isActive === false && p.position)}
              onClick={() => setUndoBustOutDialogOpen(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo Bust Out
            </Button>
          </div>

          {/* Move mode banner */}
          {moveMode && (
            <div className="mb-4 px-4 py-3 rounded-lg border border-primary/40 bg-primary/5 text-sm text-primary fade-in">
              {selectedPlayerToMove
                ? `✅ ${selectedPlayerToMove.name} selected — tap an empty seat to move them`
                : '👆 Tap a player to select them for moving'}
            </div>
          )}

          {/* Tables grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: Math.min(6, numberOfTables) }).map((_, tableIndex) => {
              const tablePlayers = state.players
                .filter(p => p.seated && p.tableAssignment?.tableIndex === tableIndex)
                .sort((a, b) => (a.tableAssignment?.seatIndex || 0) - (b.tableAssignment?.seatIndex || 0));

              return (
                <div
                  key={tableIndex}
                  className={cn(
                    feltClass(tableBackgrounds[tableIndex] || 'felt-green'),
                    "rounded-2xl p-4 border shadow-xl transition-all duration-300",
                    moveMode ? "border-primary/50 shadow-primary/10 shadow-lg" : ""
                  )}
                >
                  {/* Table header */}
                  <div className="flex items-center justify-between mb-3">
                    {editingTableIndex === tableIndex ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editTableName}
                          onChange={(e) => setEditTableName(e.target.value)}
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') saveTableName(); if (e.key === 'Escape') setEditingTableIndex(null); }}
                        />
                        <Button size="sm" variant="outline" onClick={saveTableName} className="h-7 px-2 text-xs">Save</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <h3 className="text-base font-bold text-orange-300 truncate">
                          {tableNames[tableIndex] || `Table ${tableIndex + 1}`}
                        </h3>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => { setEditingTableIndex(tableIndex); setEditTableName(tableNames[tableIndex]); }}
                          className="h-6 w-6 p-0 text-orange-300/50 hover:text-orange-300 flex-shrink-0"
                        >
                          <Pencil size={11} />
                        </Button>
                        {/* Break table — only when ≥2 tables have active players */}
                        {(() => {
                          const activeTables = new Set(
                            state.players
                              .filter(p => p.seated && p.isActive !== false && p.tableAssignment)
                              .map(p => p.tableAssignment!.tableIndex)
                          );
                          const hasPlayersHere = activeTables.has(tableIndex);
                          return activeTables.size >= 2 && hasPlayersHere ? (
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => { setTableToBreak(tableIndex); setBreakTableDialogOpen(true); }}
                              className="h-6 w-6 p-0 text-red-400/50 hover:text-red-400 flex-shrink-0"
                              title="Break this table"
                            >
                              <TableProperties size={11} />
                            </Button>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {/* Felt colour picker */}
                    <Select
                      value={tableBackgrounds[tableIndex] || 'felt-green'}
                      onValueChange={(v) => changeTableBackground(tableIndex, v)}
                    >
                      <SelectTrigger className="h-7 w-auto px-2 bg-black/30 border-white/20 text-white/70 hover:bg-black/40 flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-3 h-3 rounded-full border border-white/50"
                            style={{ backgroundColor: feltHex(tableBackgrounds[tableIndex] || 'felt-green') }}
                          />
                          <span className="text-[10px] hidden sm:block">Felt</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent className="min-w-[150px]">
                        {FELT_COLORS.map(f => (
                          <SelectItem key={f.key} value={f.key} className="py-2.5 sm:py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: f.hex }} />
                              <span className="text-sm">{f.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Occupancy bar */}
                  <div className="flex items-center justify-between text-xs mb-3 text-white/60">
                    <span>{tablePlayers.length}/{seatsPerTable} seated</span>
                    <span>{seatsPerTable - tablePlayers.length} empty</span>
                  </div>

                  {/* Seats */}
                  <div className="space-y-1.5 min-h-[160px]">
                    {Array.from({ length: seatsPerTable }).map((_, seatIndex) => {
                      const player = tablePlayers.find(p => p.tableAssignment?.seatIndex === seatIndex);
                      const isSelected = selectedPlayerToMove?.id === player?.id;
                      const canMoveHere = moveMode && selectedPlayerToMove && !player;
                      const canSelectPlayer = moveMode && player && player.isActive !== false;

                      if (!player) {
                        return (
                          <div
                            key={`empty-${seatIndex}`}
                            onClick={() => { if (canMoveHere) movePlayerToSeat(tableIndex, seatIndex); }}
                            className={cn(
                              "flex items-center gap-2.5 p-2.5 rounded-lg border border-dashed transition-all",
                              canMoveHere
                                ? "border-green-400/70 bg-green-500/15 cursor-pointer hover:bg-green-500/25"
                                : "border-white/15 bg-black/15"
                            )}
                          >
                            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/40 text-[10px] font-bold flex-shrink-0">
                              {seatIndex + 1}
                            </div>
                            <span className="text-xs text-white/40">
                              {canMoveHere ? `Move ${selectedPlayerToMove.name} here` : 'Empty'}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={player.id}
                          onClick={() => { if (canSelectPlayer) setSelectedPlayerToMove(isSelected ? null : player); }}
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-lg border transition-all",
                            isSelected ? "border-primary bg-primary/20" :
                            canSelectPlayer ? "border-dashed border-primary/50 bg-black/20 hover:bg-primary/10 cursor-pointer" :
                            "border-white/20 bg-black/25 hover:bg-black/35"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-6 h-6 rounded-full bg-blue-500/80 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                              {seatIndex + 1}
                            </div>
                            <span className="font-medium text-white text-sm truncate">{player.name}</span>
                            {isSelected && <span className="text-primary text-xs ml-auto">✓</span>}
                          </div>

                          {!moveMode && (
                            <div className="ml-2 flex items-center gap-1 flex-shrink-0">
                              {/* Rebuy button */}
                              {state.prizeStructure?.allowRebuys &&
                                player.isActive === false &&
                                (player.rebuys || 0) < (state.prizeStructure?.maxRebuys || 3) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); processRebuy(player.id); }}
                                  className="h-7 px-1.5 bg-purple-500/80 hover:bg-purple-500 text-white rounded text-[10px] font-bold transition-colors"
                                >
                                  R
                                </button>
                              )}
                              {/* Re-entry button */}
                              {state.prizeStructure?.allowReEntry &&
                                player.isActive === false &&
                                (player.reEntries || 0) < (state.prizeStructure?.maxReEntries ?? 99) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); processReEntry(player.id); }}
                                  className="h-7 px-1.5 bg-blue-500/80 hover:bg-blue-500 text-white rounded text-[10px] font-bold transition-colors"
                                >
                                  RE
                                </button>
                              )}
                              {/* KO button — only for active players */}
                              {player.isActive !== false && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPlayerToBustOut(player);
                                    setHitmanId(null);
                                    setBustOutDialogOpen(true);
                                  }}
                                  className="h-7 w-10 bg-red-500/80 hover:bg-red-500 text-white rounded text-[10px] font-bold transition-colors"
                                >
                                  KO
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {numberOfTables > 6 && (
              <div className="card-glass rounded-2xl p-4 flex items-center justify-center text-muted-foreground text-sm">
                +{numberOfTables - 6} more tables
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      {/* Seat Players Dialog */}
      <SeatPlayersDialog
        isOpen={seatDialogOpen}
        onClose={() => setSeatDialogOpen(false)}
        players={state.players}
        onSeatPlayers={seatPlayersManually}
      />

      {/* Bust Out Dialog */}
      <Dialog open={bustOutDialogOpen} onOpenChange={setBustOutDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Bust Out — {playerToBustOut?.name}</DialogTitle>
            <DialogDescription>Who knocked them out?</DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-2 max-h-64 overflow-y-auto">
            {state.players
              .filter(p =>
                p.seated && p.isActive !== false &&
                p.id !== playerToBustOut?.id &&
                p.tableAssignment?.tableIndex === playerToBustOut?.tableAssignment?.tableIndex
              )
              .map(player => (
                <div
                  key={player.id}
                  onClick={() => setHitmanId(player.id)}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between",
                    hitmanId === player.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/30"
                  )}
                >
                  <span className="font-medium">{player.name}</span>
                  <span className="text-xs text-muted-foreground">{player.knockouts || 0} KOs</span>
                </div>
              ))}
            {state.players.filter(p =>
              p.seated && p.isActive !== false &&
              p.id !== playerToBustOut?.id &&
              p.tableAssignment?.tableIndex === playerToBustOut?.tableAssignment?.tableIndex
            ).length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No other players at this table</p>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setBustOutDialogOpen(false)}>Cancel</Button>
            <Button className="flex-1" disabled={!hitmanId} onClick={handleBustOut}>Confirm KO</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Undo Bust Out Dialog */}
      <Dialog open={undoBustOutDialogOpen} onOpenChange={setUndoBustOutDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Undo Bust Out</DialogTitle>
            <DialogDescription>Restore a player to the tournament</DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-2 max-h-64 overflow-y-auto">
            {state.players
              .filter(p => p.isActive === false && p.position)
              .sort((a, b) => (b.position || 0) - (a.position || 0))
              .map(player => (
                <div
                  key={player.id}
                  onClick={() => { undoBustOut(player.id); setUndoBustOutDialogOpen(false); }}
                  className="p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{player.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {player.position}th place
                      {player.eliminatedBy && ` · KO'd by ${state.players.find(p => p.id === player.eliminatedBy)?.name}`}
                    </div>
                  </div>
                  {player.prizeMoney ? (
                    <span className="text-xs text-green-400 font-mono">£{player.prizeMoney}</span>
                  ) : null}
                </div>
              ))}
            {!state.players.some(p => p.isActive === false && p.position) && (
              <p className="text-center text-sm text-muted-foreground py-4">No eliminations to undo</p>
            )}
          </div>
          <Button variant="outline" className="w-full" onClick={() => setUndoBustOutDialogOpen(false)}>Close</Button>
        </DialogContent>
      </Dialog>

      {/* Table Balance Dialog */}
      <Dialog open={tableBalanceDialogOpen} onOpenChange={setTableBalanceDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>⚖️ Table Imbalance</DialogTitle>
            <DialogDescription>
              {balanceOptions && `${tableNames[balanceOptions.overloadedTable] || `Table ${balanceOptions.overloadedTable + 1}`} has ${balanceOptions.playersToMove.length} players vs ${
                state.players.filter(p => p.seated && p.isActive !== false && p.tableAssignment?.tableIndex === balanceOptions.underloadedTable).length
              } at ${tableNames[balanceOptions.underloadedTable] || `Table ${balanceOptions.underloadedTable + 1}`}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Button variant="outline" className="w-full justify-start h-auto p-4" onClick={balanceRandomly}>
              <div className="text-left">
                <div className="font-medium">🎲 Random — move a random player</div>
                <div className="text-xs text-muted-foreground mt-0.5">Let the app pick who moves</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto p-4"
              onClick={() => {
                setMoveMode(true);
                setSelectedPlayerToMove(null);
                setTableBalanceDialogOpen(false);
                setBalanceOptions(null);
              }}
            >
              <div className="text-left">
                <div className="font-medium">👆 Manual — choose who moves</div>
                <div className="text-xs text-muted-foreground mt-0.5">Use Move Players mode to pick</div>
              </div>
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => { setTableBalanceDialogOpen(false); setBalanceOptions(null); }}
          >
            Ignore for now
          </Button>
        </DialogContent>
      </Dialog>

      <FinalTableDialog
        isOpen={isFinalTableDialogOpen}
        onClose={() => setIsFinalTableDialogOpen(false)}
        playerCount={state.players.filter(p => p.isActive !== false).length}
        onConfirm={goToFinalTable}
      />

      {/* Break Table Dialog */}
      <Dialog open={breakTableDialogOpen} onOpenChange={open => { setBreakTableDialogOpen(open); if (!open) setTableToBreak(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Break {tableToBreak !== null ? (tableNames[tableToBreak] || `Table ${tableToBreak + 1}`) : ''}</DialogTitle>
            <DialogDescription>
              {tableToBreak !== null && (() => {
                const count = state.players.filter(p => p.seated && p.isActive !== false && p.tableAssignment?.tableIndex === tableToBreak).length;
                return `${count} player${count !== 1 ? 's' : ''} will be randomly distributed to the emptiest remaining tables.`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setBreakTableDialogOpen(false); setTableToBreak(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => tableToBreak !== null && breakTable(tableToBreak)}
            >
              Break Table
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}