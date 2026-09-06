import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { TimerPiping } from '@/types';

/**
 * The clock, and the piping round it.
 *
 * Shared by the director's console (`TimerCard`) and the participant view, which
 * had been rendering a hand-rolled duplicate: its own teal-blue card, its own
 * size ramp, its own inline line-height. The two drifted immediately and
 * invisibly — every improvement to the director's timer simply never reached the
 * people scanning the QR code, which is the screen most people actually see.
 *
 * Presentational on purpose. It knows how a clock should look and nothing about
 * running a tournament: no hook, no Firestore, no controls. What goes underneath
 * differs by side — transport buttons for the director, a live/paused badge for
 * participants — so that arrives as children.
 */

/**
 * The piping's colours, from what the tournament is doing.
 *
 * Deliberately the palette the clock digits already use — white through amber to
 * red — so the frame and the numbers say the same thing and there is nothing new
 * to learn to read it across a room.
 */
export function pipingFor(opts: {
  secondsLeft: number;
  isRunning: boolean;
  isBreak: boolean;
  isFinished: boolean;
}): { colours: [string, string, string]; drift: string; bloom: number } {
  if (opts.isFinished) return { colours: ['#FBBF24', '#F59E0B', '#FBBF24'], drift: '5s', bloom: 0.55 };
  if (opts.isBreak)    return { colours: ['#22D3EE', '#8B5CF6', '#22D3EE'], drift: '22s', bloom: 0.34 };
  if (!opts.isRunning) return { colours: ['#64748B', '#475569', '#64748B'], drift: '40s', bloom: 0.1 };
  if (opts.secondsLeft <= 30) return { colours: ['#EF4444', '#F97316', '#EF4444'], drift: '3.2s', bloom: 0.62 };
  if (opts.secondsLeft <= 60) return { colours: ['#F59E0B', '#FB923C', '#F59E0B'], drift: '7s', bloom: 0.45 };
  return { colours: ['#14B8A6', '#3B82F6', '#6366F1'], drift: '16s', bloom: 0.3 };
}

/** The colour the digits themselves take, matching the piping. */
export function clockColour(secondsLeft: number): string {
  if (secondsLeft <= 30) return '#EF4444';
  if (secondsLeft <= 60) return '#F59E0B';
  return 'white';
}

export interface TimerFaceProps {
  /** The clock, already formatted. */
  clock: string;
  secondsLeft: number;
  /** Level progress, 0-100. Drives the ring. */
  progress: number;
  isRunning: boolean;
  isBreak: boolean;
  isFinished: boolean;
  /** What sits under the clock: the blinds, "BREAK TIME", or the winner. */
  headline: string;
  ante?: number;
  /** 'Ante' or 'BB Ante' — the director's structure decides which. */
  anteLabel?: string;
  /** Absent means the ring, the only treatment that encodes progress. */
  piping?: TimerPiping;
  /** Flashes the headline when the level has just changed. */
  recentLevelChange?: boolean;
  /** Pinned to the card's top-right — the fullscreen control, on the console. */
  topRight?: React.ReactNode;
  /** Controls, status, level info: whatever this side puts under the clock. */
  children?: React.ReactNode;
}

export default function TimerFace({
  clock,
  secondsLeft,
  progress,
  isRunning,
  isBreak,
  isFinished,
  headline,
  ante,
  anteLabel = 'Ante',
  piping = 'ring',
  recentLevelChange = false,
  topRight,
  children,
}: TimerFaceProps) {
  const colours = pipingFor({ secondsLeft, isRunning, isBreak, isFinished });

  return (
    <div
      className="timer-frame"
      data-piping={piping}
      style={{
        '--pipe-1': colours.colours[0],
        '--pipe-2': colours.colours[1],
        '--pipe-3': colours.colours[2],
        // The ring reads as an arc, so it wants 0-1 rather than a percentage.
        '--pipe-progress': Math.min(1, Math.max(0, progress / 100)),
        '--pipe-drift': colours.drift,
        '--pipe-bloom': colours.bloom,
      } as React.CSSProperties}
    >
      <Card className="relative bg-gradient-to-r from-teal-600/10 to-blue-600/10 border-0 rounded-[calc(1.25rem-5px)] shadow-lg p-4 sm:p-8 flex flex-col items-center">
        {topRight}

        <div
          className="font-mono text-8xl sm:text-[10rem] md:text-[16rem] lg:text-[20rem] font-bold tracking-tight my-4 sm:my-8 flex-shrink-0 timer-responsive"
          style={{
            lineHeight: '0.85',
            color: isFinished ? '#FBBF24' : clockColour(secondsLeft),
            transition: 'color 0.8s ease',
          }}
        >
          {clock}
        </div>

        {!isBreak && !isFinished && (
          /* Deliberately dim and widely tracked: this is a caption naming the
             figure below it, and at full muted-foreground it competed with the
             numbers instead of introducing them. The 0.22em is a display choice
             for this one label — wide enough that 11px still reads as a heading
             rather than small text. */
          <div className="text-caption text-muted-foreground/45 tracking-[0.22em] uppercase mb-1">Blinds</div>
        )}
        <div className={cn(
          "text-2xl sm:text-4xl md:text-6xl font-bold mb-3 sm:mb-7 text-center",
          recentLevelChange && "level-change",
          isBreak && "text-secondary",
          isFinished && "animate-pulse text-yellow-400"
        )}>
          {headline}
        </div>

        {!isBreak && !!ante && ante > 0 && (
          <div className="text-xs sm:text-sm font-medium mb-3 sm:mb-5 text-amber-400/80 tracking-wide">
            {anteLabel}: {ante}
          </div>
        )}

        {children}
      </Card>
    </div>
  );
}
