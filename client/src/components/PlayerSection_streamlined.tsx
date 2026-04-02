import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserPlus, X } from 'lucide-react';
import { db, collections } from '@/lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';

interface PlayerSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

interface SavedPlayerName {
  id: string | number;
  name: string;
  createdAt: string;
}

export default function PlayerSection({ tournament }: PlayerSectionProps) {
  const { state, addPlayer } = tournament;
  const { user } = useAuth();
  const [playerName, setPlayerName] = useState('');
  const [savedNames, setSavedNames] = useState<SavedPlayerName[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  // Load saved player names
  useEffect(() => {
    fetchSavedNames();
  }, [user]);

  // Get frequently used players (recent 8)
  const getFrequentPlayers = () => {
    return savedNames
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
      .map(p => p.name)
      .filter(name => !state.players.some(player => player.name === name));
  };

  const fetchSavedNames = async () => {
    try {
      const q = query(collections.playerNames, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const names = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };
      });
      setSavedNames(names);
    } catch (error) {
      console.error('Failed to fetch saved names:', error);
    }
  };

  const handleAddPlayer = async () => {
    if (playerName.trim()) {
      addPlayer(playerName);
      
      // Save the name to database if it doesn't exist
      const nameExists = savedNames.some(saved => saved.name.toLowerCase() === playerName.trim().toLowerCase());
      if (!nameExists) {
        try {
          await addDoc(collections.playerNames, {
            name: playerName.trim(),
            createdAt: serverTimestamp()
          });
          fetchSavedNames();
        } catch (error) {
          console.error('Failed to save player name:', error);
        }
      }
      
      setPlayerName('');
    }
  };

  const handlePlayerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddPlayer();
    }
  };

  const handleRemovePlayer = (playerId: string) => {
    const updatedPlayers = state.players.filter(player => player.id !== playerId);
    tournament.updatePlayers(updatedPlayers);
  };

  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-secondary">groups</span>
          Players ({state.players.length})
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'unfold_less' : 'unfold_more'}
        </span>
      </div>

      {isExpanded && (
        <div className="pt-4 space-y-6">
          {/* Quick Add Recent Players */}
          {getFrequentPlayers().length > 0 && (
            <div>
              <div className="flex gap-3">
                <Select onValueChange={(value) => addPlayer(value)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add recent player" />
                  </SelectTrigger>
                  <SelectContent>
                    {getFrequentPlayers().map((name: string) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => {
                    getFrequentPlayers().forEach((name: string) => addPlayer(name));
                  }}
                >
                  Add All ({getFrequentPlayers().length})
                </Button>
              </div>
            </div>
          )}

          {/* Add New Player */}
          <div>
            <div className="flex gap-3">
              <input 
                type="text" 
                placeholder="Enter player name" 
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={handlePlayerKeyDown}
                className="flex-1 rounded-md px-3 py-2 bg-input border border-border"
              />
              <Button 
                onClick={handleAddPlayer}
                disabled={!playerName.trim()}
                className="px-4"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </div>

          {/* Players List */}
          {state.players.length > 0 && (
            <div className="space-y-3">
              {state.players.map((player) => (
                <div key={player.id} className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className="font-medium">{player.name}</div>
                    {player.seated && (
                      <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full">
                        Seated
                      </span>
                    )}
                    {player.knockouts > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {player.knockouts} KO{player.knockouts > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => handleRemovePlayer(player.id)}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isExpanded && state.players.length > 0 && (
        <div className="pt-2 text-sm text-muted-foreground border-t border-border mt-4">
          {state.players.length} players • {state.players.filter(p => p.seated).length} seated
        </div>
      )}
    </Card>
  );
}