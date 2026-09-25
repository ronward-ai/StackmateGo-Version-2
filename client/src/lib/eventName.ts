import type { Settings } from '@/types';

/**
 * The name shown on the big screen and in the participant view.
 *
 * Two separate things were both called "league name":
 *
 *   settings.branding.leagueName — the EVENT name, on the page header
 *   leagues/{id}.name            — the LEAGUE, in the standings title
 *
 * So renaming the league appeared to do nothing, because the header reads a
 * different field. They are genuinely different — a standalone tournament has
 * an event name and no league — so the fix is to name them apart rather than
 * merge them. The stored key is now `eventName`, matching the label the UI has
 * always shown; `leagueName` is still read so existing tournaments keep working.
 *
 * @param leagueName the league's own name, used as a fallback in league mode so
 *        that renaming the league is visible on screen.
 */
export function eventNameOf(
  settings: Partial<Settings> | null | undefined,
  leagueName?: string | null,
): string {
  const branding = settings?.branding as { eventName?: string; leagueName?: string } | undefined;
  const explicit = (branding?.eventName ?? branding?.leagueName ?? '').trim();
  if (explicit) return explicit;

  // No event name set: in league mode fall back to the league itself, so the
  // header follows a rename rather than silently staying blank.
  const isLeagueMode = (settings as any)?.isSeasonTournament === true;
  if (isLeagueMode && leagueName?.trim()) return leagueName.trim();

  return '';
}

/**
 * The display name for a stored tournament DOCUMENT, as a player sees it.
 *
 * The participant view and the check-in screen printed `name` (or
 * `details.name`) straight from the document, and never went through
 * `eventNameOf` at all — the one consumer that did not. That is worse than it
 * sounds: `lib/tournamentDocument.ts` sets `name` ONCE, at creation, from
 * `state.details?.name`, which `useTournament` never writes. So for an ordinary
 * game the string on every player's phone was literally
 * `Tournament 25/09/2026`, and renaming the event on the console changed
 * nothing anywhere a player could see.
 *
 * The real name was in the same document the whole time: `PokerTimer` syncs the
 * settings object wholesale, so `settings.branding.eventName` arrives with it.
 *
 * Normalised on READ, the trade `payoutsOf()`, `bandsOf()` and `claimedByFor()`
 * already make here — no stored game has to be rewritten, and a document that
 * genuinely has only a `name` keeps showing it.
 *
 * Returns '' when the document names itself nowhere, so callers keep their own
 * "Tournament" placeholder rather than this module inventing one.
 */
export function eventNameOfTournament(
  doc:
    | {
        settings?: Partial<Settings> | null;
        details?: { name?: string } | null;
        name?: string | null;
      }
    | null
    | undefined,
  leagueName?: string | null,
): string {
  const fromSettings = eventNameOf(doc?.settings, leagueName);
  if (fromSettings) return fromSettings;
  return (doc?.details?.name || doc?.name || '').trim();
}
