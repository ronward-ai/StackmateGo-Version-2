import { describe, it, expect } from 'vitest';
import { bandsOf, pointsForBand, DEFAULT_POSITION_POINTS, type PointsBand } from './pointsBands';

describe('pointsForBand', () => {
  const bands: PointsBand[] = [
    { from: 1, to: 1, points: 36, perPlayer: true },
    { from: 2, to: 3, points: 10 },
    { from: 4, to: null, points: 1 },
  ];

  it('pays a flat band the same whatever the field', () => {
    expect(pointsForBand(bands, 2, 10)).toBe(10);
    expect(pointsForBand(bands, 2, 40)).toBe(10);
    expect(pointsForBand(bands, 3, 10)).toBe(10);
  });

  it('scales a per-player band with the field — the reason this exists', () => {
    expect(pointsForBand(bands, 1, 10)).toBe(360);
    expect(pointsForBand(bands, 1, 20)).toBe(720);
  });

  it('lets an open-ended band catch everything after it', () => {
    expect(pointsForBand(bands, 4, 10)).toBe(1);
    expect(pointsForBand(bands, 99, 10)).toBe(1);
  });

  it('scores nothing for a place no band covers — how "top twenty only" is said', () => {
    const topThree: PointsBand[] = [{ from: 1, to: 3, points: 10 }];
    expect(pointsForBand(topThree, 4, 10)).toBe(0);
    expect(pointsForBand([], 1, 10)).toBe(0);
  });

  it('takes the FIRST matching band, so an overlap is predictable', () => {
    const overlapping: PointsBand[] = [
      { from: 1, to: 1, points: 50 },
      { from: 1, to: 5, points: 10 },
    ];
    expect(pointsForBand(overlapping, 1, 10)).toBe(50);
    expect(pointsForBand(overlapping, 2, 10)).toBe(10);
  });

  it('stays whole and never negative', () => {
    expect(pointsForBand([{ from: 1, to: 1, points: 2.5, perPlayer: true }], 1, 3)).toBe(7);
    expect(pointsForBand([{ from: 1, to: 1, points: -20 }], 1, 10)).toBe(0);
  });

  it('ignores a nonsense position', () => {
    expect(pointsForBand(bands, 0, 10)).toBe(0);
    expect(pointsForBand(bands, NaN, 10)).toBe(0);
  });
});

describe('bandsOf', () => {
  it('prefers bands when a league has them', () => {
    const bands = [{ from: 1, to: 5, points: 10 }];
    expect(bandsOf({ positionBands: bands, positionPoints: [99] })).toBe(bands);
  });

  it('converts a stored array into one-place bands', () => {
    expect(bandsOf({ positionPoints: [25, 18] })).toEqual([
      { from: 1, to: 1, points: 25, perPlayer: false },
      { from: 2, to: 2, points: 18, perPlayer: false },
    ]);
  });

  it('falls back to the default ladder', () => {
    expect(bandsOf({})).toHaveLength(DEFAULT_POSITION_POINTS.length);
    expect(bandsOf(null)[0].points).toBe(25);
  });

  it('SCORES A STORED ARRAY IDENTICALLY — no league moves', () => {
    // The guarantee the whole change rests on.
    const stored = [25, 18, 13, 9, 6, 4, 3, 2, 1];
    const bands = bandsOf({ positionPoints: stored });
    for (let position = 1; position <= 15; position++) {
      const before = stored[position - 1] ?? 0;
      expect(pointsForBand(bands, position, 12)).toBe(before);
    }
  });
});

describe('the scaling scheme, built from bands', () => {
  // The claim this change rests on: the popular ready-made is configuration.
  const scaling: PointsBand[] = [
    { from: 1, to: 1, points: 36, perPlayer: true },
    { from: 2, to: 2, points: 24, perPlayer: true },
    { from: 3, to: 3, points: 20, perPlayer: true },
    { from: 4, to: 4, points: 16, perPlayer: true },
    { from: 5, to: 5, points: 12, perPlayer: true },
    { from: 6, to: 6, points: 10, perPlayer: true },
    { from: 7, to: 7, points: 8, perPlayer: true },
    { from: 8, to: 8, points: 6, perPlayer: true },
    { from: 9, to: 15, points: 2, perPlayer: true },
    { from: 16, to: 20, points: 1, perPlayer: true },
  ];

  const formula = (f: number, p: number) =>
    (f==1?p*36:f==2?p*24:f==3?p*20:f==4?p*16:f==5?p*12:f==6?p*10:f==7?p*8:f==8?p*6:f<=15?p*2:f<=20?p:0);

  it('scores exactly what the formula scores, position by position', () => {
    for (let players = 2; players <= 40; players++) {
      for (let position = 1; position <= 25; position++) {
        expect(pointsForBand(scaling, position, players)).toBe(formula(position, players));
      }
    }
  });
});
