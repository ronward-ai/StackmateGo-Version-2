import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserCheck, Users, ChevronRight, CheckCircle2, UserPlus } from 'lucide-react';

interface TournamentPlayer {
  id: string;
  name: string;
  isActive?: boolean;
  claimedBy?: string;
  tableAssignment?: { tableIndex: number; seatIndex: number };
  seatInfo?: { tableIndex: number; seatIndex: number; totalSeatedPlayers: number };
}

interface LeaguePlayerRecord {
  id: string;
  name: string;
}

export default function PlayerClaimView() {
  const params = useParams<{ tournamentId: string }>();
  const tournamentId = params.tournamentId;
  const [, setLocation] = useLocation();

  const { user, isAuthenticated, isLoading, signInAnonymously } = useAuth();
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [tournamentName, setTournamentName] = useState('');
  const [claiming, setClaming] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [selfRegName, setSelfRegName] = useState('');
  const [showSelfReg, setShowSelfReg] = useState(false);
  const [selfRegLoading, setSelfRegLoading] = useState(false);
  const [isLeagueTournament, setIsLeagueTournament] = useState(false);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [leagueRoster, setLeagueRoster] = useState<LeaguePlayerRecord[]>([]);

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
    if (stored) {
      setClaimed(stored);
    }
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
              setIsLeagueTournament(data.settings?.isSeasonTournament ?? false);
              setLeagueId(data.settings?.leagueId || null);
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
      } catch (e: any) {
        setError('Could not connect. Check your connection and try again.');
        setDataLoaded(true);
      }
    };

    load();
    return () => { unsubscribe?.(); };
  }, [tournamentId]);

  // Load league roster once leagueId is known (anonymous auth is sufficient)
  useEffect(() => {
    if (!leagueId) return;

    const load = async () => {
      try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const q = query(collection(db, 'leaguePlayers'), where('leagueId', '==', leagueId));
        const snap = await getDocs(q);
        const roster: LeaguePlayerRecord[] = snap.docs
          .map(d => ({ id: d.id, name: d.data().name as string }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setLeagueRoster(roster);
      } catch (e) {
        // silently ignore — fall back to "ask director" message
      }
    };

    load();
  }, [leagueId]);

  const handleClaim = async (player: TournamentPlayer) => {
    if (!tournamentId) return;
    setClaming(player.id);

    try {
      let uid = (user as any)?.uid as string | undefined;
      if (!uid) {
        try {
          const { getAuth, signInAnonymously: firebaseSignIn } = await import('firebase/auth');
          const { app } = await import('@/lib/firebase');
          const result = await firebaseSignIn(getAuth(app));
          uid = result.user.uid;
        } catch {
          // proceed without uid
        }
      }

      const { doc, updateDoc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const docRef = doc(db, 'activeTournaments', tournamentId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error('Tournament not found');

      const data = snap.data();
      const updatedPlayers = (data.players || []).map((p: TournamentPlayer) =>
        p.id === player.id ? { ...p, claimedBy: uid ?? `device_${player.id}` } : p
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
      setClaming(null);
    }
  };

  // Add a league roster member to this tournament and immediately claim their seat
  const handleLeaguePlayerJoin = async (leaguePlayer: LeaguePlayerRecord) => {
    if (!tournamentId) return;
    setClaming(leaguePlayer.id);

    try {
      let uid: string | undefined;
      try {
        const { getAuth, signInAnonymously: firebaseSignIn } = await import('firebase/auth');
        const { app } = await import('@/lib/firebase');
        const result = await firebaseSignIn(getAuth(app));
        uid = result.user.uid;
      } catch { /* proceed without uid */ }

      const { doc, updateDoc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const docRef = doc(db, 'activeTournaments', tournamentId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error('Tournament not found');

      const newPlayer: TournamentPlayer = {
        id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: leaguePlayer.name,
        isActive: true,
        claimedBy: uid ?? `device_${Date.now()}`,
      };

      const data = snap.data();
      await updateDoc(docRef, { players: [...(data.players || []), newPlayer] });

      localStorage.setItem(`claimedPlayer_${tournamentId}`, newPlayer.id);
      setClaimed(newPlayer.id);
    } catch (e: any) {
      const msg = e?.code === 'permission-denied'
        ? 'Check-in requires a connection — try again or enter as spectator.'
        : 'Could not join. Please try again.';
      setClaimError(msg);
    } finally {
      setClaming(null);
    }
  };

  const handleSelfRegister = async () => {
    const name = selfRegName.trim();
    if (!name || !tournamentId) return;
    setSelfRegLoading(true);
    try {
      let uid: string | undefined;
      try {
        const { getAuth, signInAnonymously: firebaseSignIn } = await import('firebase/auth');
        const { app } = await import('@/lib/firebase');
        const result = await firebaseSignIn(getAuth(app));
        uid = result.user.uid;
      } catch { /* proceed without uid */ }

      const { doc, updateDoc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const docRef = doc(db, 'activeTournaments', tournamentId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error('Tournament not found');

      const newPlayer: TournamentPlayer = {
        id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        isActive: true,
        claimedBy: uid ?? `device_${Date.now()}`,
      };

      const data = snap.data();
      await updateDoc(docRef, { players: [...(data.players || []), newPlayer] });

      localStorage.setItem(`claimedPlayer_${tournamentId}`, newPlayer.id);
      setClaimed(newPlayer.id);
    } catch (e: any) {
      setClaimError('Could not join. Please try again.');
    } finally {
      setSelfRegLoading(false);
    }
  };

  const handleUnclaim = async () => {
    if (!user || !tournamentId || !claimed) return;
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
    } catch (e) {
      // silently ignore
    }
  };

  const claimedPlayer = players.find(p => p.id === claimed);
  const uid = (user as any)?.uid;

  if (!dataLoaded || isLoading) {
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

  const unclaimed = players.filter(p => !p.claimedBy);
  const alreadyClaimed = players.filter(p => p.claimedBy && p.claimedBy !== uid);

  // Match a league roster name against the tournament player list (case-insensitive)
  const findTournamentPlayer = (rosterName: string) =>
    players.find(p => p.name.toLowerCase() === rosterName.toLowerCase());

  // Show league roster when this is a league tournament AND we have players on record
  const showLeagueRoster = isLeagueTournament && leagueRoster.length > 0;

  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <Users className="h-10 w-10 text-orange-500 mx-auto mb-2" />
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

      {/* ── League roster ── */}
      {showLeagueRoster && (
        <div className="space-y-2">
          {leagueRoster.map(rp => {
            const tp = findTournamentPlayer(rp.name);
            const isCheckedIn = !!tp?.claimedBy;
            const canClaim = tp && !tp.claimedBy;  // added by director, not yet claimed
            const isClaiming = claiming === (tp?.id ?? rp.id);

            if (isCheckedIn) {
              return (
                <Card key={rp.id} className="p-4 flex items-center gap-3 opacity-40">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{rp.name}</span>
                </Card>
              );
            }

            return (
              <button
                key={rp.id}
                onClick={() => canClaim ? handleClaim(tp!) : handleLeaguePlayerJoin(rp)}
                disabled={isClaiming}
                className="w-full text-left"
              >
                <Card className="p-4 flex items-center justify-between hover:border-orange-500/50 transition-colors active:scale-[0.98]">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-orange-400 font-bold text-sm">
                        {rp.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="font-medium">{rp.name}</span>
                  </div>
                  {isClaiming ? (
                    <span className="text-xs text-muted-foreground animate-pulse">Joining…</span>
                  ) : (
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                  )}
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Casual tournament: self-register form ── */}
      {!isLeagueTournament && (players.length === 0 || showSelfReg) && (
        <Card className="p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-orange-500" />
            {players.length === 0 ? 'Enter your name to join' : 'Add yourself'}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Your name"
              value={selfRegName}
              onChange={e => setSelfRegName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSelfRegister()}
              className="flex-1"
              autoFocus={players.length === 0}
            />
            <Button
              onClick={handleSelfRegister}
              disabled={!selfRegName.trim() || selfRegLoading}
              className="shrink-0"
            >
              {selfRegLoading ? 'Joining…' : 'Join'}
            </Button>
          </div>
          {showSelfReg && players.length > 0 && (
            <button className="text-xs text-muted-foreground underline" onClick={() => setShowSelfReg(false)}>
              Cancel
            </button>
          )}
        </Card>
      )}

      {/* ── Casual tournament: director-added unclaimed players ── */}
      {!showLeagueRoster && unclaimed.length > 0 && (
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
      )}

      {/* ── Casual tournament: already claimed ── */}
      {!showLeagueRoster && alreadyClaimed.length > 0 && (
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

      {/* ── League with no roster yet (leagueId not stored or no players added yet) ── */}
      {isLeagueTournament && !showLeagueRoster && (
        <Card className="p-4 mb-4 text-center text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">League tournament</p>
          <p>No league players found. Ask your director to add players to the league first.</p>
        </Card>
      )}

      {/* Bottom actions */}
      <div className="mt-8 text-center space-y-2">
        {!isLeagueTournament && players.length > 0 && !showSelfReg && (
          <button
            className="text-xs text-muted-foreground underline block mx-auto mb-2"
            onClick={() => setShowSelfReg(true)}
          >
            Not in the list? Add yourself
          </button>
        )}
        {isLeagueTournament && showLeagueRoster && (
          <p className="text-xs text-muted-foreground mb-2">
            Not in the list? Ask your director to add you to the league.
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
