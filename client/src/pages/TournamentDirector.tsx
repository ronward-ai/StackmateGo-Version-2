import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import PokerTimer from './PokerTimer';
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from '@/components/AuthModal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LogIn, Eye } from 'lucide-react';

/**
 * The director view of a specific tournament.
 *
 * Signing out used to hard-redirect here to the participant view after a
 * three-second countdown. That screen shows the same tournament read-only and
 * has no sign-in control — participants never sign in — so the director was
 * left looking at their own game with no way back into the app, which read as
 * "I logged out and nothing happened". Being signed out now offers a way back
 * in instead of moving you somewhere you did not ask to go.
 */
function TournamentDirector() {
  const params = useParams<{ tournamentId?: string; id?: string }>();
  const id = params.tournamentId || params.id;
  const [, setLocation] = useLocation();
  const { user, isLoading, isAnonymous } = useAuth();

  const [isAuthorised, setIsAuthorised] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [notMine, setNotMine] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participantPath = id ? `/tournament/${id}` : '/';

  useEffect(() => {
    const authoriseDirector = async () => {
      if (!id) {
        setError('Invalid tournament ID');
        return;
      }

      if (isLoading) return;

      // Not signed in: offer the way back in rather than navigating away. The
      // effect re-runs when the user signs in, so the director view loads with
      // no page reload and the tournament state already in hand.
      if (!user || isAnonymous) {
        setNeedsSignIn(true);
        setIsAuthorised(false);
        setError(null);
        return;
      }

      setNeedsSignIn(false);
      setNotMine(false);

      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const snap = await getDoc(doc(db, 'activeTournaments', String(id)));

        // Signed in, but this game belongs to another account — after handing it
        // over, typically.
        //
        // Clearing the pin is what stops the app wedging. `/` redirects to
        // whatever activeDirectorTournamentId names (PokerTimer), so a
        // tournament you have given away kept sending you here, here kept
        // sending you to the player view, and its home button sent you back to
        // `/`. From the outside that is indistinguishable from the page
        // refreshing and there was no way out of it.
        if (snap.exists() && snap.data().ownerId !== user.id) {
          try {
            if (localStorage.getItem('activeDirectorTournamentId') === String(id)) {
              localStorage.removeItem('activeDirectorTournamentId');
            }
          } catch {}
          setNotMine(true);
          setIsAuthorised(false);
          return;
        }

        setIsAuthorised(true);
        setError(null);
      } catch (err) {
        console.error('Director authorisation failed:', err);
        setError('Could not check whether you direct this tournament.');
      }
    };

    authoriseDirector();
  }, [id, user, isAnonymous, isLoading, setLocation, participantPath]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center px-6">
      <div className="text-center max-w-sm w-full">
        <div className="inline-block bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 rounded-xl shadow-lg mb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">StackMate Go</h1>
        </div>
        {children}
      </div>
    </div>
  );

  if (error) {
    return (
      <Shell>
        <div className="space-y-4">
          <p className="text-red-400">{error}</p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => window.location.reload()}>Try again</Button>
            <Button variant="outline" onClick={() => setLocation(participantPath)}>
              View as participant
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  if (notMine) {
    return (
      <Shell>
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-lg font-medium">This game is run from another account</p>
            <p className="text-sm text-muted-foreground">
              Director control was passed on, so you can watch it but not change it. Your own app is
              unaffected.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button className="gap-2" onClick={() => setLocation(participantPath)}>
              <Eye className="h-4 w-4" />
              Watch as a player
            </Button>
            <Button variant="outline" onClick={() => setLocation('/')}>
              Go to my app
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  if (needsSignIn) {
    return (
      <Shell>
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-lg font-medium">Sign in to run this tournament</p>
            <p className="text-sm text-muted-foreground">
              Director controls need the account that owns the game. You can still watch it as a
              player without signing in.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button className="gap-2" onClick={() => setShowAuthModal(true)}>
              <LogIn className="h-4 w-4" />
              Sign in
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setLocation(participantPath)}>
              <Eye className="h-4 w-4" />
              View as participant
            </Button>
          </div>
        </div>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </Shell>
    );
  }

  if (!isAuthorised) {
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

  return <PokerTimer params={{ tournamentId: id }} />;
}

export default TournamentDirector;
