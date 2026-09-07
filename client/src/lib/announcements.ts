import type { BlindLevel } from '@/types';

/**
 * What the app says out loud when the game moves.
 *
 * Free of React and of the browser, per the lib/ convention — `speak.ts` owns
 * the utterance and this owns the sentence, so the wording is testable without
 * a speech synthesiser.
 *
 * Five sites used to build these strings inline, and the level numbering below
 * was copied at three of them. Same class of duplication as the rake formula
 * before `prizePool.ts`.
 */

/**
 * Which blind level this is, as a player counts them.
 *
 * Breaks sit in the same array as levels but do not take a number, so level 3
 * is still level 3 with two breaks in front of it. A break's own index returns
 * the number of the level before it — callers only ask for a break's number
 * when they are not going to use it.
 */
export function blindLevelNumber(levels: BlindLevel[], index: number): number {
  return levels.slice(0, index + 1).filter(level => !level.isBreak).length;
}

/**
 * The sentence for arriving at a level.
 *
 * `prefix` is how the two skip controls announce themselves — 'Skipped to',
 * 'Skipped back to' — so that the difference between skipping and arriving is
 * one word rather than a second copy of the sentence.
 */
export function levelAnnouncement(levels: BlindLevel[], index: number, prefix?: string): string {
  const level = levels[index];
  if (!level) return '';

  const lead = prefix ? `${prefix} ` : '';

  if (level.isBreak) {
    // Spoken in minutes — nobody wants a duration in seconds. Lower case after
    // a prefix, because 'Skipped to Break time' reads as two sentences.
    const breakWord = prefix ? 'break time' : 'Break time';
    return `${lead}${breakWord}. Duration: ${level.duration / 60} minutes`;
  }

  let announcement =
    `${lead}Level ${blindLevelNumber(levels, index)}. ` +
    `Small blind ${level.small}, big blind ${level.big}`;

  if (level.ante && level.ante > 0) {
    announcement += `, ante ${level.ante}`;
  }

  return announcement;
}
