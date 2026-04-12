import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from 'lucide-react';

// Mirrors TablesSection.tsx FELT_COLORS — single source of truth
const feltClass = (key: string) => {
  const classes: Record<string, string> = {
    'felt-green':    'table-felt-green',
    'felt-blue':     'table-felt-blue',
    'felt-red':      'table-felt-red',
    'felt-purple':   'table-felt-purple',
    'felt-orange':   'table-felt-orange',
    'felt-teal':     'table-felt-teal',
    'felt-pink':     'table-felt-pink',
    'felt-yellow':   'table-felt-yellow',
    'felt-black':    'table-felt-black',
    'felt-burgundy': 'table-felt-burgundy',
  };
  return `table-felt-base ${classes[key] || 'table-felt-green'}`;
};

interface Player {
  id: string;
  name: string;
  knockouts?: number;
  seated?: boolean;
  isActive?: boolean;
  tableAssignment?: { tableIndex: number; seatIndex: number };
}

interface TablesSectionReadOnlyProps {
  tournament: {
    state: {
      players: Player[];
      settings: {
        tables?: { numberOfTables: number; seatsPerTable: number; tableNames?: string[] };
        tableBackgrounds?: string[];
      };
    };
  };
}

export default function TablesSectionReadOnly({ tournament }: TablesSectionReadOnlyProps) {
  const { players, settings } = tournament.state;
  const tableSettings = settings?.tables || { numberOfTables: 1, seatsPerTable: 9, tableNames: ['Table 1'] };
  const tableBackgrounds = settings?.tableBackgrounds || [];

  const seatedActive = players.filter(p => p.seated && p.tableAssignment && p.isActive !== false);

  // Hide section entirely if nobody is seated yet
  if (seatedActive.length === 0) return null;

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-purple-500" />
          Table Seating
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: Math.min(6, tableSettings.numberOfTables) }).map((_, tableIndex) => {
            const tableName = tableSettings.tableNames?.[tableIndex] || `Table ${tableIndex + 1}`;
            const tablePlayers = seatedActive
              .filter(p => p.tableAssignment?.tableIndex === tableIndex)
              .sort((a, b) => (a.tableAssignment?.seatIndex ?? 0) - (b.tableAssignment?.seatIndex ?? 0));

            return (
              <div key={tableIndex} className={feltClass(tableBackgrounds[tableIndex] || 'felt-green')}>
                {/* Table header */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-orange-300 truncate">{tableName}</h3>
                  <span className="text-xs text-white/60 flex-shrink-0 ml-2">
                    {tablePlayers.length}/{tableSettings.seatsPerTable}
                  </span>
                </div>

                {/* Seat rows */}
                <div className="space-y-1.5 min-h-[80px]">
                  {Array.from({ length: tableSettings.seatsPerTable }).map((_, seatIndex) => {
                    const player = tablePlayers.find(p => p.tableAssignment?.seatIndex === seatIndex);

                    if (!player) {
                      return (
                        <div
                          key={seatIndex}
                          className="flex items-center gap-2.5 p-2 rounded-lg border border-dashed border-white/15 bg-black/15"
                        >
                          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/40 text-[10px] font-bold flex-shrink-0">
                            {seatIndex + 1}
                          </div>
                          <span className="text-xs text-white/40">Empty</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={player.id}
                        className="flex items-center gap-2.5 p-2 rounded-lg border border-white/20 bg-black/25"
                      >
                        <div className="w-6 h-6 rounded-full bg-blue-500/80 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                          {seatIndex + 1}
                        </div>
                        <span className="font-medium text-white text-sm truncate flex-1">{player.name}</span>
                        {(player.knockouts ?? 0) > 0 && (
                          <span className="text-xs bg-orange-600/70 text-orange-100 px-1.5 py-0.5 rounded flex-shrink-0">
                            🎯 {player.knockouts}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {tableSettings.numberOfTables > 6 && (
            <div className="table-felt-base rounded-2xl p-4 flex items-center justify-center text-white/50 text-sm">
              +{tableSettings.numberOfTables - 6} more tables
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
