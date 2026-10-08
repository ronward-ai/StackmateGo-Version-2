import { describe, it, expect } from 'vitest';
import { editRowsFrom, validateEdit, applyEdit, editWarnings, knockoutsFrom, type EditRow, type EditablePlayer } from './resultsEdit';

const structure = {
  buyIn: 10, rebuyAmount: 10,
  manualPayouts: [{ position: 1, percentage: 70 }, { position: 2, percentage: 30 }],
};

// A finished night: Dan out 4th (by Amy), Cat out 3rd (by Bob), Bob 2nd (by Amy).
// Cat rebought once, busted that time by Dan.
const night = () => [
  { id: 'a', name: 'Amy', position: 1, isActive: false, knockouts: 2 },
  { id: 'b', name: 'Bob', position: 2, isActive: false, eliminatedBy: 'a', knockouts: 1 },
  { id: 'c', name: 'Cat', position: 3, isActive: false, eliminatedBy: 'b', rebuys: 1, earlierBustsBy: [{ by: 'd', then: 'rebuy' as const }], knockouts: 0 },
  { id: 'd', name: 'Dan', position: 4, isActive: false, eliminatedBy: 'a', knockouts: 1 },
];

const row = (rows: EditRow[], id: string) => rows.find(r => r.id === id)!;

describe('editRowsFrom', () => {
  it('lists each player\'s busts, best place first', () => {
    const rows = editRowsFrom(night());
    expect(rows.map(r => r.name)).toEqual(['Amy', 'Bob', 'Cat', 'Dan']);
    expect(row(rows, 'c').busts).toEqual([{ by: 'd', then: 'rebuy' }, { by: 'b', then: 'out' }]);
    expect(row(rows, 'a').busts).toEqual([]);
  });

  it('pads counts with no recorded hitman as Unknown', () => {
    const rows = editRowsFrom([{ id: 'x', name: 'X', rebuys: 2, reEntries: 1 }]);
    expect(rows[0].busts).toEqual([{ by: null, then: 'rebuy' }, { by: null, then: 'rebuy' }, { by: null, then: 'reEntry' }]);
    expect(rows[0].place).toBeNull();
  });
});

describe('applyEdit', () => {
  it('a consistent night round-trips unchanged in every count', () => {
    const players = night();
    const out = applyEdit(players, editRowsFrom(players), structure);
    for (const p of out) {
      const was = players.find(x => x.id === p.id)!;
      expect([p.position, p.knockouts, p.rebuys || 0, p.eliminatedBy]).toEqual([was.position, was.knockouts, was.rebuys || 0, was.eliminatedBy]);
    }
  });

  it('derives knockouts from EVERY bust, the ones before a rebuy included', () => {
    expect(Object.fromEntries(knockoutsFrom(editRowsFrom(night())))).toEqual({ a: 2, b: 1, d: 1 });
  });

  it('THE REPORTED CASE: every bust undone leaves stray hits and rebuys; the edit sets them right', () => {
    // After undoing everything: all in, but Dan still holds the KO from Cat's
    // pre-rebuy bust and Cat still holds the rebuy.
    const unwound: EditablePlayer[] = [
      { id: 'a', name: 'Amy', knockouts: 0 },
      { id: 'b', name: 'Bob', knockouts: 0 },
      { id: 'c', name: 'Cat', rebuys: 1, knockouts: 0 },
      { id: 'd', name: 'Dan', knockouts: 1 },
    ];
    const rows = editRowsFrom(unwound);
    expect(knockoutsFrom(rows).get('d')).toBeUndefined(); // the stray hit is not a bust anybody had
    // The director types the night in: Cat's first bust by Bob, then a missed second rebuy by Amy.
    row(rows, 'c').busts = [{ by: 'b', then: 'rebuy' }, { by: 'a', then: 'rebuy' }, { by: 'b', then: 'out' }];
    row(rows, 'c').place = 3;
    row(rows, 'd').place = 4; row(rows, 'd').busts = [{ by: 'a', then: 'out' }];
    row(rows, 'b').place = 2; row(rows, 'b').busts = [{ by: 'a', then: 'out' }];
    row(rows, 'a').place = 1;
    expect(validateEdit(rows)).toEqual([]);

    const out = applyEdit(unwound, rows, structure);
    const get = (id: string) => out.find(p => p.id === id)!;
    expect(get('a')).toMatchObject({ position: 1, isActive: false, knockouts: 3 });
    expect(get('b')).toMatchObject({ position: 2, knockouts: 2, eliminatedBy: 'a' });
    expect(get('c')).toMatchObject({ position: 3, rebuys: 2, knockouts: 0, eliminatedBy: 'b' });
    expect(get('d')).toMatchObject({ position: 4, knockouts: 0 });
    // Money from the places, against a pool that now has two rebuys in it: 60 in.
    expect(get('a').prizeMoney).toBe(42);
    expect(get('b').prizeMoney).toBe(18);
    expect(get('c').prizeMoney).toBe(0);
  });

  it('an Unknown hitman credits nobody, and says so', () => {
    const rows = editRowsFrom([{ id: 'x', name: 'X', rebuys: 1 }, { id: 'y', name: 'Y' }]);
    expect(knockoutsFrom(rows).size).toBe(0);
    expect(editWarnings(rows, null)[0]).toMatch(/1 bust has no hitman/);
  });

  it('players left in keep their chair; finishers leave it', () => {
    const players = [
      { id: 'a', name: 'A', seated: true, tableAssignment: { tableIndex: 0, seatIndex: 1 } },
      { id: 'b', name: 'B', seated: true, tableAssignment: { tableIndex: 0, seatIndex: 2 } },
      { id: 'c', name: 'C', seated: true, tableAssignment: { tableIndex: 0, seatIndex: 3 } },
    ];
    const rows = editRowsFrom(players);
    row(rows, 'c').place = 3; row(rows, 'c').busts = [{ by: 'a', then: 'out' }];
    const out = applyEdit(players, rows, structure);
    expect(out.find(p => p.id === 'a')).toMatchObject({ isActive: true, seated: true });
    expect(out.find(p => p.id === 'c')).toMatchObject({ isActive: false, seated: false, tableAssignment: undefined });
  });
});

describe('validateEdit', () => {
  const finished = () => editRowsFrom(night());

  it('a consistent night is valid', () => {
    expect(validateEdit(finished())).toEqual([]);
  });

  it('refuses two players in one place', () => {
    const rows = finished(); row(rows, 'd').place = 3;
    expect(validateEdit(rows).join(' ')).toMatch(/same place/);
  });

  it('refuses places that do not run from the bottom', () => {
    const rows = editRowsFrom([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
    row(rows, 'a').place = 2; row(rows, 'a').busts = [{ by: 'b', then: 'out' }];
    expect(validateEdit(rows).join(' ')).toMatch(/must be 3 to 3/);
  });

  it('refuses a missing hitman for a finisher, a knocked-out winner and a self-knockout', () => {
    const rows = finished();
    row(rows, 'b').busts = [];
    row(rows, 'a').busts = [{ by: 'b', then: 'out' }];
    row(rows, 'c').busts[0].by = 'c';
    const text = validateEdit(rows).join(' ');
    expect(text).toMatch(/Bob needs who knocked them out/);
    expect(text).toMatch(/Amy won/);
    expect(text).toMatch(/Cat cannot knock themselves out/);
  });

  it('refuses a lone player still in — that is the winner', () => {
    const rows = finished(); row(rows, 'a').place = null;
    expect(validateEdit(rows).join(' ')).toMatch(/give them 1st/);
  });
});
