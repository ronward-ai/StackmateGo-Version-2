import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Users, Shield, Trophy, Eye } from 'lucide-react';
import type { Tournament } from '@/../../shared/schema';

export default function TournamentAccess() {
  const [location, setLocation] = useLocation();
  const tournamentId = location.split('/')[2]; // Extract tournamentId from /tournament/:tournamentId/access
  const { user, isLoading: isAuthLoading } = useAuth();

  const [directorCode, setDirectorCode] = useState('');
  const [showDirectorLogin, setShowDirectorLogin] = useState(false);

  // Get tournament info
  const { data: tournament, isLoading: isTournamentLoading, error: tournamentError } = useQuery<Tournament>({
    queryKey: [`/api/tournaments/${tournamentId}`],
    queryFn: async () => {
      const response = await fetch(`/api/tournaments/${tournamentId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch tournament: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!tournamentId,
    retry: 3,
    retryDelay: 1000,
  });

  const directorLoginMutation = useMutation({
    mutationFn: async (data: { directorCode: string }) => {
      const response = await fetch(`/api/tournaments/${tournamentId}/director-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Invalid director code');
      }
      return response.json();
    },
    onSuccess: () => {
      // Redirect to full tournament management dashboard
      setLocation(`/`);
    },
  });

  const handleDirectorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directorCode.trim()) return;

    directorLoginMutation.mutate({
      directorCode: directorCode.trim().toUpperCase()
    });
  };

  const handleViewTournament = () => {
    // Direct access to participant view - no authentication needed  
    setLocation(`/tournament/${tournamentId}/view`);
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
                  <p className="text-xs text-gray-400">
                    Requires director password
                  </p>
                </div>
                {!showDirectorLogin ? (
                  <Button 
                    onClick={() => setShowDirectorLogin(true)}
                    size="lg"
                    className="w-full h-12 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all"
                  >
                    <Shield className="mr-2 h-5 w-5" />
                    Director Login
                  </Button>
                ) : (
                  <form onSubmit={handleDirectorLogin} className="space-y-3">
                    <Input
                      id="directorCode"
                      type="text"
                      placeholder="Enter director code"
                      value={directorCode}
                      onChange={(e) => setDirectorCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      required
                      className="h-10 text-center font-mono tracking-widest bg-slate-800/50 border-slate-600/50 text-white placeholder:text-gray-400 focus:border-orange-400 focus:ring-orange-400/20"
                    />
                    {directorLoginMutation.error && (
                      <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-2">
                        <p className="text-xs text-red-300">{directorLoginMutation.error.message}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button 
                        type="button"
                        variant="outline"
                        onClick={() => setShowDirectorLogin(false)}
                        className="flex-1 border-gray-500/30 text-gray-400 text-sm"
                        size="sm"
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        className="flex-1 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-medium text-sm" 
                        disabled={directorLoginMutation.isPending || !directorCode.trim()}
                        size="sm"
                      >
                        {directorLoginMutation.isPending ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          'Access'
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
      </div>
    </div>
  );
}