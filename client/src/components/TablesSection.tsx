import { useState, useEffect } from "react";
import { currencyOf, money } from '@/lib/currency';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { entryCosts } from "@/lib/prizePool";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Pencil, X, ArrowUpDown, LayoutGrid, Shuffle, RotateCcw, TableProperties, Check, Scale, MousePointerClick, UserMinus } from "lucide-react";
import { TableConfig, Player } from "@/types";
import SeatPlayersDialog from "./SeatPlayersDialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import PlayerEntryActions from '@/components/PlayerEntryActions';
import { ordinal } from '@/lib/ordinal';
import { mostRecentlyBusted } from '@/lib/eliminationOrder';
import { seatablePlayers, allSeated, planSeating } from '@/lib/seating';
import { commitNumber, isDraftNumber } from '@/lib/numberField';
import { imbalance, imbalanceDismissed, imbalanceKey } from '@/lib/tableBalance';
import { cn } from "@/lib/utils";
import { canRebuy } from '@/lib/entryLimits';

interface TablesSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  /**
   * Whether the final-table prompt is up. It is mounted at page level now (it
   * had to be — this component is a TAB, and an unmounted tab cannot ask the
   * director anything), so the balance prompt below is told rather than able
   * to see for itself. Two dialogs at once would be two questions about the
   * same bust-out.
   */
  finalTablePromptOpen?: boolean;
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

export default function TablesSection({ tournament, finalTablePromptOpen = false }: TablesSectionProps) {
  const {
    state, updateSettings, updatePlayers,
    addKnockout, eliminatePlayer, undoBustOut,
    processRebuy, processReEntry,
    shouldPromptForFinalTable, goToFinalTable
  } = tournament;

  const tables = state.settings.tables || { numberOfTables: 3, seatsPerTable: 6, tableNames: ['Table 1','Table 2','Table 3'] };

  const sym = currencyOf(state.settings);
  const ps = state.prizeStructure;
  const {
    perEntryRake,
    rebuyRake: rebuyRakeAmt,
    reEntryRake: reEntryRakeAmt,
    rebuyBounty: rebuyBountyAmt,
    reEntryBounty: reEntryBountyAmt,
  } = entryCosts(ps);

  const [numberOfTables, setNumberOfTables] = useState(tables.numberOfTables);
  // The DRAFT is what the field shows while it is being typed in, and it has to
  // be allowed to be empty or half-finished — see lib/numberField.ts. Without
  // it these two fields could not be changed at all.
  const [tablesDraft, setTablesDraft] = useState(String(tables.numberOfTables));
  const [seatsDraft, setSeatsDraft]   = useState(String(tables.seatsPerTable));
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
  /** Which imbalance was waved away, so "Ignore for now" stays ignored. */
  const [balanceDismissedKey, setBalanceDismissedKey] = useState<string | null>(null);

  const [bustOutDialogOpen, setBustOutDialogOpen] = useState(false);
  const [playerToBustOut, setPlayerToBustOut]     = useState<Player | null>(null);
  const [hitmanId, setHitmanId]                   = useState<string | null>(null);

  const [undoBustOutDialogOpen, setUndoBustOutDialogOpen] = useState(false);

  // The one a director is almost always reaching for — they just knocked them
  // out. Shared with the final-table prompt through lib/eliminationOrder.ts.
  const justBusted = mostRecentlyBusted(state.players);

  const bustedPlayers = state.players
    .filter(p => p.isActive === false)
    .sort((a, b) => (b.position || 0) - (a.position || 0));

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
      // A snapshot still wins: the drafts follow the stored value.
      setTablesDraft(String(c.numberOfTables));
      setSeatsDraft(String(c.seatsPerTable));
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

  // Table balance check — see lib/tableBalance.ts for why this is shaped the
  // way it is.
  //
  // `tableBalanceDialogOpen` is deliberately NOT a dependency. It used to be
  // both the early-return guard above and a dep, so dismissing the dialog
  // changed a dep, re-ran the effect, passed the guard, found the imbalance
  // still there — ignoring one does not fix it — and reopened instantly.
  // "Ignore for now" could never work.
  const currentImbalance = imbalance(state.players);

  useEffect(() => {
    if (finalTablePromptOpen || moveMode || shouldPromptForFinalTable()) return;
    if (!currentImbalance) return;
    if (imbalanceDismissed(balanceDismissedKey, currentImbalance)) return;

    const playersToMove = state.players.filter(
      p => p.seated && p.isActive !== false
        && p.tableAssignment?.tableIndex === currentImbalance.overloadedTable,
    );
    setBalanceOptions({
      overloadedTable: currentImbalance.overloadedTable,
      underloadedTable: currentImbalance.underloadedTable,
      playersToMove,
    });
    setTableBalanceDialogOpen(true);
  }, [currentImbalance, balanceDismissedKey, finalTablePromptOpen, moveMode, shouldPromptForFinalTable, state.players]);

  /** Grow or trim the per-table arrays to `n`, and RETURN the names.
   *
   *  The return matters: `saveTableConfig`'s defaults read render-time state,
   *  so a blur handler that set state and then called it bare would save the
   *  previous count and the previous names. The caller passes these on. */
  const expandTableNames = (n: number): string[] => {
    const grow = <T,>(prev: T[], fill: (i: number) => T) => n > prev.length
      ? [...prev, ...Array.from({ length: n - prev.length }, (_, i) => fill(prev.length + i))]
      : prev.slice(0, n);
    const names = grow(tableNames, i => `Table ${i + 1}`);
    setTableNames(names);
    setTableBackgrounds(prev => grow(prev, () => 'felt-green'));
    return names;
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
        } catch (e) { console.error('Could not save the table layout:', e); }
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

  const seatPlayersManually = (chosen: Player[]) => {
    // The SECOND gate, and not redundant: a check in the dialog alone is walked
    // around by the next caller, which is why `attemptAddPlayer` is the single
    // route for adding a player. A busted player has no seat.
    const selectedPlayers = seatablePlayers(chosen);
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

    // How many land on each table comes from lib/seating.ts, the same function
    // the dialog's summary renders from, so the sentence a director reads and
    // the seating they then get cannot disagree. Which SEAT each player takes
    // stays here, because that depends on which chairs are already occupied by
    // players outside this selection.
    const plan = planSeating(shuffled.length, { numberOfTables, seatsPerTable });

    if (plan.perTable.length <= 1) {
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
      let pi = 0;
      for (let t = 0; t < numberOfTables && pi < shuffled.length; t++) {
        const need = plan.perTable[t] ?? 0;
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
    setBustOutDialogOpen(false);
    setPlayerToBustOut(null);
    setHitmanId(null);
  };

  const balanceRandomly = () => {
    if (!balanceOptions) return;
    const player = balanceOptions.playersToMove[Math.floor(Math.random() * balanceOptions.playersToMove.length)];
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

    const toRedistribute = current
      .filter(p => p.seated && p.isActive !== false && p.tableAssignment?.tableIndex === breakIdx)
      .sort(() => Math.random() - 0.5);

    let updated = current.map(p =>
      toRedistribute.some(r => r.id === p.id)
        ? { ...p, seated: false, tableAssignment: undefined }
        : p
    );

    for (const player of toRedistribute) {
      const occupied = new Set(
        updated.filter(p => p.seated && p.tableAssignment)
               .map(p => `${p.tableAssignment!.tableIndex}-${p.tableAssignment!.seatIndex}`)
      );

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
      <Card className="card-glass rounded-xl">
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
                value={tablesDraft}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!isDraftNumber(raw)) return;
                  setTablesDraft(raw);
                  // Follow along live where the draft is already usable, so the
                  // tables below react as you type.
                  const v = parseInt(raw, 10);
                  if (Number.isFinite(v) && v >= 1 && v <= 20) {
                    setNumberOfTables(v);
                    expandTableNames(v);
                  }
                }}
                onBlur={() => {
                  const n = commitNumber(tablesDraft, { min: 1, max: 20, fallback: numberOfTables });
                  setTablesDraft(String(n));
                  setNumberOfTables(n);
                  // Explicit, not the defaults: those read render-time state.
                  saveTableConfig(n, seatsPerTable, expandTableNames(n));
                }}
                className="w-20 h-9 text-center"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seatsPerTable" className="text-xs text-muted-foreground">Seats / Table</Label>
              <Input
                id="seatsPerTable"
                type="text"
                value={seatsDraft}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!isDraftNumber(raw)) return;
                  setSeatsDraft(raw);
                  const v = parseInt(raw, 10);
                  if (Number.isFinite(v) && v >= 2 && v <= 12) setSeatsPerTable(v);
                }}
                onBlur={() => {
                  const n = commitNumber(seatsDraft, { min: 2, max: 12, fallback: seatsPerTable });
                  setSeatsDraft(String(n));
                  setSeatsPerTable(n);
                  saveTableConfig(numberOfTables, n, tableNames);
                }}
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
            {/* The Seating tab's primary action. It does two jobs — place
                people who have no chair, and redraw the chairs of people who do
                — and said both at once. At a final table everyone is already
                seated, so half the label describes nothing and the half the
                director wants is the half they read past. */}
            <Button
              size="sm"
              className="gap-1.5 h-9 text-xs"
              disabled={state.players.length === 0}
              onClick={() => setSeatDialogOpen(true)}
            >
              <Shuffle className="h-3.5 w-3.5" />
              {allSeated(state.players) ? 'Randomize' : 'Seat / Randomize'}
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
                ? `${selectedPlayerToMove.name} selected — tap an empty seat to move them`
                : 'Tap a player to select them for moving'}
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
                          <span className="text-caption hidden sm:block">Felt</span>
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
                              "flex items-center gap-2.5 p-3 rounded-lg border transition-all",
                              canMoveHere
                                ? "border-green-400/70 bg-green-500/15 cursor-pointer hover:bg-green-500/25"
                                : "border-white/20 bg-black/15 hover:bg-white/5"
                            )}
                          >
                            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/40 text-caption font-bold flex-shrink-0">
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
                            "flex items-center justify-between p-3 rounded-lg border transition-all",
                            isSelected ? "border-primary bg-primary/20" :
                            canSelectPlayer ? "border-primary/50 bg-black/20 hover:bg-primary/10 cursor-pointer" :
                            "border-white/25 bg-black/25 hover:bg-white/8"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-6 h-6 rounded-full bg-blue-500/80 flex items-center justify-center text-white text-caption font-bold flex-shrink-0">
                              {seatIndex + 1}
                            </div>
                            <span className="font-semibold text-white text-sm truncate">{player.name}</span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-primary ml-auto flex-shrink-0" />}
                          </div>

                          {!moveMode && (
                            <div className="ml-2 flex items-center gap-1 flex-shrink-0">
                              {/* One implementation, shared with the busted
                                  strip below — see PlayerEntryActions. */}
                              {player.isActive === false && (
                                <>
                                  <PlayerEntryActions
                                    player={player}
                                    prizeStructure={state.prizeStructure}
                                    settings={state.settings}
                                    currentLevel={state.currentLevel}
                                    onRebuy={processRebuy}
                                    onReEntry={processReEntry}
                                    variant="compact"
                                  />
                                  {/* The way out of a seat for someone already
                                      out of the tournament. Seating them is now
                                      prevented at two gates, but a game broken
                                      before that shipped needs a hand.

                                      Deliberately NOT a bust-out: they are
                                      already busted, and their finishing
                                      position and league result must not be
                                      touched. This clears the chair, nothing
                                      else. */}
                                  <Button
                                    variant="outline"
                                    title="Remove from seat"
                                    aria-label={`Remove ${player.name} from this seat`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updatePlayers(state.players.map(p =>
                                        p.id === player.id
                                          ? { ...p, seated: false, tableAssignment: undefined }
                                          : p
                                      ));
                                    }}
                                    className="h-7 px-2 text-caption"
                                  >
                                    Unseat
                                  </Button>
                                </>
                              )}
                              {/* KO button — only for active players */}
                              {player.isActive !== false && (
                                <Button
                                  variant="destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPlayerToBustOut(player);
                                    setHitmanId(null);
                                    setBustOutDialogOpen(true);
                                  }}
                                  className="h-7 w-10 text-caption font-bold"
                                >
                                  KO
                                </Button>
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

          {/* Busted players, and the way back in.
              
              The seating screen already had a rebuy button, drawn INSIDE a seat
              and gated on isActive === false — and it could never appear,
              because eliminatePlayer clears `seated` and `tableAssignment`, so a
              busted player leaves the grid the instant they bust. There was no
              seat left to hang it on, and the only route back in was the players
              list. This is where they actually are. */}
          {bustedPlayers.length > 0 && !moveMode && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-caption uppercase tracking-wide text-muted-foreground">
                  Busted — most recent first
                </span>
              </div>
              <div className="space-y-1.5">
                {bustedPlayers.map(player => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-white/10 bg-black/20"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate">{player.name}</span>
                      {player.position && (
                        <span className="text-caption text-muted-foreground font-mono flex-shrink-0">
                          {ordinal(player.position)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <PlayerEntryActions
                        player={player}
                        prizeStructure={state.prizeStructure}
                        settings={state.settings}
                        currentLevel={state.currentLevel}
                        onRebuy={processRebuy}
                        onReEntry={processReEntry}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Seat Players Dialog */}
      <SeatPlayersDialog
        isOpen={seatDialogOpen}
        onClose={() => setSeatDialogOpen(false)}
        players={state.players}
        onSeatPlayers={seatPlayersManually}
        numberOfTables={numberOfTables}
        seatsPerTable={seatsPerTable}
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
                    <span className="text-xs text-green-400 font-mono">{money(player.prizeMoney, sym)}</span>
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
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-amber-400" />
              Table Imbalance
            </DialogTitle>
            <DialogDescription>
              {balanceOptions && `${tableNames[balanceOptions.overloadedTable] || `Table ${balanceOptions.overloadedTable + 1}`} has ${balanceOptions.playersToMove.length} players vs ${
                state.players.filter(p => p.seated && p.isActive !== false && p.tableAssignment?.tableIndex === balanceOptions.underloadedTable).length
              } at ${tableNames[balanceOptions.underloadedTable] || `Table ${balanceOptions.underloadedTable + 1}`}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* The answer that removes the imbalance instead of shuffling the
                tables around it. A bust-out is what created the gap, so if that
                player is buying back in, nobody needs to move at all — the same
                move FinalTableDialog makes for the same reason. */}
            {justBusted && canRebuy(state.prizeStructure, justBusted, state.currentLevel) && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 space-y-2">
                <p className="text-label leading-relaxed">
                  <span className="font-medium">{justBusted.name}</span> busting is what left the
                  tables uneven. If they are buying back in, nobody needs to move.
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    processRebuy(justBusted.id);
                    setTableBalanceDialogOpen(false);
                    setBalanceOptions(null);
                  }}
                >
                  Rebuy {justBusted.name}
                </Button>
              </div>
            )}

            <Button variant="outline" className="w-full justify-start h-auto p-4" onClick={balanceRandomly}>
              <div className="text-left">
                <div className="font-medium flex items-center gap-2">
                  <Shuffle className="h-4 w-4" />
                  Random — move a random player
                </div>
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
                <div className="font-medium flex items-center gap-2">
                  <MousePointerClick className="h-4 w-4" />
                  Manual — choose who moves
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Use Move Players mode to pick</div>
              </div>
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => {
              setBalanceDismissedKey(imbalanceKey(currentImbalance));
              setTableBalanceDialogOpen(false);
              setBalanceOptions(null);
            }}
          >
            Ignore for now
          </Button>
        </DialogContent>
      </Dialog>

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
