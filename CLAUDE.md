# StackMate Go — working notes

A poker tournament timer and league manager. A **director** runs a game on a laptop or tablet;
**participants** join by scanning a QR code and see a read-only live view on their phones.

React + TypeScript + Vite, Firestore for data, deployed on Railway.

---

## Commands

```
npm run dev         # local dev server
npm run check       # tsc — MUST stay clean
npm test            # vitest, ~121 unit tests
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

**`?home=1`** means "I asked to be here": it suppresses both the pin redirect and the resume, and
clears the pin. New Tournament navigates there for exactly that reason — plain `/` would reopen the
game it just finished.

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
| `prizePool.ts` | Prize pool and rake. **Rake is charged ON TOP of the buy-in**, so `net === gross` is deliberate, not a bug. |
| `seasonProgress.ts` | Game numbering, games played, season completion, next-season dates. |
| `tournamentMode.ts` | Whether a tournament is a league game. An explicit flag wins either way; `leagueId` is consulted only when no flag exists. |
| `eventName.ts` | The display name, per above. |
| `sharedSnapshot.ts` | Refcounted Firestore listener sharing. |
| `eliminationOrder.ts` | Finishing positions, and the renumbering a re-entry forces. |
| `payoutTemplates.ts` | Payout percentages: non-increasing, ≥1 each, summing to 100. |
| `handover.ts` | Director handover: issuing, redeeming and burning transfer codes. |

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

### Season numbering is derived, never stored twice

`gameNumberFor()` is the single derivation. `settings.gameNumber` is written in exactly one place
(`PokerTimer`), from the season the UI is *displaying* — results are attributed to that same
season, so the screen and the database cannot disagree.

---

## Known gaps, deliberately left

- **Check-in writes are unauthenticated.** `PlayerClaimView` PATCHes the players array with no
  token. The rule constrains it to the `players` field with the array length preserved, which
  blocks deletion and injection but not editing an existing entry. Closing it means authenticating
  the write — see the note in `PlayerClaimView.tsx`.
- **Anyone registered can create league documents.** Scoping create to `ownsLeague()` was tried and
  reverted when it silently denied a handover director mid-game. Handover between accounts no longer
  exists, so that rationale has expired — this can probably be tightened now, but do it deliberately
  and with rules tests rather than as a drive-by. Update and delete remain owner-scoped.
- **`leaguePlayers.totalPoints`** is a denormalised counter nothing reads — every table recomputes
  from results. It can only drift.
- **The rake formula is copy-pasted at 9 sites**, and one of them disagrees.
  `useTournament.ts` `completeTournament` subtracts rake from the pool where every other site keeps
  it on top. It is exported but never called, so it is a landmine rather than a live loss.
  `TournamentParticipantView` shows a house-fee figure that omits re-entry and rebuy rake, so it
  disagrees with the director's screen; the pool itself is right, so payouts are unaffected.
  `prizePool.ts` is canonical and tested; consolidating the rest is safe but touches money code in
  several components.
- **`users` can be written by its own owner** (`firestore.rules`), including `subscriptionStatus`.
  Nothing in the client writes that collection at all — only the Stripe webhook, via the Admin SDK —
  so the fix is to drop `create`/`update`. Dormant until payments are switched on, but it must be
  done *before* that, not after. The webhook also reads `metadata.uid` off the subscription while
  the checkout session sets it on the session, which Stripe does not propagate.
- **League columns for Rebuys / Re-entries / Add-ons / Bounties display 0 forever.**
  `RealTimeLeagueTable` reads those fields off `tournamentResults`; `useLeague` never writes them.

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

`docs/league-seasons-rework-plan.md` is the archived plan the League & Seasons rework was executed
from. Read it for *why* the model looks the way it does — the single `activeSeasonId` pointer, the
derived game number, league-as-scope in the Manage League dialog. It is a record, not a to-do list.
