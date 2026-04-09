import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from 'lucide-react';

interface Player {
  id: string;
  name: string;
  knockouts: number;
  seated: boolean;
  isActive: boolean;
  tableAssignment?: {
    tableIndex: number;
    seatIndex: number;
  };
}

interface Tournament {
  state: {
    players: Player[];
    settings: {
      tables?: {
        numberOfTables: number;
        seatsPerTable: number;
        tableNames: string[];
        tableFeltColors?: { [tableName: string]: string };
      };
      tableBackgrounds?: string[];
    };
  };
}

interface TablesSectionReadOnlyProps {
  tournament: Tournament;
}

export default function TablesSectionReadOnly({ tournament }: TablesSectionReadOnlyProps) {
  const { players, settings } = tournament.state;
  // Use settings from tournament state
  const tableSettings = tournament.state.settings?.tables || {
    numberOfTables: 1,
    seatsPerTable: 9,
    tableNames: ['Table 1']
  };

  // Get table backgrounds from settings (sync with main app)
  const tableBackgrounds = tournament.state.settings?.tableBackgrounds || [];
  
  const getTableBackgroundClass = (tableIndex: number) => {
    const bgClass = tableBackgrounds[tableIndex] || 'felt-green';
    
    // Convert felt class to gradient background
    const feltToGradient: Record<string, string> = {
      'felt-green':    'bg-gradient-to-br from-green-800 to-green-900',
      'felt-blue':     'bg-gradient-to-br from-blue-800 to-blue-900',
      'felt-red':      'bg-gradient-to-br from-red-800 to-red-900',
      'felt-purple':   'bg-gradient-to-br from-purple-800 to-purple-900',
      'felt-orange':   'bg-gradient-to-br from-orange-700 to-orange-900',
      'felt-teal':     'bg-gradient-to-br from-teal-700 to-teal-900',
      'felt-pink':     'bg-gradient-to-br from-pink-700 to-pink-900',
      'felt-yellow':   'bg-gradient-to-br from-yellow-600 to-yellow-800',
      'felt-black':    'bg-gradient-to-br from-gray-800 to-gray-900',
      'felt-burgundy': 'bg-gradient-to-br from-red-900 to-red-950',
    };
    
    return feltToGradient[bgClass] || 'bg-gradient-to-br from-green-800 to-green-900';
  };

  // Get seated players
  const seatedPlayers = players.filter(p => p.seated && p.tableAssignment && p.isActive !== false);

  // Create table structure
  const tables = Array.from({ length: tableSettings.numberOfTables }, (_, tableIndex) => {
    const tableName = tableSettings.tableNames[tableIndex] || `Table ${tableIndex + 1}`;
    const seats = Array.from({ length: tableSettings.seatsPerTable }, (_, seatIndex) => {
      const player = seatedPlayers.find(p => 
        p.tableAssignment?.tableIndex === tableIndex && 
        p.tableAssignment?.seatIndex === seatIndex
      );
      return {
        seatIndex,
        player: player || null
      };
    });

    return {
      tableIndex,
      tableName,
      seats,
      playersCount: seats.filter(s => s.player).length
    };
  });

  const totalSeatedPlayers = seatedPlayers.length;
  const totalAvailableSeats = tableSettings.numberOfTables * tableSettings.seatsPerTable;

    

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-purple-500" />
          Table Seating
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        

        {/* Tables Grid - Poker Table Style */}
        <div className="space-y-6">
          {tables.map((table) => (
            
            <Card key={table.tableIndex} className="bg-card/80 backdrop-blur-sm border-border/50">
              {/* Table Header */}
              <div className="flex items-center justify-between p-4">
                <h4 className="font-semibold text-lg text-foreground">{table.tableName}</h4>
                <Badge variant="outline" className="text-sm">
                  {table.playersCount}/{tableSettings.seatsPerTable} seated
                </Badge>
              </div>

              {/* Poker Table Visual */}
              <div className="relative p-4">
                {/* Table Felt Background */}
                <div className={`${getTableBackgroundClass(table.tableIndex)} rounded-full p-8 shadow-2xl border-8 border-amber-600/30`}>
                  <div className="bg-green-900/50 rounded-full p-6 border-4 border-green-700/40">
                    {/* Table Center */}
                    <div className="h-32 bg-green-800/30 rounded-full flex items-center justify-center border-2 border-green-600/20">
                      <div className="text-center">
                        <div className="text-green-200 font-bold text-lg">{table.tableName}</div>
                        <div className="text-green-300 text-sm">{table.playersCount} players</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Player Seats around the table */}
                <div className="absolute inset-0">
                  {table.seats.map((seat) => {
                    // Calculate seat position around the oval table
                    const angle = (seat.seatIndex / tableSettings.seatsPerTable) * 2 * Math.PI - Math.PI / 2;
                    const radiusX = 140; // Horizontal radius
                    const radiusY = 100; // Vertical radius
                    const x = Math.cos(angle) * radiusX;
                    const y = Math.sin(angle) * radiusY;

                    return (
                      <div
                        key={seat.seatIndex}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `calc(50% + ${x}px)`,
                          top: `calc(50% + ${y}px)`,
                        }}
                      >
                        {seat.player ? (
                          // Occupied seat
                          <div className="bg-blue-600 text-white rounded-lg p-3 shadow-lg border-2 border-blue-400 min-w-[80px] text-center">
                            <div className="text-xs font-medium">Seat {seat.seatIndex + 1}</div>
                            <div className="font-bold text-sm truncate max-w-[70px]" title={seat.player.name}>
                              {seat.player.name}
                            </div>
                            {seat.player.knockouts > 0 && (
                              <div className="text-xs text-red-200 mt-1">
                                {seat.player.knockouts} KO{seat.player.knockouts !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        ) : (
                          // Empty seat
                          <div className="bg-gray-700 text-gray-400 rounded-lg p-3 shadow-lg border-2 border-gray-600 min-w-[80px] text-center">
                            <div className="text-xs font-medium">Seat {seat.seatIndex + 1}</div>
                            <div className="text-xs mt-1">Empty</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {totalSeatedPlayers === 0 && (
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No players are seated yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}