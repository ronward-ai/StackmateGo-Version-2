import { ordinal } from '@/lib/ordinal';

/**
 * The night's Summary: a timed log of what happened to whom.
 *
 * Built after rebuys went missing from a real night and nothing could say
 * afterwards whether they were refused, declined, reverted or never pressed.
 * Director-facing — it is written to the live document (so it survives a
 * reload and follows a takeover) and to the History record, but no player's
 * screen renders it.
 *
 * GROW-ONLY, like `rebuysAnswered`, and that is what keeps it cheap: a log that
 * cannot shrink cannot be reverted by its own echo, so a stale snapshot is only
 * ever a subset and `mergeLog`'s union heals it. No pending-write machinery.
 *
 * Ids are `<consoleId>:<n>`, with `n` taken from the log being appended to, so
 * a `setState` updater React calls twice produces the SAME event, and two
 * consoles either side of a takeover can never mint the same id.
 */

export type LogKind =
  | 'added'
  | 'removed'
  | 'bust'
  | 'undoBust'
  | 'returnUndone'
  | 'rebuy'
  | 'reEntry'
  | 'addon'
  | 'rebuyDeclined'
  | 'rebuyRefused'
  | 'reEntryRefused'
  | 'finalTable'
  | 'tableBreak';

export interface LogEvent {
  id: string;
  /** Wall-clock milliseconds. */
  at: number;
  /** One-indexed BLIND level, as the clock shows it. */
  level: number;
  kind: LogKind;
  playerId?: string;
  playerName?: string;
  /** Who knocked them out, for a bust. */
  byName?: string;
  /** Finishing place for a bust; the running count for a rebuy or re-entry. */
  position?: number;
  count?: number;
  /** A reason (refusals) or a table name (break). */
  detail?: string;
}

/** Far beyond any real night (~150 events), far below the 1 MiB document limit. */
export const LOG_CAP = 1000;

export type NewLogEvent = Omit<LogEvent, 'id'>;

/** Only arrays of plausible events survive — the document is data, not trusted shape. */
export function logOf(value: unknown): LogEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is LogEvent =>
      !!e && typeof e === 'object' && typeof e.id === 'string' && typeof e.at === 'number' && typeof e.kind === 'string',
  );
}

export function appendEvent(log: LogEvent[] | undefined, consoleId: string, event: NewLogEvent): LogEvent[] {
  const current = log ?? [];
  // The next number after this console's highest — not a count, which the cap
  // could shrink and so hand out an id already used.
  const prefix = `${consoleId}:`;
  let n = 0;
  for (const e of current) {
    if (!e.id.startsWith(prefix)) continue;
    const k = Number(e.id.slice(prefix.length));
    if (Number.isFinite(k) && k >= n) n = k + 1;
  }
  const next = [...current, { ...event, id: `${prefix}${n}` }];
  return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
}

/** Union by id, oldest first. Either side may be stale; neither can remove anything. */
export function mergeLog(a: unknown, b: unknown): LogEvent[] {
  const byId = new Map<string, LogEvent>();
  for (const e of logOf(a)) byId.set(e.id, e);
  for (const e of logOf(b)) if (!byId.has(e.id)) byId.set(e.id, e);
  const merged = Array.from(byId.values()).sort((x, y) => x.at - y.at || x.id.localeCompare(y.id));
  return merged.length > LOG_CAP ? merged.slice(merged.length - LOG_CAP) : merged;
}

/** Cheap equality for the sync guard: a grow-only log changes exactly when its ids do. */
export function logFingerprint(log: LogEvent[] | undefined): string {
  return (log ?? []).map(e => e.id).join(',');
}

const nth = (n?: number) => (n && n > 0 ? ` (${ordinal(n)})` : '');

/** The one sentence per event — the Summary dialog and History both read this. */
export function describeEvent(e: LogEvent): string {
  const who = e.playerName || 'A player';
  switch (e.kind) {
    case 'added':
      return `${who} entered`;
    case 'removed':
      return `${who} was removed`;
    case 'bust': {
      const by = e.byName ? ` by ${e.byName}` : '';
      const place = e.position ? ` — ${ordinal(e.position)}` : '';
      return e.position === 1 ? `${who} won the tournament` : `${who} busted${by}${place}`;
    }
    case 'undoBust':
      // Undoing the final hand puts the champion back in play too.
      return e.position === 1 ? `${who}'s win was undone` : `${who}'s bust-out was undone`;
    case 'returnUndone':
      return `${who}'s ${e.detail || 'return'} was undone`;
    case 'rebuy':
      return `${who} rebought${nth(e.count)}`;
    case 'reEntry':
      return `${who} re-entered${nth(e.count)}`;
    case 'addon':
      return `${who} took the add-on`;
    case 'rebuyDeclined':
      return `Rebuy declined for ${who}`;
    case 'rebuyRefused':
      return `Rebuy refused for ${who}${e.detail ? `: ${e.detail}` : ''}`;
    case 'reEntryRefused':
      return `Re-entry refused for ${who}${e.detail ? `: ${e.detail}` : ''}`;
    case 'finalTable':
      return 'Final table';
    case 'tableBreak':
      return e.detail ? `${e.detail} broken` : 'A table was broken';
    default:
      return String(e.kind);
  }
}

interface LoggedPlayer {
  id: string;
  name: string;
  isActive?: boolean;
  position?: number;
  eliminatedBy?: string;
  rebuys?: number;
  reEntries?: number;
  addons?: number;
}

interface LoggedState {
  players: LoggedPlayer[];
  isFinalTable?: boolean;
  settings?: { tables?: { numberOfTables?: number } };
}

const stillIn = (p: LoggedPlayer) => p.isActive !== false && !p.position;

/**
 * What one ACTION did, read off the roster before and after it.
 *
 * Derived rather than spelled out at each door, because there are seven doors
 * (add, remove, bust, undo, rebuy, re-entry, add-on) plus the toast's undo and
 * the two consolidations, and "a rule at one door out of three is not a rule"
 * is this codebase's most expensive lesson. Called only from the hook's own
 * action updaters — never from the snapshot handler, whose changes are the
 * OTHER console's and arrive already logged — and never from a reset.
 *
 * The winner is listed last: one bust-out that ends the game busts the runner-up
 * and crowns the champion in the same update, and the Summary should read in
 * that order.
 */
export function eventsBetween(prev: LoggedState, next: LoggedState, at: number, level: number): NewLogEvent[] {
  const events: NewLogEvent[] = [];
  const before = new Map(prev.players.map(p => [p.id, p]));
  const after = new Map(next.players.map(p => [p.id, p]));
  const nameOf = (id?: string) => (id ? after.get(id)?.name ?? before.get(id)?.name : undefined);
  const base = (p: LoggedPlayer) => ({ at, level, playerId: p.id, playerName: p.name });

  for (const p of prev.players) {
    if (!after.has(p.id)) events.push({ ...base(p), kind: 'removed' });
  }

  const winners: NewLogEvent[] = [];
  for (const n of next.players) {
    const o = before.get(n.id);
    if (!o) {
      events.push({ ...base(n), kind: 'added' });
      continue;
    }
    const rebuys = n.rebuys || 0;
    const reEntries = n.reEntries || 0;
    const rebuysBefore = o.rebuys || 0;
    const reEntriesBefore = o.reEntries || 0;

    if (stillIn(o) && !stillIn(n)) {
      if (rebuys < rebuysBefore) {
        events.push({ ...base(n), kind: 'returnUndone', detail: 'rebuy' });
      } else if (reEntries < reEntriesBefore) {
        events.push({ ...base(n), kind: 'returnUndone', detail: 're-entry' });
      } else {
        const bust: NewLogEvent = { ...base(n), kind: 'bust', position: n.position, byName: nameOf(n.eliminatedBy) };
        (n.position === 1 ? winners : events).push(bust);
      }
    } else if (!stillIn(o) && stillIn(n)) {
      if (rebuys > rebuysBefore) events.push({ ...base(n), kind: 'rebuy', count: rebuys });
      else if (reEntries > reEntriesBefore) events.push({ ...base(n), kind: 'reEntry', count: reEntries });
      else events.push({ ...base(n), kind: 'undoBust', position: o.position });
    }
    if ((n.addons || 0) > (o.addons || 0)) events.push({ ...base(n), kind: 'addon' });
  }
  events.push(...winners);

  // The toast's Undo of a return puts the tables back as well; that is part of
  // the undo, not a new consolidation.
  if (events.some(e => e.kind === 'returnUndone')) return events;

  if (!prev.isFinalTable && next.isFinalTable) {
    events.push({ at, level, kind: 'finalTable' });
  } else {
    const tablesBefore = prev.settings?.tables?.numberOfTables;
    const tablesAfter = next.settings?.tables?.numberOfTables;
    if (!next.isFinalTable && tablesBefore && tablesAfter && tablesAfter < tablesBefore) {
      events.push({ at, level, kind: 'tableBreak' });
    }
  }
  return events;
}

/** HH:MM in the viewer's clock. */
export function logTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
