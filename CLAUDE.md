# StackMate Go — working notes

A poker tournament timer and league manager. A **director** runs a game on a laptop or tablet;
**participants** join by scanning a QR code and see a read-only live view on their phones.

React + TypeScript + Vite, Firestore for data, deployed on Railway.

---

## Commands

```
npm run dev         # local dev server
npm run check       # tsc — MUST stay clean
npm test            # vitest, ~82 unit tests
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
  reverted: it silently denied handover directors mid-game, losing results with no error on screen.
  Update and delete remain owner-scoped. The proper fix is authorising by tournament, not league.
  See the director-handover test in `tests/rules/firestore.rules.test.ts`.
- **`leaguePlayers.totalPoints`** is a denormalised counter nothing reads — every table recomputes
  from results. It can only drift.
- **The rake formula is copy-pasted at ~11 sites.** `prizePool.ts` is canonical and tested;
  consolidating the rest is safe but touches money code in several components.

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
