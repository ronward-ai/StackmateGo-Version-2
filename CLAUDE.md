# StackMate Go — working notes

A poker tournament timer and league manager. A **director** runs a game on a laptop or tablet;
**participants** join by scanning a QR code and see a read-only live view on their phones.

React + TypeScript + Vite, Firestore for data, deployed on Railway.

---

## Commands

```
npm run dev         # local dev server
npm run check       # tsc — MUST stay clean
npm test            # vitest, ~194 unit tests
npm run test:rules  # Firestore rules tests against the emulator (needs Java)
npm run build       # production build
```

`test:rules` boots the Firestore emulator via `firebase emulators:exec`. First run downloads a JAR.

---

## Things that will bite you

### Firestore rules are deployed BY HAND

Editing `firestore.rules` changes nothing until it is published. There is no automatic deploy.

```
npx firebase deploy --only firestore:rules --project project-4d166fd9-5ce4-482d-924
```

Or paste the file into Firebase Console → Firestore → **Security** (the tab is called Security, not
Rules). **Check the database selector** — the project contains two databases and only
`ai-studio-127bb0ae-…` belongs to this app.

A feature that writes a new field or collection will fail silently in production until the rules
go out. Several changes have needed this.

### Firestore was on "AI shared quota"

The database was provisioned by Google AI Studio and originally ran under a shared quota pool
unrelated to this project's own billing — which is why "quota limit exceeded" appeared on mobile
while the project sat at £0.00 on the Blaze plan and used 788 reads a month. Fixed by moving the
database to pay-as-you-go in the console.

Four commits chased this in the wrong layer first (browser storage, iOS UA detection, IndexedDB
cleanup). **If quota errors reappear, look at the database's billing mode before touching app code.**

### `?debug=1`

Append it to any URL for an on-device error panel: `window.onerror`, unhandled promise rejections,
React error boundary, plus a storage snapshot. Built for debugging on phones with no DevTools.
Inert without the parameter. See `client/src/lib/debugOverlay.ts`.

Its handlers install as a **module side effect** and the import is first in `main.tsx`. That
ordering is load-bearing: ES module imports all evaluate before any statement in the importing
module, so calling an exported `install()` from `main.tsx` would arm the handlers *after* Firebase
had already initialised and had its chance to throw.

### Two things are called "league name"

- `settings.branding.eventName` — the EVENT, shown on the big screen and to participants
- `leagues/{id}.name` — the LEAGUE, shown in the standings title

They are genuinely different: a standalone tournament has an event name and no league. Always
resolve the display name through `lib/eventName.ts`, which reads the legacy `branding.leagueName`
key for older tournaments and falls back to the league's name in league mode.

### Handing over is logging out — there is no handover mechanism

Two were built and both removed. **Do not build a third without reading this.**

A **transfer code** moved `ownerId` between two different accounts. It worked, but the receiving
director's device then resolved the league from `where('ownerId', '==', <signed-in user>)`
(`useLeague.ts`) and the points formula from that user's settings — so their half of the night was
recorded into *their own* league with *their own* scoring, silently.

A **device lock** (`activeDeviceId`) then tried to give one device control under a shared login. It
was only half-enforced: `broadcastTournamentState` stood down, but the three direct `updateDoc`
writers in `PokerTimer.tsx` bypass the broadcast chain by design and kept writing. The device without
control still wrote the players array on every local change, so its stale copy overwrote the other
device's rebuys — bust-outs worked, rebuys silently reverted.

What replaced both: **one director at a time, handing over by logging out.** The next person signs in
with the same account, and `PokerTimer` restores the pin from that user's most recent
`activeTournaments` document, so the game resumes on any device with no URL and no code. League,
season and points are correct by construction because it is the same account throughout.

`ownerId` is unwritable by clients again, and only the owner may change a live game.

**Logging out does a full page load to `/?home=1`.** That is load-bearing, not laziness: the console
runs from in-memory state that signing out does not clear, so the screen kept working after a logout
— and on signing back in the player-sync effect would push that stale state over whatever the next
director had done. A hard navigation discards it. A live tournament also refuses to render the
console at all when nobody is signed in; standalone games stay usable offline.

**`?home=1`** means "I asked to be here": it suppresses both the pin redirect and the resume, and
clears the pin. New Tournament navigates there for exactly that reason — plain `/` would reopen the
game it just finished.

### Saving a game and publishing it are different things

Every tournament a signed-in director starts is saved to their account as soon as it has players
(`PokerTimer`, via `lib/tournamentDocument.ts`). **"Go Live" only publishes** — it sets
`isPublished: true` and reveals the QR.

They used to be the same action, which meant a director who never showed a QR code had no cloud copy:
the game could not be resumed on another device and was lost on logging out. That is how a live test
game disappeared.

`isPublished === false` hides a game from the participant view. **Absent means published** — every
document written before the field existed came from Go Live, and those QR links must keep working.

`lib/tournamentDocument.ts` is the single creation path. Two ways to create a tournament is the trap
the removed handover code set. Go Live therefore **PATCHes `isPublished` onto the document that
already exists** and only creates one when there genuinely is none — a game started while signed out.
Calling the creation path again would collide on the id, and a collision now adopts (below), so it
would silently fail to publish.

Having a document id is no longer the same as being live. The QR and the Broadcasting badge key off
`details.isPublished`, mirrored from the snapshot, or the director sees a QR that participants are
refused by.

### Every game is mirrored locally, and the mirror is never restored on its own

`lib/localProgress.ts` holds the players and clock of the game being run, keyed by `localGameId`, and
`dbTournamentId` once it is live. Players were never persisted at all once, so a refresh lost the
roster of a local game — and when logging out became a full page load, an ordinary action destroyed
one.

It used to be **cleared the moment the game became a database tournament**, on the reasoning that the
blob stands in for a cloud copy and keeping it once there is one makes it a rival source of truth.
That hazard is real: a roster from before a game was saved once survived a logout and was resurrected
over the real game two hours further on.

But it assumed **Firestore was reachable**. An ad blocker cancelling `Write/channel` (reads were
fine, so the game looked completely normal) left the roster living only in the tab's memory, and a
refresh restored the near-empty document written when the game was created — a whole tournament,
gone. **Deleting the only copy is worse than keeping a second one.**

So the mirror is written for live games too, and the hazard is closed at the other end instead:

- **Automatic restore is unchanged** — only when `details.type !== 'database'`. Seeding a live
  tournament from localStorage is the same hazard `hasLoadedRemoteState` exists to prevent, and that
  rule did not move.
- **`recoverableProgress()` offers it back** in exactly one shape: the mirror names *this* tournament,
  it has players, and the remote document's roster is **empty**. Where Firestore holds a real roster it
  wins, always. The director presses Restore; nothing happens on its own. The automatic restore lost a
  game precisely because nobody was asked.

`clearLocalProgress()` now runs only where a game genuinely ends or is replaced — New Tournament.

The clock is deliberately restored paused, in both paths. The page was away for an unknown time, so
resuming a running timer would silently be wrong.

### An ad blocker is a first-class failure mode

`ERR_BLOCKED_BY_CLIENT` on `firestore.googleapis.com` is a browser extension cancelling the request
before it leaves the machine. Nothing in the app can defeat it — but it must not be silent, and it
must not cost data.

**Blocking is not symmetrical.** The case that happened had `Listen/channel` (reads) working and
`Write/channel` blocked, so the game loaded, looked healthy and saved nothing. **Any connectivity
check must therefore be a WRITE** — `PokerTimer`'s preflight writes `lastSeenAt` to the director's own
`userSettings` document, once per mount behind a ref.

**A blocked request does not reject.** The SDK keeps retrying and the promise never settles, so the
preflight races it against 8 seconds and treats "still pending" as blocked.

`lib/syncHealth.ts` owns when a failure is worth saying. Both extremes were tried: reporting every
failure re-fired three identical destructive toasts on every retry, and suppressing `unavailable`
outright — an offline blip, self-healing — hid a blocked browser completely. The distinction is not
the code but whether the failure **persists**: three consecutive failures or 20 seconds. A blocked
browser also gets a standing **"Not syncing"** chip on the StackMate Live card, because it is a
condition rather than an event, and the director had no connection indicator at all while the
*participant* view has had a Live/Offline badge all along.

### Resume only reopens a game that is plausibly current

Nothing deletes an `activeTournaments` document, so every game an account has ever taken live is a
resume candidate. Selection therefore skips anything marked `status: 'completed'` and anything not
touched in the last 12 hours, and sorts on a *parsed* timestamp — `String(value)` put a Firestore
Timestamp's `"[object Object]"` above every ISO string, so an old test could outrank tonight's game.

`updatedAt` is written on every player sync so "most recently active" is real rather than "most
recently created".

That selection lives in `lib/liveTournament.ts`, not in the resume effect, because the auto-save asks
the same question — see below.

### `details.type` is overloaded, so nothing may key "is it saved" on it

```ts
type: 'standalone' | 'season' | 'database'
```

One field, two meanings: **league or standalone**, and **saved to Firestore**. The mode toggle writes
the first over the second, and that un-saved the game. Three readers keyed on `'database'` and all
three failed at once — the Firestore listener detached, `hasLoadedRemoteState` reset (which the three
sync effects wait on), and `consoleTournamentId()` returned null.

Nothing errored, because the writes were **blocked rather than attempted**. What the director saw was
a roster fighting the snapshot: a removed player came back on the next read, and re-adding produced a
second entry with a new id. Duplicates and "cannot remove" are one bug, and they are what "the writes
stopped" looks like from the outside.

**The honest marker is `details.id`** — a game with a document has one, and `resetTournament` drops it
when a new game begins. The listener, the local mirror and `consoleTournamentId()` all key on that
now; `type === 'database'` survives only as a fallback for a game whose details have not filled in
yet. League-ness lives in `settings.isSeasonTournament`, which every reader of `isLeagueMode` already
honours, and the toggle leaves `type` alone on a stored game.

**A console that holds a tournament and has never read it now says so** after ten seconds — the same
standing chip and banner as a blocked browser. `lib/syncHealth.ts` only hears about writes that threw,
so a latch that never closes is invisible to it, and that silence is why this reached a director
instead of a toast.

### Which document the console is driving is derived, not held

`lib/liveTournament.ts`'s `consoleTournamentId()` answers it once, for the sync effects and the QR
code alike. They used to work it out separately — the syncs from a `dbTournamentId` held in
`PokerTimer`'s state, the QR from `state.details?.id || dbTournamentId` — and **they disagreed.**

New Tournament navigates to `/?home=1`, which is the route the console is already on, so the
component is never unmounted and `dbTournamentId` **survived the reset**. From the second game of a
session onwards: the auto-save returned early because an id was held, so the new game was never saved
to the account at all; the sync effects were blocked too, because a reset game is local again and
they wait on a Firestore read that never comes for a local game; and the QR fell back to the previous
game's document, showing its stale roster and paused clock under a green Broadcasting badge. Nothing
failed, so nothing was reported — the console looked perfectly healthy.

`creatingRef` was a second, invisible lock of the same kind: set true on a successful creation and
cleared only on failure, so it meant "has ever created" when the comment beside it said "in flight".
It is cleared in a `finally` now.

**A held id belonging to no current game is worth nothing.** The rule: a tournament id in the URL is
definitive, otherwise the game must actually be a database game. `PokerTimer` clears the held id
whenever the game is not one, keyed on the state rather than on the New Tournament button, because
holding an id for a game that is not in the database is the inconsistency itself however it arose.

### A device must never write to a tournament it has not read

`PokerTimer` has three direct `updateDoc` sync effects that bypass the broadcast chain by design.
They wait on `tournament.hasLoadedRemoteState` — a latch set by the first Firestore snapshot for the
current tournament id. **Do not remove it.**

Local state starts with an empty players array. Being guarded on `dbTournamentId` alone was enough
only while the sole way to hold a tournament id was to have gone live on that device, so its state
was necessarily correct. Once signing in began resuming a live game on *any* device, a device that
had not read the tournament yet would write `players: []` straight over the real game — the roster
gone mid-night, on every device.

Deliberately not `isConnected`, which flips back to false on a listener error or teardown. The
question is "have we ever read this", which only goes one way.

### A collision on the tournament id means JOIN, not overwrite

The document id **is** the `localGameId`, so the same night's game has the same id on every device.
`createDocViaRest` therefore treats a 409 as "it is already there" and returns the id having written
nothing; the caller loads it through the normal path and the `hasLoadedRemoteState` latch. It used to
PATCH the whole document on the reasoning that re-going-live should overwrite — and that cost a live
game: after a handover, device 1 still held the roster from before the document existed, and signing
back in 409'd and overwrote device 2's game with it.

The auto-save asks the same question first, before writing anything: if the account has a current
live tournament **whose id is this device's `localGameId`**, adopt it. The id match is deliberate — a
live game with a different id is a different game, and adopting it would hijack a director who has
genuinely started a second tournament that evening. Nothing marks a game finished, so "the account
has a live game" alone does not identify it as this one.

`lib/liveTournament.ts` answers "which game is being run right now" for both the resume and that
guard, so the two cannot disagree. It owns the 12-hour recency window, the `completed` filter and
`timestampMs`, and is free of React and Firebase — callers pass documents they have already read.

### `useAuth`'s return value is memoised, and that is not a micro-optimisation

`user` was an object literal rebuilt on every render, and the legacy `anonymousUser` key was read and
parsed from localStorage on every render for a second one. Sixteen effects across the app list `user`
in a dependency array, so a referentially fresh object meant **"run on every render"** — and
`PokerTimer` re-renders every second, because that is how the clock advances.

Two of its three Firestore sync effects had no payload guard, so **a live game wrote to Firestore
twice a second** — about 7,200 writes an hour where a handful were needed. That is enough to exhaust
a day's write allowance in an evening, and `resource-exhausted` is what the sync effects catch and
report as the "Sync issue" toast. It is very likely the real story behind the quota exhaustion above,
which was chased through browser storage, iOS UA detection and IndexedDB before the database's
billing mode fixed the symptom.

The churn reached the clock as well: the timer interval effect had `user` in its deps, so the
one-second interval was **torn down and recreated on every render** and could only fire when a whole
second passed with no render at all. The digits survived it, being recomputed from `targetEndTime` —
but the level change, the 30-second warning and the voice announcements all live inside that tick.

Three things keep it fixed, and all three are wanted. `useAuth` memoises. Dependency arrays take
**`user?.id`, a string**, not the object. And each sync effect serialises its payload and returns
early when it matches what it last wrote — recorded **after** the write resolves, so a failure is
retried rather than looking saved. Referential instability is invisible at the call site, which is
why the belt as well as the braces.

The sync toast now names the Firestore code and the sync, and fires **once per failure streak**:
three identical destructive toasts re-fired on every retry turned one underlying failure into a popup
that would not go away and said nothing anyone could act on. `unavailable` is an offline blip and
raises nothing.

### `isAnonymous` means the FIREBASE anonymous session

`TournamentParticipantView` signs every visitor in anonymously on arrival, so `isAuthenticated`
(`!!firebaseUser`) is true for people who have not signed in at all. The thing that distinguishes a
real account is `isAnonymous`, and every consumer spells the test `!user || isAnonymous`.

It used to be derived as `!!anonymousUser && !user` from a legacy `anonymousUser` localStorage key
**that nothing writes** — so it was permanently `false`, and a Firebase anonymous session looked
like a signed-in director everywhere. That is what made logging out appear to do nothing: no Sign In
button in any header, `/` redirecting back into the tournament, and the director route admitting the
anonymous user as far as an ownership check it could never pass.

It now reads `firebaseUser.isAnonymous`, honouring the legacy key only for stale data. **Check
`isAnonymous`, never `isAuthenticated` alone**, when you mean "signed in for real".

### Type is Archivo, JetBrains Mono and Instrument Serif — and it used to be nothing

`tailwind.config.ts` declares the three stacks and `body` applies `font-sans`, so they actually take
effect. Before that, `index.css` imported **Inter and Roboto Mono and nothing ever set
`font-family`** — Tailwind's default `font-sans` is the system stack — so two families were
downloaded on every visit and neither was ever drawn.

Every figure belongs in `font-mono`: the clock, money, chip counts, standings. That class also sets
`tabular-nums` app-wide, so digits stop jittering as they change. Each stack falls back to something
real, because a standalone game stays usable offline where Google Fonts will not load.

**The ramp is named by role** — `text-caption` (11px), `text-label` (13px), `text-body` (15px),
`text-title` — declared in `tailwind.config.ts` alongside Tailwind's own scale. Reach for these in
new work. 85% of the app was `text-xs` or `text-sm`, `text-base` was rarer than `text-lg`, and four
undeclared sizes (8, 9, 10, 11px) had been reached for whenever `xs` was too big; those are folded
into `caption`. Prose gets `body` — an empty state is one of the few places the app explains itself,
so it should not be set in the same 12px as a table cell.

### The mode slider lives in Tournament Info, with the league panel beneath it

Standalone-vs-League decides what KIND of game this is, which is the same sort of fact as the event
name, the prize pool and the payouts — so it sits in the Tournament Info card, on its own row under
the header and **outside the collapse**, since folding the body away must not take the mode control
with it. The league panel renders directly beneath that card.

It used to sit in the Tournament Setup card. Once the league stopped being a tab, flipping it summoned
a panel *below* that very tall card, off-screen: a control whose effect nobody would scroll to find.

The season line — `Spring 2026 · Game 4 of 13` — is stated **once**, beside the toggle, where it reads
as one statement with the selected mode. The info card's header printed the identical sentence in the
identical colour, so in league mode the same fact appeared twice on one screen.

The toggle's two buttons were styled with **inline style objects** hard-coding `rgba(249,115,22,…)` —
the `.btn-*` gradient pattern in JavaScript form, which is how it survived the sweep of the CSS ones.
They take `bg-primary/10 text-primary border-primary/30` now.

### The league is a section on the page, not a setup tab

It used to be a **League tab** in the Tournament Setup row, appearing between Levels and Settings when
the mode toggle moved. Wrong category: every other tab there configures TONIGHT'S GAME, and the card
is headed "Tournament Setup", while the league spans every game — standings, seasons, points, and
Manage League. Renaming it would not have helped; "Standings" undersells a panel that also deletes
leagues.

It also made the tab row **change shape** with the toggle. On a phone `TabsList` is a four-column grid,
so League was what pushed Settings and Share onto a second row. The six tabs are unconditional now.

`LeagueSection` was always built for this: a self-contained card with its own header, its own Manage
League button and its own collapse control — which is why it rendered as a card inside a card in a
tab. Its collapse is remembered (`leaguePanelExpanded`), since on the page it is what stands between a
phone and the timer.

### The League panel says the season once

`LeagueSection` is the LEAGUE header — the league's name, Manage League, and the collapse control. The
SEASON belongs to `SeasonDashboard`, which holds its numbers: name, status, dates, the progress bar
and the four figures. Both used to describe it, one above the other, the second in a tinted panel —
and then four `Card`s nested inside the League card for four numbers. Five boxes before the standings,
which is the thing the tab is opened for.

The figures are an inline strip now: mono numerals, caption labels, no boxes, the treatment the
Payouts panel uses. Collapsed, `LeagueSection` shows a one-line summary so folding the panel away does
not lose which season is running.

**Money in the league table comes from `lib/currency.ts`.** Five columns and the season's prize pool
hard-coded `£` while every other figure in the app honours `settings.currency`, so a director working
in dollars saw pounds in their own standings. `currencyOf(settings)` and `money(amount, symbol)` own
it; `RealTimeLeagueTable` asks for both shapes of the `tournament` prop, because the console passes the
hook and the participant view passes the raw document.

### A player's chips are written once, in `lib/playerBadges.ts`

The director's row, the exported PNG and the participant's phone all render the chips beside a
player's name from that one list. They used to build them separately and had drifted into three
vocabularies for the same fact — knockouts read `🎯 3`, `KO x3` and `3 KOs`, in orange, brown and
red. Adding a chip means adding it there, once.

**The tones are semantic and there are five**: `neutral` for facts (seat, knockouts, rebuys), `money`,
`bounty` (the COUNT of bounties collected), `eliminated`, `points`. A row could previously carry six
hues chosen per call site, which is why the money did not stand out. Facts sharing the neutral chip
is the point, not an oversight.

**One money chip, and it is the total** — the payout plus the bounty money, added inside
`badgesFor` so two call sites cannot disagree about what "total" means. They used to sit side by side
in green and amber, asking the reader to add up two numbers to answer the only question anyone asks.
The split is still on the Payouts panel.

**The bounty count includes the winner's own bounty back**, so `5 bounties` beside `4 KO` is correct
for a winner and the count multiplies out against the money on the same row. That `+1` was already in
the money arithmetic in both call sites; the count only surfaces it.

`TONE_STYLES` in `ui/player-badge.tsx` repeats those colours as inline styles because the PNG export
hands plain DOM nodes to html2canvas and cannot use Tailwind classes. Change one, change both.

### Icons are lucide, and there are no emoji

One exception, deliberate: `TournamentOverBanner`'s confetti. That screen is shown once a night and a
lucide outline of a party popper would be worse at the job.

Everything else went. Emoji render from the system emoji font — full colour, a different weight and
baseline from the lucide icon beside them, different again on each platform, and baked into the
exported results image exactly as they looked. `✓` and `✗` were the worst of it: interface icons
carrying meaning in league settings, drawn by the text renderer.

### The StackMate Live card wears rails

`.card-rails` in `index.css` — the timer's rails treatment, on the one card that earns marking out.
It is the feature nothing else in this category has, and edges-only is the safe way to say so: unlike
a tint it cannot touch the legibility of anything nested inside, which is exactly how that card went
wrong when it carried `card-live`.

Both rails are drawn in **one `::after`**, because `.grid-pattern::before` is already taken on every
`Card`. Two rules fighting over one pseudo-element is a collision that only shows up on screen.

The rails are the accent, always. The green Broadcasting badge still reports the state — the rails
say "this is special", not "this is live".

### Colour means something, or it is not used

**One accent, and it is orange.** `--primary` used to be teal while the app was visibly orange — 119
orange utility classes, the active tab, half the section-header icons. With the token disagreeing
with the screen, `variant="default"` was used exactly once in the whole codebase, 83% of buttons were
outline or ghost, and nothing read as the main action; two dozen bespoke `.btn-*` gradient classes
with `!important` grew to fill that vacuum. **Teal is the clock's colour, not the brand** — it lives
in `pipingFor()` and nowhere else.

**One card, three roles** (`.card-glass` resting, `.card-raised`, `.card-live`, or the `variant` prop
on `ui/card.tsx`). There were nine tinted variants encoding nothing: the Structure tab alone wore six
for sub-panels of one screen, and purple was shared by four unrelated cards. Being the largest
coloured surface on every screen, that is what stopped the timer card reading as special. `raised` is
at most one card per screen; `live` means something is actually happening.

`live` tints the whole card in the accent, which **compounds with anything nested inside it** — the
Share tab put a `card-glass` panel inside a `card-live` card and the two translucent layers plus the
40%-accent border came out a muddy brown that text sat badly on. It also already had a green
Broadcasting badge, so it was signalling one state twice. It is now a plain card, and `live` survives
on exactly one card: the participant's own check-in row, where it says "this is you" and has nothing
nested in it.

**The `.btn-*` classes are being retired, not extended.** Eight remain, all in the timer and the
structure editors; the League dialog's seven are gone, replaced by the `variant` prop. They were also
a live collision: `.btn-add-position` was declared TWICE with different colours — rose for the Buy-in
section, green for the League dialog — and the second won for both, so Buy-in's button had silently
been the wrong colour. Same class of bug as two rules fighting over one pseudo-element, and the same
reason not to add a ninth.

Adding a tenth tint, or a `.btn-*` gradient class, is how both of these grew the first time. If a new
colour is genuinely needed, it needs a reason that survives being written down here.

### One clock, drawn by `TimerFace`

The director's console and the participant view render the SAME timer — frame, digits, blinds, ante —
from `components/TimerFace.tsx`. What differs goes in as children: transport controls for the
director, a running/paused badge for participants.

The participant view used to hand-roll its own duplicate, with its own card, size ramp and inline
line-height. The two drifted immediately and silently: every improvement to the console's clock was
invisible to the people scanning the QR code, which is the screen most people at a game actually
look at. **Change the clock in `TimerFace`, never in one of its callers.**

Participants see **the treatment the director chose**. `settings.timerPiping` rides along with the
rest of `settings`, which `PokerTimer` syncs wholesale to the tournament document, so the value is
already there — the participant view simply never read it. The progress-bar rule travels with it:
both sides hide the bar for `ring` and show it for everything else.

### A running clock is an end time, not a countdown

A tournament document carries the clock twice, and the two are not equally trustworthy.
`targetEndTime` is absolute — the moment the level ends — and stays true however old the document is.
`secondsLeft` is a countdown **snapshotted at write time**, true only at the instant it was stored.

`lib/tournamentClock.ts` owns the rule: while running, the end time decides and the stored countdown
is ignored; paused, the countdown is all there is, and that is safe because pausing is itself a write.

The console's snapshot handler used to take `data.secondsLeft` at face value. That went unnoticed for
a long time **because the app was writing the document about twice a second**, so the stored value was
never more than a moment stale — the bug was propped up by the write storm, and surfaced the instant
that was fixed: every snapshot, including the echo of the app's own player writes, stamped a stale
count over the running clock and the next tick jumped it back down. Freeze, then jump.

The participant view had it right all along and the console did not, which is the whole argument for
one derivation rather than two.

### The piping round the clock is the level progress

`TimerFace` renders inside `.timer-frame`, whose conic-gradient border fills clockwise from twelve
o'clock as the level runs — `from 0deg`, or it looks like it is unwinding. Its colours come from
`pipingFor()` and are the ones the digits already use: teal through blue, amber inside the last
minute, red inside thirty seconds, slate paused, cyan-violet on a break, gold for the winner.

**Four treatments live in `index.css` and the director picks between them in Settings** —
`settings.timerPiping` is `'ring' | 'drift' | 'rails' | 'ember'`, absent meaning `ring`. Adding a
fifth means a CSS block keyed on `[data-piping="..."]` and an entry in `PIPING_OPTIONS`
(`SettingsSection.tsx`); nothing else.

Only `ring` encodes progress, so **`TimerCard` renders the flat progress bar for every other
treatment and hides it for the ring.** Two indicators for one number can only disagree, and none is
worse than two — that conditional is the whole reason the setting is safe to offer.

The picker previews each option with the real CSS at chip size (`.timer-piping-swatch`), so the
choice is made by looking rather than by reading four names.

It is stored with the other settings in localStorage, and reaches the tournament document because
`PokerTimer` syncs the whole `settings` object — which is how participants get it. A second director
device starts on its own local value until it is set there too.

### The QR code is generated on the device

`components/ui/tournament-qr.tsx` draws it with the `qrcode` package, into an SVG. Both places that
show a QR — the timer card and the Share tab — used to be `<img>` tags fetched from
**api.qrserver.com**, with an `onError` that set `display: none`. One failed request took the app's
main participant-facing affordance off the screen silently, and it stayed gone until the next render.
Drawing it locally cannot fail, works at a venue with no internet, and stops a third party being told
the URL of every game.

The generator is **dynamically imported** inside the effect, so it is a 24kB chunk fetched only by a
game that actually shows a QR rather than dead weight on every console.

**It shows only for a PUBLISHED game.** The timer card keyed on `details.id`, which every signed-in
director's game has from the moment it has players, so it offered a QR that participants are refused
by — the trap the Go Live note above warns about. Both sites now test `isPublished !== false`.

The timer card's code is 96px rather than the old 80: a real tournament URL is 88 characters and needs
39 modules, which at 80px is 1.6 CSS pixels per module — tight for a phone camera across a table.

### The footer shows the build, and `index.html` is never cached

`vite.config.ts` defines `__BUILD_ID__` from the git short SHA and `PokerTimer`'s footer renders it.
Check it before chasing any bug reported from a device: whether a change had reached Railway came up
three separate times, and each cost more than showing it does.

`serveStatic` (`server/vite.ts`) sends `index.html` as `no-cache` and everything under `/assets/` as
`immutable`. That pairing is deliberate — the hashed asset names make a changed file a changed URL,
so caching them hard is safe, while the one uncached document guarantees a reload picks up a new
deploy. Without it a browser can hold an old `index.html`, keep requesting the old chunks, and sit on
a stale build indefinitely while other devices move on. That happened, and it presented as an app bug.

### Every screen needs a way out, and a way to change account

`/` redirects to whatever `activeDirectorTournamentId` names, so a plain "go home" cannot escape a
wedged state — the home control on the participant view links to **`/?home=1`**, which skips that
redirect and clears the pin. Use it wherever "get me out" is meant.

The participant view shows a **Sign out naming the account**, plus the home control — but **only to a
signed-in account**. Without it, a director signed in as the wrong account had nothing to press on
that screen — no sign-out, and no Take control because they did not own the game — and the only
escape was clearing site cookies from browser settings. Naming the account is load-bearing too:
"which login is this?" was the unanswered question behind several rounds of debugging.

Anonymous QR visitors see the logo and nothing else. They were never the ones stuck, and a Sign in
button on a screen they reached to watch a game is noise. Do not put the controls back for them
without also solving the trap above for the signed-in case.

### A league result is written once, from a whitelist, and read through another

`tournamentResults` has exactly one writer — `addResultMutation` in `useLeague.ts` — and the read
path (`useLeague.ts`, building `tournamentResults` for each player) rebuilds every result from an
**explicit whitelist**. A field has to be added in three places to reach a column: the call site in
`PokerTimer`, the mutation's parameter type and write, and that mapping. Adding it to only the
document is not enough, and nothing fails — the column just reads 0.

That is exactly how Rebuys, Re-entries, Add-ons and Bounties displayed 0 for every player in every
league. All four are tracked live on the player and were dropped at the moment of recording, taking
Invested, Profit and ROI down with them, since investment is buy-in *plus* what was put in again.

Two traps in that write. `sanitizeForFirestore` strips `undefined`, so a count must be coerced with
`|| 0` or the field is silently absent for everyone who never rebought. And the mapping renames
`knockouts` to `playersEliminatedCount`, which is why the table reads both.

`lib/resultStats.ts` owns the arithmetic and its fallbacks — an unpriced rebuy is charged at the
buy-in, and a result with no recorded buy-in falls back to 10 so old leagues' history does not move.

The **Bounties column is money**, not a count: a count of heads is the Hits column, and
`bountyWinnings` is the only bounty figure the timer tracks. The stat key stays `bountiesWon`
because it is persisted in each league's column settings.

Historical results carry none of these fields and stay at 0. `completedTournaments` — a parallel
record written by `useCompletedTournaments` — does hold per-player rebuys and add-ons, so a backfill
is possible if it is ever worth doing.

### A rebuy keeps the chair; a re-entry does not

`eliminatePlayer` records where a player was sitting as `seatInfo`, and `lib/seating.ts`'s
`seatToReclaim()` answers the one question that matters when they come back: **is that seat still
free?** Someone may have been moved into it. Two players in one chair is worse than an unseated one,
so a taken seat means they wait to be placed.

`processRebuy` used to clear `seated` and `tableAssignment` outright, so a rebuy sent the player to be
re-seated — and with a spare table configured, the seating put them at the empty one. A rebuy is chips
bought in the chair they never left. **The app already knew how to do this**: the undo-elimination
path restored a player to their exact seat, so one fact had two behaviours and the rebuy had the wrong
one. Both call `seatToReclaim` now.

**A re-entry stays unseated on purpose.** It is a fresh entry into the tournament rather than more
chips in the same chair — the same distinction that has a re-entry raked by default and a rebuy not.

`seatInfo` used to be **passed in by the caller**, and only `TablesSection` passed it; busting a
player out from the Players list lost their seat outright, and undo could not restore it either. The
hook has the player, so it takes the seat from them when the caller says nothing.

### A chop splits only the money still to be won

`ChipChopCalculator`, behind the **Chop** button in the Payouts header of `TournamentInfoCard`, is
the only deal calculator. A second one, `DealCalculatorDialog`, existed unmounted and was deleted —
two of these is how the rake formula drifted.

`lib/chop.ts` owns the arithmetic. The thing to hold on to is what the players are competing for:
**the top n payouts, where n is how many are left**, not the whole prize pool. Anyone already
eliminated has taken their place and their money with them. ICM had this right and the proportional
tab did not, so with six paid places and three players left it shared out the money already owed to
4th, 5th and 6th — the two tabs quietly disagreed, and the wrong one was bigger.

`payingPlaces()` trims trailing zeros before ICM runs, which is a correctness-shaped performance
fix: `icmEquity` recurses once per payout, so padding the array to the player count made nine
players enumerate 9! orderings to compute equities that were zero past third place.

The chip inputs reset every time the dialog opens. They used to be seeded once for the life of the
component, so chopping at five players, closing, busting to three and reopening showed stale stacks
that already looked complete — an authoritative answer for a table that no longer existed.

Chip counts are typed in by hand. `Player.chipCount` exists and nothing writes it.

### Payout percentages live in `manualPayouts`, and once did not

Every money figure reads `prizeStructure.manualPayouts` — the player row's prize, the exported PNG,
the money written onto a player at bust-out, and the Payouts panel, which hides itself entirely when
the field is absent.

The DEFAULT prize structure wrote its 60/30/10 into **`structure`**, a field nothing in the app
reads. So a game run straight from the defaults advertised a payout scheme and then paid nobody: no
money on any player, no money chip, no Payouts panel. Applying anything in the Structure tab writes
`manualPayouts` and it all starts working, which is why it survived — it only bit a game that never
visited that tab, which is exactly what a quick test game is.

`payoutsOf()` in `lib/payoutTemplates.ts` reads whichever field a structure has, preferring
`manualPayouts`; `withNormalisedPayouts()` is applied where a structure is **loaded** — localStorage
and the tournament document — so the rest of the app only ever sees `manualPayouts`. Normalising on
read rather than migrating means no stored game has to be rewritten to keep working. **Never write
`structure`.**

### Every money figure comes from `lib/prizePool.ts`

`prizePoolFor(players, prizeStructure)` is the one entry point, and `entryCosts(prizeStructure)`
gives what a single buy-in, rebuy or re-entry costs for the confirmation dialogs. Call those; do not
re-derive.

The formula used to be copy-pasted at nine sites, each re-spelling the same defaults, and they had
already drifted:

- `useTournament.completeTournament` paid the winner out of `gross - rake` where every other site
  keeps the rake on top. Exported and called by nothing, so it never cost a real game — it has been
  **deleted** rather than fixed. Build any future "finish the game" action on `prizePool.ts`.
- `TournamentParticipantView` had a local copy whose house fee omitted re-entry and rebuy rake, so
  the figure players saw disagreed with the director's screen for the same game. The pool was right,
  so payouts were never affected. Fixing it makes the player-facing fee **go up** to match.

The defaults are the part worth knowing, because they are not uniform: **a re-entry is raked by
default and a rebuy is not** — a re-entry is a fresh entry into the tournament, a rebuy is not. Same
for bounties. Spelling that as `?? true` in one file and `|| false` in another is how it drifts, so
it now lives only in `entryCosts`.

### Payments: `users` is read-only to clients, and the uid rides on the subscription

`users` holds `subscriptionStatus` and its only writer is the Stripe webhook through the Admin SDK,
which bypasses rules entirely. The rules therefore allow **read only**. They used to allow the owner
to create and update their own document, which meant any account could grant itself
`{ subscriptionStatus: 'pro' }` from the browser console.

The uid is stamped as Stripe metadata **twice** at checkout — on the session and, via
`subscription_data`, on the subscription — because different events carry different objects.
`checkout.session.completed` has the session, `customer.subscription.*` has the subscription, and
`invoice.paid` has neither and must be resolved through the subscription it references. With the uid
only on the session, as it was, every event the webhook acted on arrived without one and a paying
customer would never have been marked pro.

The webhook **fails loudly**: no Admin credentials, or a failed write, returns 500 so Stripe retries.
Returning 200 makes Stripe consider the event delivered, and it never sends it again — a dropped
upgrade with no trace.

Payments are still switched off. `customer.subscription.updated` is deliberately not handled, so a
subscription that goes `past_due` keeps pro until it is actually deleted; decide on that before
going live.

### The app speaks through `lib/speak.ts`, and picks no voice

Voice announcements are real and they work: the 30-second warning, each level change, the two skip
controls and the end of the tournament, all in `useTournament.ts`, all gated on
`settings.enableVoice`. **They are not in `TimerCard`** — it once carried a `voiceEnabled`, a
`ttsEnabled` and a `SpeechSynthesisUtterance` ref that were declared and never referenced, and those
three dead declarations are why this was once written up here as an unbuilt feature. It is built.

`lib/speak.ts` is the only place that constructs an utterance and the only place that sets rate,
volume and language. Six sites used to build their own and had drifted: the 30-second warning was
0.7 while everything else was 1.0, and exactly one of them set `lang` — so on a device with several
installed voices the warning could be spoken by a different voice from the level change seconds
later. The delays stay per-call, because they are genuinely different: 2.5s lets the level-complete
chimes finish, 1.2s clears the warning chime.

**No voice is selected, deliberately.** `speechSynthesis` supplies the platform default, which is
why the same game sounds male on an iPad and female on Android. A picker would have to be per-device
— installed voices differ, so a choice could not travel — and every announcement on a given device
already matches. If it is ever wanted it belongs in `speak.ts` and nowhere else.

`lib/announcements.ts` owns the wording, including the level numbering that skips breaks (copied at
three sites before). The Settings Test button speaks the level the game is on, through the same
path, so it tests the announcements rather than only the device.

### A season's dates are optional

Not every league runs on a calendar. A quarterly season is a date range with a schedule inside it; a
12-game season runs until the twelfth game is played, whenever that falls. **A season needs only a
name** — dates and a game count are each optional, and a season with neither simply never advertises
itself as finished.

The model was always ready for this: `isSeasonComplete` takes the game count first and consults
`endDate` only when there is one, and `sanitizeForFirestore` stores an absent date as null. What
stood in the way was the UI. `LeagueSeasonsTab.handleCreate` returned early without both dates **and
the button was not disabled**, so pressing Create with none did nothing and said nothing —
indistinguishable from a broken app. `formatSeasonDateRange` formatted unconditionally, so a dateless
season read `Invalid Date - Invalid Date`; it returns `''` now, and callers test before rendering.

**Both dates or neither.** Half a range is worse than none, because `isSeasonComplete` would then
read an end date with no beginning.

`seasonSubtitle()` joins the range and the length, dropping whichever is missing — concatenating them
directly left a dateless season reading `· 12 games`, leading separator and all.

Start Next Season works without dates too: same game count, no dates, named by `suggestNextName`,
which bumps a trailing number (`Season 3` → `Season 4`) when it has no date to reason from. The error
about unusable dates survives for the case it was written for — dates that exist but do not parse.

`isSeasonActive` was deleted with this: it derived "is this season current" from dates, which the
`activeSeasonId` pointer replaced, and nothing called it. A dates-only notion of "current" left lying
about is how the four competing ones grew.

### The game count can be worked out from the dates

`gamesInRange(startDate, endDate, { weekdays, everyNWeeks })` counts the playing nights in a range,
and the season form offers it whenever a date range is set: pick the nights, say how many weeks apart
they are, press Use.

The frequency is **a number, not a set of options**. It shipped as "Every week" and "Every 2 weeks",
a pair that could not justify itself — if fortnightly earns a button then so does every three weeks,
or monthly. `gamesInRange` always took any N; only the control stopped at two.

It is a **suggestion that fills an editable field**, never a rule. A cancelled week, a Christmas
break and a double-header are all normal and none of them are knowable from a pattern — the same
reason nothing ends a season automatically.

Worth knowing why it earns its place: **1 Jan to 31 Mar 2026 is thirteen weeks but twelve
Wednesdays.** That is exactly the arithmetic a director does in their head and gets wrong.

Two details in the implementation. All dates are read as **UTC midnight**, like `nextSeasonDates`, so
a timezone west of Greenwich cannot shift a date onto the previous day and lose a week. And
`everyNWeeks` is anchored to the **week** the range starts in, not to each weekday independently —
otherwise a fortnightly Tuesday-and-Thursday league would have its two nights land on alternating
weeks.

The chosen nights are not stored on the season. Nothing needs them after the count, and a stored
schedule that reality diverges from is a second source of truth.

### The Points tab is chosen by looking, not by reading

The schemes were labelled **Logarithmic, Square Root and Linear** — curve families, which is how the
maths thinks and not how a director does. Nobody setting up a home league wants to pick between
logarithms; they want the winner to get a lot more than second, or everyone to score close together.
They are named for what they do now, with `mathName` keeping the technical term for anyone who came
from software that used it.

**The preview is a table of what each place scores**, for an adjustable field size, and it reads out
of `calculatePoints` — the same function the league scores with, so it cannot drift from a real game.
It replaced a single position and one big number, which hid the shape of a scheme entirely.

Building it caught a description that was simply false. "Logarithmic" claimed to *reward top finishes
heavily*; with the defaults a field of twelve scores **38, 24, 23, 23, 21** — second through fifth are
nearly level, and almost all of the gap is the winner's bonus. A director choosing on that sentence
would have got the opposite of what they wanted. It is called "Close together" now.

`baseMultiplier` and `winnerMultiplier` are labelled by their effect — "Points scale", "Winner's
bonus (1 = no bonus)" — rather than by their name. And Custom reads "Custom formula (advanced)", since
a beginner browsing the list should not land in a formula editor by accident.

The table also catches the silent-zero: when every row reads 0 it says so, which is otherwise
invisible.

### Points presets are custom formulas, not system types

`lib/pointsPresets.ts` holds known scoring schemes — currently The Tournament Director's classic
`switch(r, 1, n*36, …)`, translated to this app's `f` and `p`. They load into the custom-formula field
beside the director's own saved formulas, using the same Load button.

**They are deliberately NOT entries in the points-system dropdown.** That lists KINDS of scoring —
logarithmic, square root, linear, fixed, custom — and a specific formula is an instance of the last
one rather than a sibling of the others. Listing one there would be like putting "Wednesday" beside
"weekly".

`pointsPresets.test.ts` **evaluates each preset the way `calculatePoints` does** and pins the TD
scheme band by band across 2–40 players and positions 1–25, so an edit cannot quietly change what a
league scores. It also asserts the properties any preset must have: it evaluates to a number rather
than throwing, and never scores a later finish above an earlier one.

That matters because a custom formula that throws **scores 0 for everyone, silently** —
`useLeagueSettings` catches, logs to the console and returns 0.

Two evaluators exist for one formula, and they disagree. The dialog's "Formula valid" tick
string-replaces `p`/`f`/`b`/`c`/`k`/`z` with fixed numbers, tests **first place only**, and rejects the
long variable names (`position`, `totalPlayers`, …) that the real engine accepts. The **Points
Preview** below it calls the real `calculatePoints` and is the one to trust. Collapsing the two is
worth doing — same class as the rake formula and the duplicated timer.

### `'default-season'`

A synthetic season id used before Firestore resolves. Results tagged with it match no real season
and vanish from every filtered view. Guard with `isRealSeasonId()` from `lib/seasonProgress.ts`
before writing `seasonId` anywhere.

---

## Architecture decisions worth knowing

### `client/src/lib/` holds pure, tested logic

Anything non-trivial and testable lives here with a colocated `.test.ts`, kept free of React and
Firebase imports so tests need no mocking. Follow this pattern rather than growing components.

| Module | Owns |
|---|---|
| `prizePool.ts` | Prize pool, rake and what one entry costs. **Rake is charged ON TOP of the buy-in**, so `net === gross` is deliberate, not a bug. Every money figure on screen comes from here. |
| `seasonProgress.ts` | Game numbering, games played, season completion, next-season dates. |
| `tournamentMode.ts` | Whether a tournament is a league game. An explicit flag wins either way; `leagueId` is consulted only when no flag exists. |
| `eventName.ts` | The display name, per above. |
| `sharedSnapshot.ts` | Refcounted Firestore listener sharing. |
| `eliminationOrder.ts` | Finishing positions, and the renumbering a re-entry forces. |
| `payoutTemplates.ts` | Payout percentages: non-increasing, ≥1 each, summing to 100. |
| `handover.ts` | Director handover: issuing, redeeming and burning transfer codes. |
| `liveTournament.ts` | Which of an account's tournaments is the one being run right now. |
| `chop.ts` | Splitting the remaining prize money: ICM equity, proportional chop, and what is still on the table. |
| `resultStats.ts` | What a league result says a player spent and collected: investment, rebuys, add-ons, bounty money. |

### One shared listener per query

`useLeague`, `useSeasons` and `useLeagueSettings` are called from many components. Each instance
used to open its own `onSnapshot`, so one page held 20+ listeners against the same four queries.
They now route through `useSharedSnapshot`, which keys a subscription by a string: first consumer
opens the real listener, the rest attach, teardown after a 5s grace period. **Call sites are
unchanged** — same parameters produce the same key.

### `leagues/{id}.activeSeasonId` decides the current season

There were once four competing notions of "which season is current". The league document now holds
a single pointer. `seasons.status` survives only as `'active' | 'completed'` for whether a season
has been *ended* — it does not decide which is current.

Switching seasons is one write. It used to be N+1 un-batched writes that also rewrote documents
participants read.

### `leaguePlayers.totalPoints` is vestigial

Written as 0 when a player is created and never maintained. Every standings table recomputes points
from that player's results, so the stored value was read by nothing while costing a second Firestore
write on every result recorded, deleted or corrected — halving the writes a ten-player game makes
just to keep a number that could only drift.

It was also a failure point in the wrong place: the increment was awaited inside `addResultMutation`,
so a permission or network error on a write nobody needed turned a successfully recorded result into
a thrown one.

Do not resurrect the increments. If a stored total is ever genuinely wanted, derive it somewhere it
can be tested.

### Season numbering is derived, never stored twice

`gameNumberFor()` is the single derivation. `settings.gameNumber` is written in exactly one place
(`PokerTimer`), from the season the UI is *displaying* — results are attributed to that same
season, so the screen and the database cannot disagree.

---

## Known gaps, deliberately left

- **Check-in writes are only as strong as an anonymous session.** `PlayerClaimView` signs in
  anonymously and sends a token, and the rule requires one — but anyone can obtain an anonymous
  session, so a determined participant can still edit a field inside an existing entry. The array
  length is preserved, so deletion and injection stay blocked. Closing it fully means writing
  server-side with the Admin SDK, which needs a service account key; **key creation is blocked by an
  organisation policy on this project**, so that route is not currently open.

  **This makes check-in depend on the Anonymous provider being enabled** (Firebase Console →
  Authentication → Sign-in method). It was the one participant flow that needed no auth at all, and
  turning it into one that does broke check-in until the provider was switched on. The rules tests
  cannot catch this — the emulator has anonymous auth on by default. Any new environment this app is
  deployed to needs that provider enabled, or nobody can check in.

---

## Working style that has paid off here

- **Measure before and after.** A `manualChunks` catch-all once silently cancelled a lazy import;
  only inspecting the built chunks caught it.
- **Check tests can fail.** Mutation-testing the listener registry found a real coverage gap that
  12 passing tests had missed.
- **Prefer fixing the model over patching the symptom.** A `seasonSwitched` CustomEvent patch for
  season-picker desync could never have worked — its reset effect ran on every instance mount.
  Replacing the model removed the whole class of bug.

---

## History

`replit.md` was deleted: it described a "WebSocket" architecture this app has never had and
duplicated CLAUDE.md badly. `.replit` stays — it is live config, not documentation.

`docs/league-seasons-rework-plan.md` is the archived plan the League & Seasons rework was executed
from. Read it for *why* the model looks the way it does — the single `activeSeasonId` pointer, the
derived game number, league-as-scope in the Manage League dialog. It is a record, not a to-do list.
