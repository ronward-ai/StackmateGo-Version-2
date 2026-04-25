
import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import PokerTimer from './PokerTimer';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

function TournamentDirector() {
  const params = useParams<{ tournamentId?: string; id?: string }>();
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

        if (typeof window !== 'undefined') {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('@/lib/firebase');
            const docRef = doc(db, 'activeTournaments', id.toString());
            const docSnap = await getDoc(docRef);

            if (docSnap.exists() && docSnap.data().ownerId !== user.id) {
              setError('You do not have permission to access this tournament as a director.');
              setTimeout(() => { window.location.href = `/tournament/${id}`; }, 3000);
              return;
            }
          }

        setIsAuthenticated(true);
        setError(null);
      } catch (error) {
        console.error('Director authentication failed:', error);
        setError('Could not verify tournament access. Redirecting to participant view...');
        
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
        <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
          <div className="flex justify-between items-center mb-8">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <Skeleton className="h-[400px] w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-[300px] w-full rounded-xl" />
            <Skeleton className="h-[300px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Once authenticated, show the full PokerTimer interface with tournament context
  return <PokerTimer params={{ tournamentId: id }} />;
}

export default TournamentDirector;
