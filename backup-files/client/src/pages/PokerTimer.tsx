import { useState, useEffect } from 'react';
import { useTournament } from '@/hooks/useTournament';
import TimerCard from '@/components/TimerCard';
import TournamentInfoCard from '@/components/TournamentInfoCard';
import PlayerSection from '@/components/PlayerSection';
import TablesSection from '@/components/TablesSection';

import BlindLevelsSection from '@/components/BlindLevelsSection';
import BuyInSection from '@/components/BuyInSection';
import QRCodeSection from '@/components/QRCodeSection';
import SettingsSection from '@/components/SettingsSection';
import EventBrandingSection from '@/components/EventBrandingSection';

export default function PokerTimer() {
  const tournament = useTournament();

  // Add safety check for tournament hook
  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="flex flex-col items-center space-y-4">
          <div className="text-gray-400">Loading tournament...</div>
        </div>
      </div>
    );
  }

  // Listen for director coordination sync events
  useEffect(() => {
    const handleTournamentSync = (event: CustomEvent) => {
      console.log('Tournament sync event received:', event.detail);
      if (event.detail?.tournament) {
        // Force a re-render by updating the tournament state
        const syncData = event.detail.tournament;
        if (tournament && tournament.setState) {
          console.log('Syncing tournament state from event');
          tournament.setState(syncData);
        }
      }
    };

    window.addEventListener('tournament-sync', handleTournamentSync as EventListener);
    return () => {
      window.removeEventListener('tournament-sync', handleTournamentSync as EventListener);
    };
  }, [tournament]);
  const [recentLevelChange, setRecentLevelChange] = useState(false);

  // Track level changes to trigger the flash animation
  useEffect(() => {
    if (tournament.state.isRunning) {
      setRecentLevelChange(true);
      const timeout = setTimeout(() => {
        setRecentLevelChange(false);
      }, 1000);

      return () => clearTimeout(timeout);
    }
  }, [tournament.state.currentLevel]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header Section */}
        <header className="text-center">
          {/* Main StackMate Go Logo */}
          <div className="inline-block bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 rounded-xl shadow-lg transform hover:scale-105 transition-transform duration-200 mb-6">
            <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight">StackMate Go</h1>
            <div className="text-orange-100 text-sm md:text-base font-medium mt-1">Perfectly Organised Poker</div>
          </div>

          {/* Event Branding - Clean Minimal Style */}
          {tournament.state.settings.branding.isVisible && (tournament.state.settings.branding.leagueName || tournament.state.settings.branding.logoUrl) && (
            <div className="mb-6">
              <div className="flex items-center justify-center gap-6">
                {tournament.state.settings.branding.logoUrl && (
                  <img 
                    src={tournament.state.settings.branding.logoUrl} 
                    alt={tournament.state.settings.branding.leagueName} 
                    className="h-16 md:h-20 w-auto object-contain" 
                  />
                )}
                {tournament.state.settings.branding.leagueName && (
                  <h2 className="text-4xl md:text-5xl font-bold text-foreground tracking-wide">
                    {tournament.state.settings.branding.leagueName}
                  </h2>
                )}
                {tournament.state.settings.branding.logoUrl && (
                  <img 
                    src={tournament.state.settings.branding.logoUrl} 
                    alt={tournament.state.settings.branding.leagueName} 
                    className="h-16 md:h-20 w-auto object-contain" 
                  />
                )}
              </div>
            </div>
          )}
        </header>

        {/* Tournament Over Banner */}
        {(() => {
          const activePlayers = tournament.state.players.filter(p => p.isActive === true);
          const eliminatedPlayers = tournament.state.players.filter(p => p.isActive === false);

          if (activePlayers.length === 1 && tournament.state.players.length > 1 && eliminatedPlayers.length > 0) {
            return (
              <div className="mb-6 relative overflow-hidden">
                <div className="bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 p-8 rounded-xl shadow-2xl border-4 border-yellow-300">
                  <div className="text-center">
                    <div className="text-6xl md:text-8xl font-black text-white drop-shadow-lg mb-4 animate-pulse">
                      🏆 TOURNAMENT OVER 🏆
                    </div>
                    <div className="text-2xl md:text-3xl font-bold text-white drop-shadow-md mb-2">
                      WINNER: {activePlayers[0]?.name}
                    </div>
                    <div className="text-lg text-yellow-100">
                      Congratulations on your victory!
                    </div>
                  </div>
                  {/* Decorative elements */}
                  <div className="absolute top-4 left-4 text-4xl animate-bounce">🎉</div>
                  <div className="absolute top-4 right-4 text-4xl animate-bounce delay-150">🎊</div>
                  <div className="absolute bottom-4 left-8 text-3xl animate-pulse">✨</div>
                  <div className="absolute bottom-4 right-8 text-3xl animate-pulse delay-300">⭐</div>
                </div>
              </div>
            );
          }
          return null;
        })()}



        {/* Main Timer Card */}
        <div className="mb-6">
          <TimerCard 
            tournament={tournament}
            recentLevelChange={recentLevelChange}
          />
        </div>

        {/* Tournament Info Card */}
        <div className="mb-6">
          <TournamentInfoCard tournament={tournament} />
        </div>



        {/* Player Management Section */}
        <div className="mb-6">
          <PlayerSection tournament={tournament} />
        </div>

        {/* Tables Section */}
        <div className="mb-6">
          <TablesSection tournament={tournament} />
        </div>

        {/* Tournament Rankings Section */}
        <div className="mb-6">

        </div>

        {/* Blind Levels Section */}
        <div className="mb-6">
          <BlindLevelsSection tournament={tournament} />
        </div>

        {/* Buy-in & Prizes Section */}
        <div className="mb-6">
          <BuyInSection tournament={tournament} />
        </div>

        {/* QR Code Section */}
         <div className="mb-6">
          <QRCodeSection tournament={tournament} />
        </div>

        {/* Settings Section */}
        <div className="mb-6">
          <SettingsSection tournament={tournament} />
        </div>

        <footer className="mt-8 text-center text-muted-foreground text-sm py-4">
          <p>TournHub &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}