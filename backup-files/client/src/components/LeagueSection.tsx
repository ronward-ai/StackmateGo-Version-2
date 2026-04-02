import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLeague } from "@/hooks/useLeague";
import { useSeasons } from "@/hooks/useSeasons";
import { calculatePoints } from "@/types/league";
import { Trophy, Users, ChevronRight, Calendar, Star, Target, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface LeagueSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function LeagueSection({ tournament }: LeagueSectionProps) {
  const { state } = tournament;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRecordingToLeague, setIsRecordingToLeague] = useState(false);
  
  // League integration hooks
  const { recordTournamentResult, addLeaguePlayer, leaguePlayers } = useLeague();
  const { currentSeason } = useSeasons();

  // Function to record tournament results to league
  const recordToLeague = async () => {
    if (!currentSeason) {
      alert('No active season found. Create a season in League Mode first.');
      return;
    }

    setIsRecordingToLeague(true);
    
    try {
      // Generate unique tournament ID
      const tournamentId = `tournament-${Date.now()}`;
      const tournamentDate = new Date().toISOString().split('T')[0];
      
      // Get all players with positions (eliminated players)
      const eliminatedPlayers = state.players.filter(p => p.position && p.position > 0);
      
      if (eliminatedPlayers.length === 0) {
        alert('No players have been eliminated yet. Complete the tournament first.');
        return;
      }

      // Record results for each eliminated player
      for (const player of eliminatedPlayers) {
        if (player.position) {
          // Add player to league if not already there
          addLeaguePlayer(player.name);
          
          // Record the tournament result
          const points = calculatePoints(player.position, state.players.length);
          recordTournamentResult(player.id, {
            tournamentId,
            position: player.position,
            points,
            date: tournamentDate,
            seasonId: currentSeason.id
          });
        }
      }
      
      alert(`Successfully recorded ${eliminatedPlayers.length} player results to league!`);
    } catch (error) {
      console.error('Error recording to league:', error);
      alert('Failed to record results to league. Please try again.');
    } finally {
      setIsRecordingToLeague(false);
    }
  };

  // Get eliminated players count
  const eliminatedPlayers = state.players.filter(p => p.position && p.position > 0);
  const currentSeasonPlayers = leaguePlayers.filter(p => p.seasonId === currentSeason?.id);
  const tournamentType = state.details?.type || 'standalone';
  
  // Check if this is a season tournament
  const isSeasonTournament = tournamentType === 'season' && currentSeason;

  // Always show compact view for better UX
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center">
          <Trophy className="mr-2 h-5 w-5 text-secondary" />
          League & Season
        </h2>
        <Link href="/league">
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <span>Manage</span>
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* Tournament Status */}
      <div className="flex items-center justify-between mb-4 p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          {isSeasonTournament ? (
            <>
              <Calendar className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-sm">Season Tournament</span>
              <Badge variant="default" className="bg-blue-500">
                {currentSeason?.name}
              </Badge>
            </>
          ) : (
            <>
              <Target className="h-4 w-4 text-orange-500" />
              <span className="font-medium text-sm">One-off Tournament</span>
              <Badge variant="secondary">Standalone</Badge>
            </>
          )}
        </div>
      </div>

      {isSeasonTournament ? (
        /* Season Tournament View */
        <div className="space-y-4">
          {/* Auto-Record Notice */}
          <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Star className="h-4 w-4 text-green-600 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-green-800">League Points Enabled</p>
              <p className="text-green-700">Tournament results will automatically count towards season rankings.</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <div className="text-2xl font-bold text-primary">{state.players.length}</div>
              <div className="text-xs text-muted-foreground">Total Players</div>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <div className="text-2xl font-bold text-primary">{currentSeasonPlayers.length}</div>
              <div className="text-xs text-muted-foreground">Season Players</div>
            </div>
          </div>

          {/* Top 3 Leaderboard Preview */}
          {currentSeasonPlayers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Season Leaders</h4>
              {currentSeasonPlayers
                .sort((a, b) => b.totalPoints - a.totalPoints)
                .slice(0, 3)
                .map((player, index) => (
                  <div key={player.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-yellow-400 text-black' :
                        index === 1 ? 'bg-gray-300 text-black' :
                        'bg-orange-400 text-black'
                      }`}>
                        {index + 1}
                      </div>
                      <span className="text-sm">{player.name}</span>
                    </div>
                    <span className="text-sm font-medium">{player.totalPoints}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        /* One-off Tournament View */
        <div className="space-y-4">
          {/* Manual Record Option */}
          <div className="text-center py-6">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-4">
              {currentSeason ? 
                'Manually record results to league after tournament completion' :
                'Create a season to track tournament results'
              }
            </p>
            
            {currentSeason ? (
              <Button
                onClick={recordToLeague}
                disabled={isRecordingToLeague || eliminatedPlayers.length === 0}
                variant={eliminatedPlayers.length > 0 ? "default" : "outline"}
                className="w-full"
              >
                {isRecordingToLeague ? 'Recording...' : 
                 eliminatedPlayers.length === 0 ? 'Complete Tournament First' :
                 `Record ${eliminatedPlayers.length} Results to League`}
              </Button>
            ) : (
              <Link href="/league">
                <Button variant="default" className="w-full">
                  Create Season First
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}