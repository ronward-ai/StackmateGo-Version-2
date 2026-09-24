import { useState } from 'react';
import { QrCode, Trophy, ShieldCheck } from 'lucide-react';

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

  const pillars = [
    {
      icon: QrCode,
      title: 'The whole room, same clock',
      body: 'One code on the screen and every player follows the blinds, the prize pool and the ' +
        'standings from their own phone. They find themselves on your list and watch their own seat.',
    },
    {
      icon: Trophy,
      title: 'The league adds itself up',
      body: 'Seasons, standings and twenty-five stats you pick from: hits, ROI, ITM, attendance, ' +
        'streaks. Live all season, every player’s night-by-night history a tap away, the lot out ' +
        'to a spreadsheet.',
    },
    {
      icon: ShieldCheck,
      title: 'It survives the bad night',
      body: 'A blocker, a dropped connection, a browser that will not keep a backup. If anything ' +
        'stops saving you are told at the time, on screen, rather than at the end of the night.',
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
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.08] text-balance">
                Run the night.<br />The league runs itself.
              </h1>
              <p className="text-body sm:text-lg text-muted-foreground mt-5 max-w-[46ch] leading-relaxed">
                A poker tournament clock and league manager for the person actually running the game.
                The timer, the tables, the money and the standings all stay in agreement, and everyone at the table can see it.
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

        {/* The at-a-glance version. The sections below are the same three
            claims, said properly. */}
        <section className="grid gap-8 sm:gap-10 md:grid-cols-3">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-3">
              <Icon className="h-5 w-5 text-primary" strokeWidth={2} />
              <h3 className="text-title font-semibold leading-snug text-balance">{title}</h3>
              <p className="text-body text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-border/40 pt-10">
          <h2 className="font-display text-2xl sm:text-3xl text-balance">
            It is called StackMate <span className="text-primary">Go</span> because it goes where you do.
          </h2>
          <p className="text-body text-muted-foreground mt-4 max-w-[62ch] leading-relaxed">
            It runs in a browser. The laptop on the bar, the tablet propped against the rack, the
            venue’s TV, the phone in your pocket — there is nothing to install and nothing to keep
            up to date. The game belongs to your account rather than to a machine, so sign in on
            whatever is to hand and the night is exactly where you left it. Hand the room over to
            whoever is directing next and they pick it up on theirs.
          </p>
        </section>

        <section className="border-t border-border/40 pt-10">
          <h2 className="font-display text-2xl sm:text-3xl text-balance">
            One code, and the room stops asking.
          </h2>
          <div className="grid gap-8 mt-5 md:grid-cols-[1.4fr_1fr] md:gap-12 md:items-start">
            <div>
              <p className="text-body text-muted-foreground max-w-[62ch] leading-relaxed">
                Put the QR code on the screen and every player has the night in their hand: the same
                clock the big screen is showing, the blinds and the ante, the prize pool, what each
                place pays, the standings, and which table and seat they are in.
              </p>
              <p className="text-body text-muted-foreground max-w-[62ch] leading-relaxed mt-4">
                You still enter everyone yourself — nobody registers themselves, which at a real
                table would be chaos. A player simply finds their own name on the list you already
                made, and their phone follows them from then on.
              </p>
              <p className="text-body text-foreground/90 max-w-[62ch] leading-relaxed mt-4">
                What you notice is what stops happening. <em>Where am I sitting? What does third
                pay? How long is left in this level? Is Dave still in?</em> Asked once, on a screen,
                instead of forty times across the room while you are trying to count a rack.
              </p>
            </div>
            <Shot
              phone
              alt="A player’s phone showing the live clock, blinds, payouts and their own seat"
              caption="What the QR code opens."
            />
          </div>
        </section>

        <section className="border-t border-border/40 pt-10">
          <h2 className="font-display text-2xl sm:text-3xl text-balance">
            The league adds itself up, all season.
          </h2>
          <p className="text-body text-muted-foreground mt-4 max-w-[62ch] leading-relaxed">
            Seasons run on dates, on a number of games, or on neither — a quarterly season and a
            “until we’ve played twelve” season are both normal. Points are chosen by looking at a
            table of what every place would actually score, not by picking the word “logarithmic”,
            and knockouts and turning up can each be worth something on top.
          </p>
          <p className="text-body text-muted-foreground mt-4 max-w-[62ch] leading-relaxed">
            Twenty-five stats are tracked and you choose which become columns: hits, ROI, in the
            money, attendance, best finish, streaks. Tap a player’s name and their whole season comes
            up night by night. Send the table to the group chat as an image, or out to a spreadsheet
            as a CSV.
          </p>
          <p className="text-body text-foreground/90 mt-4 max-w-[62ch] leading-relaxed">
            On the software most leagues are running, answering <em>“how many hits has Dave had this
            season?”</em> means opening every game of the season one at a time and adding them up.
            Here it is already a column.
          </p>
          <div className="grid gap-6 mt-8 md:grid-cols-2 md:gap-8">
            <Shot
              aspect="4 / 3"
              alt="The league standings table with several stat columns turned on"
              caption="Standings, with the columns this league cares about."
            />
            <Shot
              aspect="4 / 3"
              alt="One player’s season, game by game, with totals"
              caption="Behind any player’s name: every night they have played."
            />
          </div>
        </section>

        <section className="border-t border-border/40 pt-10">
          <h2 className="font-display text-2xl sm:text-3xl text-balance">
            And it holds the night together while you are busy.
          </h2>
          <div className="grid gap-8 mt-5 md:grid-cols-[1fr_1.2fr] md:gap-12 md:items-start">
            <div>
              <p className="text-body text-muted-foreground max-w-[62ch] leading-relaxed">
                Rebuy and re-entry windows are actually enforced, and when the button is unavailable
                it says why rather than sitting there greyed out. Whoever you have just knocked out
                is in a strip under the tables, one tap from buying back in — the screen you are
                already on, not the one you would have to go and find.
              </p>
              <p className="text-body text-muted-foreground max-w-[62ch] leading-relaxed mt-4">
                Uneven tables get pointed out, with the option to wave it away. The final table is
                drawn for you when the field is small enough — and can be un-drawn, every seat back
                as it was, if someone is about to rebuy. When it comes down to a deal, the chop
                calculator splits only the money still to be won, by chips or by ICM.
              </p>
            </div>
            <Shot
              aspect="16 / 10"
              alt="The tables and seating screen, with the busted strip underneath"
              caption="Seating, and the players who have just gone out."
            />
          </div>
        </section>

        <section className="border-t border-border/40 pt-10">
          <h2 className="font-display text-2xl sm:text-3xl text-balance">
            Built by people who run games.
          </h2>
          <div className="grid gap-8 mt-5 md:grid-cols-[1.3fr_1fr] md:gap-12 md:items-start">
            <p className="text-body text-muted-foreground max-w-[62ch] leading-relaxed">
              Every feature here is one we wanted on a Tuesday night. Bust the wrong player and undo
              puts them back in the chair they never left. Go to the final table too early and it
              goes back, every seat as it was. Share a login with whoever is directing tonight and
              you each keep your own setup, while the league follows the account to whatever device
              you pick up. And if anything ever stops saving, you are told at the time, on screen —
              not at the end of the night.
            </p>
            <Shot
              aspect="4 / 3"
              alt="The points table preview, showing what each place scores"
              caption="Pick a points system by looking at it."
            />
          </div>
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
