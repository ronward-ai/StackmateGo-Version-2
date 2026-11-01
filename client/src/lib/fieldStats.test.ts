import { describe, it, expect } from 'vitest';
import { fieldStats, clockStats, shortChips } from './fieldStats';

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
    expect(later.map(s => s.label)).toEqual(['Players left', 'Avg stack', 'Prize pool']);
    expect(later[1].value).toBe('15k');
    expect(later[2].value).toBe('£30');
  });

  it('leaves out a pool of nothing, and shows nothing once the game is over', () => {
    expect(clockStats(fieldStats([player()], { buyIn: 0 }), '£', false).map(s => s.label)).toEqual(['Players', 'Avg stack']);
    expect(clockStats(fieldStats([player()], ps), '£', true)).toEqual([]);
    expect(clockStats(fieldStats([], ps), '£', false)).toEqual([]);
  });
});

describe('shortChips', () => {
  it('reads across a room', () => {
    expect([shortChips(950), shortChips(12_500), shortChips(1_250_000)]).toEqual(['950', '13k', '1.3M']);
  });
});
