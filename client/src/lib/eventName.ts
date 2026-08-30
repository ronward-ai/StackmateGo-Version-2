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
