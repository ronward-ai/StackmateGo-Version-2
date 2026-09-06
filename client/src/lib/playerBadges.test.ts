import { describe, it, expect } from 'vitest';
import { badgesFor, badgeText, type BadgeInputs } from './playerBadges';

const base: BadgeInputs = { gameFinished: false, currencySymbol: '£' };
const keys = (i: Partial<BadgeInputs>) => badgesFor({ ...base, ...i }).map(b => b.key);
const one = (i: Partial<BadgeInputs>, key: string) =>
  badgesFor({ ...base, ...i }).find(b => b.key === key);

describe('badgesFor', () => {
  it('gives a player with nothing to report no chips at all', () => {
    expect(badgesFor(base)).toEqual([]);
  });

  it('shows the seat only while the game is running', () => {
    const seated = { seated: true, seat: { tableIndex: 0, seatIndex: 2 } };
    expect(one(seated, 'seat')?.figure).toBe('T1·S3');
    expect(keys({ ...seated, gameFinished: true })).not.toContain('seat');
  });

  it('does not show a seat for someone who is not seated', () => {
    expect(keys({ seat: { tableIndex: 0, seatIndex: 0 } })).not.toContain('seat');
  });

  it('separates the figure from its label, so digits can be set in mono', () => {
    const ko = one({ knockouts: 4 }, 'ko');
    expect(ko).toMatchObject({ figure: '4', label: 'KO' });
  });

  it('counts one rebuy as a rebuy and two as rebuys', () => {
    expect(one({ rebuys: 1 }, 'rebuys')?.label).toBe('rebuy');
    expect(one({ rebuys: 2 }, 'rebuys')?.label).toBe('rebuys');
  });

  it('names who knocked the player out', () => {
    expect(one({ eliminatedByName: 'Dave Renshaw' }, 'out')?.label).toBe('out to Dave Renshaw');
  });

  it('carries the currency the game is played in', () => {
    expect(one({ prize: 170 }, 'prize')?.figure).toBe('£170');
    expect(badgesFor({ ...base, prize: 170, currencySymbol: '€' })[0].figure).toBe('€170');
  });

  it('rounds money to whole units', () => {
    expect(one({ prize: 102.4 }, 'prize')?.figure).toBe('£102');
    expect(one({ bounty: 19.6 }, 'bounty')?.figure).toBe('£20');
  });

  it('omits every zero rather than showing an empty count', () => {
    expect(badgesFor({ ...base, knockouts: 0, rebuys: 0, points: 0, prize: 0, bounty: 0 })).toEqual([]);
  });

  // The point of the module: colour says what kind of thing this is, not who
  // wrote the line. Facts share the neutral chip so money can stand out.
  it('gives facts one tone and money another', () => {
    const all = badgesFor({
      ...base,
      seated: true, seat: { tableIndex: 0, seatIndex: 0 },
      knockouts: 2, rebuys: 1, points: 120, prize: 170, bounty: 20,
      eliminatedByName: 'Kelly',
    });
    const tone = (k: string) => all.find(b => b.key === k)?.tone;

    expect(tone('seat')).toBe('neutral');
    expect(tone('ko')).toBe('neutral');
    expect(tone('rebuys')).toBe('neutral');
    expect(tone('prize')).toBe('money');
    expect(tone('bounty')).toBe('bounty');
    expect(tone('out')).toBe('eliminated');
    expect(tone('points')).toBe('points');
  });

  it('keeps a fixed order, so a row does not reshuffle as the night goes on', () => {
    expect(keys({
      seated: true, seat: { tableIndex: 0, seatIndex: 0 },
      knockouts: 1, eliminatedByName: 'Kelly', rebuys: 1, points: 10, prize: 5, bounty: 5,
    })).toEqual(['seat', 'ko', 'out', 'rebuys', 'points', 'prize', 'bounty']);
  });
});

describe('badgeText', () => {
  // The exported PNG writes plain DOM nodes, so it needs one string per chip —
  // and it must be the same string the screen shows.
  it('joins the figure and label', () => {
    expect(badgeText({ key: 'ko', figure: '4', label: 'KO', tone: 'neutral' })).toBe('4 KO');
  });

  it('handles a chip that is only a figure, or only a label', () => {
    expect(badgeText({ key: 'prize', figure: '£170', tone: 'money' })).toBe('£170');
    expect(badgeText({ key: 'out', label: 'out to Kelly', tone: 'eliminated' })).toBe('out to Kelly');
  });

  it('says the same thing the screen says, chip for chip', () => {
    const badges = badgesFor({ ...base, knockouts: 3, prize: 40 });
    expect(badges.map(badgeText)).toEqual(['3 KO', '£40']);
  });
});
