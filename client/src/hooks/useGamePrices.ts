import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { entryPricesOf, type EntryPrices } from '@/lib/resultStats';
import type { GamePrices } from '@/lib/playerSeason';

/**
 * What each game charged per entry for rake and bounty, read from the game's own
 * document — so Net, Profit, ROI and Paid in count everything a player handed
 * over for games ALREADY played, without rewriting a single stored result.
 *
 * One `getDoc` per game, ever: the answer is cached at module scope and shared by
 * every component that asks (the standings and each player's season card). A
 * season is a dozen games, so a dozen reads. `activeTournaments/{id}` is publicly
 * gettable, so a player's phone gets the same figures as the console.
 *
 * A game whose document is gone, or a read that fails, answers `null`: that game
 * nets against the prize-pool money alone, exactly as before — never worse.
 */
const known = new Map<string, EntryPrices | null>();
const inFlight = new Map<string, Promise<void>>();

function load(id: string): Promise<void> {
  const existing = inFlight.get(id);
  if (existing) return existing;
  const p = getDoc(doc(db, 'activeTournaments', id))
    .then(snap => { known.set(id, snap.exists() ? entryPricesOf(snap.data()?.prizeStructure) : null); })
    .catch(() => { known.set(id, null); });
  inFlight.set(id, p);
  return p;
}

/** Forget everything — a test's clean slate. */
export function __resetGamePricesForTests() {
  known.clear();
  inFlight.clear();
}

export function useGamePrices(tournamentIds: ReadonlyArray<string | number | null | undefined>): GamePrices {
  const ids = useMemo(
    () => Array.from(new Set(tournamentIds.filter(id => id !== null && id !== undefined && id !== '').map(String))).sort(),
    [tournamentIds.map(String).join('|')], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const key = ids.join('|');
  const snapshot = (): GamePrices => Object.fromEntries(ids.filter(id => known.has(id)).map(id => [id, known.get(id)]));
  const [prices, setPrices] = useState<GamePrices>(snapshot);

  useEffect(() => {
    let live = true;
    setPrices(snapshot());
    const missing = ids.filter(id => !known.has(id));
    if (missing.length === 0) return;
    Promise.all(missing.map(load)).then(() => { if (live) setPrices(snapshot()); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return prices;
}
