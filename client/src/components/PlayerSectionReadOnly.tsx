import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Trophy, Target, ChevronUp, ChevronDown } from 'lucide-react';
import EmptyState from '@/components/ui/empty-state';
import PlayerBadge from '@/components/ui/player-badge';
import { badgesFor } from '@/lib/playerBadges';

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
  const [isExpanded, setIsExpanded] = useState(true);
  const { players, settings, prizeStructure } = tournament.state;
  const currencySymbol = settings?.currency || '£';

  // Separate active and eliminated players
  const activePlayers = players.filter(p => p.isActive !== false);
  const eliminatedPlayers = players
    .filter(p => p.isActive === false && p.position)
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  // Calculate tournament stats
  const totalKnockouts = players.reduce((sum, p) => sum + (p.knockouts || 0), 0);

  const isFinished = players.some(p => p.position === 1);
  const hideTableBadge = isFinished || activePlayers.length <= 1;

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Players & Rankings
          </div>
          <button onClick={() => setIsExpanded(v => !v)}>
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardTitle>
      </CardHeader>
      {isExpanded && <CardContent className="space-y-6">


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
                    {badgesFor({
                      seat: player.tableAssignment,
                      seated: player.seated,
                      gameFinished: hideTableBadge,
                      currencySymbol: '',
                    }).map(badge => <PlayerBadge key={badge.key} badge={badge} />)}
                  </div>
                  <div className="flex items-center gap-2">
                    {badgesFor({
                      gameFinished: true,
                      knockouts: player.knockouts,
                      currencySymbol: '',
                    }).map(badge => <PlayerBadge key={badge.key} badge={badge} />)}
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
                        {currencySymbol}{player.prizeMoney.toLocaleString()}
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
          <EmptyState icon={Users} title="Nobody has joined yet">
            Players appear here as they scan the QR code and check in.
          </EmptyState>
        )}
      </CardContent>}
    </Card>
  );
}