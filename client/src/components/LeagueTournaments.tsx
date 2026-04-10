import { useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Calendar } from 'lucide-react';
import { useLeague, TournamentResult } from '@/hooks/useLeague';

export default function LeagueTournaments() {
  const { leaguePlayers } = useLeague();

  // Get recent tournaments
  const recentTournaments = useMemo(() => {
    const allResults: (TournamentResult & { playerName: string })[] = [];
    leaguePlayers.forEach(player => {
      player.tournamentResults.forEach(result => {
        allResults.push({ ...result, playerName: player.name });
      });
    });
    
    // Group by tournament and date
    const tournaments = new Map<string, { date: string; players: typeof allResults }>();
    allResults.forEach(result => {
      const key = `${result.tournamentId || result.id}-${result.date?.split('T')[0] ?? ''}`;
      if (!tournaments.has(key)) {
        tournaments.set(key, { date: result.date, players: [] });
      }
      tournaments.get(key)!.players.push(result);
    });

    return Array.from(tournaments.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10); // Last 10 tournaments
  }, [leaguePlayers]);

  return (
    <div data-testid="league-tournaments">
      <div className="flex items-center mb-4">
        <Target className="mr-2 h-5 w-5 text-primary" />
        <h3 className="text-xl font-semibold">Recent Tournaments</h3>
      </div>

      {recentTournaments.length > 0 ? (
        <div className="space-y-4">
          {recentTournaments.map((tournament, index) => (
            <Card key={index} className="p-4" data-testid={`tournament-card-${index}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium" data-testid={`tournament-date-${index}`}>
                    {new Date(tournament.date).toLocaleDateString('en-US', { 
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </h4>
                </div>
                <Badge variant="outline" data-testid={`tournament-players-${index}`}>
                  {tournament.players.length} players
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {tournament.players
                  .sort((a, b) => a.position - b.position)
                  .map((result) => (
                    <div 
                      key={`${result.playerName}-${result.position}`} 
                      className="flex justify-between items-center text-sm p-2 rounded bg-muted/30"
                      data-testid={`result-${index}-${result.position}`}
                    >
                      <span className="font-medium">
                        <span className={`inline-block w-6 ${
                          result.position === 1 ? 'text-yellow-500' :
                          result.position === 2 ? 'text-gray-400' :
                          result.position === 3 ? 'text-orange-600' : ''
                        }`}>
                          {result.position}.
                        </span>
                        {result.playerName}
                      </span>
                      <span className="font-mono text-muted-foreground">{result.points} pts</span>
                    </div>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8" data-testid="no-tournaments">
          <div className="text-center text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">No tournaments recorded yet</p>
            <p className="text-sm">Tournament results will appear here as you record them</p>
          </div>
        </Card>
      )}
    </div>
  );
}
