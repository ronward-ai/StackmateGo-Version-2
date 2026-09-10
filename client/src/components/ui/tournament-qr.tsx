import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The check-in QR code, generated ON THIS DEVICE.
 *
 * Both places that show a QR used to be `<img>` tags fetched from
 * api.qrserver.com, with an onError that set `display: none`. One failed
 * request — a venue's guest wifi, a blocker, a rate limit — took the app's main
 * participant-facing affordance off the screen silently, and it stayed gone
 * until the next render. Drawing it here cannot fail, works where there is no
 * internet at all, and stops a third party being told the URL of every game.
 *
 * One component for both the timer card and the Share tab, for the same reason
 * TimerFace owns the clock: two of these drift.
 */
export function TournamentQR({
  tournamentId,
  size = 80,
  className,
}: {
  tournamentId: string;
  /** Rendered pixel size of the square. */
  size?: number;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  const url = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/tournament/${tournamentId}/join`
    : '';

  useEffect(() => {
    let alive = true;
    // Imported here rather than at the top so the generator is fetched only by a
    // game that actually shows a QR — it is 25kB, and it is dead weight on the
    // console until Go Live.
    import('qrcode').then(({ default: QRCode }) => QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      // Medium recovery: readable with a thumb over a corner, without making the
      // modules so small they fail on a phone camera across a poker table.
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }))
      .then(out => { if (alive) setSvg(out); })
      .catch(() => { if (alive) setSvg(null); });
    return () => { alive = false; };
  }, [url]);

  if (!svg) {
    // A blank of the right size, so the layout does not jump when it lands.
    return <div className={cn('rounded-md bg-white/5', className)} style={{ width: size, height: size }} />;
  }

  return (
    <div
      className={cn('rounded-md bg-white p-1 [&>svg]:block [&>svg]:h-full [&>svg]:w-full', className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="Scan to check in"
      role="img"
    />
  );
}

export default TournamentQR;
