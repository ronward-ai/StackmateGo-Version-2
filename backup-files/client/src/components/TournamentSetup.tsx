import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useTournamentContext } from '@/hooks/useTournamentContext';
import { useSeasons } from '@/hooks/useSeasons';
import { useLeague } from '@/hooks/useLeague';
import { Calendar, Users, Trophy, Clock } from 'lucide-react';

interface SavedPlayerName {
  id: number;
  name: string;
  createdAt: string;
}

interface TournamentSetupProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  onPlayersSelected: (players: string[]) => void;
}

export default function TournamentSetup({ tournament, onPlayersSelected }: TournamentSetupProps) {
  const { context, setTournamentMode, shouldSuggestSeasonMode } = useTournamentContext();
  const { currentSeason, seasons } = useSeasons();
  const { leaguePlayers } = useLeague();
  
  const [savedNames, setSavedNames] = useState<SavedPlayerName[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [showSetup, setShowSetup] = useState(true);
  
  // Load saved player names
  useEffect(() => {
    fetchSavedNames();
  }, []);

  const fetchSavedNames = async () => {
    try {
      const response = await fetch('/api/player-names');
      if (response.ok) {
        const names = await response.json();
        setSavedNames(names);
      }
    } catch (error) {
      console.error('Error fetching saved names:', error);
    }
  };

  // Get season players for quick selection
  const getSeasonPlayers = () => {
    if (context.mode === 'season' && context.seasonId) {
      return leaguePlayers
        .filter((p: any) => p.seasonId === context.seasonId)
        .map((p: any) => p.name);
    }
    return [];
  };

  // Get frequently used players from saved names
  const getFrequentPlayers = () => {
    return savedNames
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)
      .map(p => p.name);
  };

  const togglePlayerSelection = (playerName: string) => {
    setSelectedPlayers(prev => 
      prev.includes(playerName)
        ? prev.filter(p => p !== playerName)
        : [...prev, playerName]
    );
  };

  const handleStartTournament = () => {
    selectedPlayers.forEach(name => {
      tournament.addPlayer(name);
    });

    // Set tournament details based on context
    const tournamentDetails = {
      type: context.mode,
      startTime: new Date().toISOString(),
      ...(context.mode === 'season' && {
        seasonId: context.seasonId,
        seasonName: context.seasonName,
        tournamentNumber: context.tournamentNumber
      })
    };
    
    tournament.updateTournamentDetails(tournamentDetails);
    onPlayersSelected(selectedPlayers);
    setShowSetup(false);
  };

  if (!showSetup) {
    return null;
  }

  const seasonPlayers = getSeasonPlayers();
  const frequentPlayers = getFrequentPlayers();
  const suggestedPlayers = context.mode === 'season' ? seasonPlayers : frequentPlayers;

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Tournament Setup</h2>
        {context.mode === 'season' && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {context.seasonName} - Game {context.tournamentNumber}
          </Badge>
        )}
      </div>

      {/* Context Mode Selection */}
      <div className="mb-6">
        <Label className="text-sm font-medium mb-3 block">Tournament Type</Label>
        <div className="flex gap-3">
          <Button
            variant={context.mode === 'standalone' ? 'default' : 'outline'}
            onClick={() => setTournamentMode('standalone')}
            className="flex items-center gap-2"
          >
            <Trophy className="h-4 w-4" />
            One-off Tournament
          </Button>
          {currentSeason?.isActive && (
            <Button
              variant={context.mode === 'season' ? 'default' : 'outline'}
              onClick={() => setTournamentMode('season', currentSeason.id)}
              className="flex items-center gap-2"
            >
              <Calendar className="h-4 w-4" />
              Season Game
            </Button>
          )}
        </div>
        {shouldSuggestSeasonMode && (
          <p className="text-sm text-muted-foreground mt-2">
            You have an active season. Consider using Season Game mode to track league points.
          </p>
        )}
      </div>

      {/* Player Selection */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-medium">
            Select Players ({selectedPlayers.length} selected)
          </Label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedPlayers(suggestedPlayers)}
            >
              Select All {context.mode === 'season' ? 'Season' : 'Recent'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedPlayers([])}
            >
              Clear All
            </Button>
          </div>
        </div>

        {suggestedPlayers.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">
              {context.mode === 'season' 
                ? `${context.seasonName} Players` 
                : 'Recently Used Players'
              }
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {suggestedPlayers.map(playerName => (
                <div
                  key={playerName}
                  className={`flex items-center space-x-2 p-2 border rounded cursor-pointer transition-colors ${
                    selectedPlayers.includes(playerName)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-muted border-border'
                  }`}
                  onClick={() => togglePlayerSelection(playerName)}
                >
                  <Checkbox
                    checked={selectedPlayers.includes(playerName)}
                    onChange={() => {}} // Handled by parent click
                  />
                  <span className="text-sm font-medium truncate">{playerName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All saved players for manual selection */}
        {savedNames.length > suggestedPlayers.length && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">
              All Saved Players
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
              {savedNames
                .filter(saved => !suggestedPlayers.includes(saved.name))
                .map(saved => (
                  <div
                    key={saved.id}
                    className={`flex items-center space-x-2 p-2 border rounded cursor-pointer transition-colors ${
                      selectedPlayers.includes(saved.name)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card hover:bg-muted border-border'
                    }`}
                    onClick={() => togglePlayerSelection(saved.name)}
                  >
                    <Checkbox
                      checked={selectedPlayers.includes(saved.name)}
                      onChange={() => {}} // Handled by parent click
                    />
                    <span className="text-sm font-medium truncate">{saved.name}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Tournament Start */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {selectedPlayers.length} players ready
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setShowSetup(false)}
          >
            Skip Setup
          </Button>
          <Button
            onClick={handleStartTournament}
            disabled={selectedPlayers.length === 0}
            className="flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            Start Tournament
          </Button>
        </div>
      </div>
    </Card>
  );
}