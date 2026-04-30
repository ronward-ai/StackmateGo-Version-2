import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCheck, ChevronRight, CheckCircle2 } from 'lucide-react';

interface TournamentPlayer {
  id: string;
  name: string;
  isActive?: boolean;
  claimedBy?: string;
  tableAssignment?: { tableIndex: number; seatIndex: number };
  seatInfo?: { tableIndex: number; seatIndex: number; totalSeatedPlayers: number };
}

export default function PlayerClaimView() {
  const params = useParams<{ tournamentId: string }>();
  const tournamentId = params.tournamentId;
  const [, setLocation] = useLocation();

  const { user, isAuthenticated, isLoading, signInAnonymously } = useAuth();
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [tournamentName, setTournamentName] = useState('');
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Sign in anonymously if needed
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      signInAnonymously().catch(console.error);
    }
  }, [isAuthenticated, isLoading, signInAnonymously]);

  // Check if already claimed on this device
  useEffect(() => {
    if (!tournamentId) return;
    const stored = localStorage.getItem(`claimedPlayer_${tournamentId}`);
    if (stored) setClaimed(stored);
  }, [tournamentId]);

  // Load players from Firestore
  useEffect(() => {
    if (!tournamentId) return;

    let unsubscribe: (() => void) | null = null;

    const load = async () => {
      try {
        const { doc, onSnapshot } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const docRef = doc(db, 'activeTournaments', tournamentId);
        unsubscribe = onSnapshot(
          docRef,
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              setPlayers((data.players || []).filter((p: TournamentPlayer) => p.isActive !== false));
              setTournamentName(data.details?.name || data.name || 'Tournament');
            } else {
              setError('Tournament not found. Check the QR code and try again.');
            }
            setDataLoaded(true);
          },
          (err) => {
            console.error('Firestore read error:', err);
            setError('Could not load tournament data. Please try again.');
            setDataLoaded(true);
          }
        );
      } catch {
        setError('Could not connect. Check your connection and try again.');
        setDataLoaded(true);
      }
    };

    load();
    return () => { unsubscribe?.(); };
  }, [tournamentId]);

  const handleClaim = async (player: TournamentPlayer) => {
    if (!tournamentId) return;
    setClaiming(player.id);

    try {
      // Use the app's user id (consistent with the rest of the codebase)
      const uid = (user as any)?.id || (user as any)?.uid || `device_${player.id}`;

      const { doc, updateDoc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const docRef = doc(db, 'activeTournaments', tournamentId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error('Tournament not found');

      const data = snap.data();
      const updatedPlayers = (data.players || []).map((p: TournamentPlayer) =>
        p.id === player.id ? { ...p, claimedBy: uid } : p
      );
      await updateDoc(docRef, { players: updatedPlayers });

      localStorage.setItem(`claimedPlayer_${tournamentId}`, player.id);
      setClaimed(player.id);
    } catch (e: any) {
      const msg = e?.code === 'permission-denied'
        ? 'Check-in requires a connection — try again or enter as spectator.'
        : 'Could not claim seat. Please try again.';
      setClaimError(msg);
    } finally {
      setClaiming(null);
    }
  };

  const handleUnclaim = async () => {
    if (!tournamentId || !claimed) return;
    try {
      const { doc, updateDoc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const docRef = doc(db, 'activeTournaments', tournamentId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const updatedPlayers = (data.players || []).map((p: TournamentPlayer) =>
        p.id === claimed ? { ...p, claimedBy: undefined } : p
      );
      await updateDoc(docRef, { players: updatedPlayers });
      localStorage.removeItem(`claimedPlayer_${tournamentId}`);
      setClaimed(null);
    } catch {
      // silently ignore
    }
  };

  const claimedPlayer = players.find(p => p.id === claimed);
  const uid = (user as any)?.id || (user as any)?.uid;
  const unclaimed = players.filter(p => !p.claimedBy);
  const alreadyClaimed = players.filter(p => p.claimedBy && p.claimedBy !== uid);

  if (!dataLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Connecting…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="p-6 max-w-sm w-full text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={() => setLocation(`/tournament/${tournamentId}`)}>
            View as spectator
          </Button>
        </Card>
      </div>
    );
  }

  // Already claimed — show confirmation
  if (claimed && claimedPlayer) {
    const seat = claimedPlayer.tableAssignment || claimedPlayer.seatInfo;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="p-6 max-w-sm w-full text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold">{claimedPlayer.name}</h1>
          <p className="text-muted-foreground text-sm">You're checked in!</p>
          {seat && (
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-sm font-medium">
                Table {(seat.tableIndex ?? 0) + 1} · Seat {(seat.seatIndex ?? 0) + 1}
              </p>
            </div>
          )}
          <Button className="w-full" onClick={() => setLocation(`/tournament/${tournamentId}`)}>
            <ChevronRight className="mr-2 h-4 w-4" />
            Go to tournament view
          </Button>
          <button
            className="text-xs text-muted-foreground underline"
            onClick={handleUnclaim}
          >
            Not you? Unclaim
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-3">
          <img
            src="/stackmatelogo.svg"
            alt="StackMate Go"
            className="h-7 w-auto object-contain"
            style={{ filter: 'brightness(1.1)' }}
          />
          <span className="flex items-center gap-1 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            LIVE
          </span>
        </div>
        <h1 className="text-xl font-bold">{tournamentName}</h1>
        <p className="text-muted-foreground text-sm mt-1">Tap your name to check in</p>
      </div>

      {/* Inline claim error */}
      {claimError && (
        <Card className="p-4 mb-4 border-destructive/40 text-center space-y-3">
          <p className="text-sm text-destructive">{claimError}</p>
          <div className="flex gap-2 justify-center">
            <Button size="sm" variant="outline" onClick={() => setClaimError(null)}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLocation(`/tournament/${tournamentId}`)}>
              Enter as spectator
            </Button>
          </div>
        </Card>
      )}

      {/* Unclaimed players */}
      {unclaimed.length > 0 ? (
        <div className="space-y-2">
          {unclaimed.map(player => (
            <button
              key={player.id}
              onClick={() => handleClaim(player)}
              disabled={claiming === player.id}
              className="w-full text-left"
            >
              <Card className="p-4 flex items-center justify-between hover:border-orange-500/50 transition-colors active:scale-[0.98]">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-orange-400 font-bold text-sm">
                      {player.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="font-medium">{player.name}</span>
                </div>
                {claiming === player.id ? (
                  <span className="text-xs text-muted-foreground animate-pulse">Claiming…</span>
                ) : (
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                )}
              </Card>
            </button>
          ))}
        </div>
      ) : (
        players.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            No players added yet. Ask your director.
          </Card>
        )
      )}

      {/* Already checked in */}
      {alreadyClaimed.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground px-1">Already checked in</p>
          {alreadyClaimed.map(player => (
            <Card key={player.id} className="p-4 flex items-center gap-3 opacity-40">
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span className="text-sm">{player.name}</span>
            </Card>
          ))}
        </div>
      )}

      {/* Bottom actions */}
      <div className="mt-8 text-center space-y-2">
        {players.length > 0 && unclaimed.length === 0 && (
          <p className="text-xs text-muted-foreground mb-2">
            Not in the list? Ask your director to add you.
          </p>
        )}
        {unclaimed.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2">
            Not in the list? Ask your director to add you.
          </p>
        )}
        <button
          className="text-xs text-muted-foreground underline"
          onClick={() => setLocation(`/tournament/${tournamentId}`)}
        >
          Watch as spectator instead
        </button>
      </div>
    </div>
  );
}
