
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Calendar, Trophy, Users, DollarSign } from 'lucide-react';
import { useSeasons } from '@/hooks/useSeasons';
import { useLeague } from '@/hooks/useLeague';
import { db, collections } from '@/lib/firebase';
import { query, where, getDocs, orderBy } from 'firebase/firestore';

interface TournamentResult {
  id: string;
  tournamentDate: string;
  tournamentName: string;
  position: number;
  totalPlayers: number;
  points: number;
  knockouts: number;
  prizeMoney: number;
  buyIn: number;
  playerName: string;
}

export default function SeasonTournaments() {
  const { league, leaguePlayers } = useLeague();
  const { seasons, currentSeason } = useSeasons({ leagueId: league?.id });
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

  // Fetch tournament results for the selected season
  const { data: tournamentResults = [], isLoading } = useQuery<TournamentResult[]>({
    queryKey: ['seasonResults', league?.id, selectedSeasonId || currentSeason?.id],
    queryFn: async () => {
      const seasonId = selectedSeasonId || currentSeason?.id;
      if (!league?.id || !seasonId || league.id === 'pending') return [];
      
      const q = query(
        collections.tournamentResults,
        where('leagueId', '==', String(league.id)),
        where('seasonId', '==', String(seasonId))
      );
      
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => {
        const data = doc.data();
        const player = leaguePlayers.find(p => p.id === String(data.leaguePlayerId));
        return {
          id: doc.id,
          tournamentDate: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
          tournamentName: `Tournament ${data.tournamentId || 'Unknown'}`,
          position: data.position,
          totalPlayers: data.totalPlayers,
          points: data.points,
          knockouts: data.knockouts || 0,
          prizeMoney: data.prizeMoney || 0,
          buyIn: data.buyIn || 0,
          playerName: player?.name || 'Unknown Player'
        };
      });
      
      return results;
    },
    enabled: !!league?.id && league?.id !== 'pending' && !!(selectedSeasonId || currentSeason?.id) && leaguePlayers.length > 0,
    select: (data) => {
      // Group results by tournament
      const tournamentMap = new Map<string, TournamentResult[]>();
      data.forEach(result => {
        const key = `${result.tournamentDate}-${result.tournamentName}`;
        if (!tournamentMap.has(key)) {
          tournamentMap.set(key, []);
        }
        tournamentMap.get(key)!.push(result);
      });
      return data;
    }
  });

  // Group results by tournament
  const tournamentsByDate = tournamentResults.reduce((acc, result) => {
    const key = `${result.tournamentDate}-${result.tournamentName}`;
    if (!acc[key]) {
      acc[key] = {
        date: result.tournamentDate,
        name: result.tournamentName,
        results: []
      };
    }
    acc[key].results.push(result);
    return acc;
  }, {} as Record<string, { date: string; name: string; results: TournamentResult[] }>);

  const tournaments = Object.values(tournamentsByDate).sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (cents: number) => {
    return `£${(cents / 100).toFixed(2)}`;
  };

  if (!currentSeason) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No active season</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Season Tournaments
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={currentSeason.id.toString()} onValueChange={(value) => setSelectedSeasonId(parseInt(value))}>
          <TabsList className="w-full">
            {seasons.filter(s => s.isActive || tournaments.some(t => t.results.length > 0)).map(season => (
              <TabsTrigger key={season.id} value={season.id.toString()}>
                {season.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {seasons.map(season => (
            <TabsContent key={season.id} value={season.id.toString()} className="space-y-4">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading tournaments...
                </div>
              ) : tournaments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No tournaments played in this season yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tournaments.map((tournament, idx) => {
                    const winner = tournament.results.find(r => r.position === 1);
                    const totalPrizePool = tournament.results.reduce((sum, r) => sum + r.prizeMoney, 0);
                    const uniquePlayers = new Set(tournament.results.map(r => r.playerName)).size;

                    return (
                      <div key={idx} className="border rounded-lg p-4 bg-muted/20">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="font-semibold">{tournament.name}</h4>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(tournament.date)}
                            </p>
                          </div>
                          <Badge variant="secondary">
                            Game #{idx + 1}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div className="text-center p-2 bg-background rounded">
                            <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                            <div className="text-sm font-medium">{uniquePlayers}</div>
                            <div className="text-xs text-muted-foreground">Players</div>
                          </div>
                          <div className="text-center p-2 bg-background rounded">
                            <Trophy className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                            <div className="text-sm font-medium">{winner?.playerName || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">Winner</div>
                          </div>
                          <div className="text-center p-2 bg-background rounded">
                            <DollarSign className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                            <div className="text-sm font-medium">{formatCurrency(totalPrizePool)}</div>
                            <div className="text-xs text-muted-foreground">Prize Pool</div>
                          </div>
                        </div>

                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                            View full results ({tournament.results.length} entries)
                          </summary>
                          <div className="mt-2 space-y-1">
                            {tournament.results
                              .sort((a, b) => a.position - b.position)
                              .map((result, resultIdx) => (
                                <div key={resultIdx} className="flex items-center justify-between text-sm py-1 px-2 bg-background rounded">
                                  <div className="flex items-center gap-2">
                                    <span className={`font-medium ${result.position <= 3 ? 'text-yellow-500' : ''}`}>
                                      #{result.position}
                                    </span>
                                    <span>{result.playerName}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-muted-foreground">
                                    <span>{result.points} pts</span>
                                    {result.prizeMoney > 0 && (
                                      <span className="text-green-500">{formatCurrency(result.prizeMoney)}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
