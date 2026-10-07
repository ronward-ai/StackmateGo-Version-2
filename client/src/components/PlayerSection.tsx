import { useState, useEffect, useRef } from 'react';
import { blindLevelIndex } from '@/lib/entryLimits';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, Download, Users, Trophy, Plus, PlusCircle, Check, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { currencyOf } from '@/lib/currency';
import { buyInOf, investedIn } from '@/lib/resultStats';
import { payoutAmount, prizePoolFor } from '@/lib/prizePool';
import EmptyState from '@/components/ui/empty-state';
import { resultRowsFor } from '@/lib/resultRows';
import { resultsCsvTable } from '@/lib/resultColumns';
import { toCsv, csvFilename, downloadCsv } from '@/lib/csv';
import { gameIsOver, finishedGameNote } from '@/lib/gameOver';
import ResultsTable from '@/components/ResultsTable';
import ResultsSheet from '@/components/export/ResultsSheet';
import { captureSheet, sheetFilename } from '@/components/export/captureSheet';
import { eventNameOf } from '@/lib/eventName';
import { addOnsOpen, lateEntryClosedReason } from '@/lib/entryLimits';
import { planSeating, assignSeats, tablesNeededFor, tableNamesFor } from '@/lib/seating';
import { ordinal } from '@/lib/ordinal';
// html2canvas is ~200 kB and only runs when the user exports a PNG, so it is
// imported dynamically at the call site rather than loaded on every page.
import { Player } from '@/types';
import { seasonLine } from '@/lib/seasonProgress';
import { type RecentPlayer } from '@/lib/recentPlayers';
import { useRecentPlayers } from '@/hooks/useRecentPlayers';
import PlayerEntryActions from '@/components/PlayerEntryActions';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

interface PlayerSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  /** Who holds the failsafe Rebuy, from `useRebuyOffer` on the page. */
  failsafeFor?: string | null;
}

export default function PlayerSection({ tournament, failsafeFor = null }: PlayerSectionProps) {
  const { state, addKnockout, addPlayer, removePlayer, processRebuy, eliminatePlayer, undoPlayerReturn } = tournament;
  const { toast } = useToast();

  /**
   * Put a player back in, and offer one tap to take it back.
   *
   * A misfired rebuy used to be unrecoverable without removing the player from
   * the tournament altogether — and since a return renumbers everyone who
   * busted after them, it is not a one-player mistake.
   */
  // The rebuy here is the failsafe for a misclick on the bust-out offer, which
  // `useRebuyOffer` keeps to the one bust-out it last witnessed. The offer
  // itself lives in components/RebuyOffer.tsx.
  const returnPlayerToTable = (action: 'rebuy' | 'reentry', playerId: string) => {
    if (action === 'rebuy') processRebuy(playerId);
    else tournament.processReEntry(playerId);

    const name = state.players.find(p => p.id === playerId)?.name ?? 'Player';
    toast({
      title: action === 'rebuy' ? `${name} bought back in` : `${name} re-entered`,
      description: 'Back in the tournament.',
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            const undone = undoPlayerReturn();
            toast(undone
              ? { title: 'Undone', description: `Reversed ${undone}.` }
              : {
                  title: 'Too late to undo',
                  description: 'The tournament has moved on since. Undo it by hand instead.',
                  variant: 'destructive' as const,
                });
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };
  const tournamentLeagueId = (state.settings as any)?.leagueId
    ?? (state.details as any)?.leagueId
    ?? null;
  const { calculatePoints } = useLeagueSettings(
    (state.details as any)?.ownerId,
    tournamentLeagueId ? String(tournamentLeagueId) : null
  );
  const [playerName, setPlayerName] = useState('');
  /** A player waiting on the late-entry confirmation. */
  const [pendingLateEntry, setPendingLateEntry] = useState<string | null>(null);

  const isLeagueMode =
    state.details?.type === 'season' ||
    (state.settings as any)?.isSeasonTournament === true;

  /**
   * The finishing order, derived ONCE for the rows on screen and the exported
   * image alike. They each used to work it out, and they disagreed: this screen
   * said "21th" past twentieth where the picture said "21st", the two spelled
   * "is the game over" differently, and the points chip was fed a raw buy-in
   * here and the `buyInOf` fallback there. See `lib/resultRows.ts`.
   */
  const resultRows = resultRowsFor(state.players, {
    prizeStructure: state.prizeStructure,
    settings: state.settings,
    isLeagueMode,
    calculatePoints,
  });

  /** Which columns this game can show at all — a feature switched off for the
   *  whole tournament draws nothing, the rule the Busted strip already follows. */
  const columnContext = { prizeStructure: state.prizeStructure, isLeagueMode };

  /** Names and sizes the picture, so it still means something in a group chat
   *  weeks later: `Spring 2026 · Game 4 of 13 · 9 players`.
   *
   *  The season block is read off `settings`, where `PokerTimer`'s one guarded
   *  writer puts it in league mode — the same place the participant's own card
   *  reads it. A standalone game has none, so `seasonLine` returns '' and the
   *  subtitle is the player count alone, with no stranded separator.
   *
   *  The count stays beside the season because it is the one fact a picture
   *  loses once the night is over; the standings sheet carries it too. */
  const subtitleForExport = [
    isLeagueMode ? seasonLine(state.settings as any) : '',
    `${state.players.length} player${state.players.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  // KO dialog state
  /** How many will not fit, when Seat Players has been pressed on too big a
   *  field. Null means no question is up — the count rather than a boolean
   *  because the dialog states it. */
  const [seatOverflow, setSeatOverflow] = useState<number | null>(null);
  const [bustOutDialogOpen, setBustOutDialogOpen] = useState(false);
  const [playerToBustOut, setPlayerToBustOut] = useState<Player | null>(null);
  const [hitmanId, setHitmanId] = useState<string | null>(null);

  // Follows the account — see hooks/useRecentPlayers.ts.
  const { recentPlayers, add: saveRecentPlayer, remove: removeRecentPlayer } = useRecentPlayers();
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [filteredNames, setFilteredNames] = useState<RecentPlayer[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [recentSearchTerm, setRecentSearchTerm] = useState('');
  const [playerToRemove, setPlayerToRemove] = useState<Player | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Cost helpers for confirmation dialogs
  const sym = currencyOf(state.settings);
  const ps = state.prizeStructure;

  // Recent players is not a setting.
  //
  // It was gated on `enableRecentPlayers`, which defaulted to false and lived
  // behind a titled "Player Options" panel at the top of this tab — the largest
  // element on the screen, controlling the smallest feature on it, and off for
  // everyone who never found it.
  //
  // Nothing here needs opting out of: the autocomplete fires only when what you
  // type matches a stored name, and the list below appears only when there are
  // names to offer.
  //
  // The × on each row needs no confirmation, deliberately: typing the name again
  // puts it straight back.

  // Get filtered recent players based on search term
  const getFilteredRecentPlayers = () => {
    const availablePlayers = recentPlayers.filter(player => 
      !state.players.some(p => p.name.toLowerCase() === player.name.toLowerCase())
    );

    if (!recentSearchTerm.trim()) {
      return availablePlayers.sort((a, b) => a.name.localeCompare(b.name));
    }

    const searchTerm = recentSearchTerm.toLowerCase();
    const filtered = availablePlayers.filter(player => 
      player.name.toLowerCase().includes(searchTerm)
    );

    // Sort with names starting with search term first, then alphabetically
    return filtered.sort((a, b) => {
      const aStartsWith = a.name.toLowerCase().startsWith(searchTerm);
      const bStartsWith = b.name.toLowerCase().startsWith(searchTerm);

      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  // Filter names based on input
  useEffect(() => {
    if (playerName.trim() && recentPlayers.length > 0) {
      const searchTerm = playerName.toLowerCase();
      const filtered = recentPlayers
        .filter(p => 
          p.name.toLowerCase().includes(searchTerm) &&
          !state.players.some(player => player.name.toLowerCase() === p.name.toLowerCase())
        )
        .sort((a, b) => {
          const aStartsWith = a.name.toLowerCase().startsWith(searchTerm);
          const bStartsWith = b.name.toLowerCase().startsWith(searchTerm);

          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          return a.name.localeCompare(b.name);
        });
      setFilteredNames(filtered);
      setShowAutocomplete(filtered.length > 0);
    } else {
      setFilteredNames([]);
      setShowAutocomplete(false);
    }
  }, [playerName, recentPlayers, state.players]);

  // Handle clicks/touches outside autocomplete (touch-safe for mobile/iPad)
  const handleClickOutside = (event: MouseEvent | TouchEvent) => {
    const target = event.target as HTMLElement;
    if (autocompleteRef.current && !autocompleteRef.current.contains(target)) {
      setShowAutocomplete(false);
    }
  };

  useEffect(() => {
    // Add both mouse and touch event listeners for cross-device compatibility
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  /**
   * The ONE way a player gets added, which both entry paths go through.
   *
   * Typing a name and picking one from the autocomplete used to add the player
   * independently, so a gate on one would simply be walked around by the other
   * — the shape of trap this codebase has paid for more than once.
   *
   * Late entry closing is a WARNING, not a refusal. Tournament Info states the
   * window, so the app must not ignore it silently; but someone genuinely
   * arriving at the door late is a fact about the world, and the director is
   * the one who gets to decide.
   */
  const blindLevel = blindLevelIndex(state.levels, state.currentLevel);
  const lateEntryClosed = lateEntryClosedReason(state.prizeStructure, blindLevel);

  const commitAddPlayer = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (state.players.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) return;
    addPlayer(trimmed);
    saveRecentPlayer(trimmed);
    setPlayerName('');
    setShowAutocomplete(false);
  };

  const attemptAddPlayer = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (state.players.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) return;
    if (lateEntryClosed) {
      setPendingLateEntry(trimmed);
      setShowAutocomplete(false);
      return;
    }
    commitAddPlayer(trimmed);
  };

  const handleAddPlayer = () => attemptAddPlayer(playerName);

  const handleSelectName = (name: string) => {
    setPlayerName(name);
    setShowAutocomplete(false);
    setTimeout(() => attemptAddPlayer(name), 100);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddPlayer();
    }
  };

  /** Players who could have knocked this one out — everyone still in, minus them. */
  const hitmanCandidates = state.players.filter(
    p => p.isActive !== false && p.id !== playerToBustOut?.id
  );

  // Heads-up: there is only one person it could have been, so pick them. Making
  // the director tap a single-item list before Confirm KO would enable reads as
  // a dead button — which is exactly how it was misread mid-game.
  useEffect(() => {
    if (bustOutDialogOpen && !hitmanId && hitmanCandidates.length === 1) {
      setHitmanId(hitmanCandidates[0].id);
    }
  }, [bustOutDialogOpen, hitmanId, hitmanCandidates]);

  const handleBustOut = () => {
    if (!playerToBustOut) return;
    // A hitman is only required when there is someone who could have done it.
    // Busting the last player standing has no attributable knockout, and
    // previously the Confirm button stayed disabled here — leaving the director
    // unable to close out the tournament at all.
    if (hitmanCandidates.length > 0 && !hitmanId) return;
    eliminatePlayer(playerToBustOut.id, hitmanId ?? undefined);
    setBustOutDialogOpen(false);
    setPlayerToBustOut(null);
    setHitmanId(null);
  };


  /**
   * Seat Players — reseats every active player from scratch.
   *
   * **This used to be a second seater with its own arithmetic, and that is what
   * the reported bug was.** It worked out `tablesNeeded` as
   * `min(ceil(field / seatsPerTable), numberOfTables)` and then divided the whole
   * field across that cap **without ever consulting `seatsPerTable` again** — so
   * 17 players on 2 tables of 8 gave `base = 8, extra = 1` and table one was
   * handed NINE chairs, seat indexes 0 to 8. The grid draws eight, so the ninth
   * player was a ghost: seated, invisible, no KO button, and the header read
   * `9/8 seated · -1 empty`, which was a faithful rendering of it.
   *
   * It does not mint chairs any more, because it does not do the arithmetic any
   * more: `planSeating` and `assignSeats` are the one derivation, shared with the
   * Seating tab's dialog. Two seaters disagreeing about how many chairs a table
   * has is the same fault as two answers to "which document is the console
   * driving" — and this one reached a director.
   *
   * When the field will not fit it ASKS rather than seating 16 of 17 quietly.
   */
  const seatsForAll = () => {
    const { numberOfTables, seatsPerTable = 9 } =
      state.settings.tables || { numberOfTables: 1, seatsPerTable: 9 };
    const activePlayers = state.players.filter(p => p.isActive !== false);
    return { activePlayers, numberOfTables, seatsPerTable };
  };

  /** Hand out the chairs, leaving anyone who does not fit honestly unseated. */
  const applySeating = (tableCount: number) => {
    const { updatePlayers } = tournament;
    const { activePlayers, seatsPerTable } = seatsForAll();
    if (activePlayers.length === 0) return;

    const cfg = { numberOfTables: tableCount, seatsPerTable };
    const plan = planSeating(activePlayers.length, cfg);
    // Every active player is being reseated, so no chair is held by anyone else.
    const seats = assignSeats(activePlayers.length, new Set<string>(), plan, cfg);
    const shuffled = [...seats].sort(() => Math.random() - 0.5);

    updatePlayers(state.players.map(p => {
      if (p.isActive === false) return p;
      const idx = activePlayers.findIndex(a => a.id === p.id);
      const seat = idx === -1 ? undefined : shuffled[idx];
      // A seat that does not exist is not a seat. Unseated is a state the whole
      // app already understands; seat 8 of an 8-seat table is not.
      return seat
        ? { ...p, seated: true, tableAssignment: seat }
        : { ...p, seated: false, tableAssignment: undefined };
    }));
  };

  const seatAllPlayers = () => {
    const { activePlayers, numberOfTables, seatsPerTable } = seatsForAll();
    if (activePlayers.length === 0) return;
    const { overflow } = planSeating(activePlayers.length, { numberOfTables, seatsPerTable });
    // Warn and never refuse — the same call lateEntryClosedReason makes. The
    // director is the one standing there, and seating most of the field is a
    // legitimate thing to want.
    if (overflow > 0) { setSeatOverflow(overflow); return; }
    applySeating(numberOfTables);
  };

  /** Add the tables the field actually needs, then seat everybody.
   *
   *  The count is passed through explicitly rather than read back from state:
   *  `updateSettings` is asynchronous as far as this tick is concerned, so
   *  `applySeating()` reading `state.settings` would use the OLD table count —
   *  the same trap the Seating tab's own "Add a table" had to avoid. */
  const addTablesAndSeat = () => {
    const { activePlayers, seatsPerTable } = seatsForAll();
    const needed = tablesNeededFor(activePlayers.length, seatsPerTable);
    tournament.updateSettings({
      tables: {
        numberOfTables: needed,
        seatsPerTable,
        tableNames: tableNamesFor(state.settings.tables?.tableNames, needed),
      },
    });
    setSeatOverflow(null);
    applySeating(needed);
  };

  // Seat a single late-entry player — emptiest table first, random seat within that table.
  const seatSinglePlayer = (player: Player) => {
    const { updatePlayers } = tournament;
    const currentPlayers = [...state.players];
    const { numberOfTables, seatsPerTable = 9 } = state.settings.tables || { numberOfTables: 1, seatsPerTable: 9 };

    // Build set of occupied seat keys
    const occupied = new Set(
      currentPlayers
        .filter(p => p.seated && p.tableAssignment)
        .map(p => `${p.tableAssignment!.tableIndex}-${p.tableAssignment!.seatIndex}`)
    );

    // Count active seated players per table
    const tableCount: Record<number, number> = {};
    for (let t = 0; t < numberOfTables; t++) tableCount[t] = 0;
    currentPlayers.forEach(p => {
      if (p.seated && p.isActive !== false && p.tableAssignment) {
        tableCount[p.tableAssignment.tableIndex] = (tableCount[p.tableAssignment.tableIndex] || 0) + 1;
      }
    });

    // Sort tables by occupancy ascending, try each for an empty seat
    const sorted = Object.entries(tableCount)
      .map(([t, count]) => ({ tableIndex: parseInt(t), count }))
      .sort((a, b) => a.count - b.count);

    let assignedSeat: { tableIndex: number; seatIndex: number } | null = null;
    for (const { tableIndex } of sorted) {
      const emptySeats: number[] = [];
      for (let s = 0; s < seatsPerTable; s++) {
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
      updatePlayers(currentPlayers.map(p =>
        p.id === player.id ? { ...p, seated: true, tableAssignment: seat } : p
      ));
    }
  };

  // Handle export image functionality — builds a fresh off-screen DOM from
  // state data so no scroll-container clipping can affect the output.
  /**
   * The results, as a picture.
   *
   * Was ~130 lines of `document.createElement` and `cssText` building a parallel
   * DOM by hand — which is why its ordinal was right while the row on screen said
   * "21th", why it fed the points formula a different buy-in, and why it needed
   * `TONE_STYLES`, a hand-kept second copy of the badge palette. It renders the
   * same rows the screen does now, through one capture.
   */
  const handleExportImage = async () => {
    setIsExporting(true);
    try {
      await captureSheet(
        <ResultsSheet
          title={eventNameOf(state.settings) || 'Tournament results'}
          subtitle={subtitleForExport}
          rows={resultRows}
          settings={state.settings}
          columnContext={columnContext}
          currencySymbol={currencyOf(state.settings)}
        />,
        { filename: sheetFilename(['tournament-results']) },
      );
    } catch (error) {
      console.error('Error exporting players & rankings:', error);
      toast({
        title: 'Could not save the image',
        description: 'The results image could not be created. Try again, or take a screenshot.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * The results, as a spreadsheet — the same rows and columns the table and the
   * image draw, through `resultsCsvTable`, so a figure cannot read one way on
   * screen and another in the file. Escaping and formula defusing are
   * `lib/csv.ts`'s, as for the standings: player names are typed in.
   */
  const handleExportCsv = () => {
    const { headers, rows } = resultsCsvTable(
      resultRows, state.settings.resultColumns, columnContext, currencyOf(state.settings),
    );
    const name = csvFilename([eventNameOf(state.settings) || 'tournament', 'results']);
    if (!downloadCsv(name, toCsv(headers, rows))) {
      toast({
        title: 'Could not save the file',
        description: 'The download was blocked. Try again, or use a different browser.',
        variant: 'destructive',
      });
    }
  };

  // `isActive !== false`, not truthy: an ABSENT flag means active everywhere in
  // this app, and a player restored from a Firestore round-trip may carry none.
  const activePlayers = state.players.filter(p => p.isActive !== false);

  /** The table configuration, spelled once for the overflow dialog. Same
   *  fallback as the seater, which is the point of having it here. */
  const tablesConfigured = state.settings.tables || { numberOfTables: 1, seatsPerTable: 9 };
  /** Who the seater will actually try to seat. `isActive !== false`, not
   *  `isActive`, because an absent flag means active everywhere in this app —
   *  and the dialog must count the same heads the seating does. */
  const seatableCount = state.players.filter(p => p.isActive !== false).length;

  // `lib/gameOver.ts`, not a fourth spelling of it. The old one was
  // `(active === 0 && eliminated > 0) || (active === 1 && eliminated > 0)` off a
  // TRUTHY active filter — and its `=== 1` arm is the dead predicate CLAUDE.md
  // records, since `eliminatePlayer` awards position 1 and `isActive: false` in
  // the same update, so a finished game has ZERO active players, never one.
  const tournamentFinished = gameIsOver(state.players);
  const finishedNote = finishedGameNote(state.players);

  

  return (
    <Card className="p-4 card-glass">
      <div className="flex items-center justify-between">
        {/* Once finished every player is marked inactive — including the winner —
            so the live count would read "(0)" and look like an empty state right
            where the final standings are. Switch to a results heading instead,
            which also gives the Export button next to it some context. */}
        <h2 className="text-xl font-semibold flex items-center">
          {tournamentFinished
            ? <Trophy className="mr-2 h-5 w-5 text-orange-500" />
            : <Users className="mr-2 h-5 w-5 text-orange-500" />}
          {tournamentFinished
            ? `Final Results (${state.players.length})`
            : `Players & Rankings (${activePlayers.length})`}
        </h2>
        <div className="flex items-center gap-2">
          {/* Export button — only shown once the tournament is finished.
              Labelled rather than icon-only: a bare download arrow appearing in
              the header gave no clue what it did, and read as detached from the
              results it saves. */}
          {tournamentFinished && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleExportCsv();
              }}
              title="Download the results as a spreadsheet"
              className="h-8 px-3 gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="text-xs">CSV</span>
            </Button>
          )}
          {tournamentFinished && (
            <Button
              variant="success"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleExportImage();
              }}
              disabled={isExporting}
              title="Save the final rankings as an image you can share"
              className="h-8 px-3 gap-1.5"
            >
              <Download className={`h-4 w-4 ${isExporting ? 'animate-pulse' : ''}`} />
              <span className="text-xs">{isExporting ? 'Saving…' : 'Export Results'}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="pt-4 space-y-4">
        {/* Add Player Section - Mobile Optimized.

            NOT MOUNTED once the game is over — a finished game takes no new
            entries (lib/gameOver.ts's finishedGameNote). Recent Players goes with
            it, because every name in that list is an add button. One line of
            text says what is true and names both ways forward; a greyed input
            would read as the app being broken. The action in useTournament
            refuses it too, so this is the screen agreeing with the rule. */}
        {finishedNote ? (
          <p className="text-label text-muted-foreground">{finishedNote}</p>
        ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative" ref={autocompleteRef}>
              <Input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter player name..."
                className="w-full px-3 py-3 text-base focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
              />

              {/* Autocomplete dropdown */}
              {showAutocomplete && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {filteredNames.map((player) => (
                    <button
                      key={player.name}
                      onClick={() => handleSelectName(player.name)}
                      className="w-full px-3 py-2 text-left text-body text-foreground hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* The Players tab's primary action. */}
            <Button
              onClick={handleAddPlayer}
              className="flex items-center justify-center gap-1 font-medium py-2 px-3"
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </Button>
          </div>

          {/* Quick Add Recent Players - Compact View */}
          {recentPlayers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllRecent(!showAllRecent)}
                  className="text-label text-muted-foreground hover:text-foreground h-6 px-0 font-medium"
                >
                  Recent Players ({recentPlayers.length})
                </Button>
                {showAllRecent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllRecent(false)}
                    className="text-label text-muted-foreground hover:text-foreground h-6 px-2"
                  >
                    Show Less
                  </Button>
                )}
              </div>

              {showAllRecent && (
                // Show all recent players in a more organized way
                <div className="space-y-3">
                  <Input
                    type="text"
                    placeholder="Search recent players..."
                    value={recentSearchTerm}
                    onChange={(e) => setRecentSearchTerm(e.target.value)}
                    className="h-8 text-label"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {getFilteredRecentPlayers().map((player) => (
                      <div
                        key={player.name}
                        className="flex items-center justify-between gap-2 p-2 hover:bg-white/5 rounded"
                      >
                        <button
                          type="button"
                          className="flex-1 text-left text-body text-foreground"
                          onClick={() => handleSelectName(player.name)}
                        >
                          {player.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${player.name} from recent players`}
                          title="Remove from this list"
                          className="text-muted-foreground hover:text-destructive p-1 rounded"
                          onClick={() => removeRecentPlayer(player.name)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {getFilteredRecentPlayers().length === 0 && recentSearchTerm && (
                      <div className="text-center text-label text-muted-foreground py-2">
                        No players found matching "{recentSearchTerm}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Seat Players — centred above player list, visible while unseated players exist */}
        {activePlayers.length > 0 && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={seatAllPlayers}
              className="text-xs border-purple-500/50 text-purple-400 hover:bg-purple-500/10 px-4"
            >
              {state.players.some(p => p.isActive !== false && p.seated)
                ? 'Reseat All Players'
                : 'Seat Players'}
            </Button>
          </div>
        )}

        {/* MORE PLAYERS THAN SEATS.
            The warning the director asked for, and it warns rather than refusing
            — the call lateEntryClosedReason already makes for someone walking in
            late. Seating most of a field is a legitimate thing to want; minting a
            ninth chair at an eight-seat table, which is what this replaced, is
            not. The offer to add tables works the count out itself, because
            "how many more do I need" is the arithmetic a director does in their
            head at the busiest moment of the night. */}
        <AlertDialog open={seatOverflow !== null} onOpenChange={o => { if (!o) setSeatOverflow(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>More players than seats</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    {seatableCount} players, and {tablesConfigured.numberOfTables}
                    {tablesConfigured.numberOfTables === 1 ? ' table of ' : ' tables of '}
                    {tablesConfigured.seatsPerTable} seats
                    {' '}— {tablesConfigured.numberOfTables * tablesConfigured.seatsPerTable} in all.
                  </p>
                  <p className="text-muted-foreground">
                    {seatOverflow === 1
                      ? 'One player will be left unseated.'
                      : `${seatOverflow} players will be left unseated.`}
                    {' '}They stay in the tournament and can be seated by hand from the Seating tab.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="outline"
                onClick={addTablesAndSeat}
              >
                Use {tablesNeededFor(seatableCount, tablesConfigured.seatsPerTable)} tables and seat everyone
              </Button>
              <AlertDialogAction
                onClick={() => { const n = tablesConfigured.numberOfTables; setSeatOverflow(null); applySeating(n); }}
              >
                Seat {seatableCount - (seatOverflow || 0)} of {seatableCount}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Players List with Rankings - Mobile Optimized */}
        <div className="space-y-2">
          {resultRows.length === 0 ? (
            <EmptyState icon={Users} className="fade-in" title="No players yet">
              Add players above to track knockouts, rebuys and standings through the night.
            </EmptyState>
          ) : (
            /* A table, not a strip of chips — the standings read better because
               every row has the same shape, and this is the same roster. The
               columns are the director's, from lib/resultColumns.ts, and the
               exported image renders from the identical list. */
            <ResultsTable
              rows={resultRows}
              settings={state.settings}
              columnContext={columnContext}
              actions={row => {
                const player = row.player as Player;
                return (
                  <>
                      {player.isActive !== false && !player.seated && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => seatSinglePlayer(player)}
                          className="text-xs bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10 px-2 py-1 font-medium h-7"
                        >
                          Seat
                        </Button>
                      )}

                      {player.isActive !== false && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlayerToBustOut(player);
                            setHitmanId(null);
                            setBustOutDialogOpen(true);
                          }}
                          className="h-7 w-10 bg-red-500/80 hover:bg-red-500 text-white rounded text-caption font-bold flex-shrink-0 transition-colors"
                        >
                          KO
                        </button>
                      )}

                      {/* The same controls the seating screen shows, from one
                          implementation — see PlayerEntryActions. This screen used
                          to draw the rebuy button DISABLED and silent while the
                          seating screen HID it, so a used-up cap looked like two
                          different bugs. Both now say why. */}
                      {player.isActive === false && (
                        <PlayerEntryActions
                          player={player}
                          failsafeFor={failsafeFor}
                          prizeStructure={state.prizeStructure}
                          onRebuy={id => returnPlayerToTable('rebuy', id)}
                          settings={state.settings}
                          currentLevel={blindLevel}
                          onReEntry={id => returnPlayerToTable('reentry', id)}
                          gameOver={tournamentFinished}
                        />
                      )}

                      {player.isActive !== false && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-400 hover:text-red-300 hover:bg-red-900/20 w-8 h-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Player?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove <strong>{player.name}</strong> from the tournament?
                                This action cannot be undone and will permanently delete their tournament data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removePlayer(player.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Remove Player
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                  </>
                );
              }}
            />
          )}
        </div>

        {/* The standalone Rebuys and Re-entries lists that used to sit here are
            gone. Eliminated players already carry both actions on their own row,
            behind a dialog showing the cost — these duplicated them as bare
            name-buttons that fired on a single tap with no confirmation, which is
            how a player got put back into a live game by accident. An accidental
            rebuy also renumbers everyone who busted after them, so it is not a
            one-player mistake. The Add-on section below stays: add-ons apply to
            active players, who have no row button, and it already confirms. */}

        {/* Add-on Section - Compact - Only show when add-ons are enabled and level reached */}
        {addOnsOpen(state.prizeStructure, blindLevel) &&
          state.players.filter(p => p.isActive !== false).length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#2a2a2a]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                <span>Add-ons (Level {state.prizeStructure?.addonAvailableLevel || 1}+)</span>
              </h4>
              <span className="text-xs text-green-400">Available</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {state.players.filter(p => p.isActive !== false).map((player) => {
                const hasAddon = (player.addons || 0) > 0;

                if (hasAddon) {
                  return (
                    <Button
                      key={player.id}
                      variant="outline"
                      size="sm"
                      disabled
                      className="text-xs flex items-center gap-1 bg-gray-600 text-gray-300 cursor-not-allowed"
                    >
                      <Check className="h-4 w-4" />
                      {player.name}
                    </Button>
                  );
                }

                return (
                  <AlertDialog key={player.id}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs flex items-center gap-1 bg-card border border-amber-500 text-amber-400 hover:bg-amber-500/10"
                      >
                        <PlusCircle className="h-4 w-4" />
                        {player.name}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Add-on for {player.name}?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between"><span>Add-on cost</span><span>{sym}{ps?.addonAmount || 0}</span></div>
                            <div className="flex justify-between text-muted-foreground"><span>Chips received</span><span>{(ps?.addonChips || ps?.startingChips || 10000).toLocaleString()}</span></div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => tournament.processAddon(player.id)}>Confirm Add-on</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bust Out Dialog */}
      <Dialog open={bustOutDialogOpen} onOpenChange={setBustOutDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {hitmanCandidates.length === 0
                ? `Finish Tournament — ${playerToBustOut?.name}`
                : `Bust Out — ${playerToBustOut?.name}`}
            </DialogTitle>
            <DialogDescription>
              {hitmanCandidates.length === 0
                ? 'No one left to attribute a knockout to — this closes out the tournament.'
                : 'Who knocked them out?'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-2 max-h-64 overflow-y-auto">
            {hitmanCandidates
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
            {hitmanCandidates.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Last player standing — no knockout to record.
              </p>
            )}
          </div>
          {/* Say why the button is unavailable. A silently disabled button reads
              as broken, which is how this was misread during a live game. */}
          {hitmanCandidates.length > 0 && !hitmanId && (
            <p className="text-center text-xs text-amber-400/90">
              Tap who knocked them out to continue
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setBustOutDialogOpen(false)}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={hitmanCandidates.length > 0 && !hitmanId}
              onClick={handleBustOut}
            >
              {hitmanCandidates.length === 0 ? 'Finish Tournament' : 'Confirm KO'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Late entry closed — warn, do not refuse. See attemptAddPlayer. */}
      <AlertDialog
        open={!!pendingLateEntry}
        onOpenChange={open => { if (!open) setPendingLateEntry(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Late entry has closed</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>{lateEntryClosed}. You are on level {blindLevel + 1}.</p>
                <p>
                  Add <span className="font-medium text-foreground">{pendingLateEntry}</span> anyway?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingLateEntry) commitAddPlayer(pendingLateEntry);
                setPendingLateEntry(null);
              }}
            >
              Add anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}