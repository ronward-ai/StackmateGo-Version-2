import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCode, Loader2, Shield, Copy, Key, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { db, collections } from '@/lib/firebase';
import { addDoc, doc, updateDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

interface QRCodeSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  dbTournamentId?: string | null;
}

export default function QRCodeSection({ tournament, dbTournamentId }: QRCodeSectionProps) {
  const { state, updateTournamentDetails } = tournament;
  const { toast } = useToast();
  const { user, isAnonymous } = useAuth();
  const [, setLocation] = useLocation();

  const [isCreating, setIsCreating] = useState(false);
  const [transferCode, setTransferCode] = useState<string | null>(null);
  const [showTransferCode, setShowTransferCode] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  const createTournament = async () => {
    if (!user || isAnonymous) {
      toast({ title: "Login required", description: "You must be logged in to enable access features.", variant: "destructive" });
      return;
    }

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

      toast({ title: "Access enabled", description: "Viewer QR code and director transfer are now available" });
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

  return (
    <Card className="p-4 bg-gradient-to-r from-rose-600/10 to-pink-600/10 border border-rose-500/20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center">
          <Key className="h-5 w-5 mr-2 text-orange-500" />
          Access
        </h2>
      </div>

      <div className="space-y-4">
        {tournamentId ? (
          <>
            {/* Viewer Access Section */}
            <div className="bg-gradient-to-r from-blue-600/10 to-cyan-600/10 border border-blue-500/20 rounded-lg p-4">
              <h3 className="font-medium mb-3 flex items-center text-blue-400">
                <Users className="h-4 w-4 mr-2" />
                Viewer Access
              </h3>
              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">
                    Players can scan this QR code to view live tournament updates, timer, and blind levels (read-only)
                  </p>
                </div>
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-28 h-28 border-2 border-dashed border-muted-foreground/50 rounded-lg flex items-center justify-center bg-white">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`${window.location.protocol}//${window.location.host}/tournament/${tournamentId}`)}`}
                      alt="Tournament Viewer QR Code"
                      className="w-24 h-24"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Scan for read-only view</p>
                </div>
              </div>
            </div>

            {/* Director Access Section */}
            <div className="bg-gradient-to-r from-purple-600/10 to-pink-600/10 border border-purple-500/20 rounded-lg p-4">
              <h3 className="font-medium mb-3 flex items-center text-purple-400">
                <Shield className="h-4 w-4 mr-2" />
                Director Access
              </h3>
              
              <div className="space-y-4">
                {/* Generate Code for Another Director */}
                <div className="p-3 bg-purple-900/20 border border-purple-700/30 rounded">
                  <p className="text-sm text-gray-300 mb-3">
                    <strong>Share control:</strong> Generate a code to give another director access to this tournament
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
                      <p className="text-xs text-purple-400 text-center">
                        Code expires in 5 minutes
                      </p>
                    </div>
                  )}
                </div>

                {/* Enter Code from Another Director */}
                <div className="p-3 bg-green-900/20 border border-green-700/30 rounded">
                  <p className="text-sm text-gray-300 mb-3">
                    <strong>Take control:</strong> Enter a code received from another director
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Enter 6-digit code"
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
                      {isSubmittingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use Code"}
                    </Button>
                  </div>
                  {!user && (
                    <p className="text-xs text-amber-400 mt-2">You must be logged in to use a transfer code</p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Enable Access Option */
          <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-lg p-4">
            <div className="space-y-4 text-center">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Enable Access Features</h3>
                <p className="text-sm text-gray-300">Create viewer QR codes and enable director transfer</p>
              </div>
              <Button
                onClick={createTournament}
                disabled={isCreating}
                className="btn-create-viewer-green px-4 py-2 text-sm font-medium"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Enable Access'
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
