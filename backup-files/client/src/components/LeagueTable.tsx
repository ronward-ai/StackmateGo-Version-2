import { useState } from 'react';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { calculatePoints } from '@/types/league';

interface LeagueTableProps {
  playerCount: number;
}

export default function LeagueTable({ playerCount }: LeagueTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [position, setPosition] = useState<number>(1);
  
  const { currentSeason, formatSeasonDateRange } = useSeasons();
  const {
    leaguePlayers,
    addLeaguePlayer,
    recordResult,
    getLeagueStandings,
    resetLeague
  } = useLeague();
  
  const standings = getLeagueStandings();
  
  const handleAddPlayer = () => {
    const trimmedName = newPlayerName.trim();
    if (trimmedName && trimmedName.length > 0) {
      addLeaguePlayer(trimmedName);
      setNewPlayerName('');
    }
  };
  
  const handleRecordResult = () => {
    if (selectedPlayer && position > 0) {
      recordResult(selectedPlayer, position, playerCount);
      setSelectedPlayer(null);
      setPosition(1);
    }
  };
  
  const handlePlayerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddPlayer();
    }
  };
  
  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-secondary">emoji_events</span>
          League Table - {currentSeason?.name || 'Current Season'}
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'unfold_less' : 'unfold_more'}
        </span>
      </div>
      
      {isExpanded && (
        <div className="p-5 pt-0 border-t border-[#2a2a2a]">
          {/* Season Info */}
          {currentSeason && (
            <div className="mb-4 pb-3 border-b border-[#2a2a2a]">
              <h3 className="text-lg font-medium mb-1">{currentSeason.name}</h3>
              <p className="text-sm text-muted-foreground">
                Season Dates: {formatSeasonDateRange(currentSeason)}
              </p>
              <p className="text-sm text-muted-foreground">
                Player Count: {currentSeason.players.length} registered
              </p>
            </div>
          )}
          
          {/* Add League Player */}
          <div className="mb-4">
            <h3 className="text-lg font-medium mb-3">Add Player to League</h3>
            <div className="flex gap-2">
              <Input 
                type="text" 
                placeholder="Player name" 
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={handlePlayerKeyDown}
                className="flex-1 rounded-lg px-3 py-2 bg-input border border-border"
              />
              <Button 
                onClick={handleAddPlayer}
                className="flex items-center justify-center bg-primary hover:bg-[#7722ff] text-white font-medium py-2 px-4 rounded-lg"
              >
                <span className="material-icons">person_add</span>
              </Button>
            </div>
          </div>
          
          {/* Record Tournament Result */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3">Record Tournament Result</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="col-span-1 md:col-span-1">
                <select
                  value={selectedPlayer || ''}
                  onChange={(e) => setSelectedPlayer(e.target.value)}
                  className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2"
                >
                  <option value="">Select Player</option>
                  {leaguePlayers.map(player => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-1 md:col-span-1">
                <div className="flex items-center">
                  <span className="mr-2 text-muted-foreground">Position:</span>
                  <Input
                    type="number" 
                    min={1}
                    value={position}
                    onChange={(e) => setPosition(parseInt(e.target.value) || 1)}
                    className="w-20 rounded-lg px-3 py-2 bg-input border border-border"
                  />
                  <div className="ml-2 text-muted-foreground">
                    ({calculatePoints(position, playerCount)} pts)
                  </div>
                </div>
              </div>
              <div>
                <Button 
                  onClick={handleRecordResult}
                  disabled={!selectedPlayer}
                  className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-opacity-90 text-black font-medium py-2 px-4 rounded-lg"
                >
                  <span className="material-icons">add_task</span>
                  <span>Record Result</span>
                </Button>
              </div>
            </div>
          </div>
          
          {/* League Standings */}
          <div className="rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-[#2a2a2a]">
                <TableRow>
                  <TableHead className="text-white">Rank</TableHead>
                  <TableHead className="text-white">Player</TableHead>
                  <TableHead className="text-white text-right">Total Points</TableHead>
                  <TableHead className="text-white text-right">Tournaments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.length > 0 ? (
                  standings.map((player, index) => (
                    <TableRow key={player.id} className={index % 2 === 0 ? 'bg-[#1e1e1e]' : ''}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>{player.name}</TableCell>
                      <TableCell className="text-right">{player.totalPoints}</TableCell>
                      <TableCell className="text-right">{player.tournamentResults.length}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      No players in the league yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Reset League Button */}
          <div className="mt-4 flex justify-end">
            <Button 
              variant="destructive" 
              onClick={resetLeague}
              className="flex items-center justify-center gap-2 bg-destructive hover:bg-opacity-90 text-white font-medium py-2 px-4 rounded-lg"
            >
              <span className="material-icons">delete_forever</span>
              <span>Reset League</span>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}