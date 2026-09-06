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

### A local game is persisted; a live one is not

`tournamentLocalProgress` holds the players and clock of a game that has **not** gone live, keyed by
`localGameId`. Restored only when `details.type !== 'database'`.

Players were never persisted, so a refresh always lost the roster of a local game — and once logging
out became a full page load, an ordinary action destroyed one.

It is **cleared the moment the game becomes a database tournament**: it stands in for a cloud copy,
and keeping it once there is one makes it a rival source of truth. That is precisely how a live game
was lost — a roster from before the game was saved survived a logout and was resurrected over the
real game two hours further on. **Never restore this into a live tournament:** its truth is
Firestore, and seeding it from localStorage is the same hazard `hasLoadedRemoteState` exists to
prevent.

The clock is deliberately restored paused. The page was away for an unknown time, so resuming a
running timer would silently be wrong.

### Resume only reopens a game that is plausibly current

Nothing deletes an `activeTournaments` document, so every game an account has ever taken live is a
resume candidate. Selection therefore skips anything marked `status: 'completed'` and anything not
touched in the last 12 hours, and sorts on a *parsed* timestamp — `String(value)` put a Firestore
Timestamp's `"[object Object]"` above every ISO string, so an old test could outrank tonight's game.

`updatedAt` is written on every player sync so "most recently active" is real rather than "most
recently created".

That selection lives in `lib/liveTournament.ts`, not in the resume effect, because the auto-save asks
the same question — see below.

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

### The piping round the clock is the level progress

`TimerCard` renders inside `.timer-frame`, whose conic-gradient border fills clockwise from twelve
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

It is stored with the other settings in localStorage and deliberately **not** written to the
tournament document: it is how this director likes their screen, not a property of the game. A
second device gets the default until it is set there too.

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

The participant view shows the signed-in account with a **Sign out**, not just a Sign In for
signed-out visitors. Without it, a director signed in as the wrong account had nothing to press on
that screen — no sign-out, and no Take control because they did not own the game — and the only
escape was clearing site cookies from browser settings. Naming the account is load-bearing too:
"which login is this?" was the unanswered question behind several rounds of debugging.

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

- **Check-in writes are only as strong as an anonymous session.** `PlayerClaimView` now signs in
  anonymously and sends a token, and the rule requires one — but anyone can obtain an anonymous
  session, so a determined participant can still edit a field inside an existing entry. The array
  length is preserved, so deletion and injection stay blocked. Closing it fully means writing
  server-side with the Admin SDK, which needs a service account key; **key creation is blocked by an
  organisation policy on this project**, so that route is not currently open.

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
