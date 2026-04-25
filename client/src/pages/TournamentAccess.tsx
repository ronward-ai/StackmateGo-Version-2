import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Shield, Trophy, Eye, Key, LogIn } from 'lucide-react';
import { AuthModal } from '@/components/AuthModal';

interface Tournament {
  id: string;
  name: string;
  status: string;
  transferCode?: string;
  transferCodeGeneratedBy?: string;
  transferCodeExpiresAt?: number;
  ownerId?: string;
}

export default function TournamentAccess() {
  const [location, setLocation] = useLocation();
  const tournamentId = location.split('/')[2]; // Extract tournamentId from /tournament/:tournamentId/access
  const { user, isLoading: isAuthLoading, isAuthenticated, signInAnonymously } = useAuth();
  const { toast } = useToast();
  const [transferCode, setTransferCode] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      signInAnonymously().catch(console.error);
    }
  }, [isAuthenticated, isAuthLoading, signInAnonymously]);

  // Get tournament info
  const { data: tournament, isLoading: isTournamentLoading, error: tournamentError } = useQuery<Tournament>({
    queryKey: ['tournament', tournamentId],
    queryFn: async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      const docRef = doc(db, 'activeTournaments', tournamentId.toString());
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error(`Failed to fetch tournament: Not Found`);
      }
      return { id: docSnap.id, ...docSnap.data() } as any;
    },
    enabled: !!tournamentId && isAuthenticated,
    retry: 3,
    retryDelay: 1000,
  });

  const handleDirectorAccess = () => {
    // Redirect authenticated users to main app (director mode)
    setLocation(`/`);
  };

  const handleViewTournament = () => {
    // Direct access to participant view - no authentication needed  
    setLocation(`/tournament/${tournamentId}/view`);
  };

  // Transfer code mutation
  const transferCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const { auth } = await import('@/lib/firebase');
      
      const docRef = doc(db, 'activeTournaments', tournamentId.toString());
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Tournament not found');
      }
      
      const data = docSnap.data();
      
      if (data.transferCode !== code.trim().toUpperCase()) {
        throw new Error('Invalid transfer code');
      }
      
      if (data.transferCodeExpiresAt && Date.now() > data.transferCodeExpiresAt) {
        throw new Error('Transfer code has expired');
      }
      
      if (!auth.currentUser || auth.currentUser.isAnonymous) {
        throw new Error('You must be logged in to take over a tournament');
      }
      
      // Update the tournament owner
      await updateDoc(docRef, {
        ownerId: auth.currentUser.uid,
        transferCode: null,
        transferCodeGeneratedBy: null,
        transferCodeExpiresAt: null
      });
      
      return { transferredFrom: data.transferCodeGeneratedBy || 'Previous Director' };
    },
    onSuccess: (data) => {
      toast({
        title: "Director Access Granted",
        description: `Successfully transferred from ${data.transferredFrom}`,
      });
      // Redirect to director dashboard
      setTimeout(() => {
        setLocation(`/director/${tournamentId}`);
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "Transfer Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const isValidTransferCode = (code: string): boolean => {
    // Must be exactly 6 alphanumeric characters
    const trimmedCode = code.trim();
    return /^[A-Z0-9]{6}$/.test(trimmedCode);
  };

  // A registered account is required to receive director handover — anonymous
  // Firebase sessions (auto-created on page load) cannot own a tournament.
  const isRegisteredUser = !!user && 'email' in user && !!user.email;

  const handleTransferCodeSubmit = () => {
    const trimmedCode = transferCode.trim();

    if (!trimmedCode) {
      toast({
        title: "Code Required",
        description: "Please enter a transfer code",
        variant: "destructive",
      });
      return;
    }

    if (!isValidTransferCode(trimmedCode)) {
      toast({
        title: "Invalid Code Format",
        description: "Transfer code must be exactly 6 characters (letters and numbers only)",
        variant: "destructive",
      });
      return;
    }

    if (!isRegisteredUser) {
      setShowAuthModal(true);
      return;
    }

    transferCodeMutation.mutate(trimmedCode);
  };

  if (isAuthLoading || isTournamentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
          <p className="text-gray-400">Loading tournament...</p>
        </div>
      </div>
    );
  }

  if (!tournament && !isTournamentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
        <Card className="w-full max-w-md bg-gradient-to-r from-red-600/10 to-orange-600/10 border border-red-500/20">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-white">Tournament Not Found</CardTitle>
            <CardDescription className="text-gray-400">
              {tournamentError 
                ? `Error: ${tournamentError.message}`
                : "The tournament you're looking for doesn't exist or has been removed."
              }
            </CardDescription>
            <div className="mt-4 text-sm text-gray-500">
              <p>Tournament ID: {tournamentId}</p>
              <p>Please check the QR code or link and try again.</p>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 flex items-center justify-center">
      <div className="w-full max-w-lg">
        {/* Tournament Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600/20 to-purple-600/20 px-6 py-3 rounded-full border border-blue-500/30">
            <Trophy className="h-5 w-5 text-yellow-400" />
            <h1 className="text-xl font-semibold text-white">{tournament?.name || 'Tournament'}</h1>
          </div>
        </div>

        {/* Transfer Code Section */}
        <Card className="bg-gradient-to-br from-purple-600/10 to-pink-600/10 border-2 border-purple-400/40 mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                <Key className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-white">Director Transfer Code</CardTitle>
                <CardDescription className="text-gray-400">
                  Enter a code from the current director to take over
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isRegisteredUser && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <LogIn className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Account required</p>
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    You need a StackMate Go account to take over director control. Enter your code below then log in when prompted.
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="transfer-code" className="text-gray-300">Transfer Code</Label>
              <Input
                id="transfer-code"
                data-testid="input-transfer-code"
                placeholder="Enter 6-digit code (e.g., A3B7X2)"
                value={transferCode}
                onChange={(e) => setTransferCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="bg-gray-800/50 border-purple-400/30 text-white placeholder:text-gray-500 font-mono text-lg tracking-widest text-center"
                disabled={transferCodeMutation.isPending}
              />
            </div>
            <Button
              onClick={handleTransferCodeSubmit}
              data-testid="button-submit-transfer-code"
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              disabled={transferCodeMutation.isPending || !isValidTransferCode(transferCode)}
            >
              {transferCodeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : !isRegisteredUser ? (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Log in &amp; Use Transfer Code
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Use Transfer Code
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Two Main Action Cards */}
        <div className="grid gap-6 md:grid-cols-2">
              {/* Tournament Viewer Button */}
              <div className="bg-gradient-to-br from-green-600/20 to-blue-600/20 border-2 border-green-400/40 rounded-xl p-6 text-center space-y-4 shadow-lg">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                  <Eye className="h-8 w-8 text-green-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Tournament Viewer</h3>
                  <div className="bg-green-500/10 border border-green-400/30 rounded-lg p-3 mb-3">
                    <p className="text-green-400 font-semibold text-sm mb-1">
                      👁️ READ-ONLY ACCESS
                    </p>
                    <p className="text-gray-200 text-xs">
                      View live tournament updates, timer, blind levels, and player standings. All controls disabled.
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">
                    Perfect for participants and spectators
                  </p>
                </div>
                <Button 
                  onClick={handleViewTournament}
                  size="lg"
                  className="w-full h-12 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all"
                >
                  <Eye className="mr-2 h-5 w-5" />
                  View Tournament
                </Button>
              </div>

              {/* Director Access Button */}
              <div className="bg-gradient-to-br from-orange-600/20 to-red-600/20 border-2 border-orange-400/40 rounded-xl p-6 text-center space-y-4 shadow-lg">
                <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto">
                  <Shield className="h-8 w-8 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Director Access</h3>
                  <div className="bg-orange-500/10 border border-orange-400/30 rounded-lg p-3 mb-3">
                    <p className="text-orange-400 font-semibold text-sm mb-1">
                      🛠️ FULL CONTROL ACCESS
                    </p>
                    <p className="text-gray-200 text-xs">
                      Complete tournament management with timer controls, player management, and all settings.
                    </p>
                  </div>
                  {user ? (
                    <p className="text-xs text-green-400">
                      ✓ Logged in as {('email' in user && user.email) || ('name' in user && user.name) || ('playerName' in user && user.playerName) || 'User'}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">
                      Login required for director access
                    </p>
                  )}
                </div>
                {user ? (
                  <Button 
                    onClick={() => setLocation(`/director/${tournamentId}`)}
                    size="lg"
                    className="w-full h-12 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all"
                  >
                    <Shield className="mr-2 h-5 w-5" />
                    Access Director Dashboard
                  </Button>
                ) : (
                  <Button 
                    onClick={() => setShowAuthModal(true)}
                    size="lg"
                    className="w-full h-12 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all"
                  >
                    <Shield className="mr-2 h-5 w-5" />
                    Login for Director Access
                  </Button>
                )}
              </div>
            </div>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}