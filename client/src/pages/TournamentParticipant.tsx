import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Users, MapPin, Clock, Trophy, LogOut } from 'lucide-react';
import { AuthModal } from "@/components/AuthModal";

interface TableAssignment {
  id: number;
  tournamentId: string | number;
  tableNumber: number;
  seatNumber: number;
  playerId: string | null;
  playerName: string | null;
  isActive: boolean;
}

interface TournamentInfo {
  id: string | number;
  name: string;
  currentLevel: number;
  secondsLeft: number;
  isRunning: boolean;
  buyIn: number;
  prizeStructure?: any;
}

export default function TournamentParticipant() {
  const { user, isAuthenticated, isLoading, login, logout, signInAnonymously } = useAuth();
  const { toast } = useToast();
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [seatingAssignments, setSeatingAssignments] = useState<TableAssignment[]>([]);
  const [myAssignment, setMyAssignment] = useState<TableAssignment | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [tournamentId, setTournamentId] = useState<string | number | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const signIn = async () => {
        try {
          await signInAnonymously();
        } catch (error) {
          console.error("Failed to sign in anonymously:", error);
          toast({
            title: "Authentication Failed",
            description: "Could not connect to the tournament server.",
            variant: "destructive",
          });
        }
      };
      signIn();
    }
  }, [isAuthenticated, isLoading, toast, signInAnonymously]);

  // Firebase connection for real-time updates
  useEffect(() => {
    if (tournamentId && isAuthenticated) {
      let unsubscribe = () => {};
      
      const setupFirebaseListener = async () => {
        const { doc, onSnapshot } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        
        const docRef = doc(db, 'activeTournaments', tournamentId.toString());
        unsubscribe = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Update tournament info
            setTournament({
              id: docSnap.id as any,
              name: data.name || 'Tournament',
              currentLevel: data.currentLevel || 0,
              secondsLeft: data.secondsLeft || 0,
              isRunning: data.isRunning || false,
              buyIn: data.prizeStructure?.buyIn || 0,
            });
            
            // Update seating assignments based on players array
            if (data.players && Array.isArray(data.players)) {
              const assignments: TableAssignment[] = data.players
                .filter((p: any) => p.tableAssignment)
                .map((p: any) => ({
                  id: p.id,
                  tournamentId: tournamentId,
                  tableNumber: p.tableAssignment.tableIndex + 1,
                  seatNumber: p.tableAssignment.seatIndex + 1,
                  playerId: p.id,
                  playerName: p.name,
                  isActive: p.isActive
                }));
                
              setSeatingAssignments(assignments);
              updateMyAssignment(assignments);
            }
          }
        }, (error) => {
          console.error('Firebase listener error:', error);
        });
      };
      
      setupFirebaseListener();
      
      return () => {
        unsubscribe();
      };
    }
  }, [tournamentId, isAuthenticated]);

  const updateMyAssignment = (assignments: TableAssignment[]) => {
    if (user) {
      const mySeating = assignments.find(a => a.playerName === playerName);
      setMyAssignment(mySeating || null);
    }
  };

  const joinTournament = async () => {
    if (!joinCode.trim() || !playerName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both tournament code and your player name.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { collection, query, where, getDocs, doc, updateDoc, arrayUnion } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      // First find tournament by access code
      const q = query(collection(db, 'activeTournaments'), where('participantCode', '==', joinCode.trim().toUpperCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        toast({
          title: "Invalid Code",
          description: "Tournament not found with that access code.",
          variant: "destructive",
        });
        return;
      }

      const targetTournamentDoc = querySnapshot.docs[0];
      const targetTournament = { id: targetTournamentDoc.id, ...targetTournamentDoc.data() } as TournamentInfo;

      // Join the tournament
      const docRef = doc(db, 'activeTournaments', targetTournament.id as string);
      
      // Add the player to the tournament's players array
      const newPlayer = {
        id: Math.random().toString(36).substr(2, 9),
        name: playerName.trim(),
        isActive: true,
        chips: targetTournament.prizeStructure?.startingChips || 1000,
        position: 0,
        rebuys: 0,
        addons: 0,
        bounties: 0
      };

      await updateDoc(docRef, {
        players: arrayUnion(newPlayer)
      });

      setTournament(targetTournament);
      setTournamentId(targetTournament.id);
      
      toast({
        title: "Joined Tournament",
        description: `Welcome to ${targetTournament.name}!`,
      });
    } catch (error: any) {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Please sign in to continue.",
          variant: "destructive",
        });
        setShowAuthModal(true);
        return;
      }
      
      toast({
        title: "Error",
        description: "Failed to join tournament. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLogout = () => {
    logout();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
        <div className="max-w-md mx-auto pt-16">
          <div className="text-center mb-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-white">Join Tournament</h1>
              <Button variant="ghost" onClick={handleLogout} className="text-white">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
            <p className="text-gray-300">Enter the tournament code to see your seating assignment</p>
          </div>

          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Tournament Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter tournament code"
                  className="w-full p-3 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Your Player Name</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name as it appears in the tournament"
                  className="w-full p-3 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              
              <Button 
                onClick={joinTournament} 
                className="w-full"
                disabled={!joinCode.trim() || !playerName.trim()}
              >
                Join Tournament
              </Button>
            </div>
          </Card>

          <div className="mt-6 text-center text-gray-400 text-sm">
            <p>Welcome, {user && ('playerName' in user ? user.playerName : user.firstName || user.email)}</p>
          </div>
        </div>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">{tournament.name}</h1>
            <p className="text-gray-300">Tournament Participant View</p>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="text-white">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* My Seating Assignment */}
        {myAssignment ? (
          <Card className="p-6 mb-6 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-blue-500/30">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-2 flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Your Seat Assignment
                </h2>
                <div className="space-y-1">
                  <p className="text-lg text-gray-300">
                    <span className="font-medium">Table:</span> {myAssignment.tableNumber}
                  </p>
                  <p className="text-lg text-gray-300">
                    <span className="font-medium">Seat:</span> {myAssignment.seatNumber}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="secondary" className="bg-green-100 text-green-800 text-lg px-3 py-1">
                  Seated
                </Badge>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 mb-6 bg-gradient-to-r from-orange-600/20 to-red-600/20 border-orange-500/30">
            <div className="text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-orange-400" />
              <h2 className="text-xl font-semibold text-white mb-2">Waiting for Seat Assignment</h2>
              <p className="text-gray-300">You'll be notified when seating is arranged</p>
            </div>
          </Card>
        )}

        {/* Tournament Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center">
              <Clock className="h-5 w-5 mr-2 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Time Remaining</p>
                <p className="font-semibold">{formatTime(tournament.secondsLeft)}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">Current Level</p>
                <p className="font-semibold">{tournament.currentLevel + 1}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center">
              <Users className="h-5 w-5 mr-2 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Buy-in</p>
                <p className="font-semibold">£{tournament.buyIn}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* All Tables Overview */}
        {seatingAssignments.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Tournament Seating
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from(new Set(seatingAssignments.map(a => a.tableNumber)))
                .sort((a, b) => a - b)
                .map(tableNum => {
                  const tableSeats = seatingAssignments
                    .filter(a => a.tableNumber === tableNum && a.isActive)
                    .sort((a, b) => a.seatNumber - b.seatNumber);
                  
                  return (
                    <div key={tableNum} className="border rounded-lg p-4">
                      <h4 className="font-medium mb-3 text-center">Table {tableNum}</h4>
                      <div className="space-y-2">
                        {tableSeats.map(seat => (
                          <div
                            key={seat.seatNumber}
                            className={`flex justify-between items-center p-2 rounded text-sm ${
                              seat.playerName === playerName
                                ? 'bg-blue-100 text-blue-900 font-medium'
                                : 'bg-gray-50'
                            }`}
                          >
                            <span>Seat {seat.seatNumber}</span>
                            <span>{seat.playerName || 'Empty'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        )}
      </div>
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}