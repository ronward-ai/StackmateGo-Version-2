import { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useTournamentHistory } from '@/hooks/useTournamentHistory';
import { useSeasons } from '@/hooks/useSeasons';

export default function TournamentHistorySection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { 
    tournamentHistory, 
    getStandaloneTournaments, 
    getSeasonTournaments, 
    getRecentTournaments 
  } = useTournamentHistory();
  const { seasons } = useSeasons();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (tournamentHistory.length === 0) {
    return null;
  }

  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-orange-500">history</span>
          Tournament History ({tournamentHistory.length})
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'expand_less' : 'expand_more'}
        </span>
      </div>

      {isExpanded && (
        <div className="mt-4 border-t border-[#2a2a2a] pt-4">
          <Tabs defaultValue="recent" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="standalone">One-off</TabsTrigger>
              <TabsTrigger value="season">Season Games</TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="space-y-3">
              {getRecentTournaments(5).map((tournament) => (
                <div key={tournament.id} className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {tournament.type === 'season' ? (
                        <Badge variant="secondary" className="text-xs">
                          <span className="material-icons text-xs mr-1 text-orange-500">emoji_events</span>
                          {tournament.seasonName} - Game {tournament.tournamentNumber}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <span className="material-icons text-xs mr-1 text-orange-500">casino</span>
                          One-off
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(tournament.startTime)} • {formatTime(tournament.startTime)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span>
                      <strong>Winner:</strong> {tournament.winner || 'N/A'}
                    </span>
                    <span className="text-muted-foreground">
                      {tournament.playerCount} players • £{tournament.prizePool}
                    </span>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="standalone" className="space-y-3">
              {getStandaloneTournaments().map((tournament) => (
                <div key={tournament.id} className="bg-muted/20 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <Badge variant="outline" className="text-xs">
                      <span className="material-icons text-xs mr-1 text-orange-500">casino</span>
                      One-off Tournament
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(tournament.startTime)} • {formatTime(tournament.startTime)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span>
                      <strong>Winner:</strong> {tournament.winner || 'N/A'}
                    </span>
                    <span className="text-muted-foreground">
                      {tournament.playerCount} players • £{tournament.prizePool}
                    </span>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="season" className="space-y-4">
              {seasons.map((season) => {
                const seasonTournaments = getSeasonTournaments(season.id);
                if (seasonTournaments.length === 0) return null;

                return (
                  <div key={season.id} className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                      <span className="material-icons text-sm text-orange-500">emoji_events</span>
                      {season.name} ({seasonTournaments.length} games)
                    </h4>
                    <div className="space-y-2 ml-4">
                      {seasonTournaments.map((tournament) => (
                        <div key={tournament.id} className="bg-muted/20 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium">
                              Game {tournament.tournamentNumber}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(tournament.startTime)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span>
                              <strong>Winner:</strong> {tournament.winner || 'N/A'}
                            </span>
                            <span className="text-muted-foreground">
                              {tournament.playerCount} players
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Card>
  );
}