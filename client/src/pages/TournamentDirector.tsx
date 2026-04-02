
import { useState, useEffect } from 'react';
import { useParams, useSearch } from 'wouter';
import PokerTimer from './PokerTimer';
import { useAuth } from '@/hooks/useAuth';

function TournamentDirector() {
  const params = useParams<{ tournamentId?: string; id?: string }>();
  const search = useSearch();
  const id = params.tournamentId || params.id;
  const { user, isLoading, isAnonymous } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const authenticateDirector = async () => {
      if (!id) {
        setError('Invalid tournament ID');
        return;
      }

      if (isLoading) return;

      try {
        // Check if user is logged in and not anonymous
        if (!user || isAnonymous) {
          setError('Please login to access director controls');
          setTimeout(() => {
            window.location.href = `/tournament/${id}`;
          }, 3000);
          return;
        }

        // Force comprehensive data sync when director access authenticates
        try {
          console.log('🎯 Director authenticated - fetching tournament state from server');
          if (typeof window !== 'undefined') {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('@/lib/firebase');
            const docRef = doc(db, 'activeTournaments', id.toString());
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
              const tournamentData = docSnap.data();
              
              if (tournamentData.ownerId !== user.id) {
                setError('You do not have permission to access this tournament as a director.');
                setTimeout(() => {
                  window.location.href = `/tournament/${id}`;
                }, 3000);
                return;
              }

              console.log('📊 Director access - received tournament state from server:', {
                currentLevel: tournamentData.currentLevel,
                isRunning: tournamentData.isRunning,
                players: tournamentData.players?.length || 0,
                isSeasonTournament: tournamentData.settings?.isSeasonTournament
              });
            }
          }
        } catch (error) {
          console.error('❌ Error during comprehensive director data sync:', error);
        }

        setIsAuthenticated(true);
        setError(null);
      } catch (error) {
        console.error('Director authentication failed:', error);
        setError('Invalid director code. Redirecting to participant view...');
        
        // Redirect back to participant view after 3 seconds
        setTimeout(() => {
          window.location.href = `/tournament/${id}`;
        }, 3000);
      }
    };

    authenticateDirector();
  }, [id, user, isLoading]);

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 rounded-xl shadow-lg mb-4">
            <h1 className="text-3xl font-bold text-white tracking-tight">StackMate Go</h1>
          </div>
          <div className="space-y-2">
            <p className="text-red-400">{error}</p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 rounded-xl shadow-lg mb-4">
            <h1 className="text-3xl font-bold text-white tracking-tight">StackMate Go</h1>
          </div>
          <div className="space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Authenticating director access...</p>
          </div>
        </div>
      </div>
    );
  }

  // Once authenticated, show the full PokerTimer interface with tournament context
  return <PokerTimer params={{ tournamentId: id }} />;
}

export default TournamentDirector;
