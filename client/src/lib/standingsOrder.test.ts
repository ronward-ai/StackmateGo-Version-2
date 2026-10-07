import { describe, it, expect } from 'vitest';
import { compareStandings, bestFinishOf } from './standingsOrder';

describe('compareStandings (Oct Low)', () => {
  it('points, then fewer games, then best finish', () => {
    const rows = [
      { id: 'a', points: 50, games: 3, bestFinish: 4 },
      { id: 'b', points: 60, games: 4, bestFinish: 9 },
      { id: 'c', points: 50, games: 3, bestFinish: 1 },
      { id: 'd', points: 50, games: 2, bestFinish: 7 },
    ];
    expect([...rows].sort(compareStandings).map(r => r.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('ranks no finish below any finish', () => {
    expect(compareStandings({ points: 0, games: 0 }, { points: 0, games: 0, bestFinish: 12 })).toBeGreaterThan(0);
  });

  it('bestFinishOf ignores unplaced results', () => {
    expect(bestFinishOf([{ position: 0 }, { position: 5 }, { position: 3 }])).toBe(3);
    expect(bestFinishOf([])).toBe(999);
  });
});
