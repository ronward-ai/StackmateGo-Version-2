import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCode, Loader2, ExternalLink, Database } from 'lucide-react';

interface QRCodeSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function QRCodeSection({ tournament }: QRCodeSectionProps) {
  const { state, updateTournamentDetails } = tournament;
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const createTournament = async () => {
    setIsCreating(true);
    try {
      // Generate random access codes
      const participantCode = Math.random().toString(36).substr(2, 6).toUpperCase();
      const directorCode = Math.random().toString(36).substr(2, 6).toUpperCase();

      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Tournament ${new Date().toLocaleDateString()}`,
          currentLevel: state.currentLevel + 1, // Use 1-based indexing for display
          secondsLeft: state.secondsLeft,
          isRunning: state.isRunning,
          buyIn: state.prizeStructure?.buyIn || 10,
          enableSounds: state.settings.enableSounds,
          enableVoice: state.settings.enableVoice,
          showSeconds: state.settings.showSeconds,
          showNextLevel: state.settings.showNextLevel,
          participantCode,
          directorCode
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to create tournament' }));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const tournament = await response.json();
      console.log('Tournament created successfully:', tournament);

      updateTournamentDetails({
        id: tournament.id,
        type: 'database',
        participantCode,
        directorCode
      });

      // Verify tournament exists by fetching it
      const verifyResponse = await fetch(`/api/tournaments/${tournament.id}`);
      if (!verifyResponse.ok) {
        console.error('Tournament verification failed');
      } else {
        console.log('Tournament verified in database');
      }
    } catch (error) {
      console.error('Failed to create tournament:', error);
      alert(`Failed to create tournament: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const resetTournament = () => {
    updateTournamentDetails({
      type: 'standalone'
    });
  };

  return (
    <Card className="p-4 bg-gradient-to-r from-rose-600/10 to-pink-600/10 border border-rose-500/20">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <QrCode className="h-5 w-5 mr-2 text-secondary" />
          Viewer Access
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'unfold_less' : 'unfold_more'}
        </span>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 border-t border-[#2a2a2a] mt-4 space-y-4">
          {state.details?.id ? (
            <div className="space-y-4">
              {/* QR Code Section - Read-Only Access */}
              <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                  <div className="flex-1">
                    <h4 className="font-medium mb-2 flex items-center">
                      <QrCode className="h-4 w-4 mr-2" />
                      Tournament Viewer
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      <strong>Read-only access</strong> - Players can scan this QR code to view live tournament updates, timer, and blind levels
                    </p>
                  </div>
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-32 h-32 border-2 border-dashed border-muted-foreground/50 rounded-lg flex items-center justify-center bg-white">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`${window.location.origin}/tournament/${state.details.id}/access`)}`}
                        alt="Tournament Viewer QR Code"
                        className="w-28 h-28"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling!.textContent = 'QR Code failed to load';
                        }}
                      />
                      <span className="text-xs text-muted-foreground hidden">QR Code</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Scan for read-only view
                    </p>
                  </div>
                </div>
              </div>

              {/* Director Access Code */}
              <div className="bg-orange-600/10 border border-orange-500/20 rounded-lg p-3">
                <h4 className="text-sm font-medium mb-2 flex items-center">
                  <Database className="h-4 w-4 mr-2" />
                  Director Access
                </h4>
                <div className="space-y-2">
                  {state.details.directorCode && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Password: <code className="bg-black/20 px-2 py-1 rounded text-orange-400">{state.details.directorCode}</code></span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigator.clipboard.writeText(state.details.directorCode)}
                      >
                        Copy
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>Full tournament controls</strong> - Use this password to access management features like timer controls, player management, and settings
                </p>
              </div>


            </div>
          ) : (
            /* Create Tournament Option */
            <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-lg p-4">
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">Enable Viewer Access</h3>
                  <p className="text-sm text-gray-300">Create a QR code for read-only tournament viewing</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <Button
                    onClick={createTournament}
                    disabled={isCreating}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Viewer Access...
                      </>
                    ) : (
                      'Create Viewer Access'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}