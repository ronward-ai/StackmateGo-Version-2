import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCAL_PROGRESS_KEY,
  clearLocalProgress,
  loadLocalProgress,
  recoverableProgress,
  saveLocalProgress,
  type LocalProgress,
} from './localProgress';
import type { Player } from '@/types';

const player = (id: string): Player => ({ id, name: id, knockouts: 0 } as Player);

const progress = (over: Partial<LocalProgress> = {}): LocalProgress => ({
  localGameId: 'game_1',
  players: [player('a'), player('b')],
  currentLevel: 2,
  secondsLeft: 300,
  isRunning: false,
  ...over,
});

beforeEach(() => localStorage.clear());

describe('loadLocalProgress', () => {
  it('returns what was saved for the same game', () => {
    saveLocalProgress(progress());
    expect(loadLocalProgress('game_1')?.players).toHaveLength(2);
  });

  it('refuses a different game, so a new tournament never inherits a roster', () => {
    saveLocalProgress(progress());
    expect(loadLocalProgress('game_2')).toBeNull();
  });

  it('survives junk in storage', () => {
    localStorage.setItem(LOCAL_PROGRESS_KEY, 'not json');
    expect(loadLocalProgress('game_1')).toBeNull();
  });
});

describe('recoverableProgress', () => {
  it('offers the mirror when the saved game has no players', () => {
    saveLocalProgress(progress({ dbTournamentId: 'game_1' }));
    expect(recoverableProgress('game_1', 0)?.players).toHaveLength(2);
  });

  it('NEVER offers it when the saved game has players — Firestore wins', () => {
    saveLocalProgress(progress({ dbTournamentId: 'game_1' }));
    expect(recoverableProgress('game_1', 5)).toBeNull();
    expect(recoverableProgress('game_1', 1)).toBeNull();
  });

  it('NEVER offers a mirror of a different tournament', () => {
    saveLocalProgress(progress({ dbTournamentId: 'game_1' }));
    expect(recoverableProgress('game_2', 0)).toBeNull();
  });

  it('does not offer a mirror of a game that never went live', () => {
    saveLocalProgress(progress()); // no dbTournamentId
    expect(recoverableProgress('game_1', 0)).toBeNull();
  });

  it('has nothing to offer when the mirror is empty', () => {
    saveLocalProgress(progress({ dbTournamentId: 'game_1', players: [] }));
    expect(recoverableProgress('game_1', 0)).toBeNull();
  });

  it('has nothing to offer once cleared', () => {
    saveLocalProgress(progress({ dbTournamentId: 'game_1' }));
    clearLocalProgress();
    expect(recoverableProgress('game_1', 0)).toBeNull();
  });
});
