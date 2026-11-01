import { describe, it, expect } from 'vitest';
import { fieldStats, clockStats, clockPayouts, shortChips } from './fieldStats';

const ps = { buyIn: 10, startingChips: 10000, rebuyChips: 5000, addonChips: 8000 };
const player = (o: Record<string, unknown> = {}) => ({ isActive: true, rebuys: 0, addons: 0, reEntries: 0, ...o });

describe('fieldStats', () => {
  it('counts every chip bought, by its own stack size', () => {
    const f = fieldStats([player({ rebuys: 1 }), player({ addons: 1 }), player({ reEntries: 1, isActive: false })], ps);
    // 3 starting stacks + one 5k rebuy + one 8k add-on + a re-entry's fresh 10k.
    expect(f.totalChips).toBe(30000 + 5000 + 8000 + 10000);
    expect(f.active).toBe(2);
    expect(f.eliminated).toBe(1);
    expect(f.averageStack).toBe(Math.floor(53000 / 2));
    // The pool is prizePool.ts's, not a second sum: three buy-ins and the re-entry
    // (an unpriced rebuy adds nothing to the pool there, by design).
    expect(f.pool).toBe(40);
  });

  it('an unset stack is the 10,000 default; nobody left means no average', () => {
    const f = fieldStats([player({ isActive: false })], {});
    expect(f.totalChips).toBe(10000);
    expect(f.averageStack).toBe(0);
  });
});

describe('clockStats', () => {
  it('reads "players left" only once somebody has busted', () => {
    expect(clockStats(fieldStats([player(), player()], ps), '£', false)[0]).toEqual({ label: 'Players', value: '2' });
    const later = clockStats(fieldStats([player(), player(), player({ isActive: false })], ps), '£', false);
    expect(later[0]).toEqual({ label: 'Players left', value: '2/3' });
    expect(later.map(s => s.label)).toEqual(['Players left', 'Avg stack']);
    expect(later[1].value).toBe('15k');
  });

  it('shows nothing once the game is over, or before anyone has entered', () => {

    expect(clockStats(fieldStats([player()], ps), '£', true)).toEqual([]);
    expect(clockStats(fieldStats([], ps), '£', false)).toEqual([]);
  });
});

describe('shortChips', () => {
  it('reads across a room', () => {
    expect([shortChips(950), shortChips(12_500), shortChips(1_250_000)]).toEqual(['950', '13k', '1.3M']);
  });
});

describe('clockPayouts', () => {
  const paid = { ...ps, manualPayouts: [{ position: 1, percentage: 60 }, { position: 2, percentage: 30 }, { position: 3, percentage: 10 }] };
  const ten = Array.from({ length: 10 }, () => player());

  it('names what each place pays, from the pool as it stands', () => {
    expect(clockPayouts(fieldStats(ten, paid), paid, '£', false)).toEqual([
      { label: '1st', value: '£60' }, { label: '2nd', value: '£30' }, { label: '3rd', value: '£10' },
    ]);
  });

  it('reads the legacy `structure` field too, through payoutsOf', () => {
    const legacy = { ...ps, structure: paid.manualPayouts };
    expect(clockPayouts(fieldStats(ten, legacy), legacy, '£', false).map(p => p.value)).toEqual(['£60', '£30', '£10']);
  });

  it('leaves out a place that pays nothing, a free game, and a finished game', () => {
    const tiny = { ...paid, buyIn: 1 };
    // A £2 pool: 60% is £1, 30% and 10% floor to nothing.
    expect(clockPayouts(fieldStats([player(), player()], tiny), tiny, '£', false)).toEqual([{ label: '1st', value: '£1' }]);
    expect(clockPayouts(fieldStats(ten, { ...paid, buyIn: 0 }), { ...paid, buyIn: 0 }, '£', false)).toEqual([]);
    expect(clockPayouts(fieldStats(ten, paid), paid, '£', true)).toEqual([]);
  });
});

describe('the director\'s clock settings', () => {
  const paid = { ...ps, manualPayouts: [{ position: 1, percentage: 100 }] };
  const field = fieldStats([player(), player(), player({ isActive: false })], paid);

  it('shows everything when nothing is set — every game stored before the settings', () => {
    expect(clockStats(field, '£', false, {}).map(s => s.label)).toEqual(['Players left', 'Avg stack']);
    expect(clockPayouts(field, paid, '£', false, {})).toHaveLength(1);
  });

  it('leaves out exactly what was switched off', () => {
    expect(clockStats(field, '£', false, { clockShowPlayers: false }).map(s => s.label)).toEqual(['Avg stack']);
    expect(clockStats(field, '£', false, { clockShowAverageStack: false }).map(s => s.label)).toEqual(['Players left']);
    expect(clockPayouts(field, paid, '£', false, { clockShowPayouts: false })).toEqual([]);
  });
});
