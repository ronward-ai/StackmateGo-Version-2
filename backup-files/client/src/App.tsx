import { Route, Switch, Redirect } from 'wouter';
import PokerTimer from '@/pages/PokerTimer';
import LeagueMode from '@/pages/LeagueMode';
import TournamentParticipant from '@/pages/TournamentParticipant';
import TournamentParticipantView from '@/pages/TournamentParticipantView';
import TournamentAccess from '@/pages/TournamentAccess';
import NotFound from '@/pages/not-found';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/tournament" />
      </Route>
      <Route path="/tournament" component={PokerTimer} />
      <Route path="/tournament/:tournamentId/access" component={TournamentAccess} />
      <Route path="/tournament/:tournamentId/view" component={TournamentParticipantView} />
      <Route path="/tournament/:tournamentId/participant" component={TournamentParticipant} />
      <Route path="/tournament/:tournamentId/participant-view" component={TournamentParticipantView} />
      <Route path="/tournament/:tournamentId" component={PokerTimer} />
      <Route path="/league" component={LeagueMode} />
      <Route path="/tournament-participant" component={TournamentParticipant} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;