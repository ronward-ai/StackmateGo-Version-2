import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Radio, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useLeague } from '@/hooks/useLeague';
import { UpgradeModal } from '@/components/UpgradeModal';
import { createTournamentDocument } from '@/lib/tournamentDocument';

interface QRCodeSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  dbTournamentId?: string | null;
  onGoLive?: (id: string) => void;
}

export default function QRCodeSection({ tournament, dbTournamentId, onGoLive }: QRCodeSectionProps) {
  const { state, updateTournamentDetails } = tournament;
  const { toast } = useToast();
  const { user, isAnonymous } = useAuth();
  const { isPro } = useSubscription();
  const { league } = useLeague();

  const [isCreating, setIsCreating] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const createTournament = async () => {
    if (!user || isAnonymous) {
      toast({ title: "Login required", description: "You must be logged in to go live.", variant: "destructive" });
      return;
    }
    if (!isPro) { setShowUpgrade(true); return; }

    setIsCreating(true);
    try {
      if (!user?.id) {
        throw new Error('Not signed in. Please log out and log back in, then try again.');
      }

      // Publish the game that already exists, rather than writing a new one.
      //
      // Since auto-save, a signed-in director's game is in Firestore long before
      // this button is pressed, and creating again would collide on the id —
      // which now adopts the existing document and silently WOULD NOT publish
      // it. Creation is only for a game that genuinely has no document: one
      // started while signed out.
      const existingId = dbTournamentId || (state.details?.type === 'database' ? state.details?.id : null);

      let docId: string;
      if (existingId) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        await updateDoc(doc(db, 'activeTournaments', String(existingId)), {
          isPublished: true,
          updatedAt: new Date().toISOString(),
        });
        docId = String(existingId);
      } else {
        // One creation path, shared with the auto-save in PokerTimer — see
        // lib/tournamentDocument.ts.
        docId = await createTournamentDocument(state, user.id, league?.name, true);
      }

      updateTournamentDetails({
        id: docId,
        type: 'database',
        isPublished: true,
      });

      // Persist so a page refresh can redirect back to the live director view
      try { localStorage.setItem('activeDirectorTournamentId', docId); } catch {}

      onGoLive?.(docId);
      toast({ title: "You're live!", description: "Share the QR code so players and spectators can join." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const tournamentId = state.details?.id || dbTournamentId;

  // Saved is not live. Auto-save gives every signed-in director's game a
  // document id, so the id alone would show a "Broadcasting" badge and a QR
  // code that participants are refused by — isPublished is what the QR needs.
  // Absent means published, for the documents that predate the field.
  const isLive = !!tournamentId && state.details?.isPublished !== false;

  const liveUrl = isLive && tournamentId
    ? `${window.location.protocol}//${window.location.host}/tournament/${tournamentId}/join`
    : null;

  return (
    <>
    <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} featureHint="Live QR sharing" />
    {/*
      Neutral, even when live. The card wore the `live` tint AND a green
      Broadcasting badge — two signals for one state — and the tint compounded
      with the panel nested inside it into a muddy brown that the text sat
      badly on. The badge says it on its own.
    */}
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <Radio className={cn("h-5 w-5", isLive ? "text-green-400 animate-pulse" : "text-muted-foreground")} />
        <h2 className="text-xl font-bold text-foreground tracking-tight">StackMate Live</h2>
        {isLive && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Broadcasting
          </span>
        )}
      </div>

      <div className="space-y-4">
        {isLive ? (
          <>
            {/* Live View / Check-in QR */}
            <div className="card-glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground text-sm">Player Check-in &amp; Live View</h3>
              </div>
              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                <div className="flex-1 space-y-1.5">
                  <p className="text-body text-muted-foreground">
                    Players scan to check in and see their seat assignment. Spectators get a real-time live view — blinds, prize pool, leaderboard, all updating automatically.
                  </p>
                  {liveUrl && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(liveUrl); toast({ title: 'Copied!', description: 'Live link copied to clipboard' }); }}
                      className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                    >
                      Copy live link
                    </button>
                  )}
                </div>
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-32 h-32 border border-white/15 rounded-xl flex items-center justify-center bg-white p-1 shadow-lg">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=112x112&data=${encodeURIComponent(liveUrl!)}`}
                      alt="StackMate Live QR Code"
                      className="w-28 h-28"
                      crossOrigin="anonymous"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <p className="text-caption text-muted-foreground mt-2 font-medium">Scan to join live</p>
                </div>
              </div>
            </div>

          </>
        ) : (
          /* Not yet live */
          <div className="card-glass rounded-xl p-6">
            <div className="text-center space-y-4">
              <Radio className="h-10 w-10 text-muted-foreground mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Start Broadcasting</h3>
                <p className="text-body text-muted-foreground">
                  Go live so players can check in on their phones and everyone follows the action in real time — blinds, prize pool, seat assignments and league standings.
                </p>
              </div>
              <Button
                onClick={createTournament}
                disabled={isCreating}
                className="px-6 py-2 text-sm font-semibold w-full sm:w-auto"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Going live…
                  </>
                ) : (
                  <>
                    <Radio className="mr-2 h-4 w-4" />
                    Go Live
                  </>
                )}
              </Button>
              {(!user || isAnonymous) && (
                <p className="text-xs text-amber-400">Log in to enable StackMate Live</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
    </>
  );
}
