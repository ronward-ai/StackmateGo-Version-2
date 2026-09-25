import { useState } from 'react';
import { QrCode, Trophy, BarChart3, Download } from 'lucide-react';

const PASSWORD = import.meta.env.VITE_ACCESS_PASSWORD as string | undefined;
const STORAGE_KEY = 'smgo_unlocked';

function isUnlocked() {
  if (!PASSWORD) return true; // no password set = open
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

/**
 * A screenshot, or the space one will occupy.
 *
 * THE FRAME IS NOT DECORATION. Every screenshot of this app is near-black on a
 * near-black page, so without a border they bleed into the background and read
 * as holes rather than pictures. Keep the border when the real images go in.
 *
 * With no `src` it draws a labelled placeholder at the SAME aspect ratio the
 * image will be cropped to, so the page is presentable now and the layout does
 * not shift when a shot lands. Dropping one in is a one-line change.
 *
 * Bound the files before committing them: this page is the first thing anyone
 * loads, and a full-resolution console screenshot is megabytes. ~1600px wide,
 * WebP where the tooling allows. Everything below the hero is lazy.
 */
function Shot({
  src,
  alt,
  caption,
  aspect = '16 / 10',
  phone = false,
  eager = false,
}: {
  src?: string;
  alt: string;
  caption: string;
  aspect?: string;
  phone?: boolean;
  eager?: boolean;
}) {
  const ratio = phone ? '9 / 19.5' : aspect;

  return (
    <figure className={`flex flex-col gap-2 ${phone ? 'mx-auto w-full max-w-[260px]' : 'w-full'}`}>
      <div
        className="w-full overflow-hidden rounded-xl border border-border/60 bg-muted/30 shadow-lg shadow-black/30"
        style={{ aspectRatio: ratio }}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 p-4 text-center">
            <span className="font-mono text-caption uppercase tracking-[0.08em] text-primary">
              Screenshot
            </span>
            <span className="text-label text-muted-foreground max-w-[34ch] leading-snug">{alt}</span>
            <span className="font-mono text-caption text-muted-foreground/60">{ratio}</span>
          </div>
        )}
      </div>
      <figcaption className="text-caption text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

/**
 * The landing page, and the door.
 *
 * It was a password box on an empty screen, which is a wasted first impression:
 * everyone who hears about StackMate before launch — every director another TD
 * mentions it to — lands here, and the page said nothing at all about what they
 * were waiting for.
 *
 * The unlock contract is unchanged: no VITE_ACCESS_PASSWORD means open, a
 * correct code sets `smgo_unlocked` and the app renders instead of this.
 *
 * LANGUAGE TO KEEP RIGHT: a player never registers themselves. The director
 * enters everyone — `attemptAddPlayer` in PlayerSection is the only route in —
 * and a player's phone only says WHICH of those already-entered players they
 * are, so it can follow their own seat (`claims`, a playerId to device id map).
 * "Check in" and "sign up" both read as self-registration, which would be chaos
 * at a real table. They find themselves on the list; they do not join it.
 *
 * THE TRUST SECTION LEADS WITH CREDIBILITY, NOT WITH FAILURE. It was headed
 * "Built by people who have lost a tournament", and "lost a tournament" reads to
 * someone arriving cold as LOST TOURNAMENT DATA — the one thing this category of
 * software must never do. The proof points are the same; the frame is inverted,
 * so they land as things a working director wanted rather than as disasters
 * survived. Do not reach for the failure framing again.
 */
export default function ComingSoonGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);

  if (unlocked) return <>{children}</>;

  const attempt = () => {
    if (input === PASSWORD) {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
      setUnlocked(true);
    } else {
      setShake(true);
      setInput('');
      setTimeout(() => setShake(false), 600);
    }
  };

  /*
   * FOUR PILLARS, AND THE ORDER IS THE ARGUMENT: the night, the table, the
   * player, the export.
   *
   * Two of these were missing entirely, and they are the two a director reacts
   * to. Both are built. The standings table is mounted in the participant view
   * for every league game and fed by live listeners, and results are written at
   * each bust-out rather than at the end of the night — so the table on a
   * player’s phone genuinely moves while the game runs. The drill-down behind
   * a name (PlayerSeasonDialog, lib/playerSeason.ts) has no participant gate, so
   * a phone can open any player’s season night by night.
   *
   * CLAIM DISCIPLINE, both from what the code actually does:
   *  - “In a league game” is load-bearing on the second pillar. The table hides
   *    itself entirely for a standalone tournament, so an unqualified claim
   *    would be false for half the games this app runs.
   *  - The third pillar says “any name”, never “your stats”. Standings are
   *    shared: a player can open anybody’s season, and promising a private
   *    page would be promising a feature that does not exist.
   *
   * The old “The league runs itself” pillar went rather than being kept: the
   * headline says that already, and a pillar restating the headline is the same
   * fault as the event name at two sizes on one screen. Its configurability
   * survives as one clause, because a clause is what it is worth here — nobody
   * chooses this software for having a settings screen.
   */
  const pillars = [
    {
      icon: QrCode,
      title: 'Everyone sees the same night',
      body: 'Players scan the code on the screen and get the tournament live on their own phone \u2014 ' +
        'clock, blinds, prize pool, payouts, and their own table and seat number.',
    },
    {
      icon: Trophy,
      title: 'The table moves while you play',
      body: 'In a league game the standings sit on that same phone, and they move as players hit the ' +
        'rail \u2014 not next week, once somebody has added it up. Your points system, or one of ours.',
    },
    {
      icon: BarChart3,
      title: 'Nobody adds anything up',
      body: 'Tap any name for that player\u2019s whole season, night by night: hits, finishes, what they ' +
        'put in, what they took out. No opening last month\u2019s games one at a time.',
    },
    {
      icon: Download,
      title: 'Out to the group chat',
      body: 'Standings download as a PNG for WhatsApp and socials, or a CSV for anyone who loves a ' +
        'spreadsheet.',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:py-16 flex flex-col gap-12 sm:gap-16">

        <header className="flex flex-col gap-8">
          <img
            src="/stackmatelogo.svg"
            alt="StackMate Go"
            className="h-7 sm:h-9 w-auto self-start"
          />

          <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-14 lg:items-start">
            <div>
              {/* Says what it IS, before the headline says what it does. The
                  page opened on a logo and a line of voice, so someone arriving
                  cold had to reach the pillars before finding out this was
                  anything to do with poker. */}
              <p className="font-mono text-label uppercase tracking-[0.1em] text-muted-foreground mb-4">
                Poker tournament timer &amp; league manager
              </p>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.08] text-balance">
                Run the night.<br />The league runs itself.
              </h1>
              <p className="text-body sm:text-lg text-muted-foreground mt-5 max-w-[46ch] leading-relaxed">
                Cloud based. Nothing to download. Works on any device.
              </p>
              <p className="text-body sm:text-lg text-foreground/90 mt-3 max-w-[46ch] leading-relaxed">
                Made by people who know poker, and know running a poker league.
              </p>
              <p className="font-mono text-caption uppercase tracking-[0.08em] text-primary mt-6">
                Coming soon
              </p>
            </div>

            {/* The door. Present, findable, not the whole page. */}
            <div className={`card-glass rounded-xl p-5 transition-transform ${shake ? 'animate-shake' : ''}`}>
              <h2 className="text-title font-semibold">Got an access code?</h2>
              <p className="text-label text-muted-foreground mt-1 mb-4">
                Early access is open to a handful of directors while we finish up.
              </p>
              <label htmlFor="access-code" className="sr-only">Access code</label>
              <input
                id="access-code"
                type="password"
                placeholder="Access code"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && attempt()}
                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-center tracking-widest"
                autoFocus
              />
              <button
                onClick={attempt}
                className="w-full mt-3 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                Enter
              </button>
            </div>
          </div>

          <Shot
            eager
            aspect="16 / 9"
            alt="The director’s console mid-level: clock running, blinds and ante, the players and their chips"
            caption="The console, four levels in."
          />
        </header>

        <section className="grid gap-8 sm:gap-10 sm:grid-cols-2">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-3">
              <Icon className="h-5 w-5 text-primary" strokeWidth={2} />
              <h3 className="text-title font-semibold leading-snug text-balance">{title}</h3>
              <p className="text-body text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 md:grid-cols-[1fr_260px] md:gap-10 md:items-end">
          <Shot
            aspect="4 / 3"
            alt="The league standings, with the stat columns this league cares about — and one player’s season opened behind a name"
            caption="Standings, all season, adding themselves up. Tap a name for the detail."
          />
          <Shot
            phone
            alt="A player’s phone during a league game: live clock, their table and seat, and the standings below it"
            caption="What the code opens — and it keeps moving."
          />
        </section>

        <footer className="border-t border-border/40 pt-8 flex flex-wrap gap-x-6 gap-y-2 items-baseline">
          <span className="font-mono text-caption uppercase tracking-[0.08em] text-muted-foreground">
            StackMate Go
          </span>
          <span className="text-label text-muted-foreground">
            Nothing to install. Nothing to add up.
          </span>
        </footer>

      </div>
    </div>
  );
}
