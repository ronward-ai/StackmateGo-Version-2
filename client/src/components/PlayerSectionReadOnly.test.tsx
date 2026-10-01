import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlayerSectionReadOnly from './PlayerSectionReadOnly';

/**
 * The finishing order on a PLAYER'S PHONE.
 *
 * This screen had no test and the director never looks at it, which is exactly
 * why it had drifted furthest of the four implementations of one row:
 *
 *  - rank was `#9` — no ordinal, and no medal, so first place was
 *    indistinguishable from ninth on the screen most people at a game actually
 *    look at;
 *  - knockouts were hand-rolled as `3 KOs` in red and the money as raw
 *    `prizeMoney` in green, both straight past `lib/playerBadges.ts` —
 *    reproducing the precise third vocabulary that module was written to end;
 *  - `player.prizeMoney` was typed optional and dereferenced unguarded.
 *
 * All three are gone by construction now: it renders the shared `ResultRow` off
 * the shared derivation. These assertions are what stops them coming back.
 */
const tournament = (players: any[]) => ({
  state: {
    players,
    settings: { currency: '£' },
    prizeStructure: { buyIn: 10, manualPayouts: [{ position: 1, percentage: 100 }] },
  },
});

describe('PlayerSectionReadOnly', () => {
  const finished = [
    { id: '1', name: 'Dan', isActive: false, position: 1, knockouts: 3 },
    { id: '2', name: 'Amy', isActive: false, position: 2 },
    { id: '3', name: 'Cass', isActive: false, position: 21 },
  ];

  // THE MUTANT: `#{player.position}`. A hash is not a place, and it gave the
  // winner the same treatment as everybody else.
  it('names places with ordinals rather than hashes', () => {
    render(<PlayerSectionReadOnly tournament={tournament(finished) as any} />);
    expect(screen.getByText('1st')).toBeTruthy();
    expect(screen.getByText('2nd')).toBeTruthy();
    expect(screen.getByText('21st')).toBeTruthy();
    expect(screen.queryByText('#1')).toBeNull();
    expect(screen.queryByText('21th')).toBeNull();
  });

  // THE MUTANT: `{knockouts} KO{s}` in red. `lib/playerBadges.ts` says the chip
  // reads a figure and the word "KO", once, everywhere.
  it('speaks the one chip vocabulary, not a third one of its own', () => {
    render(<PlayerSectionReadOnly tournament={tournament(finished) as any} />);
    expect(screen.getByText('KO')).toBeTruthy();
    expect(screen.queryByText('3 KOs')).toBeNull();
  });

  it('shows the payout derived from the prize structure', () => {
    render(<PlayerSectionReadOnly tournament={tournament(finished) as any} />);
    expect(screen.getByText('£30')).toBeTruthy();
  });

  /**
   * A tournament document written without a prize structure still carries
   * `prizeMoney` on each player from the moment they busted, and that is all this
   * screen has ever had to show. Deriving ONLY would have silently emptied the
   * money on every older game — so the derivation falls back to the stored value.
   */
  it('still shows what a player won on a game that stored no prize structure', () => {
    render(
      <PlayerSectionReadOnly
        tournament={{
          state: {
            players: [{ id: '1', name: 'Dan', isActive: false, position: 1, prizeMoney: 75 }],
            settings: { currency: '£' },
          },
        } as any}
      />,
    );
    expect(screen.getByText('£75')).toBeTruthy();
  });

  it('does not fall over on a player with no recorded winnings at all', () => {
    expect(() =>
      render(
        <PlayerSectionReadOnly
          tournament={{
            state: { players: [{ id: '1', name: 'Dan', isActive: false, position: 2 }], settings: {} },
          } as any}
        />,
      ),
    ).not.toThrow();
  });

  it('keeps the two sections a phone wants — who is in, and how it finished', () => {
    render(<PlayerSectionReadOnly tournament={tournament([
      { id: '1', name: 'Zoe', isActive: true },
      { id: '2', name: 'Amy', isActive: false, position: 2 },
    ]) as any} />);
    expect(screen.getByText('Active Players (1)')).toBeTruthy();
    expect(screen.getByText('Final Rankings (1)')).toBeTruthy();
  });

  // An absent flag means ACTIVE everywhere in this app.
  it('treats a player with no flag as still in', () => {
    render(<PlayerSectionReadOnly tournament={tournament([
      { id: '1', name: 'Zoe' },
      { id: '2', name: 'Amy', isActive: false, position: 2 },
    ]) as any} />);
    expect(screen.getByText('Active Players (1)')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('says so when nobody has joined', () => {
    render(<PlayerSectionReadOnly tournament={tournament([]) as any} />);
    expect(screen.getByText('Nobody has joined yet')).toBeTruthy();
  });
});
