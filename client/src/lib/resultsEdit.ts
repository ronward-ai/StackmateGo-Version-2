import { payoutForPlace } from './prizePool';
import { bountyTakeFor } from './resultStats';

/**
 * The results editor: a night described as each player's BUSTS, with knockouts
 * derived from them.
 *
 * Reported: a director undid every bust-out of a night to replay it and fix
 * missed rebuys — and two players still showed a knockout. A rebuy rightly keeps
 * the hunter's knockout and clears `eliminatedBy`, and undo only reverses a
 * player's most recent bust, so the knockouts earned before a rebuy (and the
 * rebuy counts) survive a full unwind, and nothing recorded who those earlier
 * hitmen were. Undo is the wrong tool for rewriting a night; this is the tool.
 *
 * The model is the whole point. A player's night is a list of busts —
 * `{ by, then }` where `then` is what followed: a rebuy, a re-entry, or out for
 * good. The rebuy and re-entry counts are counts of those, `eliminatedBy` is the
 * last one's `by`, and a player's KNOCKOUTS are the number of busts, across
 * everybody, credited to them. Derived, so they cannot disagree with who busted
 * whom — the stray hits the report was about are impossible by construction.
 */

export type BustThen = 'rebuy' | 'reEntry' | 'out';

export interface EditBust {
  /** The hitman's player id; null when nobody knows (older games). */
  by: string | null;
  then: BustThen;
}

export interface EditRow {
  id: string;
  name: string;
  /** Finishing place; null means still in. */
  place: number | null;
  busts: EditBust[];
}

export interface EarlierBust {
  by?: string | null;
  then: 'rebuy' | 'reEntry';
}

export interface EditablePlayer {
  id: string;
  name: string;
  position?: number | null;
  isActive?: boolean;
  eliminatedBy?: string | null;
  rebuys?: number;
  reEntries?: number;
  knockouts?: number;
  bountylessKnockouts?: number;
  earlierBustsBy?: EarlierBust[] | null;
  prizeMoney?: number;
  seated?: boolean;
  tableAssignment?: unknown;
  seatInfo?: unknown;
  bustLevel?: number;
  bustCount?: number;
  currentBounty?: number;
  bountyWinnings?: number;
}

const placeOf = (p: EditablePlayer): number | null =>
  p.position && p.position > 0 && (p.isActive === false || p.position === 1) ? p.position : null;

/** Each player's night as the editor shows it, best place first, players still in last. */
export function editRowsFrom(players: readonly EditablePlayer[]): EditRow[] {
  const rows = players.map(p => {
    const known = (p.earlierBustsBy ?? []).map(b => ({ by: b.by ?? null, then: b.then }));
    const busts: EditBust[] = [];
    // The recorded history first, then Unknown for the rest of the counts — a
    // game played before the history was kept has counts and no hitmen.
    for (const kind of ['rebuy', 'reEntry'] as const) {
      const count = kind === 'rebuy' ? p.rebuys || 0 : p.reEntries || 0;
      const recorded = known.filter(b => b.then === kind).slice(0, count);
      busts.push(...recorded);
      for (let i = recorded.length; i < count; i++) busts.push({ by: null, then: kind });
    }
    const place = placeOf(p);
    if (place !== null && place !== 1) busts.push({ by: p.eliminatedBy ?? null, then: 'out' });
    return { id: p.id, name: p.name, place, busts };
  });
  return rows.sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity));
}

/** What is wrong with an edit, in the director's words. Empty means it can be saved. */
export function validateEdit(rows: readonly EditRow[]): string[] {
  const errors: string[] = [];
  const n = rows.length;
  const ids = new Set(rows.map(r => r.id));
  const placed = rows.filter(r => r.place !== null);
  const places = placed.map(r => r.place as number).sort((a, b) => a - b);
  const stillIn = n - placed.length;

  if (new Set(places).size !== places.length) errors.push('Two players have the same place.');
  // Places are taken from the bottom: with k players still in, the places used
  // are k+1..n — or every place, 1..n, when the game is over.
  const lowest = stillIn === 0 ? 1 : stillIn + 1;
  if (places.some(pl => pl < lowest || pl > n)) {
    errors.push(stillIn === 0
      ? `Places must run from 1st to ${n}th.`
      : `With ${stillIn} still in, the places given must be ${lowest} to ${n}.`);
  } else if (new Set(places).size === places.length && places.length !== n - lowest + 1) {
    errors.push(`Every place from ${lowest} to ${n} must be given.`);
  }
  if (stillIn === 1) errors.push('One player cannot be the only one still in — give them 1st.');

  for (const r of rows) {
    const outs = r.busts.filter(b => b.then === 'out').length;
    if (r.place === 1 && outs > 0) errors.push(`${r.name} won, so cannot have been knocked out.`);
    if (r.place !== null && r.place !== 1 && outs !== 1) errors.push(`${r.name} needs who knocked them out.`);
    if (r.place === null && outs > 0) errors.push(`${r.name} is still in, so cannot be out.`);
    for (const b of r.busts) {
      if (b.by === r.id) errors.push(`${r.name} cannot knock themselves out.`);
      else if (b.by !== null && !ids.has(b.by)) errors.push(`${r.name}'s hitman is not in this game.`);
    }
  }
  return Array.from(new Set(errors));
}

/** Things worth saying that do not stop a save. */
export function editWarnings(
  rows: readonly EditRow[],
  structure: { enableBounties?: boolean; bountyType?: string } | null | undefined,
): string[] {
  const warnings: string[] = [];
  const unknown = rows.reduce((n, r) => n + r.busts.filter(b => b.by === null).length, 0);
  if (unknown > 0) {
    warnings.push(`${unknown} bust${unknown === 1 ? ' has' : 's have'} no hitman — ${unknown === 1 ? 'it counts' : 'they count'} as a knockout for nobody.`);
  }
  if (structure?.enableBounties && structure.bountyType === 'progressive') {
    warnings.push('Progressive bounty winnings are kept as they were; they are not rebuilt from the edit.');
  }
  return warnings;
}

/** Knockouts per player, from every bust in the night. */
export function knockoutsFrom(rows: readonly EditRow[]): Map<string, number> {
  const kos = new Map<string, number>();
  for (const r of rows) for (const b of r.busts) if (b.by) kos.set(b.by, (kos.get(b.by) ?? 0) + 1);
  return kos;
}

/** The roster the edit describes, money and all. Validate first. */
export function applyEdit<P extends EditablePlayer>(
  players: readonly P[],
  rows: readonly EditRow[],
  structure: Parameters<typeof payoutForPlace>[1] & Parameters<typeof bountyTakeFor>[1],
): P[] {
  const byId = new Map(rows.map(r => [r.id, r]));
  const kos = knockoutsFrom(rows);

  const shaped = players.map(p => {
    const row = byId.get(p.id);
    if (!row) return p;
    const out = row.busts.find(b => b.then === 'out');
    const earlier: EarlierBust[] = row.busts
      .filter((b): b is EditBust & { then: 'rebuy' | 'reEntry' } => b.then !== 'out')
      .map(b => ({ by: b.by, then: b.then }));
    const knockouts = kos.get(p.id) ?? 0;
    const placed = row.place !== null;
    const next: P = {
      ...p,
      position: placed ? row.place : undefined,
      isActive: !placed,
      eliminatedBy: out?.by ?? undefined,
      rebuys: earlier.filter(b => b.then === 'rebuy').length,
      reEntries: earlier.filter(b => b.then === 'reEntry').length,
      earlierBustsBy: earlier,
      knockouts,
      bountylessKnockouts: Math.min(p.bountylessKnockouts || 0, knockouts),
      bustCount: row.busts.length,
      bustLevel: undefined,
    };
    // A finisher has left their chair; a player put back in keeps theirs if they had one.
    if (placed) Object.assign(next, { seated: false, tableAssignment: undefined, seatInfo: undefined });
    return next;
  });

  // Every placed player is priced afresh: rebuy counts move the pool, places move the share.
  const payout = payoutForPlace(shaped as any, structure);
  return shaped.map(p => {
    const pos = Number(p.position);
    return pos > 0
      ? { ...p, prizeMoney: payout(pos) + bountyTakeFor(p as any, structure).money }
      : { ...p, prizeMoney: 0 };
  });
}
