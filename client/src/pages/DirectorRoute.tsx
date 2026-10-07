import { useParams } from 'wouter';
import TournamentDirector from './TournamentDirector';

/**
 * The director route, remounted for every GAME it is pointed at (October audit,
 * H4).
 *
 * wouter keeps a route's component mounted when only its params change, so going
 * from `/tournament/A/director` to `/tournament/B/director` — which the
 * other-live-game banner and "Open that game" both do — used to carry game A's
 * whole console into game B: its state, its `hasLoadedRemoteState` latch (B was
 * written to before it was read), its control fact (A's holder treated as B's),
 * its held tournament id (so Go Live published A), and every per-game memory —
 * the pending roster, the result claims, the rebuy offer's seen set. The clock
 * sync then wrote A's level and blinds onto B. TournamentDirector's own "this
 * game is yours" verdict carried across too, before B had been checked.
 *
 * Every guard in that tree assumes it starts on a clean slate for ONE game, and a
 * key is the one thing that gives it one, without asking each of them to notice
 * the id changing underneath it.
 */
export default function DirectorRoute() {
  const { tournamentId } = useParams<{ tournamentId?: string }>();
  return <TournamentDirector key={tournamentId ?? ''} />;
}
