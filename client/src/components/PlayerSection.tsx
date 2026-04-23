import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, Download, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';
import { Player } from '@/types';
import { useLeague } from '@/hooks/useLeague';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';

interface RecentPlayer {
  name: string;
  lastUsed: number;
}

interface PlayerSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function PlayerSection({ tournament }: PlayerSectionProps) {
  const { state, addKnockout, addPlayer, removePlayer, processRebuy, eliminatePlayer, calculatePrizePool } = tournament;
  const { leaguePlayers } = useLeague();
  const tournamentLeagueId = (state.settings as any)?.leagueId
    ?? (state.details as any)?.leagueId
    ?? null;
  const { calculatePoints } = useLeagueSettings(
    (state.details as any)?.ownerId,
    tournamentLeagueId ? String(tournamentLeagueId) : null
  );
  const [playerName, setPlayerName] = useState('');

  const isLeagueMode =
    state.details?.type === 'season' ||
    (state.settings as any)?.isSeasonTournament === true;

  // KO dialog state
  const [bustOutDialogOpen, setBustOutDialogOpen] = useState(false);
  const [playerToBustOut, setPlayerToBustOut] = useState<Player | null>(null);
  const [hitmanId, setHitmanId] = useState<string | null>(null);

  const [recentPlayers, setRecentPlayers] = useState<RecentPlayer[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [filteredNames, setFilteredNames] = useState<RecentPlayer[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [showLeagueRoster, setShowLeagueRoster] = useState(false);
  const [recentSearchTerm, setRecentSearchTerm] = useState('');
  const [playerToRemove, setPlayerToRemove] = useState<Player | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const autocompleteRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Load recent players from localStorage when feature is enabled
  useEffect(() => {
    if (state.settings.enableRecentPlayers) {
      loadRecentPlayers();
    } else {
      // Reset state when feature is disabled
      setShowAllRecent(false);
      setRecentSearchTerm('');
      setRecentPlayers([]);
    }
  }, [state.settings.enableRecentPlayers]);

  // Load recent players from localStorage
  const loadRecentPlayers = () => {
    try {
      const stored = localStorage.getItem('recentPlayers');
      if (stored) {
        const parsed = JSON.parse(stored) as RecentPlayer[];
        setRecentPlayers(parsed);
      }
    } catch (error) {
      console.error('Failed to load recent players:', error);
    }
  };

  // Save recent players to localStorage
  const saveRecentPlayer = (name: string) => {
    if (!state.settings.enableRecentPlayers) return;

    try {
      const trimmedName = name.trim();
      if (!trimmedName) return;

      const existing = recentPlayers.filter(p => p.name.toLowerCase() !== trimmedName.toLowerCase());
      const updated = [
        { name: trimmedName, lastUsed: Date.now() },
        ...existing
      ].slice(0, 20); // Keep only 20 most recent

      setRecentPlayers(updated);
      localStorage.setItem('recentPlayers', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save recent player:', error);
    }
  };

  // Get frequently used players (recent 8)
  const getFrequentPlayers = () => {
    if (!state.settings.enableRecentPlayers) return [];

    return recentPlayers
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 8)
      .map(p => p.name)
      .filter(name => !state.players.some(player => player.name.toLowerCase() === name.toLowerCase()));
  };

  // Get filtered recent players based on search term
  const getFilteredRecentPlayers = () => {
    if (!state.settings.enableRecentPlayers) return [];

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
    if (state.settings.enableRecentPlayers && playerName.trim() && recentPlayers.length > 0) {
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
  }, [playerName, recentPlayers, state.players, state.settings.enableRecentPlayers]);

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

  const handleAddPlayer = () => {
    const trimmed = playerName.trim();
    if (trimmed && !state.players.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      addPlayer(trimmed);
      saveRecentPlayer(trimmed);
      setPlayerName('');
      setShowAutocomplete(false);
    }
  };

  const handleSelectName = (name: string) => {
    setPlayerName(name);
    setShowAutocomplete(false);
    // Auto-add the player
    setTimeout(() => {
      if (!state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        addPlayer(name);
        saveRecentPlayer(name);
        setPlayerName('');
      }
    }, 100);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddPlayer();
    }
  };

  const handleBustOut = () => {
    if (!playerToBustOut || !hitmanId) return;
    eliminatePlayer(playerToBustOut.id, hitmanId);
    setTimeout(() => addKnockout(hitmanId), 100);
    setBustOutDialogOpen(false);
    setPlayerToBustOut(null);
    setHitmanId(null);
  };


  // Seat Players — reseats ALL active players from scratch each time.
  // Uses the minimum number of tables needed so no table exceeds seatsPerTable.
  // e.g. 6 players, 8-seat tables → 1 table (all together)
  //      10 players, 8-seat tables → 2 tables (5 + 5)
  //      18 players, 8-seat tables → 3 tables (6 + 6 + 6)
  const seatAllPlayers = () => {
    const { updatePlayers } = tournament;
    const currentPlayers = [...state.players];
    const tables = state.settings.tables || { numberOfTables: 1, seatsPerTable: 9 };
    const { numberOfTables, seatsPerTable = 9 } = tables;

    const activePlayers = currentPlayers.filter(p => p.isActive !== false);
    if (activePlayers.length === 0) return;

    const totalN = activePlayers.length;

    // Minimum tables needed so no table exceeds seatsPerTable, capped at configured tables
    const tablesNeeded = Math.min(Math.max(1, Math.ceil(totalN / seatsPerTable)), numberOfTables);
    const base  = Math.floor(totalN / tablesNeeded);
    const extra = totalN % tablesNeeded; // first 'extra' tables get base+1 players

    // Build seat list distributed evenly across tablesNeeded tables
    const seats: { tableIndex: number; seatIndex: number }[] = [];
    for (let t = 0; t < tablesNeeded; t++) {
      const count = t < extra ? base + 1 : base;
      for (let s = 0; s < count; s++) {
        seats.push({ tableIndex: t, seatIndex: s });
      }
    }

    // Fisher-Yates shuffle for random assignment
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }

    // Reseat all active players; leave eliminated players untouched
    const updatedPlayers = currentPlayers.map(p => {
      if (p.isActive === false) return p;
      const idx = activePlayers.findIndex(a => a.id === p.id);
      return idx !== -1 ? { ...p, seated: true, tableAssignment: seats[idx] } : p;
    });

    updatePlayers(updatedPlayers);
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
  const handleExportImage = async () => {
    setIsExporting(true);
    try {
      const sym = state.settings.currency || '£';
      const ps = state.prizeStructure;
      const buyIn = ps?.buyIn || 0;
      const totalRebuys = state.players.reduce((s, p) => s + (p.rebuys || 0), 0);
      const totalAddons = state.players.reduce((s, p) => s + (p.addons || 0), 0);
      const totalReEntries = state.players.reduce((s, p) => s + (p.reEntries || 0), 0);
      const gross = (buyIn * state.players.length)
        + ((ps?.rebuyAmount || 0) * totalRebuys)
        + ((ps?.addonAmount || 0) * totalAddons)
        + (buyIn * totalReEntries);
      const rakeableEntries = state.players.length + (ps?.allowReEntry ? totalReEntries : 0);
      const rake = (ps?.rakeType || 'percentage') === 'percentage'
        ? Math.floor(buyIn * ((ps?.rakePercentage || 0) / 100)) * rakeableEntries
        : (ps?.rakeAmount || 0) * rakeableEntries;
      const prizePool = Math.max(0, gross - rake);

      const sorted = [...state.players].sort((a, b) => {
        if (a.isActive !== false && b.isActive === false) return -1;
        if (a.isActive === false && b.isActive !== false) return 1;
        return (a.position || 999) - (b.position || 999);
      });

      // Build off-screen container — no overflow, no height limits
      const wrap = document.createElement('div');
      wrap.style.cssText = [
        'position:fixed', 'left:-9999px', 'top:0',
        'width:700px', 'background:#1e1e1e',
        'padding:20px', 'font-family:system-ui,sans-serif',
        'box-sizing:border-box'
      ].join(';');

      sorted.forEach(player => {
        const pos = player.position || 0;
        const rankText = pos === 1 ? '1st' : pos === 2 ? '2nd' : pos === 3 ? '3rd'
          : pos > 0 ? `${pos}th` : 'Active';
        const rankBg = pos === 1 ? '#f59e0b' : pos === 2 ? '#d1d5db' : pos === 3 ? '#d97706'
          : pos > 0 ? '#7f1d1d' : '#16a34a';
        const rankFg = pos <= 2 ? '#000' : '#fff';

        // Winnings
        let winnings = 0;
        if (ps?.enableBounties && ps?.bountyAmount) {
          const kos = player.knockouts || 0;
          winnings += pos === 1 ? (kos + 1) * ps.bountyAmount : kos * ps.bountyAmount;
        }
        if (pos > 0 && ps?.manualPayouts) {
          const payout = ps.manualPayouts.find((p: any) => p.position === pos);
          if (payout?.percentage > 0) winnings += Math.floor(prizePool * payout.percentage / 100);
        }

        const row = document.createElement('div');
        row.style.cssText = [
          'display:flex', 'align-items:center', 'justify-content:space-between',
          'padding:10px 12px', 'margin-bottom:8px',
          'background:#1a1a1a', 'border-radius:8px',
          'border:1px solid #2a2a2a'
        ].join(';');

        // Left: rank badge + name
        const left = document.createElement('div');
        left.style.cssText = 'display:flex;align-items:center;gap:10px;';

        const badge = document.createElement('span');
        badge.textContent = rankText;
        badge.style.cssText = `background:${rankBg};color:${rankFg};padding:5px 9px;border-radius:5px;font-size:13px;font-weight:700;white-space:nowrap;`;

        const name = document.createElement('span');
        name.textContent = player.name;
        name.style.cssText = 'font-size:17px;font-weight:700;color:#fff;';

        left.append(badge, name);

        // Right: info badges
        const right = document.createElement('div');
        right.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;';

        const addBadge = (text: string, bg: string, fg = '#fff') => {
          const b = document.createElement('span');
          b.textContent = text;
          b.style.cssText = `background:${bg};color:${fg};padding:5px 9px;border-radius:5px;font-size:12px;font-weight:600;white-space:nowrap;`;
          right.appendChild(b);
        };

        if (player.seated && player.tableAssignment)
          addBadge(`T${player.tableAssignment.tableIndex + 1}S${player.tableAssignment.seatIndex + 1}`, '#1d4ed8', '#bfdbfe');
        if ((player.knockouts || 0) > 0)
          addBadge(`KO x${player.knockouts}`, '#9a3412', '#fed7aa');
        if (player.isActive === false && player.eliminatedBy) {
          const killer = state.players.find(p => String(p.id) === String(player.eliminatedBy));
          if (killer) addBadge(`out: ${killer.name}`, '#7f1d1d');
        }
        if ((player.rebuys || 0) > 0)
          addBadge(`R x${player.rebuys}`, '#581c87', '#e9d5ff');
        if (winnings > 0)
          addBadge(`${sym}${winnings}`, '#14532d', '#86efac');
        // League points
        if (isLeagueMode && pos > 0) {
          const pts = calculatePoints(pos, state.players.length, player.knockouts || 0, buyIn, 0, 0);
          if (pts > 0) addBadge(`${pts} pts`, '#713f12', '#fde68a');
        }

        row.append(left, right);
        wrap.appendChild(row);
      });

      document.body.appendChild(wrap);
      await new Promise(resolve => setTimeout(resolve, 80));

      const canvas = await html2canvas(wrap, {
        backgroundColor: '#1e1e1e',
        scale: 2,
        useCORS: true,
        allowTaint: false,
      } as any);

      document.body.removeChild(wrap);

      const link = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      link.download = `tournament-results-${date}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (error) {
      console.error('Error exporting players & rankings:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Calculate active players
  const activePlayers = state.players.filter(p => p.isActive);

  // Check if tournament is finished (all players eliminated OR only one active player remaining)
  const eliminatedPlayers = state.players.filter(p => p.isActive === false);
  const tournamentFinished = (activePlayers.length === 0 && eliminatedPlayers.length > 0) || 
                            (activePlayers.length === 1 && eliminatedPlayers.length > 0);

  

  return (
    <Card className="p-4 bg-gradient-to-r from-teal-600/10 to-blue-600/10 border border-teal-500/20">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-orange-500">group</span>
          Players & Rankings ({activePlayers.length})
        </h2>
        <div className="flex items-center gap-2">
          {/* Export button - only show when tournament is finished */}
          {tournamentFinished && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleExportImage();
              }}
              disabled={isExporting}
              className="h-8 px-2"
            >
              <Download className={`h-4 w-4 ${isExporting ? 'animate-pulse' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      <div className="pt-4 space-y-4" ref={exportRef}>
        {/* Add Player Section - Mobile Optimized */}
        <div className="space-y-3 export-hide">
          <div className="flex gap-2">
            <div className="flex-1 relative" ref={autocompleteRef}>
              <Input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter player name..."
                className="w-full px-3 py-3 text-base bg-[#1a1a1a] border border-[#2a2a2a] rounded-md text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />

              {/* Autocomplete dropdown */}
              {showAutocomplete && state.settings.enableRecentPlayers && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {filteredNames.map((player) => (
                    <button
                      key={player.name}
                      onClick={() => handleSelectName(player.name)}
                      className="w-full px-3 py-2 text-left text-white hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] focus:outline-none"
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button 
              onClick={handleAddPlayer}
              variant="outline"
              className="btn-add-player flex items-center justify-center gap-1 font-medium py-2 px-3 rounded-lg transition-all duration-200"
            >
              <span className="material-icons text-sm">add</span>
              <span>Add</span>
            </Button>
          </div>

          {/* League Roster Quick-Add - shown in league mode, behind toggle */}
          {isLeagueMode && leaguePlayers.length > 0 && (() => {
            // Deduplicate by name (Firestore may have stale duplicate docs)
            const seen = new Set<string>();
            const available = leaguePlayers
              .filter((lp: any) => {
                const key = (lp.name || '').toLowerCase();
                if (!key || state.players.some(p => p.name.toLowerCase() === key) || seen.has(key)) return false;
                seen.add(key);
                return true;
              })
              .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLeagueRoster(v => !v)}
                    className="text-xs text-blue-400 hover:text-blue-300 h-6 px-0 font-medium"
                  >
                    <Users className="h-3 w-3 mr-1" />
                    League Roster ({available.length} available)
                  </Button>
                  {showLeagueRoster && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowLeagueRoster(false)}
                      className="text-xs text-blue-400 hover:text-blue-300 h-6 px-2"
                    >
                      Show Less
                    </Button>
                  )}
                </div>
                {showLeagueRoster && available.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {available.map((lp: any) => (
                      <button
                        key={lp.id}
                        onClick={() => handleSelectName(lp.name)}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 hover:text-blue-200 transition-colors"
                      >
                        {lp.name}
                      </button>
                    ))}
                  </div>
                )}
                {showLeagueRoster && available.length === 0 && (
                  <p className="text-xs text-muted-foreground">All league players already added.</p>
                )}
              </div>
            );
          })()}

          {/* Quick Add Recent Players - Compact View */}
          {state.settings.enableRecentPlayers && recentPlayers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllRecent(!showAllRecent)}
                  className="text-xs text-gray-400 hover:text-gray-300 h-6 px-0 font-medium"
                >
                  Recent Players ({recentPlayers.length})
                </Button>
                {showAllRecent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllRecent(false)}
                    className="text-xs text-blue-400 hover:text-blue-300 h-6 px-2"
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
                    className="h-8 text-sm bg-[#1a1a1a] border-[#2a2a2a]"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {getFilteredRecentPlayers().map((player) => (
                      <div
                        key={player.name}
                        className="flex items-center p-2 hover:bg-[#2a2a2a] rounded cursor-pointer"
                        onClick={() => handleSelectName(player.name)}
                      >
                        <span className="text-sm text-white">{player.name}</span>
                      </div>
                    ))}
                    {getFilteredRecentPlayers().length === 0 && recentSearchTerm && (
                      <div className="text-center text-sm text-gray-400 py-2">
                        No players found matching "{recentSearchTerm}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Seat Players — centred above player list, visible while unseated players exist */}
        {activePlayers.length > 0 && (
          <div className="flex justify-center export-hide">
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

        {/* Players List with Rankings - Mobile Optimized */}
        <div className="space-y-2">
          {/* Helper functions for rankings */}
          {(() => {
            const currencySymbol = state.settings.currency || '£';
            
            const buyInAmount = state.prizeStructure?.buyIn || 0;
            const rebuyAmount = state.prizeStructure?.rebuyAmount || 0;
            const addonAmount = state.prizeStructure?.addonAmount || 0;
            const rakePercentage = state.prizeStructure?.rakePercentage || 0;
            const rakeAmountFixed = state.prizeStructure?.rakeAmount || 0;
            const rakeType = state.prizeStructure?.rakeType || 'percentage';
            
            const totalRebuys = state.players.reduce((sum, p) => sum + (p.rebuys || 0), 0);
            const totalAddons = state.players.reduce((sum, p) => sum + (p.addons || 0), 0);
            const totalReEntries = state.players.reduce((sum, p) => sum + (p.reEntries || 0), 0);
            const grossPrizePool = (buyInAmount * state.players.length) + (rebuyAmount * totalRebuys) + (addonAmount * totalAddons) + (buyInAmount * totalReEntries);

            const allowReEntry = state.prizeStructure?.allowReEntry || false;
            const rakeableEntries = state.players.length + (allowReEntry ? totalReEntries : 0);
            const rakeAmount = rakeType === 'percentage'
              ? Math.floor(buyInAmount * (rakePercentage / 100)) * rakeableEntries
              : rakeAmountFixed * rakeableEntries;

            const totalPrizePool = Math.max(0, grossPrizePool - rakeAmount);

            const calculatePlayerWinnings = (player: any): number => {
              let totalWinnings = 0;

              // Add bounty winnings for eliminations
              if (state.prizeStructure?.enableBounties && state.prizeStructure?.bountyAmount) {
                const knockouts = player.knockouts || 0;

                // Only the winner (position 1) gets their own bounty back plus knockout bounties
                if (player.position === 1) {
                  totalWinnings += (knockouts + 1) * state.prizeStructure.bountyAmount;
                } else {
                  // All other players (active or eliminated) only get knockout bounties
                  totalWinnings += knockouts * state.prizeStructure.bountyAmount;
                }
              }

              // Add position-based prize money
              if (player.position && player.position > 0 && state.prizeStructure?.manualPayouts) {
                const positionPayout = state.prizeStructure.manualPayouts.find((p: any) => p.position === player.position);
                if (positionPayout && positionPayout.percentage > 0) {
                  const prizeAmount = Math.floor((totalPrizePool * positionPayout.percentage) / 100);
                  totalWinnings += prizeAmount;
                }
              }

              return totalWinnings;
            };

            // Sort players by position: active players first (no position), then by position (1st, 2nd, 3rd, etc.)
            const sortedPlayers = [...state.players].sort((a, b) => {
              // Active players (no position) come first
              if (a.isActive !== false && b.isActive === false) return -1;
              if (a.isActive === false && b.isActive !== false) return 1;

              // Both active - sort by name
              if (a.isActive !== false && b.isActive !== false) {
                return a.name.localeCompare(b.name);
              }

              // Both eliminated - sort by position (1st, 2nd, 3rd, etc.)
              const aPos = a.position || 999;
              const bPos = b.position || 999;
              return aPos - bPos;
            });

            if (sortedPlayers.length === 0) {
              return (
                <div className="empty-state fade-in">
                  <div className="empty-state-icon">
                    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="empty-state-title">No players registered</div>
                  <div className="empty-state-description">Add players using the form above to track knockouts, rebuys, and standings</div>
                </div>
              );
            }

            return sortedPlayers.map((player) => {
              const winnings = calculatePlayerWinnings(player);

              // Check if player has been eliminated (has a position)
              let displayRank = "Active";
              let rankBadgeClass = "bg-green-600 text-white";

              if (player.position && player.position > 0) {
                if (player.position === 1) {
                  displayRank = "1st";
                  rankBadgeClass = "bg-yellow-500 text-black";
                } else if (player.position === 2) {
                  displayRank = "2nd";
                  rankBadgeClass = "bg-gray-300 text-black";
                } else if (player.position === 3) {
                  displayRank = "3rd";
                  rankBadgeClass = "bg-amber-600 text-white";
                } else {
                  displayRank = `${player.position}th`;
                  rankBadgeClass = "bg-red-900 text-white";
                }
              }

              return (
                <div
                  key={player.id}
                  className="flex flex-col sm:flex-row sm:items-center p-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] hover:bg-[#1e1e1e] transition-colors gap-3"
                >
                  <div className="flex items-center justify-between w-full sm:w-auto flex-1 gap-3 min-w-0">
                    {/* Left section: Rank + Name (most prominent) */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Rank Badge - smaller and more subtle */}
                      <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${rankBadgeClass}`}>
                        {displayRank}
                      </span>

                      {/* Player Name - more prominent */}
                      <span className="font-bold text-white text-lg truncate" title={player.name}>{player.name}</span>
                    </div>

                    {/* Right section on mobile, Center section on desktop: Status badges */}
                    <div className="flex items-center gap-2 flex-wrap justify-end sm:justify-start">
                      {/* Table Assignment */}
                      {player.seated && player.tableAssignment && (
                        <span className="text-xs bg-blue-600/70 text-blue-100 px-2 py-1 rounded font-normal">
                          T{player.tableAssignment.tableIndex + 1}S{player.tableAssignment.seatIndex + 1}
                        </span>
                      )}

                      {/* Knockouts */}
                      {player.knockouts > 0 && (
                        <div className="flex items-center gap-1 text-xs bg-orange-600/70 text-orange-100 px-2 py-1 rounded font-normal">
                          <span className="text-sm">🎯</span>
                          {player.knockouts}
                        </div>
                      )}

                      {/* Eliminated By - more subtle */}
                      {player.isActive === false && player.eliminatedBy && (
                        (() => {
                          const killer = state.players.find(p => String(p.id) === String(player.eliminatedBy));
                          return killer ? (
                            <span className="text-xs bg-red-600/50 text-red-200 px-2 py-1 rounded font-normal">
                              💀 {killer.name}
                            </span>
                          ) : null;
                        })()
                      )}

                      {/* League Points — only when position is known in a league game */}
                      {isLeagueMode && player.position && player.position > 0 && (() => {
                        const pts = calculatePoints(
                          player.position,
                          state.players.length,
                          player.knockouts || 0,
                          state.prizeStructure?.buyIn || 0,
                          0,
                          0
                        );
                        return pts > 0 ? (
                          <span className="text-xs bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 px-2 py-1 rounded font-semibold">
                            {pts} pts
                          </span>
                        ) : null;
                      })()}

                      {/* Rebuys */}
                      {(player.rebuys || 0) > 0 && (
                        <span className="text-xs bg-purple-600/70 text-purple-100 px-2 py-1 rounded font-normal">
                          R{player.rebuys}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom section on mobile, Right section on desktop: Winnings + Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto flex-shrink-0 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t border-[#2a2a2a] sm:border-0">
                    {/* Winnings Display */}
                    {winnings > 0 ? (
                      <div className="bg-green-600/20 border border-green-500/30 px-3 py-1 rounded-lg">
                        <div className="text-sm font-mono text-green-300 whitespace-nowrap font-bold">
                          {currencySymbol}{winnings.toFixed(0)}
                        </div>
                      </div>
                    ) : (
                      <div></div> /* Empty div to maintain flex-between alignment if no winnings */
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                        {/* Seat Player button for unseated active players */}
                        {player.isActive && !player.seated && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => seatSinglePlayer(player)}
                            className="text-xs bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10 px-2 py-1 font-medium"
                          >
                            Seat
                          </Button>
                        )}

                        {/* KO button for active players */}
                        {player.isActive !== false && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlayerToBustOut(player);
                              setHitmanId(null);
                              setBustOutDialogOpen(true);
                            }}
                            className="h-7 w-10 bg-red-500/80 hover:bg-red-500 text-white rounded text-[10px] font-bold flex-shrink-0 transition-colors"
                          >
                            KO
                          </button>
                        )}

                        {/* Re-buy button for eliminated players (when rebuys are enabled) */}
                        {!player.isActive && state.prizeStructure?.allowRebuys && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('💰 Re-buy button clicked for:', player.name);
                              processRebuy(player.id);
                            }}
                            disabled={!state.prizeStructure?.allowRebuys || (player.rebuys || 0) >= (state.prizeStructure?.maxRebuys || 3)}
                            className="text-xs bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10 px-2 py-1 font-medium mr-2"
                          >
                            Re-buy
                          </Button>
                        )}

                        {/* Re-entry button for eliminated players (when re-entries are enabled) */}
                        {!player.isActive && state.prizeStructure?.allowReEntry && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('🔄 Re-entry button clicked for:', player.name);
                              tournament.processReEntry(player.id);
                            }}
                            className="text-xs bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10 px-2 py-1 font-medium"
                          >
                            Re-enter
                          </Button>
                        )}

                        {/* Only show remove button for active players to prevent accidental deletion */}
                        {player.isActive && (
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
                      </div>
                    </div>
                </div>
              );
            });
          })()}
        </div>

        {/* Rebuy Section - Compact - Only show when rebuys are enabled */}
        {state.prizeStructure?.allowRebuys && state.players.filter(p => p.isActive === false).length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#2a2a2a] export-hide">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="material-icons text-sm">refresh</span>
                <span>Rebuys ({state.players.filter(p => p.isActive === false).length} out)</span>
              </h4>
              <span className="text-xs text-green-400">Available</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {state.players.filter(p => p.isActive === false).map((player) => {
                const canRebuy = state.prizeStructure?.allowRebuys &&
                  (player.rebuys || 0) < (state.prizeStructure?.maxRebuys || 3);

                return (
                  <Button
                    key={player.id}
                    variant="outline"
                    size="sm"
                    disabled={!canRebuy}
                    onClick={() => canRebuy && processRebuy(player.id)}
                    className={`text-xs flex items-center gap-1 ${
                      canRebuy
                        ? 'bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10'
                        : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    <span className="material-icons text-sm">refresh</span>
                    {player.name} ({player.rebuys || 0})
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Re-entry Section - Compact - Only show when re-entries are enabled */}
        {state.prizeStructure?.allowReEntry && state.players.filter(p => p.isActive === false).length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#2a2a2a] export-hide">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="material-icons text-sm">login</span>
                <span>Re-entries ({state.players.filter(p => p.isActive === false).length} out)</span>
              </h4>
              <span className="text-xs text-green-400">Available</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {state.players.filter(p => p.isActive === false).map((player) => {
                const maxReEntries = state.prizeStructure?.maxReEntries ?? 99;
                const canReEnter = (player.reEntries || 0) < maxReEntries;

                return (
                  <Button
                    key={player.id}
                    variant="outline"
                    size="sm"
                    disabled={!canReEnter}
                    onClick={() => canReEnter && tournament.processReEntry(player.id)}
                    className={`text-xs flex items-center gap-1 ${
                      canReEnter
                        ? 'bg-card border border-blue-500 text-blue-400 hover:bg-blue-500/10'
                        : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    <span className="material-icons text-sm">login</span>
                    {player.name} ({player.reEntries || 0})
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Add-on Section - Compact - Only show when add-ons are enabled and level reached */}
        {state.prizeStructure?.allowAddons &&
          (state.currentLevel + 1) >= (state.prizeStructure?.addonAvailableLevel ?? 1) &&
          state.players.filter(p => p.isActive !== false).length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#2a2a2a] export-hide">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="material-icons text-sm">add_circle</span>
                <span>Add-ons (Level {state.currentLevel + 1}+)</span>
              </h4>
              <span className="text-xs text-green-400">Available</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {state.players.filter(p => p.isActive !== false).map((player) => {
                const hasAddon = (player.addons || 0) > 0;

                return (
                  <Button
                    key={player.id}
                    variant="outline"
                    size="sm"
                    disabled={hasAddon}
                    onClick={() => !hasAddon && tournament.processAddon(player.id)}
                    className={`text-xs flex items-center gap-1 ${
                      !hasAddon
                        ? 'bg-card border border-amber-500 text-amber-400 hover:bg-amber-500/10'
                        : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    <span className="material-icons text-sm">add_circle</span>
                    {player.name} {hasAddon ? '✓' : ''}
                  </Button>
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
            <DialogTitle>Bust Out — {playerToBustOut?.name}</DialogTitle>
            <DialogDescription>Who knocked them out?</DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-2 max-h-64 overflow-y-auto">
            {state.players
              .filter(p => p.isActive !== false && p.id !== playerToBustOut?.id)
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
            {state.players.filter(p => p.isActive !== false && p.id !== playerToBustOut?.id).length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No other active players</p>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setBustOutDialogOpen(false)}>Cancel</Button>
            <Button className="flex-1" disabled={!hitmanId} onClick={handleBustOut}>Confirm KO</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}