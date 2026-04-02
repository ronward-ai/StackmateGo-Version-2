import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { useSeasons } from '@/hooks/useSeasons';
import { useLeague } from '@/hooks/useLeague';
import { LeaguePlayer, TournamentResult, calculatePoints } from '@/types/league';
import { Plus, Trophy, Calendar, Users, Target, CalendarIcon, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function LeagueMode() {
  const { 
    currentSeason, 
    seasons, 
    addSeason, 
    switchSeason, 
    formatSeasonDateRange, 
    isSeasonActive 
  } = useSeasons();
  
  const { 
    leaguePlayers, 
    addLeaguePlayer, 
    recordTournamentResult 
  } = useLeague();

  // Local state for forms
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isRecordingResult, setIsRecordingResult] = useState(false);
  const [tournamentDate, setTournamentDate] = useState(new Date().toISOString().split('T')[0]);
  const [playerResults, setPlayerResults] = useState<{ playerId: string; position: number }[]>([]);
  
  // Season date state
  const [seasonStartDate, setSeasonStartDate] = useState<Date>(new Date());
  const [seasonEndDate, setSeasonEndDate] = useState<Date>(() => {
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3); // Default 3 months
    return endDate;
  });

  // Get current season players
  const currentSeasonPlayers = leaguePlayers.filter(p => p.seasonId === currentSeason?.id);

  // Calculate weekly rankings
  const getWeeklyRankings = () => {
    const sortedPlayers = [...currentSeasonPlayers].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.name.localeCompare(b.name);
    });
    return sortedPlayers;
  };

  // Get recent tournaments
  const getRecentTournaments = () => {
    const allResults: (TournamentResult & { playerName: string })[] = [];
    currentSeasonPlayers.forEach(player => {
      player.tournamentResults.forEach(result => {
        allResults.push({ ...result, playerName: player.name });
      });
    });
    
    // Group by tournament and date
    const tournaments = new Map<string, { date: string; players: typeof allResults }>();
    allResults.forEach(result => {
      const key = `${result.tournamentId}-${result.date}`;
      if (!tournaments.has(key)) {
        tournaments.set(key, { date: result.date, players: [] });
      }
      tournaments.get(key)!.players.push(result);
    });

    return Array.from(tournaments.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10); // Last 10 tournaments
  };

  const handleAddSeason = () => {
    if (newSeasonName.trim()) {
      addSeason(newSeasonName.trim(), seasonStartDate);
      setNewSeasonName('');
      // Reset to default dates
      setSeasonStartDate(new Date());
      const defaultEndDate = new Date();
      defaultEndDate.setMonth(defaultEndDate.getMonth() + 3);
      setSeasonEndDate(defaultEndDate);
    }
  };

  const handleAddPlayer = () => {
    if (newPlayerName.trim()) {
      addLeaguePlayer(newPlayerName.trim());
      setNewPlayerName('');
    }
  };

  const handleRecordTournament = () => {
    if (playerResults.length === 0) return;

    // Generate tournament ID based on date and number of players
    const tournamentId = `tournament-${tournamentDate}-${playerResults.length}players-${Date.now()}`;
    
    // Record results for each player
    playerResults.forEach(({ playerId, position }) => {
      const points = calculatePoints(position, playerResults.length);
      recordTournamentResult(playerId, {
        tournamentId,
        position,
        points,
        date: tournamentDate,
        seasonId: currentSeason?.id
      });
    });

    // Reset form
    setPlayerResults([]);
    setIsRecordingResult(false);
    setTournamentDate(new Date().toISOString().split('T')[0]);
  };

  const addPlayerResult = () => {
    setPlayerResults(prev => [...prev, { playerId: '', position: prev.length + 1 }]);
  };

  const updatePlayerResult = (index: number, playerId: string) => {
    setPlayerResults(prev => prev.map((result, i) => 
      i === index ? { ...result, playerId } : result
    ));
  };

  const removePlayerResult = (index: number) => {
    setPlayerResults(prev => {
      const newResults = prev.filter((_, i) => i !== index);
      // Update positions
      return newResults.map((result, i) => ({ ...result, position: i + 1 }));
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Link href="/">
              <Button variant="outline" size="sm" className="flex items-center space-x-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Tournament</span>
              </Button>
            </Link>
          </div>
          
          <div className="text-center">
            <div className="inline-block bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 rounded-xl shadow-lg transform hover:scale-105 transition-transform duration-200">
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">League Mode</h1>
              <div className="text-orange-100 text-sm md:text-base font-medium mt-1">Tournament Rankings & Statistics</div>
            </div>
          </div>
        </header>

        {/* Season Management */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Calendar className="mr-2 h-5 w-5 text-secondary" />
              <h2 className="text-xl font-semibold">Current Season</h2>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Season
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Season</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="seasonName">Season Name</Label>
                    <Input
                      id="seasonName"
                      value={newSeasonName}
                      onChange={(e) => setNewSeasonName(e.target.value)}
                      placeholder="e.g., Winter Championship 2025"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {seasonStartDate ? format(seasonStartDate, "PPP") : "Select start date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="center">
                          <CalendarComponent
                            mode="single"
                            selected={seasonStartDate}
                            onSelect={(date) => {
                              if (date) {
                                setSeasonStartDate(date);
                                // Auto-adjust end date to 3 months later if it's before start date
                                if (seasonEndDate <= date) {
                                  const newEndDate = new Date(date);
                                  newEndDate.setMonth(newEndDate.getMonth() + 3);
                                  setSeasonEndDate(newEndDate);
                                }
                              }
                            }}
                            disabled={(date) => date < new Date("1900-01-01")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div>
                      <Label>End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {seasonEndDate ? format(seasonEndDate, "PPP") : "Select end date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="center">
                          <CalendarComponent
                            mode="single"
                            selected={seasonEndDate}
                            onSelect={(date) => date && setSeasonEndDate(date)}
                            disabled={(date) => date < seasonStartDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    Season duration: {Math.ceil((seasonEndDate.getTime() - seasonStartDate.getTime()) / (1000 * 60 * 60 * 24))} days
                  </div>
                  
                  <Button onClick={handleAddSeason} className="w-full">
                    Create Season
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {currentSeason ? (
            <div className="bg-muted/30 p-4 rounded-lg">
              <h3 className="font-medium text-lg">{currentSeason.name}</h3>
              <p className="text-muted-foreground">{formatSeasonDateRange(currentSeason)}</p>
              <p className="text-muted-foreground">{currentSeasonPlayers.length} registered players</p>
              <Badge variant={isSeasonActive(currentSeason) ? "default" : "secondary"} className="mt-2">
                {isSeasonActive(currentSeason) ? "Active" : "Completed"}
              </Badge>
            </div>
          ) : (
            <p className="text-muted-foreground">No active season. Create one to get started.</p>
          )}
        </Card>

        <Tabs defaultValue="rankings" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="rankings">Rankings</TabsTrigger>
            <TabsTrigger value="tournaments">Tournaments</TabsTrigger>
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="record">Record Result</TabsTrigger>
          </TabsList>

          {/* Rankings Tab */}
          <TabsContent value="rankings">
            <Card className="p-6">
              <div className="flex items-center mb-4">
                <Trophy className="mr-2 h-5 w-5 text-secondary" />
                <h3 className="text-xl font-semibold">Season Rankings</h3>
              </div>

              {currentSeasonPlayers.length > 0 ? (
                <div className="space-y-3">
                  {getWeeklyRankings().map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mr-3 ${
                          index === 0 ? 'bg-yellow-500 text-black' :
                          index === 1 ? 'bg-gray-400 text-black' :
                          index === 2 ? 'bg-orange-600 text-white' :
                          'bg-muted text-foreground'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{player.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {player.tournamentResults.length} tournaments played
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{player.totalPoints.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">points</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No players registered in current season
                </p>
              )}
            </Card>
          </TabsContent>

          {/* Tournaments Tab */}
          <TabsContent value="tournaments">
            <Card className="p-6">
              <div className="flex items-center mb-4">
                <Target className="mr-2 h-5 w-5 text-secondary" />
                <h3 className="text-xl font-semibold">Recent Tournaments</h3>
              </div>

              {getRecentTournaments().length > 0 ? (
                <div className="space-y-4">
                  {getRecentTournaments().map((tournament, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">
                          Tournament - {new Date(tournament.date).toLocaleDateString()}
                        </h4>
                        <Badge variant="outline">{tournament.players.length} players</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {tournament.players
                          .sort((a, b) => a.position - b.position)
                          .map((result) => (
                            <div key={`${result.playerName}-${result.position}`} 
                                 className="flex justify-between items-center text-sm">
                              <span>{result.position}. {result.playerName}</span>
                              <span className="font-medium">{result.points} pts</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No tournaments recorded yet
                </p>
              )}
            </Card>
          </TabsContent>

          {/* Players Tab */}
          <TabsContent value="players">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Users className="mr-2 h-5 w-5 text-secondary" />
                  <h3 className="text-xl font-semibold">Season Players</h3>
                </div>
                <div className="flex items-center space-x-2">
                  <Input
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="Player name"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
                  />
                  <Button onClick={handleAddPlayer}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {currentSeasonPlayers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {currentSeasonPlayers.map((player) => (
                    <div key={player.id} className="border rounded-lg p-4">
                      <h4 className="font-medium mb-2">{player.name}</h4>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>Total Points: {player.totalPoints.toLocaleString()}</p>
                        <p>Tournaments: {player.tournamentResults.length}</p>
                        {player.tournamentResults.length > 0 && (
                          <p>Best Finish: {Math.min(...player.tournamentResults.map(r => r.position))}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No players registered. Add players to get started.
                </p>
              )}
            </Card>
          </TabsContent>

          {/* Record Result Tab */}
          <TabsContent value="record">
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4">Record Tournament Result</h3>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="tournamentDate">Tournament Date</Label>
                  <Input
                    id="tournamentDate"
                    type="date"
                    value={tournamentDate}
                    onChange={(e) => setTournamentDate(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Player Results</Label>
                    <Button variant="outline" size="sm" onClick={addPlayerResult}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Player
                    </Button>
                  </div>

                  {playerResults.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {playerResults.map((result, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <span className="w-8 text-center font-medium">{result.position}.</span>
                          <Select 
                            value={result.playerId} 
                            onValueChange={(value) => updatePlayerResult(index, value)}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select player" />
                            </SelectTrigger>
                            <SelectContent>
                              {currentSeasonPlayers
                                .filter(p => !playerResults.some(r => r.playerId === p.id) || p.id === result.playerId)
                                .map((player) => (
                                  <SelectItem key={player.id} value={player.id}>
                                    {player.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => removePlayerResult(index)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {playerResults.length > 0 && (
                  <Button onClick={handleRecordTournament} className="w-full">
                    Record Tournament Results
                  </Button>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}