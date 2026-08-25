import React, { Suspense, lazy } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import ComingSoonGate from '@/components/ComingSoonGate';

// Routes are split so a participant scanning a QR code does not download the
// entire director application (timer, blind editor, league settings, seating)
// just to check in or watch the clock. Each page becomes its own chunk, fetched
// only when its route is matched.
const PokerTimer = lazy(() => import('./pages/PokerTimer'));
const TournamentParticipant = lazy(() => import('./pages/TournamentParticipant'));
const TournamentParticipantView = lazy(() => import('./pages/TournamentParticipantView'));
const TournamentDirector = lazy(() => import('./pages/TournamentDirector'));
const PlayerClaimView = lazy(() => import('./pages/PlayerClaimView'));

/** Matches the "Connecting…" state PlayerClaimView shows, so a split route
 *  transition looks the same as its own loading state rather than a flash. */
function RouteFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground text-sm animate-pulse">Loading…</div>
    </div>
  );
}

function NotFoundPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Page Not Found</h1>
        <p className="text-muted-foreground mb-4">The page you're looking for doesn't exist.</p>
        <button
          onClick={() => setLocation('/')}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Switch>
              {/* Director routes — gated */}
              <Route path="/">
                <ComingSoonGate><PokerTimer /></ComingSoonGate>
              </Route>
              <Route path="/tournament">
                <ComingSoonGate><PokerTimer /></ComingSoonGate>
              </Route>
              {/* Participant/handover routes — always accessible via QR/link */}
              <Route path="/tournament/:tournamentId/director" component={TournamentDirector} />
              <Route path="/tournament/:tournamentId/join" component={PlayerClaimView} />
              <Route path="/tournament/:tournamentId" component={TournamentParticipantView} />
              <Route path="/tournament/:tournamentId/participant" component={TournamentParticipant} />
              <Route path="/tournament/:tournamentId/participant-view" component={TournamentParticipantView} />
              <Route path="/tournament-participant" component={TournamentParticipant} />
              <Route component={NotFoundPage} />
            </Switch>
          </Suspense>
        </ErrorBoundary>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}

export default App;
