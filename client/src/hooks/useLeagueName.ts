import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isRealLeagueId } from '@/lib/seasonProgress';

/**
 * The league's CURRENT name, for screens that hold a tournament document and
 * no league (October audit, M18).
 *
 * The document used to carry the league's name frozen into
 * `settings.branding.leagueName` at creation, which then read back as an
 * explicit event name everywhere: a later rename never reached the app bar,
 * and Settings → Event Name showed a value the director never typed. The
 * creation path writes the director's own branding now, so a player's phone
 * resolves the league fallback the way the console does — from the league.
 *
 * One `get`, not a listener: `leagues/{id}` is publicly gettable by rule, and a
 * rename in the middle of a game is not worth an open channel per phone.
 * Fails to '' — the caller then shows its own placeholder.
 */
export function useLeagueName(leagueId: string | null | undefined): string {
  const [name, setName] = useState('');
  useEffect(() => {
    if (!leagueId || !isRealLeagueId(leagueId)) { setName(''); return; }
    let cancelled = false;
    getDoc(doc(db, 'leagues', leagueId))
      .then(snap => { if (!cancelled) setName(snap.exists() ? String(snap.data()?.name || '') : ''); })
      .catch(() => { if (!cancelled) setName(''); });
    return () => { cancelled = true; };
  }, [leagueId]);
  return name;
}
