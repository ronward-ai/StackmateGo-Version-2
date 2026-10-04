import { createContext, useContext } from 'react';

/**
 * Start Next Season leads to the season set-up that already exists — Manage
 * League → Seasons → New Season — rather than to a second way of making a
 * season.
 *
 * It used to create the next season silently, a copy of the last one with the
 * same number of games, which is wrong for a league whose seasons follow the
 * calendar. A replacement form was built for it and removed: the Seasons tab
 * already handles a set number of games and a date range, and is the one place
 * seasons are set up.
 *
 * `LeagueSection` owns the Manage League dialog and provides this; the season
 * panel and Next Game both render inside it. Null anywhere else, and a caller
 * renders no Start Next Season rather than one that does nothing.
 */
export const SeasonSetupContext = createContext<(() => void) | null>(null);

export function useSeasonSetup(): (() => void) | null {
  return useContext(SeasonSetupContext);
}
