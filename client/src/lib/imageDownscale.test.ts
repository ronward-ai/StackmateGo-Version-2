import { describe, it, expect } from 'vitest';
import { fitWithin, dataUrlBytes, MAX_LOGO_EDGE, MAX_LOGO_BYTES } from './imageDownscale';

describe('fitWithin', () => {
  it('leaves an image that already fits alone', () => {
    expect(fitWithin({ width: 200, height: 100 }, 512)).toEqual({ width: 200, height: 100 });
    expect(fitWithin({ width: 512, height: 512 }, 512)).toEqual({ width: 512, height: 512 });
  });

  // Never scale up: a 64px logo blown up to 512 is bigger to store and no
  // better to look at.
  it('never enlarges', () => {
    expect(fitWithin({ width: 64, height: 32 }, 512)).toEqual({ width: 64, height: 32 });
  });

  it('scales the longest edge down and keeps the aspect ratio', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 512)).toEqual({ width: 512, height: 384 });
    expect(fitWithin({ width: 3000, height: 4000 }, 512)).toEqual({ width: 384, height: 512 });
  });

  it('keeps an extreme banner at least one pixel tall', () => {
    const r = fitWithin({ width: 10000, height: 3 }, 512);
    expect(r.width).toBe(512);
    expect(r.height).toBe(1); // rounds to 0 without the guard, and a 0-wide canvas throws
  });

  it('survives a zero or nonsense size', () => {
    expect(fitWithin({ width: 0, height: 0 }, 512)).toEqual({ width: 1, height: 1 });
    expect(fitWithin({ width: NaN, height: 100 }, 512)).toEqual({ width: 1, height: 1 });
  });
});

describe('dataUrlBytes', () => {
  it('measures the whole stored string, header included', () => {
    // "AAAA" decodes to 3 bytes; the header is stored too.
    const url = 'data:image/webp;base64,AAAA';
    expect(dataUrlBytes(url)).toBe(3 + 'data:image/webp;base64,'.length);
  });

  it('accounts for padding', () => {
    const header = 'data:image/webp;base64,'.length;
    expect(dataUrlBytes('data:image/webp;base64,AAA=')).toBe(2 + header);
    expect(dataUrlBytes('data:image/webp;base64,AA==')).toBe(1 + header);
  });

  it('does not throw on a string that is not a data URL', () => {
    expect(dataUrlBytes('https://example.test/logo.png')).toBe(29);
  });

  // The figure that matters: an unbounded phone photo against Firestore's 1 MiB
  // document limit, which the logo shares with the roster and every setting.
  it('shows why a raw phone photo cannot be stored', () => {
    const fourMegabytePhoto = 'data:image/jpeg;base64,' + 'A'.repeat(4_000_000 * 4 / 3);
    expect(dataUrlBytes(fourMegabytePhoto)).toBeGreaterThan(1024 * 1024);
    expect(MAX_LOGO_BYTES).toBeLessThan(1024 * 1024);
  });
});

describe('budget', () => {
  it('leaves most of the document for the roster', () => {
    // The logo is fixed; the players array grows all night.
    expect(MAX_LOGO_BYTES).toBeLessThan(1024 * 1024 * 0.2);
    expect(MAX_LOGO_EDGE).toBeLessThanOrEqual(1024);
  });
});
