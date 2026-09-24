import { useState } from 'react';
import { QrCode, Trophy, ShieldCheck } from 'lucide-react';

const PASSWORD = import.meta.env.VITE_ACCESS_PASSWORD as string | undefined;
const STORAGE_KEY = 'smgo_unlocked';

function isUnlocked() {
  if (!PASSWORD) return true; // no password set = open
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
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
        </header>

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
            Built by people who have lost a tournament.
          </h2>
          <p className="text-body text-muted-foreground mt-4 max-w-[62ch] leading-relaxed">
            Every safeguard in StackMate Go is there because something went wrong on a real night and
            got fixed. Bust the wrong player and undo puts them back in the chair they never left.
            Move to the final table too early and it goes back, every seat as it was. Share a login
            with whoever is directing tonight and you each keep your own setup, while the league
            structure follows the account to whatever device you pick up.
          </p>
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
