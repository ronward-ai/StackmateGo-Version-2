import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, Copy, Radio, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { db, collections } from '@/lib/firebase';
import { addDoc, doc, updateDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradeModal } from '@/components/UpgradeModal';

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
  const [, setLocation] = useLocation();

  const [isCreating, setIsCreating] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [transferCode, setTransferCode] = useState<string | null>(null);
  const [showTransferCode, setShowTransferCode] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  const createTournament = async () => {
    if (!user || isAnonymous) {
      toast({ title: "Login required", description: "You must be logged in to go live.", variant: "destructive" });
      return;
    }
    if (!isPro) { setShowUpgrade(true); return; }

    setIsCreating(true);
    try {
      const participantCode = Math.random().toString(36).substr(2, 6).toUpperCase();
      const directorCode = Math.random().toString(36).substr(2, 6).toUpperCase();

      const newTournament = {
        name: state.details?.name || `Tournament ${new Date().toLocaleDateString()}`,
        currentLevel: state.currentLevel,
        secondsLeft: state.secondsLeft,
        isRunning: state.isRunning,
        buyIn: state.prizeStructure?.buyIn || 10,
        players: state.players || [],
        tables: state.details?.tables || [],
        blindLevels: state.levels || [],
        settings: {
          enableSounds: state.settings.enableSounds,
          enableVoice: state.settings.enableVoice,
          showSeconds: state.settings.showSeconds,
          showNextLevel: state.settings.showNextLevel,
          currency: state.settings.currency || '£',
          tables: state.settings.tables || {
            numberOfTables: 1,
            seatsPerTable: 9,
            tableNames: ['Table 1']
          },
          branding: {
            leagueName: state.settings.branding?.leagueName || "",
            logoUrl: state.settings.branding?.logoUrl || null,
            isVisible: state.settings.branding?.isVisible ?? true
          }
        },
        prizeStructure: state.prizeStructure || {
          buyIn: 10,
          enableBounties: false,
          bountyAmount: 0,
          manualPayouts: []
        },
        participantCode,
        directorCode,
        ownerId: user?.id || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collections.activeTournaments, newTournament);

      updateTournamentDetails({
        id: docRef.id,
        type: 'database'
      });

      // Persist so a page refresh can redirect back to the live director view
      try { localStorage.setItem('activeDirectorTournamentId', docRef.id); } catch {}

      onGoLive?.(docRef.id);
      toast({ title: "You're live!", description: "Share the QR code so players and spectators can join." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const generateTransferCode = async () => {
    const tournamentId = state.details?.id || dbTournamentId;
    if (!tournamentId) {
      toast({ title: "Error", description: "Tournament must be saved first", variant: "destructive" });
      return;
    }

    try {
      const code = Math.random().toString(36).substr(2, 6).toUpperCase();
      const docRef = doc(db, 'activeTournaments', String(tournamentId));

      await updateDoc(docRef, {
        transferCode: code,
        transferCodeExpiresAt: new Date(Date.now() + 300000).toISOString() // 5 minutes
      });

      setTransferCode(code);
      setShowTransferCode(true);
      toast({ title: "Code generated", description: "Share this code with the new director" });

      setTimeout(() => {
        setTransferCode(null);
        setShowTransferCode(false);
      }, 300000);
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate transfer code", variant: "destructive" });
    }
  };

  const copyTransferCode = () => {
    if (transferCode) {
      navigator.clipboard.writeText(transferCode);
      toast({ title: "Copied!", description: "Transfer code copied to clipboard" });
    }
  };

  const isValidCode = (code: string): boolean => {
    return /^[A-Z0-9]{6}$/.test(code.trim().toUpperCase());
  };

  const handleUseCode = async () => {
    const trimmedCode = inputCode.trim().toUpperCase();

    if (!isValidCode(trimmedCode)) {
      toast({
        title: "Invalid code",
        description: "Code must be exactly 6 characters (letters and numbers)",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to use a transfer code",
        variant: "destructive"
      });
      return;
    }

    setIsSubmittingCode(true);
    try {
      const q = query(collections.activeTournaments, where('transferCode', '==', trimmedCode));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        toast({
          title: "Invalid code",
          description: "Code is invalid or expired",
          variant: "destructive"
        });
        setIsSubmittingCode(false);
        return;
      }

      const tournamentDoc = snapshot.docs[0];
      const data = tournamentDoc.data();

      // Check expiration
      if (data.transferCodeExpiresAt && new Date(data.transferCodeExpiresAt).getTime() < Date.now()) {
        toast({
          title: "Expired code",
          description: "This transfer code has expired",
          variant: "destructive"
        });
        setIsSubmittingCode(false);
        return;
      }

      // Update owner
      await updateDoc(tournamentDoc.ref, {
        ownerId: user.id,
        transferCode: null,
        transferCodeExpiresAt: null
      });

      toast({ title: "Success!", description: "You now have director access to this tournament" });
      setInputCode('');

      setLocation(`/tournament/${tournamentDoc.id}/director`);
    } catch (error) {
      toast({ title: "Error", description: "Failed to use transfer code", variant: "destructive" });
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const tournamentId = state.details?.id || dbTournamentId;
  const liveUrl = tournamentId
    ? `${window.location.protocol}//${window.location.host}/tournament/${tournamentId}/join`
    : null;

  return (
    <>
    <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} featureHint="Live QR sharing" />
    <Card className="p-4 bg-gradient-to-br from-blue-950/60 to-indigo-950/60 border border-blue-500/25">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <Radio className="h-5 w-5 text-blue-400 animate-pulse" />
        <h2 className="text-xl font-bold text-white tracking-tight">StackMate Live</h2>
        {tournamentId && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Broadcasting
          </span>
        )}
      </div>

      <div className="space-y-4">
        {tournamentId ? (
          <>
            {/* Live View / Check-in QR */}
            <div className="bg-gradient-to-r from-blue-600/15 to-cyan-600/10 border border-blue-500/25 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Smartphone className="h-4 w-4 text-blue-400" />
                <h3 className="font-semibold text-blue-300 text-sm">Player Check-in &amp; Live View</h3>
              </div>
              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                <div className="flex-1 space-y-1.5">
                  <p className="text-sm text-gray-300 leading-snug">
                    Players scan to check in and see their seat assignment. Spectators get a real-time live view — blinds, prize pool, leaderboard, all updating automatically.
                  </p>
                  {liveUrl && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(liveUrl); toast({ title: 'Copied!', description: 'Live link copied to clipboard' }); }}
                      className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                    >
                      Copy live link
                    </button>
                  )}
                </div>
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-32 h-32 border-2 border-blue-500/40 rounded-xl flex items-center justify-center bg-white p-1 shadow-lg shadow-blue-900/30">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=112x112&data=${encodeURIComponent(liveUrl!)}`}
                      alt="StackMate Live QR Code"
                      className="w-28 h-28"
                      crossOrigin="anonymous"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <p className="text-xs text-blue-400 mt-2 font-medium">Scan to join live</p>
                </div>
              </div>
            </div>

            {/* Director handoff */}
            <div className="bg-gradient-to-r from-purple-600/10 to-pink-600/10 border border-purple-500/20 rounded-xl p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-300 text-sm">
                <Shield className="h-4 w-4" />
                Director Handoff
              </h3>

              <div className="space-y-3">
                <div className="p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg">
                  <p className="text-sm text-gray-300 mb-3">
                    <strong>Share control</strong> — generate a code to hand this tournament to another director
                  </p>
                  {!showTransferCode ? (
                    <Button
                      onClick={generateTransferCode}
                      size="sm"
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                      data-testid="button-generate-transfer-code"
                    >
                      Generate Transfer Code
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 bg-purple-800/30 border border-purple-600/50 rounded">
                        <code className="flex-1 text-xl font-mono text-purple-200 text-center tracking-widest" data-testid="text-transfer-code">
                          {transferCode}
                        </code>
                        <Button
                          onClick={copyTransferCode}
                          variant="outline"
                          size="sm"
                          className="border-purple-600"
                          data-testid="button-copy-transfer-code"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-purple-400 text-center">Expires in 5 minutes</p>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-green-900/20 border border-green-700/30 rounded-lg">
                  <p className="text-sm text-gray-300 mb-3">
                    <strong>Take control</strong> — enter a code received from another director
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="6-character code"
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      className="font-mono text-center tracking-widest uppercase"
                      data-testid="input-transfer-code"
                    />
                    <Button
                      onClick={handleUseCode}
                      disabled={!isValidCode(inputCode) || isSubmittingCode || !user}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-use-transfer-code"
                    >
                      {isSubmittingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use"}
                    </Button>
                  </div>
                  {!user && (
                    <p className="text-xs text-amber-400 mt-2">Log in to use a transfer code</p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Not yet live */
          <div className="bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-xl p-6">
            <div className="text-center space-y-4">
              <Radio className="h-10 w-10 text-blue-400 mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Start Broadcasting</h3>
                <p className="text-sm text-gray-400 leading-snug">
                  Go live so players can check in on their phones and everyone follows the action in real time — blinds, prize pool, seat assignments and league standings.
                </p>
              </div>
              <Button
                onClick={createTournament}
                disabled={isCreating}
                className="btn-create-viewer-green px-6 py-2 text-sm font-semibold w-full sm:w-auto"
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
