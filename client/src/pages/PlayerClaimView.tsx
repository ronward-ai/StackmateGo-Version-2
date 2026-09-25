import { useState, useEffect } from 'react';
import { eventNameOfTournament } from '@/lib/eventName';
import { useParams, useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCheck, ChevronRight, CheckCircle2 } from 'lucide-react';
import { getDeviceId } from '@/lib/deviceId';
import { claimedByFor, claimFieldPath, type ClaimsMap } from '@/lib/seatClaims';
import EmptyState from '@/components/ui/empty-state';

interface TournamentPlayer {
  id: string;
  name: string;
  isActive?: boolean;
  claimedBy?: string;
  tableAssignment?: { tableIndex: number; seatIndex: number };
  seatInfo?: { tableIndex: number; seatIndex: number; totalSeatedPlayers: number };
}

const fromVal = (v: any): any => {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromVal);
  if ('mapValue' in v) {
    const o: any = {};
    for (const [k, fv] of Object.entries(v.mapValue.fields || {})) o[k] = fromVal(fv as any);
    return o;
  }
  return null;
};

export default function PlayerClaimView() {
  const params = useParams<{ tournamentId: string }>();
  const tournamentId = params.tournamentId;
  const [, setLocation] = useLocation();

  const deviceId = getDeviceId();
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  // Who has checked in as whom. See lib/seatClaims.ts — this used to live
  // INSIDE each player entry, which is what let a check-in write touch
  // anything else in the players array too. It is its own top-level document
  // field now, and this view never writes to `players` again.
  const [claims, setClaims] = useState<ClaimsMap>({});
  const [tournamentName, setTournamentName] = useState('');
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

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
        const { projectId, databaseId, db } = await import('@/lib/firebase');

        // Initial load via REST (no auth required)
        const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(databaseId)}/documents/activeTournaments/${tournamentId}`;
        const restRes = await fetch(restUrl);
        if (restRes.ok) {
          const raw = await restRes.json();
          const fields: any = {};
          for (const [k, fv] of Object.entries(raw.fields || {})) fields[k] = fromVal(fv as any);
          setPlayers((fields.players || []).filter((p: TournamentPlayer) => p.isActive !== false));
          setClaims(fields.claims || {});
          // Same resolver as everywhere else. `name` is written once at
          // creation from a field nothing sets, so on its own it reads
          // "Tournament <date>" for every ordinary game.
          setTournamentName(eventNameOfTournament(fields, null) || 'Tournament');
          setDataLoaded(true);
        } else if (restRes.status === 404) {
          setError('Tournament not found. Check the QR code and try again.');
          setDataLoaded(true);
          return;
        } else {
          setError('Could not load tournament data. Please try again.');
          setDataLoaded(true);
          return;
        }

        // Real-time updates via SDK
        const { doc, onSnapshot } = await import('firebase/firestore');
        const docRef = doc(db, 'activeTournaments', tournamentId);
        unsubscribe = onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setPlayers((data.players || []).filter((p: TournamentPlayer) => p.isActive !== false));
            setClaims(data.claims || {});
            setTournamentName(eventNameOfTournament(data as any, null) || 'Tournament');
          }
        }, (err) => {
          console.error('Firestore listener error:', err);
        });
      } catch (e: any) {
        setError('Could not connect. Check your connection and try again.');
        setDataLoaded(true);
      }
    };

    load();
    return () => { unsubscribe?.(); };
  }, [tournamentId]);

  /**
   * Signs the visitor in anonymously if they are not already, so the claim
   * write below carries a session the rule can check.
   *
   * The write used to go out with no session at all, and the rule admitted it
   * unauthenticated. Anyone who could see the QR code could therefore PATCH
   * the tournament from anywhere, with nothing tying the write to a session.
   * Anonymous auth costs the participant nothing — the live view already
   * signs every visitor in this way.
   *
   * It was deferred once because anonymous auth was the leading suspect for
   * the "quota limit exceeded" reports, and check-in was the one participant
   * flow that did not depend on it. That turned out to be the database's
   * shared quota billing and nothing to do with auth, so the reason expired.
   */
  const ensureSession = async (): Promise<void> => {
    const { signInAnonymously } = await import('firebase/auth');
    // The app's own auth instance, not getAuth() — this route reaches Firebase
    // only through dynamic imports, and picking up the default app implicitly
    // is one initialisation-order bug waiting to happen.
    const { auth } = await import('@/lib/firebase');
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
    } catch (err: any) {
      // Anonymous sign-in is a hard dependency of check-in now, where it never
      // used to be. If the provider is switched off in the Firebase console
      // this is exactly where it surfaces, and a generic "try again" would
      // send someone hunting in the wrong place.
      throw new Error(
        err?.code === 'auth/operation-not-allowed' || err?.code === 'auth/admin-restricted-operation'
          ? 'Anonymous sign-in is disabled for this project, so check-in cannot be authorised.'
          : `Could not start a session: ${err?.code || err?.message || 'unknown error'}`
      );
    }
  };

  /**
   * Claims one seat, touching only `claims.<playerId>` — a single key in the
   * top-level claims map, never the players array. The rule constrains a
   * check-in write to that map and nothing else, so there is no longer a
   * field on a player entry for this write to reach.
   *
   * A transaction, not a bare update: the old array-based version read the
   * players array, then wrote it back with no check that the seat was still
   * free at the moment of writing — two people tapping the same name within
   * the same round-trip could have the second silently steal the seat from
   * the first. Reading the live claim inside the transaction and rejecting a
   * write that would steal an existing DIFFERENT device's claim closes that
   * race rather than narrowing it. The same device re-claiming its own seat
   * (a retry, or a seat claimed under the old players-array scheme) is not a
   * conflict and proceeds.
   */
  const handleClaim = async (player: TournamentPlayer) => {
    if (!tournamentId) return;
    setClaiming(player.id);
    setClaimError(null);
    try {
      await ensureSession();
      const { runTransaction, doc: firestoreDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const docRef = firestoreDoc(db, 'activeTournaments', tournamentId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists()) throw new Error('Tournament not found.');
        const existing = claimedByFor(snap.data() as any, player.id);
        if (existing && existing !== deviceId) {
          throw new Error('Someone already checked in as this player. Refresh and try again.');
        }
        tx.update(docRef, { [claimFieldPath(player.id)]: deviceId });
      });
      localStorage.setItem(`claimedPlayer_${tournamentId}`, player.id);
      setClaimed(player.id);
    } catch (e: any) {
      // Say what actually went wrong. This used to swallow everything into
      // "Please try again", which hid a permission denial behind advice that
      // could not possibly help — and made the failure undiagnosable from a
      // phone, which is the only device this screen is ever used on.
      console.error('Check-in failed:', e);
      setClaimError(e?.message || 'Could not claim seat. Please try again.');
    } finally {
      setClaiming(null);
    }
  };

  const handleUnclaim = async () => {
    if (!tournamentId || !claimed) return;
    try {
      await ensureSession();
      const { updateDoc, doc: firestoreDoc, deleteField } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      await updateDoc(firestoreDoc(db, 'activeTournaments', tournamentId), {
        [claimFieldPath(claimed)]: deleteField(),
      });
      localStorage.removeItem(`claimedPlayer_${tournamentId}`);
      setClaimed(null);
    } catch (e) {
      console.error('Releasing the seat failed:', e);
    }
  };

  const tournamentForClaims = { claims, players };
  const claimedPlayer = players.find(p => p.id === claimed);
  const unclaimed = players.filter(p => !claimedByFor(tournamentForClaims, p.id));
  const alreadyClaimed = players.filter(p => {
    const by = claimedByFor(tournamentForClaims, p.id);
    return by && by !== deviceId;
  });

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
          <Card>
            <EmptyState icon={UserCheck} title="No players yet">
              Your director has not added the roster. Ask them to add you, then refresh.
            </EmptyState>
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
