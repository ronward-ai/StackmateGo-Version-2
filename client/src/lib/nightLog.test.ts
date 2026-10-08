import { describe, it, expect } from 'vitest';
import {
  appendEvent,
  eventsBetween,
  mergeLog,
  describeEvent,
  logOf,
  logFingerprint,
  LOG_CAP,
  type LogEvent,
  type NewLogEvent,
} from './nightLog';

const ev = (over: Partial<NewLogEvent> = {}): NewLogEvent => ({
  at: 1000,
  level: 1,
  kind: 'bust',
  playerId: 'p1',
  playerName: 'Amy',
  ...over,
});

describe('appendEvent', () => {
  it('ids are per console and deterministic from the log being appended to', () => {
    const a = appendEvent([], 'laptop', ev());
    const b = appendEvent(a, 'laptop', ev({ kind: 'rebuy' }));
    expect(b.map(e => e.id)).toEqual(['laptop:0', 'laptop:1']);
    // An updater called twice on the same log yields the same event.
    expect(appendEvent(a, 'laptop', ev({ kind: 'rebuy' }))).toEqual(b);
  });

  it('two consoles never mint the same id', () => {
    const laptop = appendEvent([], 'laptop', ev());
    const phone = appendEvent(laptop, 'phone', ev({ at: 2000 }));
    expect(phone.map(e => e.id)).toEqual(['laptop:0', 'phone:0']);
  });

  it('caps the log, and the cap never hands out an id already used', () => {
    let log: LogEvent[] = [];
    for (let i = 0; i < LOG_CAP + 5; i++) log = appendEvent(log, 'c', ev({ at: i }));
    expect(log).toHaveLength(LOG_CAP);
    expect(new Set(log.map(e => e.id)).size).toBe(LOG_CAP);
    expect(log[log.length - 1].id).toBe(`c:${LOG_CAP + 4}`);
  });
});

describe('mergeLog', () => {
  const full = [ev({ at: 1 }), ev({ at: 2, kind: 'rebuy' }), ev({ at: 3, kind: 'bust' })]
    .reduce<LogEvent[]>((log, e) => appendEvent(log, 'c', e), []);

  it('a stale (subset) copy merges back to the full log, either way round', () => {
    const stale = full.slice(0, 1);
    expect(mergeLog(full, stale)).toEqual(full);
    expect(mergeLog(stale, full)).toEqual(full);
  });

  it('unions two consoles and sorts by time', () => {
    const phone = appendEvent([], 'phone', ev({ at: 2.5, kind: 'addon' }));
    expect(mergeLog(full, phone).map(e => e.at)).toEqual([1, 2, 2.5, 3]);
  });

  it('dedupes by id', () => {
    expect(mergeLog(full, full)).toHaveLength(3);
  });

  it('ignores junk from the document', () => {
    expect(mergeLog(null, [{ nope: 1 }, ...full])).toEqual(full);
    expect(logOf('x')).toEqual([]);
  });

  it('fingerprint changes exactly when an event is added', () => {
    expect(logFingerprint(full)).toBe(logFingerprint(mergeLog(full, full)));
    expect(logFingerprint(full)).not.toBe(logFingerprint(appendEvent(full, 'c', ev())));
  });
});

describe('describeEvent', () => {
  const d = (over: Partial<LogEvent>) => describeEvent({ id: 'x', ...ev(), ...over } as LogEvent);

  it('says one sentence per kind', () => {
    expect(d({ kind: 'bust', byName: 'Dave', position: 7 })).toBe('Amy busted by Dave — 7th');
    expect(d({ kind: 'bust', position: 1 })).toBe('Amy won the tournament');
    expect(d({ kind: 'rebuy', count: 2 })).toBe('Amy rebought (2nd)');
    expect(d({ kind: 'reEntry', count: 1 })).toBe('Amy re-entered (1st)');
    expect(d({ kind: 'addon' })).toBe('Amy took the add-on');
    expect(d({ kind: 'undoBust' })).toBe("Amy's bust-out was undone");
    expect(d({ kind: 'rebuyDeclined' })).toBe('Rebuy declined for Amy');
    expect(d({ kind: 'rebuyRefused', detail: 'the rebuy period ended at level 4' }))
      .toBe('Rebuy refused for Amy: the rebuy period ended at level 4');
    expect(d({ kind: 'reEntryRefused', detail: 'cap reached' })).toBe('Re-entry refused for Amy: cap reached');
    expect(d({ kind: 'added' })).toBe('Amy entered');
    expect(d({ kind: 'removed' })).toBe('Amy was removed');
    expect(d({ kind: 'finalTable' })).toBe('Final table');
    expect(d({ kind: 'tableBreak', detail: 'Table 3' })).toBe('Table 3 broken');
  });
});

describe('eventsBetween', () => {
  const p = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), ...over });

  it('a toast-undo of a rebuy is not a bust, and its table restore is not a consolidation', () => {
    const before = { players: [p('a', { rebuys: 1 })], isFinalTable: false, settings: { tables: { numberOfTables: 2 } } };
    const after = { players: [p('a', { rebuys: 0, isActive: false, position: 5 })], isFinalTable: true, settings: { tables: { numberOfTables: 1 } } };
    expect(eventsBetween(before, after, 1, 1).map(e => [e.kind, e.detail])).toEqual([['returnUndone', 'rebuy']]);
  });

  it('a re-entry, an add-on, a removal and an addition', () => {
    const before = { players: [p('a', { isActive: false, position: 4 }), p('b'), p('c')] };
    const after = { players: [p('a', { reEntries: 1 }), p('b', { addons: 1 }), p('d')] };
    expect(eventsBetween(before, after, 1, 3).map(e => `${e.kind}:${e.playerId}`))
      .toEqual(['removed:c', 'reEntry:a', 'addon:b', 'added:d']);
  });

  it('undoing the final hand reads as the win being undone', () => {
    const before = { players: [p('a', { isActive: false, position: 1 }), p('b', { isActive: false, position: 2 })] };
    const after = { players: [p('a'), p('b')] };
    const sentences = eventsBetween(before, after, 1, 1).map(e => describeEvent({ id: 'x', ...e }));
    expect(sentences).toEqual(["A's win was undone", "B's bust-out was undone"]);
  });

  it('a final table and a table break', () => {
    const t = (n: number, ft = false) => ({ players: [], isFinalTable: ft, settings: { tables: { numberOfTables: n } } });
    expect(eventsBetween(t(2), t(1, true), 1, 1).map(e => e.kind)).toEqual(['finalTable']);
    expect(eventsBetween(t(3), t(2), 1, 1).map(e => e.kind)).toEqual(['tableBreak']);
    expect(eventsBetween(t(2), t(2), 1, 1)).toEqual([]);
  });

  it('a renumbering of players already out is not an event', () => {
    const before = { players: [p('a', { isActive: false, position: 3 }), p('b')] };
    const after = { players: [p('a', { isActive: false, position: 4 }), p('b')] };
    expect(eventsBetween(before, after, 1, 1)).toEqual([]);
  });
});
