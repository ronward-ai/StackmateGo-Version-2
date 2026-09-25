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

**The screens PLAYERS see were the consumers that never did**, and it cost exactly what this note
warns about. `TournamentParticipantView` and `PlayerClaimView` printed the document's own `name`
field — which `lib/tournamentDocument.ts` sets ONCE, at creation, from `state.details?.name`, a
field `useTournament` never writes. So for every ordinary game the string on every player's phone,
and in their browser tab, was literally `Tournament 25/09/2026`, and renaming the event on the
console reached nobody. The real name was in the same document the whole time: `PokerTimer` syncs
the settings object wholesale, so `settings.branding.eventName` arrives with it. The local
`TournamentData` type in the participant view declared only the legacy `leagueName`, which is how it
stayed hidden.

`eventNameOfTournament(doc, leagueName)` is the document-level resolver all four of those sites now
use — settings first, then `details.name`, then `name`, and `''` when a document names itself
nowhere, so the caller keeps its own "Tournament" placeholder. Normalised on READ, the trade
`payoutsOf()` and `bandsOf()` already make: no stored game is rewritten.

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

### One sync streak, app-wide — and the device is the other place data vanishes

`lib/syncHealth.ts` owns the judgement (report once per streak; make `unavailable` prove it
persists). **`lib/syncReporter.ts` holds the streak**, at module scope. It used to live in a closure
inside `PokerTimer`, which meant `useSeasons`, `useLeagueSettings` and the Buy-in tab had no way to
reach it and simply logged to a console nobody has open on a tablet.

**One streak for the whole app, deliberately.** There is one database and one connection, so two
reporters would each raise their own toast for the same outage — which is the "three identical
destructive toasts that will not go away" problem `syncHealth` was written to end. Module scope
rather than a provider works because `toast` is exported standalone from `hooks/use-toast.ts`.

**The device is the second place a game can disappear, and nothing watched it.** The local mirror is
the safety net for when Firestore writes are blocked — it is the only reason a tournament survived
an ad blocker cancelling every write. If localStorage is failing too (quota, private mode, storage
off by policy) the game exists nowhere but the tab's memory. Every one of those writes was a bare
`catch {}`.

`lib/scopedStorage.ts` now carries a **storage-health flag**: a failed `setItem` flips it and
notifies, and `PokerTimer` shows a standing banner — a condition, like a blocked browser, not an
event. When BOTH are failing it says so in the strongest terms, because that pair is the only
combination that loses a game outright.

A failed **remove** is deliberately not a health signal: leaving stale data is untidy but costs
nothing. Only a failed write costs a director their game.

`readLocalProgress` separates **`corrupt` from `absent`**. They both used to return null and read
identically, so a mirror that existed but could not be parsed looked exactly like never having had
one — the single case where a director would want to know.

### A claim is released after the work, never before

`PokerTimer`'s rebuy path deletes the player's entry from `processedEliminationsRef` **after** the
`await removeTournamentResultForPlayer` resolves. It used to go first, and that was a real loss: on
failure the claim was already gone, so the next pass saw the player as unprocessed and `continue`d
straight past them. The stale league result was never retried and the player kept a wrong finishing
position **permanently**.

The elimination path ninety lines below always had it right — it releases the claim on failure
precisely *so that* the next pass retries, and toasts. Two paths, one rule, and only one of them
followed it.

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

**A pin is a guess until a read confirms it.** `activeDirectorTournamentId` sends the console to
`/tournament/{id}/director` on every visit and nothing checked the game was still there — so a pin
outlived the game it named (a deleted test game, an account wipe on another device, a document that
was never created) and every consequence was silent. The initial `getDoc` found nothing and only
logged, so `details.id` was never set, so the listener never attached, so `hasLoadedRemoteState`
never closed and the three sync effects stood down; and `dbTournamentId` is **seeded from the URL**,
so the auto-save — the one path that would have created a real document — returned early on the
strength of the very id that was broken. A director started a game, added two players, refreshed and
they were gone, with a banner on screen blaming an ad blocker.

`useTournament` now resolves every read to `remoteLoad: 'pending' | 'loaded' | 'missing' | 'error'`,
and `lib/liveTournament.ts`'s `pinIsDead()` acts on it. **`missing` is an answer; `error` is not.**
A document read for and found absent means the id is worthless — drop the pin, drop the held id, go
to `/?home=1`. A read that FAILED means nothing of the kind, and discarding a pin on a flaky
connection is how this codebase has lost a live game before. A test asserts the difference and fails
if `error` is folded in.

`remoteLoad` is deliberately NOT merged into `hasLoadedRemoteState`. That latch is the write gate,
and "we read it and it is not there" must never authorise writing over anything.

**The banner names the cause it actually has.** It said "check for an ad or tracker blocker" in every
case, which is unfixable advice for a game that is not there. Three states now — blocked browser,
game missing, still unread after ten seconds — and the two a reload cannot fix carry a button out.

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

### `overflow-x: hidden` on `html`/`body` breaks every `position: sticky` in the app

`index.css` carried `html, body { overflow-x: hidden; max-width: 100vw }` from the initial import,
under the comment "Prevent horizontal scroll on small screens". Setting overflow on one axis makes
the OTHER axis compute to `auto`, so **`body` became a scroll container** — and a sticky element
sticks to its nearest scrolling ancestor rather than the viewport.

Measured, not assumed: with `hidden`, a sticky header scrolled 600px up sits at `top: -600`; with
`clip` and with `visible` it sits at `top: 0`. It is `overflow-x: clip` now, which suppresses the
scrollbar exactly as `hidden` did and establishes no scroll container. Safari needs 16 for `clip`;
older versions drop the declaration and fall back to a horizontal scrollbar, which is a cosmetic
regression on an old browser against a feature that was otherwise dead everywhere.

**Do not change it back.** The console's app bar shipped pinned-in-theory and scrolled away in
practice, taking the clock it carries with it, and nothing about the bar was wrong.

### The top of the console is an app bar, and the event is its headline

`components/ConsoleHeader.tsx`. It was a StackMate wordmark with the tagline *"Your poker night,
sorted."* under it and an outline **Account ▾** button opposite — then the VENUE's logo and event
name centred below, smaller. Two brands competing, and the wrong one winning: on the night the thing
that matters is whose game this is. A tagline belongs on the landing page, which now has one.

**The centred branding block went rather than being kept alongside.** The event name at two sizes on
one screen is exactly the fault the season line had, where the info card's header printed the
identical sentence the toggle row already said. `branding.isVisible` still means something — with it
on, the bar renders the venue logo and name larger. Removing it also fixed a real bug: that block
rendered the venue logo **twice**, flanking the name on both sides.

**24px, 20px on a phone — and on a phone it is the EVENT NAME that hides, not the logo.** The
wordmark shipped at 16px and 80% opacity aiming for "quiet" and landed on absent. The phone rule is
forced arithmetic: the wordmark is 7.6:1, so 20px is 152px wide, and a 360px phone has 328 usable of
which the status pill, the avatar and the gaps take ~166. The two cannot coexist, so one goes.

**Which one is the director's call, and it went the other way first.** The event name was chosen on
the reasoning that a director knows which app they opened; the logo being absent from their own
phone is not what they wanted. The venue's logo hides with the venue's NAME, since left alone it
would sit beside the wordmark with nothing to label. Nothing is lost under way: the clock branch
replaces the whole left cluster once the timer card is off screen, so a phone in play reads
`Level 5 · 07:42`.

**The mark is the small WORDMARK, not the four-chip icon.** The icon was tried first, at 24, 28 and
32px, bare and tiled. At every size, in the top-left corner of an app, four orange bars read as a
hamburger menu — the association `favicon.svg`'s own comment warns about, and the corner position is
what sells it. The icon is right for a browser tab and an app tile and wrong here. 16px and 80%
opacity is the point of it: the product's name belongs on the screen, quietly, because whoever is
looking is already inside the product.

**The bottom edge is drawn only when something is sliding under it, and it is full bleed.** It was
an unconditional hairline, which at rest separated nothing — and because the bar lived inside the
page's `max-w-4xl` container it was an 896px stub floating in the middle of a laptop screen rather
than the edge of a bar. The bar now sits OUTSIDE that container, above it, with its row in a
container of its own, so the border and the blur run the width of the window while the wordmark and
the account still line up with the cards below.

A `h-px` sentinel at the very top of the document answers "has this scrolled", through the same
`useIsOffscreen` hook. **It must pass `rootMargin: '0px'`** — the hook's `-8px` default exists so the
clock does not flicker as the timer card's last pixel leaves, and it would report a sentinel at y=0
as off screen immediately, drawing the line at rest: today's bug with more machinery. The border is
`border-transparent` at rest rather than absent, so nothing shifts by a pixel when it appears.

**The bar's clock is the same clock.** It calls the hook's own `formatTime()` and
`blindLevelNumber()` — not a second derivation, which matters because a tournament document carries
the clock twice and only `targetEndTime` is trustworthy. And it renders **only while `TimerCard` is
off screen** (`hooks/useIsOffscreen.ts`), so the two are never both visible. Two readouts of one
number can only disagree; being the same value AND never simultaneous is what makes this safe.

That hook is an `IntersectionObserver` and deliberately not a scroll listener: this page re-renders
every second because that is how the clock advances, and hanging work off `scroll` here is the churn
that once had a live game writing to Firestore twice a second.

**One status chip, stated once.** Both pills were built inline in `QRCodeSection`'s header and have
moved up, through `components/TournamentStatusChip.tsx` — the only implementation, the way
`lib/playerBadges.ts` is the only implementation of a player's chips. `lib/statusChip.ts` owns which
one shows, and **a blocked browser beats a live game**: it is the one the director can act on, and
it is the one that makes the other a lie, since a published game that is not syncing is showing
participants a document that has stopped moving. A test asserts that order and fails if it is
swapped.

**The console CAN be rendered locally, and it has to be.** Firebase Auth rejects a fake API key, so
the app dies at load with `auth/invalid-api-key` without real credentials — which is why the app bar
was verified in a component harness and a page-level CSS fault went straight past it. `.devstub/`
plus `npx vite build -c devstub.vite.config.ts` aliases `lib/firebase` and `hooks/useAuth` to stubs
and the whole console renders. **Firestore stays real** — it initialises happily offline with a
memory cache and simply fails its network calls; only `auth` is faked, because auth is the only part
that refuses to start. Never used by the normal build: it needs that explicit `-c`.

**Measure narrow layouts at 500px.** Headless Chrome clamps its window to about 500px, so a
screenshot requested at 360 is rendered at 500 and cropped — which looks exactly like the bar
overflowing when it does not. `scrollWidth === clientWidth` is the answer; the picture is not.

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

### The standings export reuses the table's own accessor

`handleExportCsv` in `RealTimeLeagueTable` builds its headers from `enabledStats` and its cells from
`getPlayerStat` — the **same ordered column list and the same accessor the table renders with**. A
director exports what they were just looking at, and a column cannot disagree with the screen.
Building a second column list for the export is exactly how the rake formula reached nine sites.

Money therefore keeps its currency symbol in the file. Excel and Sheets both parse a leading symbol,
so a column still sums.

**`lib/csv.ts` defuses formulas.** Excel, Sheets and Numbers all execute a cell beginning `=`, `+`,
`-` or `@`, and a leading tab or carriage return smuggles one past a naive check. Player names are
typed in by whoever is running the game and reach the file unmodified, so a name like
`=HYPERLINK(...)` would run on the machine of whoever opened the export. A leading apostrophe, which
spreadsheets strip on display, is the standard fix.

The download writes a **UTF-8 BOM**: without it Excel reads the file as its local codepage and mangles
any non-ASCII player name. `downloadCsv` returns false rather than throwing so the caller can say a
download was blocked, instead of a button that silently does nothing.

### One player's season lives in `lib/playerSeason.ts`

The gap a director on other software reported: answering *"how many hits has Dave had?"* meant opening
every game of the season one at a time and adding them up. The standings already answer that for the
season; the drill-down behind a player's name answers the follow-up nobody could answer at all —
**which night**.

The arithmetic is in the lib rather than the dialog because it is the same arithmetic the league table
does, and **two places deriving what a player spent is how Invested, Profit and ROI all read zero for
a year**. `lib/resultStats.ts` still owns the per-result fallbacks; this only aggregates, and a test
asserts the totals agree with the rows they summarise.

Three details worth keeping:

- **Most recent game first.** The question is nearly always about a recent night.
- **A game with no usable date is kept, not dropped**, and sorts last. It is still a real result, and
  losing it from the list would make the list quietly disagree with the totals.
- **`averagePosition` and `bestFinish` are null, never 0**, for a player who has not played. "Average
  position 0" is a lie on a fresh player, and the same class of thing as the silent zeros above.

Knockouts and prize money are each read under both names they are stored under (`hitsIn`, `cashIn`) —
the read whitelist renames `knockouts` to `playersEliminatedCount`, so both shapes exist in real
documents.

### A league result is written once, from a whitelist, and read through another

`tournamentResults` has exactly one writer — `addResultMutation` in `useLeague.ts` — and the read
path (`useLeague.ts`, building `tournamentResults` for each player) rebuilds every result from an
**explicit whitelist**. A field has to be added in three places to reach a column: the call site in
`PokerTimer`, the mutation's parameter type and write, and that mapping. Adding it to only the
document is not enough, and nothing fails — the column just reads 0.

That is exactly how Rebuys, Re-entries, Add-ons and Bounties displayed 0 for every player in every
league. All four are tracked live on the player and were dropped at the moment of recording, taking
Invested, Profit and ROI down with them, since investment is buy-in *plus* what was put in again.

Two traps in that write. `sanitizeForFirestore` turns `undefined` into **`null`** — it does not strip
it, which this note used to claim — so a count must be coerced with `|| 0` or the column reads 0 for
everyone who never rebought. The difference matters beyond the wording: writing `null` *overwrites*
whatever Firestore held, where an absent key would have left it alone. And the mapping renames
`knockouts` to `playersEliminatedCount`, which is why the table reads both.

`lib/resultStats.ts` owns the arithmetic and its fallbacks — an unpriced rebuy is charged at the
buy-in, and a result with no recorded buy-in falls back to 10 so old leagues' history does not move.

The **Bounties column is money**, not a count: a count of heads is the Hits column, and
`bountyWinnings` is the only bounty figure the timer tracks. The stat key stays `bountiesWon`
because it is persisted in each league's column settings.

Historical results carry none of these fields and stay at 0. `completedTournaments` — a parallel
record written by `useCompletedTournaments` — does hold per-player rebuys and add-ons, so a backfill
is possible if it is ever worth doing.

### Late entry is a stated window that WARNS, and that is the whole feature

There is no late-entry mechanism, and there does not need to be one: a director adds players, and
`addPlayer` has never cared what level it is. What was missing was the app saying when that stops
being expected — so `lateEntryLevels` is a number in the Buy-in tab and a line in Tournament Info,
and nothing more.

**But printing a window makes it a promise, and this codebase has already paid for printing one it
never checked.** `rebuyPeriodLevels` and `reEntryPeriodLevels` were displayed as "Available during
first N levels" for years while nothing looked at the level — an omission rather than a decision,
since their sibling `addonAvailableLevel` *was* checked. Stating late entry and then silently
allowing a player at level 9 would be the identical bug with a new name.

So it warns. `lateEntryClosedReason()` names the level it closed at, the director confirms, and the
player is added. **A refusal would be wrong**: a rebuy past its cap is a rule the director set about
the game, while someone walking through the door late is a fact about the world, and the director is
the one standing there. There is deliberately no `allowLateEntry` switch for the same reason —
adding a player always has to be possible, and the window only bites when it was set, like every
other period here.

**Both ways of adding a player go through one gate.** Typing a name and picking one from the
autocomplete used to call `addPlayer` independently, so a check on one would simply be walked around
by the other. `attemptAddPlayer` in `PlayerSection` is the only route in now.

It is shown to the **director** and not to participants, which was a deliberate call: it is
information for whoever is running the night, not a public commitment made on a phone.

### Zero means unlimited, and one module says so

`lib/entryLimits.ts` answers whether a player may rebuy or re-enter. **Zero, negative and absent all
mean no limit** — for the cap AND for the period.

That rule used to live only in the Buy-in tab's head. `maxRebuys` was read at three sites, each
spelling the fallback `|| 3`, while `0` is exactly how that tab stores "unlimited" — an `∞`
placeholder and a line reading `Max: {maxRebuys || 'unlimited'}`. `0 || 3` is `3`, so **a director
who asked for unlimited got three.** Re-entries had the mirror bug with `?? 99`, which keeps the zero
and therefore read it as "none allowed", while the two info cards printed a cap only when it was
above zero and read the same zero as "unlimited". One number, three meanings, four files.

**`rebuyPeriodLevels` and `reEntryPeriodLevels` are enforced now, and were not before.** The Buy-in
tab has always printed "Available during first N levels" and nothing ever checked the level — while
their sibling `addonAvailableLevel` was checked, which is what makes it an omission rather than a
decision. `maxReEntries` was enforced nowhere at all: only the table view's button hid.

So that enforcement could not close on a game whose director never chose a window,
`DEFAULT_PRIZE_STRUCTURE` carries **no period**. A window only bites when it was deliberately set.

**Levels are zero-indexed in state and one-indexed on screen.** Every function here takes the raw
`state.currentLevel` and does the `+ 1` internally, because that off-by-one was previously spelled
inline at the one site that worked and is exactly what gets copied wrong on the fourth.

### There is one default prize structure

`lib/prizeStructure.ts`. There were two — `useTournament`'s and the Buy-in tab's own `useState`
defaults — and they disagreed on rebuys (on vs off), the cap (3 vs 0), the period (5 vs 3) and the
payout split (**60/30/10 vs 50/30/20**), so a game run from the defaults showed one split on the
Payouts panel and paid another. The tab's loader spelled a third set of fallbacks on top.

Those loader fallbacks are `??`, never `||`: `p.buyIn || 10` turned a **free game back into a £10
one** every time the tab was reopened.

### Points belong to the league, never to a player

`Player.points` is typed `never`. Two formulas used to write it — `(players - position + 1) * 10` on
elimination and `players * 36` for the winner — and neither matched any scheme a league can be set
to; `36 * p` is the first-place figure of exactly one preset. With `calculatePoints` and the settings
dialog's validator that made **four** points evaluators, two of them invisible, and the winner's
wrong figure was broadcast to every participant device.

Nothing read either. If a live points figure is ever wanted, derive it through `calculatePoints` at
the point of display.

### The logo is bounded before it is stored

`lib/imageDownscale.ts`. The upload used to read straight through with `readAsDataURL` — no limit, no
downscaling — into `settings.branding.logoUrl`, which rides into the tournament document inside
`settings`. A 4 MB phone photo is ~5.4 MB of base64 against **Firestore's 1 MiB document limit**, so
the write fails — and it is the *whole* document that fails, not just the logo.

512px longest edge, 150KB budget, WebP first so transparency survives. Verified in real Chromium:
4000×3000 of pure noise, the worst case compression can face, encodes to 122KB at the first quality
step. An image that still will not fit is **refused out loud**, because the failure it replaces was
completely silent.

### The screen is kept awake while the clock runs

`hooks/useWakeLock.ts`, on the console and the participant view alike. Nothing asked for this before
and the tablet slept mid-level.

A wake lock is **released automatically whenever the page is hidden and is not restored**, so the
`visibilitychange` listener is the load-bearing half — without it the lock survives until the first
person checks their phone. The request **rejects** when refused (no gesture yet, battery saver,
Firefox, iOS before 16.4), and every path fails silently: it is called from inside a running clock and
must never take the timer down.

### A custom points formula is parsed, never executed

`lib/formulaEval.ts` evaluates `customFormula` with a small recursive-descent parser. It used to be
`new Function('f','p', ..., 'Math', 'return (' + formula + ')')` — the formula string handed straight
to the JS engine, with nothing validating it first. The dialog's "Formula valid" tick ran its own
SEPARATE `new Function` of its own, used only for that tick and never consulted by the real scoring
path — the two could and did disagree (the tick rejected `%`, which worked; tested only `f=1`, so a
formula dividing by `f-1` was "valid" and scored 0 for the whole league; rejected the long variable
names the real engine accepts).

**The trust boundary that mattered:** `RealTimeLeagueTable.tsx` loads the DIRECTOR's league settings
and scores with them in the PARTICIPANT's browser, by design — participants watch the director's own
scheme live. So any signed-in director could put arbitrary JavaScript in a points formula and have it
run on this origin, in the browser of everyone who scans their QR code, with access to that visitor's
Firebase session. A stranger could not poison someone else's settings (writes are `userId`-scoped), so
this was director → participant, not attacker → anyone — but it was a real stored-code-execution path.

**The parser can only ever produce arithmetic.** However a formula string is contrived, there is no
path from it to executing anything — the worst outcome is a formula that fails to parse.

**Whitelisted `Math` is the FULL real set, minus `random`, not just the four the dialog names.** The
"What you can use" reference has always promised "anything else on JavaScript's Math works too," and a
live league may already have a saved formula using a `Math` member other than the four named ones.
Restricting to a small hand-picked set would have silently changed what an existing league scores —
exactly the class of regression `pointsPresets.test.ts` exists to catch. Every entry is a pure numeric
function with no route to anything outside `Math`, explicitly enumerated rather than "call anything on
Math". `Math.random` is excluded for a correctness reason, not a security one: `calculatePoints` runs
fresh on every render with no memoisation, so a random component would make a league's own points
flicker on screen.

**Both `new Function` call sites moved onto the same function.** `pointsPresets.test.ts`'s own
`evaluate()` helper used to hand-roll a THIRD copy — its comment claimed to test presets "the way the
app evaluates them," which was only true by coincidence. It now calls `evaluateFormula` too, so all
three places a formula was ever run agree by construction.

**A one-entry parse cache**, keyed on the formula string: `calculatePoints` runs per player per render
with no memoisation of its own, so re-parsing an unchanged formula on every call was pure waste.

This project's `tsconfig.json` has no `strict`/`strictNullChecks`. Under that config, TypeScript does
NOT reliably narrow a discriminated union on a bare boolean check (`if (!r.ok)` / `if (r.ok)`) — proven
in isolation against this exact tsconfig, not assumed. Use an explicit literal comparison
(`r.ok === false`) or the `'error' in result` form instead, both of which narrow correctly here.

### Check-in claims a seat through a map, never through the players array

`activeTournaments/{id}.claims` is a top-level field, `playerId -> deviceId`, owned by
`lib/seatClaims.ts`. It replaced `Player.claimedBy`, a field living *inside* each entry of the
players array.

That placement was the actual hole, not merely an incomplete fix. A check-in write had the exact
same shape as every other players-array write — the rule admitting it (`hasOnly(['players'])`, array
length preserved) constrained the shape of the array, not the contents of an existing entry. Any QR
visitor could obtain an anonymous session, and the director's own snapshot handler
(`useTournament.ts`) treats an incoming `isActive: false` as a genuine elimination and spreads an
incoming active entry wholesale — so a hostile check-in write reached the director's screen and the
league standings as if the director had done it themselves. A guest at the table with the QR code and
a browser console could bust another player out.

`claims` carries no gameplay data at all — a playerId and a deviceId, nothing else — so the rule now
admits nothing from a check-in write **but** that map (`hasOnly(['claims'])`, `claims is map`,
`claims.size() <= players.size()`), and there is nothing left in the branch for a hostile write to
reach.

**The write touches one key, not the whole map**, via a dotted field path —
`tx.update(ref, { [claimFieldPath(id)]: deviceId })`. Firestore treats a dotted-path update as a
merge into the existing map, so two participants checking in at the same moment touch different keys
and cannot clobber each other — this was verified against the real emulator before it was trusted,
not assumed from the SDK's documentation, because `affectedKeys()` reporting only the top-level
`claims` key regardless of which nested key actually changed was the fact the whole design leant on.
`PlayerClaimView`'s claim is a **transaction**, not a bare write, for the same reason the old
read-modify-write on the full players array was flagged as a race (M9 in the audit): it reads the
live claim before writing and rejects stealing a seat a *different* device already holds, rather than
silently overwriting it.

**Normalised on read**, the same trade `payoutsOf()`/`bandsOf()` make: a tournament document written
before this shipped may still carry `Player.claimedBy` from the old scheme, and no stored document is
rewritten to keep it working. `claimedByFor()` prefers `claims`, falling back to the deprecated
per-player field. **Never write `Player.claimedBy` again.**

The participant view's own "this is you" lookup had a second, unrelated bug living in the same field:
its fallback compared a player's `claimedBy` (a device id) against the visitor's *Firebase auth uid* —
two different identity spaces that could never match. It always returned nothing and nobody noticed,
because the primary lookup (a `claimedPlayer_{id}` localStorage key set by the claim itself) covers
the ordinary case. Fixed alongside this, through `myPlayerId()`.

The remaining gap is real and is now much narrower: anyone can still obtain an anonymous session, so a
determined participant can claim or unclaim a seat that is not theirs. The worst that reaches is "who
does this seat say claimed it" — never a player's name, chips, position, or elimination state. Closing
it fully still means writing server-side with the Admin SDK, which needs a service account key that
org policy on this project blocks.

### Four collections could be listed by anyone, and one of them leaked a uid

`seasons`, `leaguePlayers`, `tournamentResults` and `leagueSettings` all had `allow read: if true` —
which covers **`list`**, not just `get`. A participant genuinely does need to list these, filtered by
`leagueId` (or `userId` for settings), and Firestore rules cannot see a query's `where` clause — only
which documents a `list` call would return — so there was no way to permit "the filtered read a
participant makes" without also permitting "list everything, unfiltered, no account, no connection to
the app at all". One unauthenticated REST call could paginate out every player's real name across
every league, plus every result, every season structure, and — worse — every director's Firebase uid.

**Two different fixes, because the collections aren't the same shape.**

`leagueSettings` got the real fix, not a compromise: a director's CURRENT settings for a league now
live at a **deterministic document id** — `lib/leagueSettingsId.ts`'s `defaultSettingsDocId(ownerId,
leagueId)` — computable by anyone who already knows the tournament's `ownerId` and `leagueId`, both of
which are public. A participant reaches it with a plain `get()`, never a `list`, so `list` on this
collection could become **owner-only** (`isRegistered() && resource.data.userId == request.auth.uid`)
without breaking anything. This is possible here and not for the other three because a league has
exactly ONE current settings document that matters to a participant — `seasons`/`leaguePlayers`/
`tournamentResults` are genuinely one-to-many and cannot collapse to a single id.

Saved formula **templates** (`isDefault: false`) keep an auto-generated id — there can be many per
director, none are ever read by a participant, and the owner-only `list` already covers them.

`seasons`/`leaguePlayers`/`tournamentResults` took the other shape: **`list` now requires any Firebase
session** (`isAuthenticated()` — anonymous counts). This does not stop a determined scraper, who can
mint a free anonymous session in one call same as a real participant does — it stops **casual,
unauthenticated, no-account enumeration**, which is what the actual exposure was.

**That gate reintroduced a race this app hit once before and fixed the wrong way.** The comment that
used to justify `read: if true` said so directly: "Public read so QR participants see live standings
**before anonymous auth completes**." The participant view's `signInAnonymously()` call is
fire-and-forget in a `useEffect`, and nothing waited for it — so gating `list` on `isAuthenticated`
without also fixing the timing would have reintroduced exactly that failure, just via a permission
error instead of a design choice. The fix is the SAME mechanism `lib/sharedSnapshot.ts`'s `key: string
| null` already provides for "don't query yet, `leagueId` isn't known": the four `useSharedSnapshot`
calls in `useSeasons.ts` and `useLeague.ts` now pass `null` until `isAuthenticated` is true, and
`useSyncExternalStore` re-subscribes automatically the moment it flips — no retry logic needed, because
nothing ever failed in the first place.

**leagueSettings' write side migrates on the next save, never in bulk.** `saveSettingsToDatabase`
targets the deterministic id going forward; a league whose director saved before this shipped still
has its old default doc under an auto-generated id, found by CONTENT (matching `isDefault` and
`leagueId`) rather than by id. The first save after this ships writes the new doc and deletes the old
one — a participant reading in between sees `DEFAULT_LEAGUE_SETTINGS` (the SAME fallback this hook
already had for "settings could not be read at all"), never nothing and never an error.

### Local storage belongs to an account, not to a browser

Every key holding a director's setup used to be global to the browser and recorded nothing about who
wrote it, and all of them are read back unconditionally when the console mounts. Signing out cleared
exactly one — the live-game pin — and `useAuth` said why: the rest should stay "so signing back in
resumes where you left off". True, and right, **up until the person signing back in is somebody
else.** A second account on the same browser inherited the first one's roster, blind structure,
buy-in, payouts, event name, points system and recent player names. That is what a league sharing a
director login hits on day one.

`lib/scopedStorage.ts` buckets those keys by uid — `tournamentSettings::<uid>` — with `::local` for a
signed-out session. **Nothing is cleared on sign-out**, which is the point: this app has lost a live
game to over-eager clearing before, and the two rules that keep bucketing safe are both about not
destroying things.

- **Signing in ADOPTS the signed-out bucket** when the account has nothing of its own. A standalone
  game built before signing in has to survive the act of signing in — losing it there would be the
  exact failure the local mirror was added to prevent.
- **Adoption copies, never moves.** A wrong guess can cost a director their local defaults; it can
  never cost them data.

Storage written before this shipped has no bucket and belongs to whoever was using the browser, which
is unknowable after the fact. The first signed-in account that finds its own bucket empty adopts it
and records the claim, so a second account does not inherit the same setup again. The unbucketed keys
are left where they are.

**Callbacks read the uid through a ref, never a captured value.** Several have empty dependency
arrays, so a captured uid would be the first render's for the life of the component and every save
after a switch would land in the previous director's bucket. Widening those arrays instead would
churn the callbacks, and churn in this hook is what once had a live game writing to Firestore twice a
second.

Deliberately NOT bucketed: `playerDeviceId` and `claimedPlayer_*` are device identities that seat
check-in depends on, `leaguePanelExpanded` is a UI preference, `smgo_unlocked` is the site gate, and
`activeDirectorTournamentId` is already cleared on logout and ownership-checked in
`TournamentDirector`.

### The setup follows the account; the mirror stays on the device

Everything else a director owns already followed the account — the running game and its roster
(`activeTournaments`), history (`completedTournaments`, `tournamentResults`), the league and its
points system, saved structures (`tournamentTemplates`). The setup a new game *starts from* did not,
which is an odd gap in an app whose whole premise is running a game from whatever device is to hand,
and it is what a club sharing a login needs most.

`hooks/useDirectorSetupSync.ts` keeps settings, blind levels and prize structure in
`userSettings/{uid}` — a document that already existed for the ad-blocker preflight's `lastSeenAt`,
with owner-only rules already in place, so this added a field rather than a collection.
`lib/setupSync.ts` owns the decisions and is free of React and Firebase, because the dangerous part
is not the read or the write but choosing which copy wins.

Four things are load-bearing:

- **Pull only onto an empty table** (`canApplyRemoteSetup`). The setup carries the blind structure and
  the payouts, so applying it to a game under way would rewrite the terms of that game. Pulling is a
  sign-in-time convenience, never an ongoing sync.
- **Push only after the pull has SETTLED**, which is not the same as started. A ref set when the read
  begins is already set while the read is in flight, and the push effect would cheerfully send this
  device's defaults up over the account's real setup in that window. That bug was written, and a test
  caught it; keep the two refs distinct.
- **A failed read closes the push direction for the session.** Not knowing what the account holds is
  exactly when pushing is unsafe. Losing a night's settings changes is recoverable; overwriting a
  league's structure with a device's defaults is not.
- **`updatedAt` is excluded from the write guard's fingerprint.** It changes on every save by
  definition, so including it would defeat the comparison entirely — and an unguarded sync effect in
  this app once wrote twice a second.

`tournamentLocalProgress` is deliberately **not** synced. It is the offline safety net for when
Firestore is unreachable, so it cannot depend on Firestore.

**Cost is not the reason to hesitate here.** One document per account: one read at sign-in, one
debounced write per change. Firestore's free allowance is 50k reads and 20k writes a day. The
live-game sync that runs while a tournament is actually played dwarfs it.

### Deleting an account's data has ONE safe order, and it is not alphabetical

`lib/accountWipe.ts`'s `DELETION_ORDER` is load-bearing. `seasons`, `leaguePlayers` and
`tournamentResults` are deleted under `allow delete: if ownsLeague(resource.data.leagueId)`, and
`ownsLeague()` does a cross-document `get()` on the league to find out who owns it.

**Delete the leagues first and every remaining child row becomes undeletable by any client, forever**
— owned by a league that no longer exists, invisible to the app, still stored and still billed. So
everything league-scoped goes first, `leagues` goes after, and the collections keyed on `ownerId` or
`userId` can go whenever. `leagueScopedStagesComeFirst()` is exported purely so a test asserts this
rather than a reviewer having to notice it.

For the same reason the wipe **stops at the first stage that fails and names it**. Stopping *before*
`leagues` is exactly what keeps the remainder deletable on a retry.

**`users/{uid}` is deliberately not in the list.** It is read-only to clients by rule and holds
`subscriptionStatus`, whose only writer is the Stripe webhook. Clearing someone's tournament history
must not clear what they have paid for.

**Reset and Delete are separate controls**, because they cost different things: Reset returns the app
to factory and keeps every result, Delete removes the results. One combined button would mean anyone
wanting a clean console had to give up their league's history to get it. Reset clears the local
buckets **and** `userSettings/{uid}.setup` — clearing only the device leaves the account's copy, and
the next sign-in pulls back exactly what was just cleared.

### The final table is asked for, reversible, and the dismissal sticks

Three separate things, all found by running a real 9-player game on 8-seat tables.

**It redraws the seats at random, so the arrangement it replaces has to be kept.** That randomness is
correct — a final table draw should be random — but `goToFinalTable` overwrote every
`tableAssignment` and stored nothing, so undoing the bust-out that caused the collapse restored only
the busted player's own chair (`seatToReclaim`) and left everyone else on their new random seat with
`isFinalTable` still true. `state.preFinalTableSeating` is snapshotted **before** the redraw, and
`undoFinalTable()` puts it back. `undoBustOut` calls it when restoring the player leaves more of them
than one table seats — which is exactly the case that caused the collapse.

`lib/finalTable.ts`'s `restoreSeating` leaves a player the snapshot has never heard of **exactly as
they are** rather than unseating them: they arrived after the collapse, by rebuy or re-entry, and
`seatToReclaim` has just given them a chair. Guessing would take it away again.

**"Not yet" has to stick.** The prompt is driven off a predicate over `state.players`, so a bare
boolean was cleared by the next render that touched the roster — a chip edit, a knockout — and the
dialog reopened behind a director who had gone to sell the busted player a rebuy. The dismissal is
latched against the **player count** it was dismissed at, so it stays shut while the field is that
size and re-arms if the field changes again.

**The question is about one player, not about rebuys in general.** Nothing can grow the field
mid-game — late entry does not exist in this app — so rebuys never decide whether a final table is
DUE. They decide whether this particular bust-out counted. The dialog therefore names whoever just
busted and offers to rebuy them, which is the answer that means nobody moves.

**The predicate is `<=`, and it used to be `===`.** That equality meant the field passed through one
table's worth EXACTLY ONCE: with 8 seats and 9 players it is 8 for a single bust-out and then 7, 6,
5. Answering "Not yet" — or being on another screen for that render — meant the question was never
asked again, because no later count equals 8. A director ran a real game, got one prompt, and spent
the rest of the night collapsing the table by hand; that hand-arranging is what walked them into the
seating bug below. A test asserts the prompt is due at every count from `seatsPerTable` down to 2 and
fails if the equality comes back.

Asking on each bust-out is not nagging — each one is genuinely a new question, and
`promptDismissedFor` caps it at one prompt per bust-out. **"Not this game"** silences it for the rest
of the tournament, for the director who means to arrange it themselves. That flag is component state
in `TablesSection`, NOT tournament state: it is a preference about a question rather than a fact
about the game, and in `state` it would sync to Firestore and out to every participant device. A page
refresh therefore asks once more, which is one dialog rather than lost data.

### A busted player has to be reachable from the screen the director is on

`TablesSection` already had a rebuy button, drawn **inside a seat** and gated on
`isActive === false` — and it could never appear, because `eliminatePlayer` sets `seated: false` and
`tableAssignment: undefined`, so a busted player leaves the grid the instant they bust. There was no
seat left to hang it on. The only route back in was the players list, which is a screen change in the
middle of the one moment a director is busiest.

The **Busted strip** under the tables is where they actually are, most recent first, because the
player a director is reaching for is almost always the one they just knocked out.

**`components/PlayerEntryActions.tsx` is the only implementation of buying someone back in.** There
were three — the seat, the players list, and the dialog inside each — and they had already diverged
on the interesting question: what to do when a rebuy is NOT available. The players list drew the
button **disabled and silent**; the seating screen **hid** it. A director who set rebuys to 1 and used
it saw a greyed-out button on one screen, nothing at all on the other, and had no way to tell whether
the rule was working or the app was broken. Both now show it disabled **with the reason on it**, from
`rebuyUnavailableReason()` in `lib/entryLimits.ts`, so the wording lives with the rule.

A feature switched off for the whole tournament renders nothing, rather than a row of "Rebuys are
off" against every busted player: that is a setting, not a blocked action, and there is nothing the
director can do about it from there.

**Seating was the one path that could put a busted player back in a chair.** `eliminatePlayer` sets
`seated: false` and `tableAssignment: undefined` — that invariant is the whole reason the Busted
strip had to exist — and every part of the app honoured it except the part that hands out seats.
`SeatPlayersDialog` took the entire roster and filtered only on `seated`, so eliminated players were
tickable rows and Select All took them; `seatPlayersManually` then set `seated: true` on whatever it
was handed. **And the seat offers a busted player only a REBUY**, the KO button being gated on
`isActive !== false`, so the single way out was to put them back in the tournament for real.

`lib/seating.ts`'s `seatablePlayers()` gates it in **both** places — the dialog and the seating call.
Two gates for one rule is deliberate and is the `attemptAddPlayer` reasoning: a check in the dialog
alone is walked around by the next caller. An **Unseat** button on a seated-but-busted player clears
the chair for games already in that state; it is deliberately not a bust-out, since they are already
out and their finishing position and league result must not be touched.

### What kind of game it is, is decided before the first hand

The Standalone ↔ League slider was live for the whole game, and that was not cosmetic. League result
recording gates on nothing but the flag the slider writes — `PokerTimer`'s `syncLeagueResults` tests
`details.type === 'season' || settings.isSeasonTournament === true` and then records **every**
eliminated player not already in `processedEliminationsRef`, not only newly eliminated ones.

So flipping to League part way through a standalone night wrote the WHOLE game's bust-outs into
whichever league happened to be selected, silently, as real results. A director showing a colleague
what league mode looks like could corrupt a league's standings by doing it. Flipping back does not
undo it: the removal path only fires for a player who becomes *active* again, which is a rebuy, not a
mode change. The reverse direction is as bad — League → Standalone abandons results already written
and leaves a half-recorded game in the table.

This is the transfer-code failure wearing a new hat: *"their half of the night was recorded into their
own league with their own scoring, silently."*

`lib/tournamentMode.ts`'s `gameTypeIsLocked()` closes it, **at the first bust-out and not before**.
Until someone has a finishing position there is nothing to back-fill and flipping is a legitimate
correction — a director realising this should be tonight's league game after all. It is the moment
results become recordable that the choice stops being free. The lock applies **both directions**, and
`handleEnableLeague` re-checks it so no other caller can walk around the disabled button.

It says why. An unexplained dead control is what sent a director to ask what the slider does in the
first place.

**Already-contaminated data is not migrated.** Stray results come out through normal league admin; a
migration guessing which results were a demo and which were real is how a league loses its standings.

### A dismissal flag must never be its own effect's dependency

"Ignore for now" on the uneven-tables prompt could not work, and the reason is worth keeping.
`tableBalanceDialogOpen` was **both the effect's early-return guard and one of its dependencies**.
Dismissing set it false → the dependency changed → the effect re-ran → the guard no longer blocked →
the imbalance was of course still there, because ignoring an imbalance does not fix it → the dialog
reopened immediately. An instant loop, not a flaky dismissal, and it trapped a director who was
trying to go and rebuy the player whose bust-out caused the imbalance.

`lib/tableBalance.ts` owns the detection — untestable while it sat inline in the component — and the
dismissal is latched against **what was dismissed** (`imbalanceKey`: which tables, what gap) rather
than a bare boolean. The same imbalance stays waved away however often the roster is touched; a
*different* one re-arms the prompt, because that is a question nobody has answered yet.

**Two is the threshold, not one.** An odd field across two tables cannot be levelled, so prompting at
a one-player difference fires on a table nobody can fix.

The dialog also offers to **rebuy whoever just busted**, same as `FinalTableDialog`: the bust-out is
what created the gap, so buying them back in removes it rather than shuffling the tables around it.

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

**Railway hosts the app; Firebase is the database only.** `.github/workflows/deploy.yml` pushes the
static build to Firebase Hosting on every push to `main` — a stale, unused leftover, confirmed rather
than assumed. `/api/*` (checkout, the webhook) does not exist on that target at all, so if anyone ever
mistakes it for production, payments will look completely broken for a reason that has nothing to do
with the code. The file is left as-is; this is a note so a future "why doesn't the webhook fire"
investigation doesn't burn an hour rediscovering it.

**"Are payments active" is asked of the server, not guessed from a build-time variable.**
`useSubscription.ts` used to derive it from `!!import.meta.env.VITE_API_BASE_URL` — a variable that
answers "where does the API live" (empty is *correct* on Railway, where client and server share an
origin) and has nothing to do with payments. The two questions being conflated is what made turning
Stripe on a trap: setting the real `STRIPE_*` variables on Railway did nothing to the *client*, because
its flag was baked into the build from a variable nobody was setting either way. `GET
/api/payments-status` (`server/routes.ts`'s `paymentsConfigured()` — checking all three `STRIPE_*`
variables at once, the single place that question is answered) is the real signal now, fetched once
and cached at module scope. Turning Stripe on is now sufficient by itself: no separate client rebuild,
no second flag to remember. A fetch failure (network error, or an older deployment without the route
yet) is treated the same as "not configured" — every registered user stays Pro, exactly today's
behaviour, never silently un-Pro'd by an unrelated connectivity blip.

The `onSnapshot` listener on `users/{uid}` no longer demotes on a transient error either — it used to
call `setIsPro(false)` there, which flashed a paying customer's Pro features off for the length of a
reconnect. It now leaves the last known value alone and logs; a blip self-heals on the next successful
snapshot.

**`/api/create-checkout-session` takes `uid` and `email` from a verified Firebase ID token, never from
the request body.** It used to trust the body directly — anyone could POST any uid and any email, a
free "make Stripe email this address" primitive with no rate limit, and a completed payment would
upgrade whatever uid was named. `verifiedUser()` in `server/routes.ts` checks the
`Authorization: Bearer <token>` header with `getAuth().verifyIdToken()` — the same lazily-initialised
Admin app `getAdminDb()` already stands up, since `initializeApp()` is project-wide, not tied to either
product — and rejects an **anonymous** token the same way the Firestore rules reject anonymous writes
elsewhere (`isRegistered()`'s shape, applied server-side because this endpoint has no rules to lean
on): a QR participant's throwaway session is a real, verifiable Firebase session, but there is no
persistent account to attach a subscription to. `lib/rateLimit.ts` caps it at 5 attempts per uid per
10 minutes, in memory — an honest match for a single Railway instance, not a shortcut; it would need a
shared store before this ever runs on more than one.

**`customer.subscription.updated` is handled now**, per a policy that needed deciding rather than
guessing: a failed payment (`past_due`, `unpaid`) loses Pro **immediately** — usually accidental,
Stripe keeps retrying the card, nothing is lost by re-upgrading once it's fixed. A deliberate
cancellation is different: the customer already paid for the current period, so Pro lasts **until the
period actually ends**. That second case needs no special handling — Stripe leaves `status: 'active'`
for the whole remaining period regardless of `cancel_at_period_end`, and only transitions once the
period is over, at which point `customer.subscription.deleted` fires (unchanged, always free). See
`server/lib/subscriptionStatus.ts`'s `statusForSubscription()` — it only ever sees `status`, never the
`cancel_at_period_end` flag, which is the point being written down: "keep Pro until period end" falls
out of NOT special-casing cancellation, not from adding logic for it.

**Ordering, not just dedupe.** Every Stripe event carries `event.created`; before writing, the webhook
reads the user's stored `lastStripeEventAt` and skips anything not strictly newer
(`isNewerEvent()`, same module). Stripe does not guarantee delivery order and retries for up to three
days — without this, a retried `invoice.paid` arriving after a `customer.subscription.deleted` had
already been processed would re-grant Pro permanently, because the retry has no way to know anything
superseded it. Combined with the write already being `set(..., {merge:true})`, this also makes an
exact duplicate delivery a no-op, without a separate event-id ledger collection to maintain.

`checkout.session.completed` only grants Pro when `obj.payment_status === 'paid'` — it used to grant
unconditionally on that event type alone.

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

### Points per place is a bands table, and bands can scale with the field

`lib/pointsBands.ts` holds the shape: **places X to Y score N**, flat or as a multiple of the number
of players. A blank "to" means "and everything after"; a place no band covers scores nothing, which is
how "top twenty only" gets said.

**First matching band wins**, in the order listed. Overlaps are then harmless and predictable rather
than an error state the editor has to police.

It replaced a box per position, and the difference that matters is the multiplier. The grid could
already express a band by repeating a number seven times; what it could not do was make points scale
with how many played — **which is exactly what sent a director to the formula editor.** The "Scales
with the field" ready-made is now pure configuration: `pointsBands.test.ts` builds it from bands and
asserts it scores identically to the formula, position by position, across 2–40 players.

The two other ready-mades are square roots. Boxes cannot express those without inventing controls for
functions, so they stay as formulas to load. This removes the commonest reason to write one, not the
ability to.

**`bandsOf()` normalises on read**, the same trade `payoutsOf()` makes: a league that stored
`positionPoints` sees it as one-place bands and keeps scoring exactly what it scored. A test asserts
that equivalence, and it fails if the conversion is touched. **Never write `positionPoints` again** —
read it, convert it, leave it alone.

### Knockouts and turning up are bonuses, not a reason to write a formula

`lib/pointsBonuses.ts`'s `withBonuses()` adds **points per knockout** and **points for turning up** on
top of whatever scheme a league scores with — every type, custom included. Two rules almost every home
league has.

`knockoutPoints` and `participationPoints` were **declared on `PointsFormula` and read by nobody**,
described in a comment as applying "on top of any formula type". No UI offered them and no arithmetic
applied them, so wanting either meant writing a custom formula — which is a large part of why that
panel is the one directors find daunting. Fourth instance of the same pattern, after the league
columns, `showNextLevel`, and `b`/`c`/`z`.

They apply to **custom too**, deliberately. A custom formula can reference `k` itself, so setting both
counts knockouts twice — that is the director's business, and the points table shows it at once.

The table's rows are scored with **no knockouts**, because knockouts vary per player and a table
cannot know them. Rather than invent a number it says what is added on top: "+2 for turning up, +5 for
each knockout — on top of every figure above."

The custom panel carries **two worked lines** rather than a manual — `f==1 ? 100 : f==2 ? 60 : 30`
and `Math.round(10 * p / f)`, each read out in English — because the syntax is the daunting part and a
list of symbols does not teach it. They are the two shapes the ready-mades are built from, so both
have been seen once before one arrives. The ready-mades below are the real answer: load one and change
its numbers.

**The reference documents the functions, not only the variables.** It was headed "Available
variables" and listed six letters, while the ready-mades hand out `Math.round` and `Math.sqrt` — which
it had never acknowledged existed. A reference that omits half of what appears in the box is most of
what made this panel alarming. The four functions the presets use are named; a line says anything else
on `Math` works, because the engine passes the whole object.

**A loaded ready-made says which one it is.** `presetFor()` matches the box against the preset list —
exactly, so editing a character drops the line, since it is no longer that scheme. Anonymous symbols
are most of what alarms; named ones are just a formula.

### Points presets are custom formulas, not system types

`lib/pointsPresets.ts` holds three ready-made scoring schemes, loaded into the custom-formula field
beside the director's own saved formulas by the same Load button:

- **Scales with the field** — fixed multipliers of the field size, in bands, nothing past twentieth.
- **Rewards the bigger night** — `round(10*sqrt(p)/sqrt(f)) - 9`, where last place always scores
  exactly 1. The `-9` is what does that: at `f === p` the bracket is 10 whatever the field size.
- **Rebuys cost you** — cost-weighted, scaled ×100 because the app floors to whole points and the raw
  figures tie below about 8. The order is identical either way.

**A preset says what it does and what it suits, and names nobody.** Each carries a `bestFor` line —
"a league where surviving on your first buy-in should count for something" — which is the useful thing
to say in a footnote's place. They shipped naming the software and the person each formula came from,
in the interface, in an unrendered `source` field, in comments and in a test's `describe` block. A
director choosing how their league scores does not need to know whose formula it is, and the app is
not the place to advertise anyone.

**They are deliberately NOT entries in the points-system dropdown.** That lists KINDS of scoring —
logarithmic, square root, linear, fixed, custom — and a specific formula is an instance of the last
one rather than a sibling of the others. Listing one there would be like putting "Wednesday" beside
"weekly".

`pointsPresets.test.ts` **evaluates each preset the way `calculatePoints` does** and pins the banded
scheme position by position across 2–40 players and positions 1–25, so an edit cannot quietly change
what a league scores. It also asserts the properties any preset must have: it evaluates to a number rather
than throwing, and never scores a later finish above an earlier one.

That matters because a custom formula that throws **scores 0 for everyone, silently** —
`useLeagueSettings` catches, logs to the console and returns 0. The engine rejects on
`Number.isFinite`, not merely `isNaN`, because a formula dividing by a zero variable yields `Infinity`
— which is not NaN and was floored and shown as points.

**All six variables reach the scoring, and that is recent.** `b`, `c` and `z` were advertised in the
formula editor and passed by nobody: the points stored on a result came from
`calculatePointsFromSettings(position, totalPlayers, knockouts)` and nothing else, so all three were 0
in every result ever recorded, and the cost-weighted scheme — the one where rebuying costs a player
points — divided by zero.

`PlayerSection` meanwhile DID pass the buy-in for the chip beside a player's name, so a `b`-weighted
formula would have shown one number on the console and scored another in the standings. One fact, two
answers, again. Both call sites now use `lib/resultStats.ts`'s `buyInOf` and `investedIn`, the same
helpers the league columns use, and the preview passes representative values rather than nothing —
it claimed to show real scoring while feeding the engine zeroes.

Two evaluators exist for one formula, and they disagree. The dialog's "Formula valid" tick
string-replaces `p`/`f`/`b`/`c`/`k`/`z` with fixed numbers, tests **first place only**, and rejects the
long variable names (`position`, `totalPlayers`, …) that the real engine accepts. The **Points
Preview** below it calls the real `calculatePoints` and is the one to trust. Collapsing the two is
worth doing — same class as the rake formula and the duplicated timer.

### `'default-season'`

A synthetic season id used before Firestore resolves. Results tagged with it match no real season
and vanish from every filtered view. Guard with `isRealSeasonId()` from `lib/seasonProgress.ts`
before writing `seasonId` anywhere.

### The landing page is short on purpose

`components/ComingSoonGate.tsx` is the door AND the marketing — everyone who hears about StackMate
before launch arrives here. The unlock contract has not changed and must not: no
`VITE_ACCESS_PASSWORD` means open, a correct code sets `smgo_unlocked` and the app renders instead.

A long version of this page was written and cut the same day. Nobody reads a landing page; they scan
one. It is a headline, three lines of what it is, three short pillars and the pictures. **Adding a
paragraph here is nearly always the wrong instinct** — if something matters, it replaces a pillar.

**Screenshots go through the local `Shot` component, and the frame is load-bearing.** Every screen in
this app is near-black, and so is the page, so an unframed screenshot reads as a hole rather than a
picture. `Shot` also draws a labelled placeholder at the exact aspect ratio the real image will be
cropped to, so the layout does not move when one lands. Images live in `client/public/shots/`; bound
them before committing (this is the first thing anyone loads), and everything below the hero is lazy.

**The trust line leads with credibility, never with failure.** A draft was headed *"Built by people
who have lost a tournament"* — which reads to someone arriving cold as *lost tournament data*, the
one thing this category of software must never do. It says "made by people who know poker, and know
running a poker league" instead.

**A player never registers themselves**, in the copy as in the app: they scan a code and see the
night, including their own table and seat. "Check in" and "sign up" both read as self-registration.
See the comment block in the file.

---

## Architecture decisions worth knowing

### `client/src/lib/` holds pure, tested logic

Anything non-trivial and testable lives here with a colocated `.test.ts`, kept free of React and
Firebase imports so tests need no mocking. Follow this pattern rather than growing components.

| Module | Owns |
|---|---|
| `prizePool.ts` | Prize pool, rake and what one entry costs. **Rake is charged ON TOP of the buy-in**, so `net === gross` is deliberate, not a bug. Every money figure on screen comes from here. |
| `seasonProgress.ts` | Game numbering, games played, season completion, next-season dates. |
| `tournamentMode.ts` | Whether a tournament is a league game, and whether that can still be changed. An explicit flag wins either way; `leagueId` is consulted only when no flag exists. |
| `eventName.ts` | The display name, per above. |
| `sharedSnapshot.ts` | Refcounted Firestore listener sharing. |
| `eliminationOrder.ts` | Finishing positions, and the renumbering a re-entry forces. |
| `payoutTemplates.ts` | Payout percentages: non-increasing, ≥1 each, summing to 100. |
| `liveTournament.ts` | Which of an account's tournaments is the one being run right now. |
| `chop.ts` | Splitting the remaining prize money: ICM equity, proportional chop, and what is still on the table. |
| `resultStats.ts` | What a league result says a player spent and collected: investment, rebuys, add-ons, bounty money. |
| `entryLimits.ts` | Who may rebuy or re-enter, and until when. **Zero means unlimited**, for the cap and the period alike. |
| `prizeStructure.ts` | `DEFAULT_PRIZE_STRUCTURE` — the one default a game starts from. |
| `currency.ts` | The currency symbol and how money is spelled. |
| `ordinal.ts` | "1st", "2nd", "21st". |
| `tournamentClock.ts` | Seconds left, derived from the end time while running and the stored countdown while paused. |
| `localProgress.ts` | The local mirror of the game being run, and when it may be offered back. |
| `syncHealth.ts` | Whether a sync failure is worth telling the director about. |
| `syncReporter.ts` | The one streak for the whole app, and the only thing that raises the sync toast. |
| `speak.ts` / `announcements.ts` | The voice, and the wording it speaks. |
| `chimes.ts` | The two sounds the game makes. |
| `imageDownscale.ts` | Bounding an uploaded logo before it is stored. |
| `playerBadges.ts` | The chips beside a player's name. |
| `pointsBands.ts` / `pointsBonuses.ts` / `pointsPresets.ts` | Points per place, the two bonuses, and the ready-made schemes. |
| `seating.ts` | Whether a returning player's chair is still free. |
| `tournamentDocument.ts` | The single creation path for a tournament document. |
| `seatClaims.ts` | Who has checked in as whom — `claims`, a top-level map, playerId to device id. |
| `formulaEval.ts` | A custom points formula, evaluated without ever handing the string to a JS engine. |
| `leagueSettingsId.ts` | Where a director's CURRENT settings for one league live — a predictable document id, not a query. |
| `scopedStorage.ts` | Which account a localStorage key belongs to, and what signing in may adopt. |
| `setupSync.ts` | Whether the director's setup travels up to the account, down to this device, or stays put. |
| `accountWipe.ts` | What deleting an account removes, and the one order that does not strand it. |
| `finalTable.ts` | Whether to ask for a final table, and how to put the seats back if it is undone. |
| `tableBalance.ts` | Whether the tables are uneven enough to say so, and what a dismissal remembers. |
| `csv.ts` | Turning a table into a spreadsheet file, without letting a player's name execute in Excel. |
| `playerSeason.ts` | One player's season game by game, and its totals. |

**The same convention lives at `server/lib/`, for the same reason.** `subscriptionStatus.ts` (the
Stripe status → pro/free mapping, and whether an incoming webhook event is newer than the one already
recorded) and `rateLimit.ts` (a minimal per-key limit, in memory) are pure and colocated-tested exactly
like their client-side counterparts — `vitest.config.ts`'s `include` covers `server/**/*.test.{ts,tsx}`
alongside `client/src/**`. Route-level behaviour (headers, status codes, which handler runs) is tested
separately in `tests/server/`, with `stripe` and `firebase-admin` mocked via `vi.mock` — the same shape
as `tests/server/bodyParsers.test.ts`, and the reason both layers exist rather than one: the pure
functions prove the DECISION is right, the route tests prove it is actually WIRED to the right place,
which is exactly where an audit-shaped bug hides.

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
  anonymously, and the rule requires that session — but anyone can obtain one, so a determined
  participant can still claim or unclaim a seat that is not theirs. That is the whole gap now: the
  write reaches only the `claims` map (see "Check-in claims a seat through a map" above), which holds
  nothing but a playerId and a deviceId, so there is no route from here to a player's name, chips,
  position or elimination state — the thing this gap used to actually cost. Closing it fully still
  means writing server-side with the Admin SDK, which needs a service account key; **key creation is
  blocked by an organisation policy on this project**, so that route is not currently open.

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

**`TournamentParticipant.tsx` went the same way**, and was the last of that ghost: 405 lines built
round a `WebSocket` that never existed, reachable at two routes nothing linked to. Its join-by-code
flow was *denied by the rules* rather than merely unused — looking a game up by code is a `list` on
`activeTournaments`, which is owner-only — and the user was told "Tournament not found with that
access code", pointing them at the wrong problem. `participantCode` and `directorCode` went with it;
both were minted on every tournament and checked by nothing.

`docs/audit-2026-09.md` is the September 2026 audit: every finding with a file:line, a severity and a
fix, plus a section recording what was checked and found clean. It carries a status header naming
what has been cleared and what is still open, and why. Read it before hunting for something to
improve — it is a to-do list, unlike the archived plan below.

`docs/league-seasons-rework-plan.md` is the archived plan the League & Seasons rework was executed
from. Read it for *why* the model looks the way it does — the single `activeSeasonId` pointer, the
derived game number, league-as-scope in the Manage League dialog. It is a record, not a to-do list.
