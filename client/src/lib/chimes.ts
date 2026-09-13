/**
 * The two sounds the game makes, in one place.
 *
 * Everything about audio in this app was in a muddle before.
 *
 * `client/public/notification.mp3` and `level-complete.mp3` were 153-byte TEXT
 * files whose contents read "This is a placeholder - you'll need to add actual
 * MP3 files". `TimerCard` loaded both into refs, set their volume and looped
 * one — and never called `.play()` on either. A third `new Audio(...)` in
 * `useTournament` pointed at a sound hosted on actions.google.com, was likewise
 * never played, and fired a third-party request on every console mount; a game
 * at a venue with no internet would not have got it anyway. That is the same
 * class of dependency the QR code's api.qrserver.com was removed for.
 *
 * The sounds that actually worked were Web Audio oscillators, written inline
 * TWICE inside the timer tick. This is that code, lifted out — the same
 * frequencies, gains and timings, so nothing sounds different.
 *
 * `lib/speak.ts` owns the voice for the same reasons: six sites built their own
 * utterance and had drifted on volume and language. Sound is now the same shape.
 * A new sound belongs here, not at its call site.
 *
 * Every function is best-effort. A browser that refuses an AudioContext — no
 * user gesture yet, autoplay policy, an ancient device — must not take the clock
 * down with it, and there is nothing useful to tell the director either way.
 */

type Chime = { frequency: number; at: number };

/** C5, E5, G5 — an ascending major chord. The level has ended. */
const LEVEL_COMPLETE: Chime[] = [
  { frequency: 523, at: 0 },
  { frequency: 659, at: 0.3 },
  { frequency: 784, at: 0.6 },
];

/** E5 twice. Softer and shorter: a nudge, not an announcement. */
const THIRTY_SECOND_WARNING: Chime[] = [
  { frequency: 659, at: 0 },
  { frequency: 659, at: 0.7 },
];

function play(chimes: Chime[], gain: number, duration: number): void {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx: AudioContext = new Ctor();
    const start = ctx.currentTime;
    for (const { frequency, at } of chimes) {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine'; // smooth, and doesn't grate over three hours
      gainNode.gain.value = gain;
      // Fade rather than cut: an oscillator stopped at full gain clicks.
      gainNode.gain.setValueAtTime(gain, start + at);
      gainNode.gain.exponentialRampToValueAtTime(0.01, start + at + duration);
      oscillator.start(start + at);
      oscillator.stop(start + at + duration);
    }
  } catch {
    // No audio context. Nothing to say and nothing to do.
  }
}

/** Two soft beeps, thirty seconds before the level ends. */
export function playThirtySecondWarning(): void {
  play(THIRTY_SECOND_WARNING, 0.25, 0.6);
}

/** An ascending chord, when the level ends. */
export function playLevelComplete(): void {
  play(LEVEL_COMPLETE, 0.4, 0.8);
}
