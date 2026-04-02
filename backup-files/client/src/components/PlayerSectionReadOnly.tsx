import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Trophy, Target } from 'lucide-react';

interface Player {
  id: string;
  name: string;
  knockouts: number;
  seated: boolean;
  isActive: boolean;
  position?: number;
  prizeMoney?: number;
  rebuys?: number;
  addons?: number;
  totalInvestment?: number;
  tableAssignment?: {
    tableIndex: number;
    seatIndex: number;
  };
}

interface Tournament {
  state: {
    players: Player[];
    settings: {
      currency?: string;
    };
    prizeStructure?: {
      buyIn: number;
      enableBounties?: boolean;
      bountyAmount?: number;
    };
  };
}

interface PlayerSectionReadOnlyProps {
  tournament: Tournament;
}

export default function PlayerSectionReadOnly({ tournament }: PlayerSectionReadOnlyProps) {
  const { players, settings, prizeStructure } = tournament.state;
  const currencySymbol = settings?.currency || '£';

  // Separate active and eliminated players
  const activePlayers = players.filter(p => p.isActive !== false);
  const eliminatedPlayers = players
    .filter(p => p.isActive === false && p.position)
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  // Calculate tournament stats
  const totalPrizePool = players.length * (prizeStructure?.buyIn || 0);
  const totalKnockouts = players.reduce((sum, p) => sum + (p.knockouts || 0), 0);

  const calculateWinnings = (player: Player): number => {
    let totalWinnings = 0;

    // Add bounty winnings (knockouts × bounty amount + own bounty back for winner only) - only if bounties are enabled
    if (prizeStructure?.enableBounties && prizeStructure?.bountyAmount) {
      const knockouts = player.knockouts || 0;

      // Only the winner (position 1) gets their own bounty back plus knockout bounties
      if (player.position === 1) {
        totalWinnings += (knockouts + 1) * prizeStructure.bountyAmount;
      } else {
        // All other players (active or eliminated) only get knockout bounties
        totalWinnings += knockouts * prizeStructure.bountyAmount;
      }
    }

    if (player.prizeMoney) {
      totalWinnings += player.prizeMoney;
    }

    return totalWinnings;
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-500" />
          Players & Rankings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">


        {/* Active Players */}
        {activePlayers.length > 0 && (
          <div>
            <h4 className="font-semibold text-green-500 mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Active Players ({activePlayers.length})
            </h4>
            <div className="grid gap-2">
              {activePlayers.map((player) => (
                <div key={player.id} className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="font-medium">{player.name}</span>
                    {player.seated && player.tableAssignment && (
                      <Badge variant="outline" className="text-xs">
                        Table {player.tableAssignment.tableIndex + 1} • Seat {player.tableAssignment.seatIndex + 1}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {player.knockouts > 0 && (
                      <Badge variant="secondary" className="text-xs bg-red-500/20 text-red-400">
                        {player.knockouts} KO{player.knockouts !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Eliminated Players */}
        {eliminatedPlayers.length > 0 && (
          <div>
            <h4 className="font-semibold text-red-500 mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Final Rankings ({eliminatedPlayers.length})
            </h4>
            <div className="space-y-2">
              {eliminatedPlayers.map((player) => (
                <div key={player.id} className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-bold text-red-400 min-w-[2rem]">
                      #{player.position}
                    </div>
                    <span className="font-medium">{player.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {player.knockouts > 0 && (
                      <span className="text-red-400">{player.knockouts} KO{player.knockouts !== 1 ? 's' : ''}</span>
                    )}
                    {player.prizeMoney > 0 && (
                      <span className="font-bold text-green-400">
                        {currencySymbol}{calculateWinnings(player).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {players.length === 0 && (
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No players have joined yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}