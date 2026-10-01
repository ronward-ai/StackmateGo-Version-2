import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Trophy, Target, ChevronUp, ChevronDown } from 'lucide-react';
import EmptyState from '@/components/ui/empty-state';
import ResultsTable from '@/components/ResultsTable';
import { resultRowsFor } from '@/lib/resultRows';

interface Player {
  id: string;
  name: string;
  // Optional, to match the app's own Player. Declaring these REQUIRED only ever
  // compiled because the participant view hands this component an adapter built
  // from a raw Firestore document; the director console passes its real state.
  // An absent `isActive` means ACTIVE, which every test below already spells as
  // `!== false`.
  knockouts?: number;
  seated?: boolean;
  isActive?: boolean;
  position?: number;
  prizeMoney?: number;
  rebuys?: number;
  addons?: number;
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

  /**
   * The SAME rows the director's console renders, from `lib/resultRows.ts`.
   *
   * This screen used to build its own, and being the one screen a director never
   * looks at, it had drifted furthest: `#9` instead of an ordinal, so first place
   * was indistinguishable from ninth; `3 KOs` in red beside raw `prizeMoney` in
   * green, hand-rolled past `lib/playerBadges.ts` and reproducing the exact third
   * vocabulary that module was written to end.
   *
   * The two sections stay, because they are a real difference of purpose on a
   * phone — who is still in, and how it finished — not drift.
   */
  const rows = resultRowsFor(players, { prizeStructure, settings });
  /** The SAME columns the director chose: `settings` rides into the tournament
   *  document, so a player's phone shows the table the console shows. */
  const columnContext = { prizeStructure, isLeagueMode: !!(settings as any)?.isSeasonTournament };
  const activeRows = rows.filter(r => r.position === 0);
  const finishedRows = rows.filter(r => r.position > 0);

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


        {activeRows.length > 0 && (
          <div>
            <h4 className="font-semibold text-green-500 mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Active Players ({activeRows.length})
            </h4>
            <ResultsTable rows={activeRows} settings={settings} columnContext={columnContext} />
          </div>
        )}

        {finishedRows.length > 0 && (
          <div>
            <h4 className="font-semibold text-red-500 mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Final Rankings ({finishedRows.length})
            </h4>
            <ResultsTable rows={finishedRows} settings={settings} columnContext={columnContext} />
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