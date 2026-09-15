/**
 * What deleting an account's data removes, and — the part that matters — in
 * what order.
 *
 * ORDER IS LOAD-BEARING AND MUST NOT BE TIDIED INTO ALPHABETICAL.
 *
 * `seasons`, `leaguePlayers` and `tournamentResults` are deleted under the
 * rule `allow delete: if ownsLeague(resource.data.leagueId)`, and `ownsLeague`
 * does a cross-document `get()` on the league to check who owns it. Delete the
 * leagues first and that `get()` finds nothing, so the rule denies every
 * remaining child row — permanently. They would be invisible to the app, owned
 * by a league that no longer exists, impossible to delete from any client, and
 * still stored and still billed. A half-finished wipe that cannot be finished
 * is worse than one that never started.
 *
 * So: everything scoped to a league goes first, `leagues` goes after, and the
 * collections that key on `ownerId` or `userId` directly can go whenever.
 *
 * `users/{uid}` is deliberately absent. It is read-only to clients by rule, and
 * it holds `subscriptionStatus`, whose only writer is the Stripe webhook
 * through the Admin SDK. Deleting somebody's billing state as part of clearing
 * their tournament history would be wrong even if the rules permitted it.
 */

/** A collection's documents are found by matching this field against a value. */
export interface WipeStage {
  collection: string;
  /** 'league' — one query per league id. 'owner'/'user' — one query per uid. */
  scope: 'league' | 'owner' | 'user';
  /** Shown while it runs, so a failure can name where it stopped. */
  label: string;
}

export const DELETION_ORDER: WipeStage[] = [
  // League-scoped, and therefore strictly before `leagues` itself.
  { collection: 'tournamentResults', scope: 'league', label: 'results' },
  { collection: 'leaguePlayers', scope: 'league', label: 'league players' },
  { collection: 'seasons', scope: 'league', label: 'seasons' },
  // Only now that nothing needs to ask who owns them.
  { collection: 'leagues', scope: 'owner', label: 'leagues' },
  // Independent of leagues — these key on ownerId or userId directly.
  { collection: 'activeTournaments', scope: 'owner', label: 'saved games' },
  { collection: 'completedTournaments', scope: 'owner', label: 'past tournaments' },
  { collection: 'tournamentTemplates', scope: 'owner', label: 'saved structures' },
  { collection: 'leagueSettings', scope: 'user', label: 'points systems' },
];

/**
 * Does this order keep every league-scoped collection ahead of `leagues`?
 *
 * Exported so a test can assert it rather than a reviewer having to notice, and
 * because the cost of getting it wrong is not a failed write but data nobody
 * can ever remove.
 */
export function leagueScopedStagesComeFirst(order: WipeStage[] = DELETION_ORDER): boolean {
  const leaguesAt = order.findIndex(stage => stage.collection === 'leagues');
  if (leaguesAt === -1) return false;
  return order.every((stage, i) => stage.scope !== 'league' || i < leaguesAt);
}

/**
 * Firestore commits at most 500 operations in one batch, so a league with a
 * long history has to be deleted in several.
 */
export const MAX_BATCH = 500;

export function chunk<T>(items: T[], size: number = MAX_BATCH): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** What the confirmation shows before the button arms. */
export interface WipeCounts {
  [collection: string]: number;
}

/**
 * "3 leagues, 41 results, 18 saved games" — the scale of what is about to go,
 * in the user's words rather than collection names.
 *
 * Empty collections are dropped: listing "0 seasons" pads the warning with
 * nothing and makes the real numbers harder to see.
 */
export function describeWipe(counts: WipeCounts, order: WipeStage[] = DELETION_ORDER): string {
  const parts = order
    .filter(stage => (counts[stage.collection] ?? 0) > 0)
    .map(stage => {
      const n = counts[stage.collection];
      const label = n === 1 ? singular(stage.label) : stage.label;
      return `${n} ${label}`;
    });
  if (parts.length === 0) return 'nothing — this account has no saved data';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function singular(label: string): string {
  if (label === 'seasons') return 'season';
  if (label === 'results') return 'result';
  if (label === 'leagues') return 'league';
  if (label === 'league players') return 'league player';
  if (label === 'saved games') return 'saved game';
  if (label === 'past tournaments') return 'past tournament';
  if (label === 'saved structures') return 'saved structure';
  if (label === 'points systems') return 'points system';
  return label;
}
