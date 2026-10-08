# StackMate Go — working notes

A poker tournament timer and league manager. A **director** runs a game on a laptop or tablet;
**participants** join by scanning a QR code and see a read-only live view on their phones.

React + TypeScript + Vite, Firestore for data, deployed on Railway.

---

## Commands

```
npm run dev         # local dev server
npm run check       # tsc — MUST stay clean
npm test            # vitest, ~1,330 unit tests
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

**There was nearly a third, and it is deleted.** `LeagueSettings` carried a `name` defaulting to
`'Main League'` that **nothing read** — one careless `settings.name` away from reproducing this
entire section with a value no screen can edit. It went; the interface says why, so it cannot come
back by accident.

**One name on that object IS real, and it is not on that object.** A saved points TEMPLATE has a
name, written by `saveSettingsToDatabase` as a **top-level field on the leagueSettings document**,
beside `userId`, `leagueId`, `settings` and `isDefault` — a sibling of the settings object, not a
field inside it. A director types it and picks it out of the Load list. `doc.name` is the template;
`doc.settings.name` is the thing that must not exist.

**And the event name beats the league name on purpose.** `eventNameOf` prefers
`branding.eventName` and only falls back to the league, because a league night is often called
something of its own — so a STALE event name shows on the app bar forever while the league panel
reads correctly, and the two disagreeing is the app working as specified rather than a bug. That was
reported as one: the app bar read "Main League" for a league called "Fish & Chips League", and the
value was sitting in the director's own Event Name field, carried between games by
`resetTournament`'s `keepStructure`. It only became visible when the app bar made the event name its
headline; before that it rendered only with venue branding switched on. **If the app bar and the
league panel disagree, look in Settings → Event Name before looking at the code.**

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

**And the creation path was writing the stale name itself** (October audit M18).
`lib/tournamentDocument.ts` stored `branding.leagueName = eventNameOf(settings, leagueName)` — the
league's name AT CREATION, in the legacy key, which `eventNameOf` reads as an EXPLICIT event name. The
snapshot merged it back into the console's settings, so it appeared in Settings → Event Name, a later
league rename never reached the app bar, and `keepStructure` carried it into every next game. That is
very likely the real origin of the "Main League" report above, rather than the director typing it.
Creation now writes the director's own branding and nothing resolved. The players' screens, which had
leaned on that frozen copy for their league fallback, read the league's CURRENT name with one `get`
through `hooks/useLeagueName.ts` (`leagues/{id}` is publicly gettable). Documents already carrying a
frozen name are not migrated — it cannot be told apart from a typed one — and it clears when Event Name
is emptied.

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

**The mirror is filed under the GAME's id, never the device's** — `lib/localGameId.ts`'s `gameIdOf`:
the local id for a local game, the document id for a game opened by its document. It asked for
`localGameId` alone, which a game opened on the director route never has, and fell back to the
device's own local id — minting one if there was none. So every device that RESUMED a game (each
handover, each second device) filed the live roster under an id that was not its own, the home
route restored it as a brand-new local game, and the auto-save saved that as a SECOND DOCUMENT and
pinned it; in a league game every player got a second result. October audit C1, and **M8 is the same
root**: the header's game number asked for `localGameId` too, could not see tonight's game was
already counted, and read one too high on every console that loaded the game. The recorder had
always asked correctly. Everything that keys on "which game is this" asks `gameIdOf` now.

Two guards beside it, both in `lib/localProgress.ts`:

- **`restorableAtHome` refuses a mirror whose two ids disagree** — the shape the old build left on
  every such device. It still restores a game saved FROM the home route, whose local id IS its
  document id: a refresh of `/?home=1` clears the pin, and that restore plus the auto-save's adopt is
  how such a game survives it.
- **`wouldClobberMirror`: an empty new game never overwrites another game's roster.** There is one
  mirror slot per account, and landing on the home route used to empty it — throwing away what may
  be the only copy of a live game whose writes are blocked.

`useTournament.mirror.test.tsx` drives the real hook across both routes; three mutants (the old key,
no refusal, no guard) each turn it red.

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
one — the single case where a director would want to know. **Nothing says so yet:** its one production
caller folds `corrupt` back into null, and `recoverableProgress` parses for itself behind a bare catch,
so a corrupt mirror still reaches nobody (October audit, doc drift). The distinction is ready for a
screen that wants it.

### A claim is released after the work, never before

`PokerTimer`'s rebuy path deletes the player's entry from `processedEliminationsRef` **after** the
`await removeTournamentResultForPlayer` resolves. It used to go first, and that was a real loss: on
failure the claim was already gone, so the next pass saw the player as unprocessed and `continue`d
straight past them. The stale league result was never retried and the player kept a wrong finishing
position **permanently**.

The elimination path ninety lines below always had it right — it releases the claim on failure
precisely *so that* the next pass retries, and toasts. Two paths, one rule, and only one of them
followed it.

**And the catch was unreachable anyway, because the removal swallowed its own errors** (October
audit M3). `removeTournamentResultForPlayer` logged and returned, so a failed removal looked like a
success: the claim was released, the stale result stayed, and on a re-entry renumbering the corrected
result was then written BESIDE it — two results for one game, counting twice in points, games played
and money. It rethrows now, and a corrected result is written only once the stale one has gone. (No
unit test pins the rethrow: `useLeague` has no test file. The recorder's decisions are tested in
`lib/leagueRecorder.ts`.)

**What is already recorded is read from the league, not from this tab** — `lib/leagueRecorder.ts`
(October audit H6). The claims lived only in this tab's memory, so a reload (an iPad evicting the tab)
or a takeover started empty: a re-entered player's old result was never removed, and when they busted
again the duplicate check found it and skipped the corrected one. A wrong place, for good — and every
finisher that re-entry renumbered kept a stale place too. The league's results for this game are the
record now, with this tab's memory first wherever it has an answer, because the results snapshot LAGS
this tab's own writes. Memory holds a position, or **0 for "this tab removed it"** — a tombstone, so
the lagging snapshot can neither veto a correction as a duplicate nor resurrect a removal. The
recorder waits for the league's results to load before deciding anything.

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

**And a slow write is not a blocked one** (October audit, Low). The 8-second verdict used to be final,
so venue Wi-Fi landing the probe at nine seconds left the red banner and *Not syncing* up all night over
writes that were all succeeding. `judgePreflight` in `lib/syncHealth.ts` lets the probe take the verdict
back if it lands late; a blocked write never lands, so a blocked browser is unaffected. The same
"a blocked write never settles" fact is why Reset, Delete and sign-out's release now go through
`lib/deadline.ts`'s `withDeadline` — each awaited Firestore with no bound and spun for ever on a blocked
browser, sign-out's release included, which this file promises never blocks.

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

### The director route remounts per game, and the next game is decided in storage

Two faults with one cause (October audit H4 and H3): **wouter keeps a route's component mounted when
only its params change, and replaces it outright when the route changes** — and the console assumed
neither.

**H4 — `pages/DirectorRoute.tsx` keys `TournamentDirector` on the tournament id.** Going from
`/tournament/A/director` to `/tournament/B/director` (the other-live-game banner, *Open that game*)
used to carry A's whole console into B: its state, its `hasLoadedRemoteState` latch (so B was written
before it was read), A's control fact labelled as B's, the held tournament id (so Go Live on B
published A), and every per-game memory — the pending roster, the result claims, the rebuy offer's
seen set. The clock sync then wrote A's level and blinds onto B. `TournamentDirector`'s own "this game
is yours" verdict carried across too. A key gives every guard in that tree the clean slate it assumes,
without each having to notice the id change. `DirectorRoute.test.tsx` drives wouter's real router; a
mutant dropping the key turns it red.

**H3 — `resetTournament` writes the new game's setup to storage, synchronously.** From the director
route, starting a new game navigates to `/?home=1`, a different route, so the console is replaced in
the SAME batch: neither the reset's `setState` nor anything a caller did afterwards ever committed,
and the new console rebuilt itself from storage. Next Game's chosen season, the slider's
"standalone" and Full reset's defaults were all silently lost — a casual night came up in League mode,
and a game was filed into the season the director had just ended.

So what the next game IS goes into the reset as `settings` (`startNewGame({ settings })`), which
merges it, sets the game's type from it, and saves settings, levels and prize structure before
returning. **`after` must not set anything about the new game** — only work that persists itself
synchronously, like `switchLeague`.

**Do not "fix" this by committing first and navigating after.** On the director route the URL still
names the old game, so the old console's players sync would write `players: []` over the live game
the instant the reset committed. The same-batch navigation is what spares it.
`useTournament.reset.test.tsx` resets the real hook, unmounts it without a further render, and mounts
a fresh one the way the home route does; dropping the synchronous save turns all four red.

### One writer per fact — a manual move had THREE

Moving one player to another seat by hand made the name flicker between both chairs before settling
in the right one. Three writes of the same roster went out for that single action:

1. `updatePlayers` fired `broadcastSeatingUpdate` on a **50ms** timer — from inside a `setState`
   updater, which React is free to call more than once;
2. it then fired `broadcastTournamentAction('seating_updated')` on a **100ms** timer, which called
   `broadcastSeatingUpdate` **again**;
3. and `PokerTimer`'s direct players sync effect wrote it properly.

Three writes, three snapshots, and the console's snapshot handler rebuilds every active player from
the incoming document — so until each write landed, the echo still had the player in the chair they
had just left. Flicker, then settle. Nothing errored, and the end state was correct, which is why it
read as a rendering glitch rather than as what it was.

**`PokerTimer`'s sync effect is the writer that survives.** It waits on `hasLoadedRemoteState`, skips
a payload it has already sent, records success only once the write RESOLVES, and reports failures
through `lib/syncReporter.ts`. The two broadcast paths had bare `console.error`s, no guard against
writing before the first read — the hazard the latch exists for — and keyed on
`details.type === 'database'`, the overloaded field nothing may key "is it saved" on.

**`broadcastTournamentState` went the same way, and it was worse.** It wrote EVERY field the three
sync effects own — the roster, the whole clock (level, secondsLeft, targetEndTime, isRunning, the
blinds, the levels, the notes) and the settings. A complete second copy of all three. So every
non-seating change went out twice: a bust-out, a rebuy, a chip edit, each level change, the end of
the tournament. Seven call sites, six of them running a write from inside a `setState` updater.

The effects win on every count, and the list is the argument for having one writer at all:

| | the three effects | the broadcast |
|---|---|---|
| Writes before the first read? | never — waits on `hasLoadedRemoteState` | yes, the hazard that latch exists for |
| Repeat payload | skipped | written every time |
| On failure | retried; success recorded only once the write RESOLVES | bare `console.error` |
| Reported | through `lib/syncReporter.ts` | invisible |
| Keyed on | `activeTournamentId` | `details.type === 'database'` — the overloaded field |

Nothing replaced it, because nothing needed to: every field it wrote has a guarded owner, and a
level change moves `currentLevel`, `targetEndTime` and `isRunning`, each a dependency of the clock
effect. Check that before adding any "broadcast" back.

**`broadcastTournamentAction` survives, and writes nothing.** About a dozen actions still call it; what
is left of it dispatches the CustomEvents listed below as heard by nothing. Its empty `database` branch
and unused payload went with the October audit. It is a candidate for deletion with those events, not
a place to put a write.

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

### One device drives a game, and the lock lives inside the one door

`lib/directorControl.ts` decides; `activeTournaments/{id}.controllingDeviceId` records it. **This is
the third handover mechanism, and the section above about not building one is why it has the shape it
has** — the first two failed on the SAME thing, and neither failure was the idea.

The transfer code moved `ownerId` between accounts, so the receiving director's league and points
system silently claimed half the night. This does not touch `ownerId` or the account at all: one
login, one league, one scoring scheme, throughout. The device lock (`activeDeviceId`) was
**half-enforced** — the broadcast chain stood down and the direct `updateDoc` writers kept going, so
the device without control still wrote the roster and reverted the other's rebuys. **That is what the
one door was built for.** A rule enforced in three places out of twelve is not a rule; this one is
enforced in the single place every write passes through, which is why the door landed as its own
commit first.

Three states, and `unclaimed` is load-bearing: **every game written before this shipped carries no
holder**, so an absent field means "write freely, and claim it" rather than "someone else has it".
Refusing to write until a claim landed would make the lock's first act be freezing every game in
flight — the same instinct as `payoutsOf()` normalising on read rather than migrating documents. It
leaves a window where two devices both see `unclaimed` and both write, which is exactly today's
behaviour and closes within a round trip.

**Claiming is automatic; taking is not.** A console claims a game nobody holds, after
`hasLoadedRemoteState` — claiming a game this device has not read would be asserting control over
something it knows nothing about. It never takes control on sight, which is precisely the removed
lock's worst property: whichever device loaded last won, and the other went read-only mid-game.

**Take control must ALWAYS win, and there is no timeout, heartbeat or automatic steal.** A director
whose other device has a flat battery or is at home on the kitchen table must not be locked out of
their own tournament — that is worse than the problem this solves. One explicit press, by the person
standing there, through a TRANSACTION for the reason `lib/seatClaims.ts` gives: it reads the live
holder before writing, so two devices cannot both come away believing they claimed an unheld game.

**The gate is not only on the live document.** `completedTournaments` and `tournamentResults` are
different collections, so the door does not reach them, and the league recorder is the most expensive
thing a second console can get wrong: it records EVERY eliminated player not already in
`processedEliminationsRef`, which is **per tab in memory**, so a second console shares none of it and
would re-record the whole night. `recordResultByName`'s dedupe is cloud-backed rather than in-memory
and catches it, but the gate is there so it never has to.

**The read-only console says so in three places, and the timer's transport is REPLACED rather than
disabled** — and since then so is every other control on the page; see the section below. An amber `Read-only` chip in the app bar (`lib/statusChip.ts` — it beats Broadcasting for
the same reason a blocked browser does, and loses to one, because that is the fault a director can
actually fix from this device), an amber banner reading *nothing you do here is being saved*, and a
line where Start and Next were. A row of greyed buttons says "broken"; a line of text says what is
true. **Amber, not red: nothing is broken and nothing is at risk** — the game is being run properly,
just not here. The digits stay, because they keep tracking the real game through the snapshot and are
the one thing a second screen is genuinely good for.

**Control names the TAB, not just the device** — `lib/consoleId.ts`, `<deviceId>#<tabId>` (October
audit, Low). `getDeviceId()` is shared by every tab of a browser, so two tabs on one laptop were both
`mine` and both drove the game. The tab id is in sessionStorage so a RELOAD keeps control; a DUPLICATED
tab copies sessionStorage too, so each console announces its id on a BroadcastChannel and the newcomer
re-mints if anyone answers — the original keeps the id and the control. **A claim written before this
(a bare device id) reads as `unclaimed` on that device** and `other` everywhere else, so the deploy did
not turn every console read-only mid-game; the first tab to load claims it in the new shape. Check-in
still uses the bare device id: a claimed seat belongs to the phone, not a tab.

**A takeover reaches the other device for free.** It holds an `onSnapshot` on the document, so the
field changing is all it takes; nothing is pushed at it and no local state is set on either side.

**But Take control is not a page reload, and that gap was real.** The logout-handover's full page
load is documented above as load-bearing precisely because it DISCARDS in-memory state. Taking
control does no such thing — the read-only console brings whatever it has been holding, and the
snapshot handler does not adopt the document, it **merges**, with every rule about `players` biased
toward local: a locally-busted player stays busted, `knockouts`/`rebuys`/`reEntries` take
`Math.max`, a player absent from the document is appended back, and `prizeMoney` prefers the local
value. Those rules are CORRECT for the device driving the game — the console busts a player out
optimistically and must not have its own echo resurrect them — and wrong for one that has been
standing down.

**The divergence was sticky.** They run on every snapshot, so a read-only console prodded once never
healed, and the takeover then wrote the staleness over the real game. A read-only console USED TO BE
easy to prod — only the timer transport was replaced, while the Players tab, KO, rebuy and seating
stayed live. It is not any more (see "A read-only console shows the game" below), which makes this much
harder to reach; `shouldAdoptRemote` stays regardless, because a device that was DRIVING and then lost
control still carries whatever it held, and that is the transition it was written for.

`shouldAdoptRemote(previous, next)` is the fix, and **the exclusions are the whole design** — both
would be worse than the bug it closes:

- **`unclaimed` → `mine` must NOT adopt.** That is the automatic claim, and a device that has just
  created a game legitimately has a roster AHEAD of the document, with the sync effect not yet
  fired. Adopting there wipes the players just added: the `hasLoadedRemoteState` hazard with the
  sign flipped.
- **`mine` → `mine` must NOT adopt.** That is every ordinary snapshot, including this device's own
  echo, so adopting would undo each bust-out the instant it came back.

Only `other` → `mine` qualifies, because only after standing down is local state stale rather than
optimistic. A test asserts every transition and a mutant widening it to `next === 'mine'` turns
three red.

Two implementation details that are not incidental. **`adopt` is computed BEFORE `setState`**, since
React may call an updater more than once and this is a one-shot transition that must advance the ref
exactly once per snapshot. And **the ref resets when the listener re-subscribes**, or the first
snapshot of a DIFFERENT game could read as `other` → `mine` and adopt — a control fact belongs to
one game, exactly like a held tournament id.

**A console that is only watching takes the document's roster outright** — `takesDocumentRoster`
(October audit M14): a takeover, as above, or any snapshot while this device may not drive. The
local-biased merge kept the driving device's rebuys, re-entries, undos and removals from ever reaching
a read-only second screen — a rebought player stayed busted there all night. A watcher has nothing
local worth protecting. The two exclusions above still hold for a device that IS driving.

**Only `players` was ever biased.** `levels`, `settings`, the clock (via `secondsLeftFrom`),
`ownerId` and `isPublished` already take the document's value, which is what kept the fix narrow.

**This does NOT retire the logout.** A handover to a DIFFERENT account still has to be a sign-out —
transferring `ownerId` was removed because the league and points silently followed the wrong account
— and the pin/resume is still built around it. What Take control replaces is the sign-out dance for
two devices on ONE account, which is the common case.

**What this does NOT fix on its own** is the case it was built from — a director with a live game on
their phone opening a laptop and starting a SECOND game 5. Two devices minting two `localGameId`s
make two DOCUMENTS, and a lock on one document says nothing about the other. The lock keeps two
consoles off one game; the section below is what stops them being put on two.

### Control is HANDED BACK, and nothing ever handed it back

Reported live, mid-tournament. The two-logins-one-account handover worked. Then, on a third
device, signing in as a different account showed **"This game is being run on another device"** —
about a game nobody was running.

**It was not a cross-account bug, and every defence named above behaved.** The resume query is
owner-filtered, the pin is cleared unconditionally on sign-out, and `TournamentDirector` refuses a
game owned by someone else. What happened was simpler:

1. Each test account **owned its own** abandoned game from home testing, inside the 12-hour window
   and never marked `completed` — a legitimate resume candidate, so the app reopened it.
2. That game's `controllingDeviceId` still named the iPad, because **nothing in the codebase ever
   cleared it.** `git grep controllingDeviceId` found exactly one write, and it only ever SET — not
   on completion, not on sign-out, not on teardown.
3. So `controlOf` said `other`, and the console asserted a fact it could not know.

**The consequence generalises far past that night:** every game an account had ever taken live
carried a holder for good, so ANY new device opening ANY old game was read-only until somebody found
Take control. Run a game on the laptop, open it next week on a tablet, and you are locked out of
your own finished tournament.

**Three changes, and the shape of them is the point: control is RELEASED by the holder, never TAKEN
by a timer.**

- **`releaseLiveGameControl`** in `lib/liveGameWrite.ts`, a transaction beside the claim and for the
  same reason `lib/seatClaims.ts` gives: it reads the live holder and clears the field **only when
  the claim is ours**. A device can give up its own control and can never strip anybody else's. A
  mutant dropping that check turns two tests red — it would make signing out on any device the
  automatic steal the claim's own comment rules out, arriving through the back door.
- **Sign-out releases**, because logging out IS the handover in this app. Side effect worth knowing:
  the receiving device now finds the game `unclaimed` and picks it up by itself, so a handover no
  longer needs Take control pressed.
- **Completion releases**, one field added to the `status: 'completed'` write that already existed.
  Safe by construction — that effect returns early when `readOnlyConsole`, so only the holder reaches
  it.

**A THIRD release, and it is the one that explains why two were not enough.** The automatic claim
plants this device as the holder of **every** game it opens, while sign-out and completion each act
on exactly ONE game — the one being held at the time. So opening game A and then moving to game B
without signing out left A held by this device for good, and that is how a night of testing left a
pile of old games stuck behind a banner about a game nobody was running.
`hooks/useReleaseControlOnLeave.ts` hands back the game the console has moved OFF. **A console drives
one game at a time, so holding a claim on a game it has left is never right.**

Moving to NO game counts as leaving, and is the commonest route: New Tournament makes the game local
again, so `consoleTournamentId()` returns null.

**It is a HOOK rather than six lines inside `PokerTimer`, and the reason is the test.** What can go
wrong here is not which game to release — it is whether the effect fires at all, and whether it fires
too often, and an effect inline in that page has neither test by construction. `useRebuyOffer.test.tsx`
is the precedent for driving one across real state changes.

**The `previous === current` guard looks like defence and is not.** The dep array already stops the
effect re-running on an unchanged id, so the only way to arrive with them equal is for one of the
OTHER deps to change — and **signing in does exactly that while the console sits on a game.** Without
the guard, the sign-in releases the game this device is driving, at the moment it starts driving it.
A mutant dropping it survived every test until a fixture flipped `signedIn` with the id held still;
that test is the one that catches it.

Six mutants are caught. The one worth naming is "release on every render": this page re-renders once
a second because that is how the clock advances, so that mutant is a Firestore write a second — the
shape that once plausibly exhausted a day's write allowance in an evening.

**Verified by driving it, as far as offline Firestore allows.** The A-to-B transition cannot be
reached in the devstub, because `activeTournamentId` needs a real document. What was confirmed there
is the half most likely to be wrong anyway: the hook mounts, its effect runs **once**, and it does
not run again across four seconds of clock ticks. Instrumented behind a `RELEASE_PROBE_REMOVE_ME`
marker and removed by grep — and note `git grep` reports nothing for a file that is still untracked,
so the removal was asserted on the content instead.

**Games claimed BEFORE any of this shipped keep their stale holder**, and nothing sweeps them —
a bulk rewrite of live documents on a guess about which are abandoned is not a migration worth
having. Each clears with one Take control, or on its own the next time the holding device signs out
while on it.

**The sign-out ordering is load-bearing and there is a rules test for it.** The release is an
ordinary owner write, gated on `isExistingDocOwner()`, so it must be **awaited before
`signOut(auth)`** — afterwards there is no `request.auth.uid` and Firestore refuses it, and a
fire-and-forget release loses the same race against the full page load that follows. `test:rules`
asserts the owner can release, a signed-out client cannot, and a stranger cannot.

It is **best effort**: a failure logs and sign-out proceeds. Being unable to release a claim must not
trap somebody signed in. And the id comes from the pin rather than `consoleTournamentId()`, which is
the honest answer but lives in `PokerTimer`'s state and cannot be reached from `useAuth` — the pin
names the console's game in every ordinary case, and where it does not this simply does nothing.

**Deliberately NOT released on New Game.** A director starting a second game has not finished the
first, which may genuinely still be running on the other device — that is what `otherLiveGame()` and
`NewGameGuardDialog` exist for, and releasing there would hand it away.

**And NOT on a timeout, which is the one thing that must not be added.** A tournament break is twenty
minutes of silence and indistinguishable from an abandoned game, so idleness can never be the signal
— the reasoning already recorded under Take control, unchanged.

**The banner said something it could not know.** *"This game is being run on another device"* was
reported as plainly wrong, and it was: the holder was an iPad at home. All the app has is a device id
in a field. It now says a device **has control**, names when it was claimed, and puts the way out in
the sentence — at all three sites that repeated the claim (`controlLockReason`, `DirectorOnly`,
`TimerCard`), so the screen cannot say three different things.

**"Nothing you do here is being saved" STAYS**, and a test that already existed is why: its comment
records that a read-only console which merely looks normal is how the half-enforced lock cost a
director their rebuys without anybody noticing. The first reword dropped it and that test went red,
correctly. Only the false half goes. The assertion is now pinned from both directions — a mutant
restoring *"being run on another device"* turns a test red, and so does dropping the not-saved
warning from **either** branch, which needed the timed branch asserting more than its timestamp.

**What this does not fix, and cannot safely:** a game abandoned without finishing or signing out —
a closed tab, a flat battery — still reads as held, because no signal distinguishes it from a game in
progress. The honest banner and Take control are what cover it.

**Verified with the emulator and a forced state.** The rules test is the real end-to-end check, since
the devstub's Firestore is offline and cannot exercise either release. The banner was read on screen
through the devstub with control forced behind a `FORCED_CONTROL_MARKER_REMOVE_ME` comment, removed
by `git grep` afterwards — the procedure this file prescribes, because the patch that once made every
console read-only shipped by being removed from memory instead.

### A read-only console shows the game, it does not offer to change it

`components/DirectorOnly.tsx`, and the rule is **not mounted, not disabled**.

The second device used to render the whole editor and let `lib/liveGameWrite.ts` skip the writes. So
the screen responded to every press and nothing happened, under a banner saying nothing was being
saved. Reported twice as crazy confusing, and fairly: an amber chip does not undo a button that looks
like it works.

**The prompts were the sharp end, and they were worse than "you can press things".** `RebuyOffer`,
`FinalTablePrompt` and the uneven-tables dialog all open off a predicate over `state.players`, which on
a device that is not driving arrives **by snapshot from the one that is**. None of the three had any
control gate. So a second console did not merely accept input — it interrupted whoever was holding it
with a dialog asking them to decide something about a bust-out that had happened on somebody else's
screen, and their answer went nowhere.

**Why non-mounting rather than disabling.** Disabling is a rule at every button, which is the "three
places out of twelve is not a rule" trap this codebase has paid for twice — and the next person adding
a control to the Buy-in tab has to remember. A control that is not rendered cannot be pressed and needs
no discipline from future code. Same argument the tab structure already leans on: `TabsContent` has no
`forceMount` anywhere, which is what makes putting something in one tab actually remove it from the
others.

**A single `inert` wrapper was considered and is not possible.** Take control, the read-only banner, Go
home and the six `TabsTrigger`s are flat siblings of every mutating card inside `PokerTimer`'s one
container, with no intermediate grouping element — so one inert region would take the way out with it.
Do not add one without moving the banners first.

What a read-only console shows, all decided in `PokerTimer`'s render:

- **Players and Seating show the VIEWERS** — `PlayerSectionReadOnly` and `TablesSectionReadOnly`, which
  already existed for the participant view. The console's `tournament` carries the shape they declare,
  so it passes its own state in; the participant view needs its `tournamentForComponents` adapter only
  because it holds a raw document. Swapping `TablesSection` out **removes the uneven-tables prompt for
  free**, since that dialog lives inside it.
- **Buy-in, Levels, Settings and Share carry one line of text.** Share is in that list because Go Live
  publishes the game. **All six triggers stay** — a tab row that changes shape between the two devices
  is the bug already fixed once when the League tab came and went, and on a phone `TabsList` is a
  four-column grid.
- **Gone:** the mode slider (`TournamentInfoCard`'s `readOnly` hides only that), Next Game and Manage
  League (`LeagueSection` has had a `readOnly` prop all along that `PokerTimer` never passed), and the
  local-mirror **restore banner**, which was found during the sweep rather than reported — its button
  writes the roster, and a device that is not driving must not offer to restore a mirror over the real
  game.
- **Still live, deliberately:** Take control, the banners, Go home, the history dialog, tab switching,
  the account menu, fullscreen, the standings, and the **Chop calculator** — a chop is arithmetic on
  stacks typed into the dialog and changes nothing, so refusing it would cost a tool for no gain.

A line of text, not greyed-out buttons, and **not amber**: nothing is broken and nothing is at risk —
the game is being run properly, just not here. The chip and the banner carry that; `DirectorOnly` is
only the hole where a control was.

**Measured, not eyeballed**, through the devstub with control forced and a `git grep` marker (the patch
that shipped once and made every console read-only is why the marker is not optional). Read-only: **0
enabled buttons and 0 inputs on all six tabs**. Driving: Structure 15 buttons / 11 inputs, Levels 21 /
36, Settings 12 / 3, Seating 4 / 2, and the slider back. The contrast is the proof; a screenshot is
not, because a disabled-looking button and an absent one photograph the same.

### `isFinalTable` is a fact about the game, so it lives in the game record

It did not. `lib/tournamentDocument.ts`'s creation whitelist never carried it and no sync effect wrote
it, so **the only place it has ever been persisted is the per-device localStorage mirror** — which is
keyed per uid on that device and reaches nobody else. It existed solely in the local state of whichever
device collapsed the table.

So a second device, on a game already at its final table, had `isFinalTable === false`. And
`!isFinalTable` is the ONLY thing suppressing the prompt: `shouldPromptForFinalTable` asks whenever the
field fits one table, more than one player is left, and somebody has busted — all true by definition at
a final table. **The question was due, and had been for a while.**

**It surfaced on Take control**, which is what made it look like a takeover bug: a read-only console does
not mount `FinalTablePrompt` any more, so the prompt mounted for the first time the instant control
flipped, evaluated a predicate that had been true for twenty minutes, and opened. The dialog was new;
the wrong answer under it was not.

**There were TWO causes, and fixing one would have looked like fixing none.** Besides nothing writing
the field, `useTournament`'s initial `getDoc` transform hard-coded `isFinalTable: false` — so the flag
could be written, arrive, and be discarded by the very load path a device uses to open the game. It
reads `tournamentData.isFinalTable === true` now. The identical line in `resetTournament` is a NEW game
and is correct; leave it.

**The write rides in the players sync effect**, because `goToFinalTable` and the return paths
(`consolidationAfterReturn`) both rewrite the seats and the flag in one `setState` — that effect is already the write carrying the redraw.
No new effect and no extra traffic.

**And the echo had to be guarded, or this would have been the rebuy revert with a new field name.**
`...data` spreads the document over local state, so the echo of the previous write arrives still saying
`false` and undoes the collapse on screen. `keepLocal` is computed once and used TWICE — for the roster
merge and for the flag — because they travel in one payload and are therefore pending under exactly the
same condition. Not applied when `adopt` is set: a takeover means local state is stale rather than
optimistic. `preFinalTableSeating` is held on the same condition, since it moves with the flag.

**`lib/pendingRoster.ts` now exports `rosterPayload`, and that is the load-bearing part.** The write
guard and the echo guard must serialise the IDENTICAL thing. Serialising the roster alone in the effect
would skip a write that only moved the flag as "unchanged" — and the opposite mismatch is worse: a
reader comparing a narrower shape than the writer recorded leaves the roster pending on every snapshot
for the rest of the night, so the console stops applying the document at all. One builder is the only
thing that makes both impossible. A mutant dropping the flag from it turns two tests red; a mutant
making the reader serialise only players turns five red.

**The existing unit test is the warning here, not the safety net.** `finalTable.test.ts` has always
asserted *"does not ask once it is already the final table"* and has always passed — **because the test
hands the predicate the flag the app never persisted.** The predicate was never wrong. A green test over
a real bug, because the test supplied what production did not.

**STORING IT WAS NOT ENOUGH, and could not have been — the prompt was reported a second time.** Four
players on an established eight-seat final table, on BOTH devices. The flag had only ever lived in the
per-device mirror, which is never auto-restored for a live game, so once both devices reload onto a
build that reads the field, **neither holds `true`, nothing is left to write it, and the document stays
empty for good.** A stored fact cannot be recovered for a game that was already under way.

So it is **derived as well as stored**: `alreadyAtOneTable(players)` — every player still in, seated, at
the same table. Preferred-then-derived, the `payoutsOf()` shape, and the derivation is what fixes games
already running. **The question "should we go to the final table?" means "should we consolidate onto one
table", and if everyone is already sitting at one the answer is definitionally no** — the only thing the
collapse adds there is a random redraw, which is a different action and already lives in the Seating tab
as Randomize.

It is **conservative on purpose**: an active player unseated, or seated with no table, makes it false. A
director who never touches the seating chart must still be asked, or a genuinely due question would be
suppressed. That conservatism is what keeps the `field()` fixtures in `finalTable.test.ts` — which seat
nobody — asserting exactly what they did before.

It also answers something the flag never could: **a tournament that has only ever used ONE table has no
final table to go to**, and was being asked on every bust-out regardless.

**Two existing assertions had to be reversed, and the FIXTURE was the thing that was wrong.**
`nineAcrossTwoTables` seated 9 as **8 + 1** — a seating no cardroom would make — so busting the lone
player on table two left the other eight already sitting together, and "the field now fits one table"
and "the field is already AT one table" were the same state. The file was asserting that the prompt
fires in a game needing no consolidation. It is 5 + 4 now, and the bust-out leaves 4 + 3 across two
tables, which is what the prompt is actually for. Three mutants are caught: dropping the derivation
turns two red, making it unconservative four, and counting busted players' old chairs three.

Two things left deliberately:

- **`preFinalTableSeating` is still not written**, so undo stays on the device that collapsed the table.
  Not for size — it snapshots only ACTIVE players, so at a final table it is under 2 KB against a limit
  the roster already dwarfs. It is also absent from `LocalProgress`, so the undo snapshot does not
  survive a refresh even locally.
- **`dismissedAt` and `silenced` stay per-device**, for the reason recorded below them: they are
  preferences about a QUESTION, not facts about the game, and in `state` they would sync to every
  participant's phone. So a device taking control can still be asked once about a final table that is
  genuinely due but was answered "Not yet" elsewhere. Different question, far less wrong.

**A game that was already at a final table before this shipped carries no stored flag**, so the driving
device keeps its local `true` and a second device will still ask once. Nothing is migrated, per the
`payoutsOf()` trade.

**Nothing on a participant's phone or a read-only console says "final table" yet** —
`TablesSectionReadOnly` renders `Table 1` and cannot even be passed the flag. Now possible for the first
time, since the fact finally reaches those screens.

### A snapshot must not revert a change this device has not had written yet

`lib/pendingRoster.ts`, gating `lib/snapshotMerge.ts`'s `keepLocal`. The mirror image of
`shouldAdoptRemote` above, and the two belong together: that one asks when local is too STALE to keep,
this one asks when the document is too OLD to apply.

The merge rules are biased toward local for **eliminations only** — the console busts a player out
optimistically and must not have its own echo resurrect them. **Every local change in the other
direction was left exposed to that same echo.** One second after a bust-out the document legitimately
says the player is out, because that is this device's own write coming back, and rule two —
*"eliminated in the document, active locally: allow it"* — put them straight out again.

**And the revert was WRITTEN BACK, which is what makes it a data loss rather than a flicker.** The
revert changes `state.players`, which fires the players sync effect, which sends the busted roster as a
third write. So: bust Amy out, press Rebuy, and a second later she is busted again — on the screen and
in the document, for good. The failsafe Rebuy failed identically, being the same `processRebuy`. The
final table lost its seat redraw the same way through the both-active rule, and because `isFinalTable`
survives (nothing writes it) the prompt never asked again, so a director saw a dialog that did nothing
and never came back.

**Nothing about the race was new, and that is the point.** The rebuy used to be a button that lingered
for the whole rebuy period, so it was always pressed minutes after the echo had landed. Making a rebuy
immediate — which is what a rebuy is — moved it inside the window. A latent race is invisible until
something makes the app faster than it was.

The rule: **a device that is driving the game is the only writer, so a snapshot can tell it nothing new
about the roster until its own writes have landed.** "One writer per fact", applied to the read side.

The fact needed already existed. `lastSyncedPlayersRef` holds the payload last *successfully* written
and is advanced only on `'written'` — never on a skipped or failed write — so "the local roster differs
from it" is exactly "a write is outstanding". `pendingRoster.ts` keeps the same string at module scope,
for the reason `liveGameWrite.ts` and `syncReporter.ts` keep theirs there: the writer is an effect and
the reader is a Firestore callback, neither with a route to a provider.

Four things are load-bearing:

- **Nothing pending before the first write.** Answering `true` there would stop the first snapshot
  seeding the roster — the `hasLoadedRemoteState` hazard with the sign flipped, and how a resumed game
  would come up empty.
- **`adopt` beats `keepLocal`**, and the order in the code says so. A takeover is the one case where
  local is stale rather than optimistic.
- **`mayDrive` gates it.** A read-only console's writes are skipped by the door, so its last-written
  payload never advances and its roster would read as pending for the rest of the night — it would stop
  tracking the game it is only there to watch.
- **Asked inside the `setState` updater**, against `currentState.players`: the question is about the
  roster React is about to replace, not the one on screen when the snapshot arrived.

Self-clearing, so the window is exactly as long as the hazard. Three mutants are caught: dropping
`keepLocal` turns three tests red, swapping it ahead of `adopt` turns one red, and making it pending
before the first write turns two red.

**Still outstanding here: `...data` spreads the whole document over local state** in the snapshot
handler, which is this same fault for every non-player field. It does not bite today because nothing
writes the fields that would clobber anything — `lib/tournamentDocument.ts` does not create
`isFinalTable` — but a whitelist there is the medicine `tournamentResults` already takes.

**There was a second, unreachable copy of the merge rules, and it is deleted.**
`handleTournamentSync` in `useTournament.ts` listened for a `'tournament-sync'` CustomEvent that
**nothing dispatched**, re-implementing the elimination protection inline and spreading a whole
tournament over local state; `PokerTimer` registered a second listener for the same dead event. It
cost nothing while it sat there — the harm was that it was a *rival* copy of the rules this section
is about, in the same file, one revived dispatch away from fighting `lib/snapshotMerge.ts`. Its
`syncTimeoutRef` went with it.

**It is not the only dead wiring, and the rest is left deliberately.** `useLeagueSettings.ts` listens
for `leagueSettingsChanged`, which nothing dispatches either, and ELEVEN events are dispatched with
no listener anywhere (`tournamentStateChanged`, `leagueDataChanged`, `playerAdded`, `knockoutAdded`,
`knockoutSync`, `playerEliminated`, `playersUpdated`, `settingsUpdated`, `tournamentDetailsUpdated`,
`leagueKnockoutAdded`, `tournamentActionBroadcast`). Only `leagueSwitched` has a live round trip
(`useLeague.ts:92/100`) — the one pattern to copy if a custom event is ever genuinely wanted. They
are recorded here rather than swept because a dispatch nobody hears is inert, where a rival copy of
the merge rules is a trap.

### "Do not reopen mine" is not "do not tell me about theirs"

`lib/liveTournament.ts`'s `otherLiveGame()` and the banner it feeds. The other half of the control
lock: that one keeps two consoles off ONE game, this stops a second one being created.

**The app already knew the answer and nothing asked it.** `findCurrentLiveTournament()` is the single
derivation of "which game is this account running", used by the resume and the auto-save's adopt
guard. It was never consulted at the moment that mattered, because **both resume effects are gated and
both gates are load-bearing**:

- `PokerTimer` returns early when `activeDirectorTournamentId` is set — *before* the Firestore read —
  so a pin naming LAST NIGHT'S finished game stops the lookup dead. That is how a laptop sat on a
  finished game 4 all evening while a phone ran game 5.
- `?home=1` suppresses it as well, and correctly: that parameter means "do not reopen the game I just
  left", and New Tournament depends on it.

Neither gate may change. So the question is asked separately, past both of them, and can only ever
produce a sentence and a button. **Conflating "do not reopen mine" with "do not tell me about theirs"
is the whole bug.**

**It delegates rather than re-filters.** `otherLiveGame` calls `findCurrentLiveTournament` and then
drops the result when it is the game this console is already on. A second `status`/recency filter here
would be a fourth notion of "which game is current" — the thing `activeSeasonId` exists to have
killed.

**Passing `consoleTournamentId()`'s answer is what keeps this banner and the read-only banner mutually
exclusive.** A console that IS on the game gets null back, so the two can never both be on screen
saying different things about one game. A test asserts that clause and fails if it is removed.

**It offers and never jumps** — the console stays exactly where it is. Same rule as
`recoverableProgress()`, for the reason recorded above: the automatic restore lost a game precisely
because nobody was asked.

**A read, not a listener**, in the component that re-renders every second; and a failed read says
nothing at all, because not knowing must never produce an accusation — the same distinction
`pinIsDead()` draws between `missing` and `error`.

**Next Game asks, because the banner explains but does not prevent.** A director who does not read it
presses Next Game and gets `NewGameGuardDialog` instead — *Cancel* / *Open that game* / *Start a new
one anyway*. It **warns and never refuses**: two genuine tournaments in one evening is completely
normal, and the director is the one standing there. Same call `lateEntryClosedReason()` makes.

**One gate, in `hooks/useNewGame.tsx`, not one per button.** There are FIVE call sites across two
components; a check at each is what `attemptAddPlayer` and `seatablePlayers()` exist to avoid.

**`after` is what makes a single gate possible, and it is the subtle part.** Three of those call
sites do more work immediately after starting a game — switching league, writing the season, forcing
standalone. Deferring only the reset would leave a league and season **written against the game that
is still running**, which is half-applied state no screenshot would show. The continuation is held
with the pending options and runs in the order it always has: reset, navigate, then the caller's
work. Tests assert that ordering and that a deferred start applies BOTH halves or neither, and both
mutants — dropping the guard, dropping the continuation — are caught.

`hooks/useOpenLiveGame.ts` is the one implementation of pinning and navigating to another of the
account's games, shared by the banner and this dialog, so the two cannot drift.

**A related gap, now closed: `lib/localGameId.ts`.** A STANDALONE game's document did not use
`localGameId` as its id, because `useTournament`'s initial `details` gave one only to
`type: 'season'`. So `createTournamentDocument` passed `undefined`, `createDocViaRest`
auto-generated, and its 409-adopt arm — which requires a `docId` — could never fire. **"A collision
means JOIN" simply did not hold for standalone games**: two devices made two documents with nothing
to collide on.

It was never a decision. `resetTournament` has always minted one for both kinds,
`updateTournamentDetails` back-filled for league games only, and the local-progress mirror already
worked around the gap in a comment reading *"A standalone game carries no localGameId on details —
only league games do — so fall back to the stored id, which exists for every local game."* The stored
id was always there; only `details` disagreed. `initialDetails()` and `needsLocalGameId()` now own the
rule, because it is one line that appeared in three places and said something different in one of
them.

**A database game is deliberately excluded.** It has a document, and its `id` is the identity
everything keys on; a second local identity that may not match it is the "two answers to one
question" fault `consoleTournamentId()` exists to have fixed. The mint is passed as a thunk for the
same reason — minting STORES the id, so minting one for a game that will never use it would leave it
in scoped storage for the next local game to inherit.

It also fixed history quietly: `useCompletedTournaments` keys its document on
`${ownerId}_${localGameId}` and fell back to `${ownerId}_${Date.now()}`, so re-finishing the same
STANDALONE game wrote a second history record every time. That fallback is now unreachable for a
local game.

`createTournamentDocument` says so out loud if it is ever asked to create without one — not thrown,
because the game IS still saved without it, just unprotected, and refusing would cost a director
their cloud copy over an invariant now guaranteed upstream. Silence is what let this run unnoticed.

### Every director-side write to a live game goes through one door

`lib/liveGameWrite.ts`'s `writeLiveGame(tournamentId, fields)`. There are no other
`updateDoc` calls against `activeTournaments` from the director side — `PokerTimer`'s four sync
effects, Go Live's publish PATCH, the Buy-in tab's structure save and the Seating tab's table
backgrounds all land there.

**This is not indirection for its own sake — it is the missing somewhere the removed device lock
needed.** That lock is documented above as "only half-enforced": `broadcastTournamentState` stood
down and the direct writers in `PokerTimer` kept going, so the device without control still wrote the
players array and silently reverted the other device's rebuys. The lesson is not that locks do not
work; it is that a rule enforced in three places out of twelve is not a rule. An inventory found
writes scattered across six files using eight gating idioms, four resolving the document id their own
way. There was nowhere to put the check. Now there is one place, so "may this device write to this
game right now" is a question asked once rather than a discipline each new writer has to remember.

It returns **`'written' | 'skipped'`**, and the return value is load-bearing: a caller must NOT record
a payload as synced unless it got `written`. Recording a skipped write as saved is how a device would
sit on a roster it believes it has already sent — the same fault as marking a FAILED write saved,
which the sync effects' `lastSynced*Ref` guards already exist to avoid. It **throws** on a Firestore
failure rather than swallowing it, because the callers genuinely differ in how they report (the sync
toast, `reportWriteFailure`, or a console line) and that judgement stays with them.

Deliberately **not** routed through it: a participant's `claims` write (`PlayerClaimView` — that is a
player's own phone, not the director driving the game — the reason, and the only one: an earlier note
here said the door's `sanitizeForFirestore` would mangle its `deleteField()` sentinel, and it would not,
since it preserves Firestore's sentinel objects), every account-scoped write (setup, templates, league and
season admin, history — a director doing admin on a phone while a console runs is legitimate), and
creation, which `lib/tournamentDocument.ts` already owns.

**Two dead writers went with this.** `broadcastTournamentDetails` and `broadcastParticipantUpdate` in
`useTournament.ts` were real `updateDoc` calls writing nothing but `updatedAt`, with zero call sites.
That field is what `lib/liveTournament.ts` sorts on to decide which game is being run right now, so a
stray toucher of it is a stray voter on that question.

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

**The actions are memoised too** — `login`, `logout`, `signInAnonymously` and the rest are
`useCallback`s with no deps (October audit, Low). The participant view lists `signInAnonymously` in an
effect's deps, so a fresh function per render re-ran it every render and could mint a second anonymous
identity. `useAuth.stable.test.tsx` pins it.

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

**A player belongs to the LEAGUE; a row belongs to the SEASON.** `seasonRoster` in
`lib/playerSeason.ts` is the one answer to "who is in this season's standings": results filtered to the
season (ids compared as strings) and anyone left with none dropped. The table used to filter results but
keep every player, so a new season opened with every name the league had ever seen at the bottom on 0
games — reported from a test night — while the season panel, with its own inline copy, counted correctly.
Players are only created when a result is recorded, so nobody genuine is left out; before the first
bust-out the table shows its "starts tonight" state. `RealTimeLeagueTable.test.tsx` renders it.

**Manage League's Danger Zone lives in the SEASONS tab.** It used to sit outside the tab strip, on
the reasoning that deleting a league acts on the league — the dialog's scope, set by
`LeagueScopeBar` — rather than on whichever tab is open. True, and it meant "Delete this league" was
permanently under the **Points** and **Stats** pickers, which a director opens every week to toggle
a column or nudge a multiplier. A destructive, irreversible action should not be ambient beneath a
routine one; it belongs with the seasons, where the rest of league administration already is. This
is the same instinct that put the account-level Danger Zone deep in Settings.

`TabsContent` has no `forceMount` anywhere in this app, so inactive tab content is unmounted — which
is what makes placing something in one tab actually remove it from the others.

**Money in the league table comes from `lib/currency.ts`.** Five columns and the season's prize pool
hard-coded `£` while every other figure in the app honours `settings.currency`, so a director working
in dollars saw pounds in their own standings. `currencyOf(settings)` and `money(amount, symbol)` own
it; `RealTimeLeagueTable` asks for both shapes of the `tournament` prop, because the console passes the
hook and the participant view passes the raw document.

### A results row is one fact, and FOUR screens each had their own answer

`lib/resultRows.ts` owns the finishing order — who is where, what their place is called, and every
figure known about them. `components/ResultsTable.tsx` is the one screen table; it was
`ResultRow.tsx`, a row of chips, until the section below turned the results into a grid. Before them
there were four implementations, and they disagreed about the thing nobody could get wrong by
accident: the name of a place.

| Where | Rank read |
|---|---|
| the director's own row (`PlayerSection`) | `1st`, `2nd`, `3rd`, then **`21th`** |
| the participant's phone (`PlayerSectionReadOnly`) | **`#9`** — no ordinal, no medal, 1st identical to 9th |
| the exported PNG (`PlayerSection`, again) | `21st`, correctly |
| the league standings | a bare integer, no medal at all |

**`lib/ordinal.ts` exists for exactly that string**, and its own comment records four implementations
being wrong past tenth. It was applied to the EXPORT and not to the row directly above it — so the
console said *21th* all night and the picture the director posted afterwards said *21st*, of the same
game, seconds apart. A home game of twenty-odd is ordinary, so this was visible rather than
theoretical. **A fix landing at one call site out of two is the fault this codebase keeps paying for,
and the only cure is that there stops being a second call site.**

Three more divergences were hiding under that one, none of them visible on screen:

- **"Is the game finished" was spelled twice and neither was `gameIsOver`.** The row asked
  `(active === 0 && eliminated > 0) || (active === 1 && …)` off `filter(p => p.isActive)` — TRUTHY,
  so a player whose flag is absent read as eliminated, which `lib/gameOver.ts` is explicit about
  having cost before. The export asked `some(position === 1) || active <= 1`. That flag decides
  whether a seat chip shows, so the two could draw the same player differently. And the `=== 1` arm
  was dead on arrival: `eliminatePlayer` awards position 1 and `isActive: false` in one update, so a
  finished game has ZERO active players, never one.
- **The points chip was fed different money.** The row passed `buyInOf(...)` and `investedIn(...)`;
  the export passed a raw `prizeStructure.buyIn || 0`. `buyInOf` falls back to 10 for a game that
  never recorded a price, so any formula weighted on `b` or `c` scored one figure on the console and
  another in the image.
- **The payout guard differed** — the row required `percentage > 0`, the export did not.

**`rankTone` returns a NAME, not a colour** (`gold | silver | bronze | out | active`), and that is
what lets the screen and the exported image look different on purpose while agreeing about which
places are special. It also kills a shipped bug by construction: the export computed its text colour
as `position <= 2 ? black : white`, and an ACTIVE player's position is **0**, which is `<= 2` — so
the picture drew black text on the green badge where the screen drew white. Once "which colour" is a
lookup on a named tone rather than a sum over the position, there is nowhere for that to live.

**The money is derived first and falls back to the stored `prizeMoney`.** `manualPayouts` is the one
source of every money figure, so where there is a structure it wins — but a document written without
one still carries `prizeMoney` on each player from the moment they busted, and that is all a
participant's phone has ever had to show. Deriving only would have silently emptied the money column
on every older game. Narrow by construction: the fallback can only ADD a figure where the derivation
found none, so it can never disagree with the Payouts panel.

**And the stored figure is a TOTAL, not a payout — which cost exactly what mixing the two always
costs.** `eliminatePlayer` folds the bounty money into `prizeMoney` at the bust-out
(`prizeMoney += knockouts * bountyAmount`), so the fallback was reading bounty money as a prize and
then adding the bounty on top: the same money twice. Reported from a real game — a £3 bounty showing
**£6** in the Won column — and it bit **every row outside the places**, which is most of any field,
because that is exactly where there is no derived payout to prefer.

The fix is to take the bounty back out of the stored total (`prize = max(0, stored - bounty)`) and
leave `won = prize + bounty` as **one expression for both paths**. That is what keeps Prize, Bounty
and Won consistent by construction: on the fallback they add back up to the stored figure, and a
stored figure SMALLER than the derived bounty — a document that never recorded the bounty money —
floors the prize at zero and still shows the bounty. A second expression for `won` is precisely
where the three could disagree; a mutant writing one survives every other test, which is how that
version was caught before it shipped.

**The LEAGUE's Bounties column read £0 for the same game, and that was the other half of it.**
`useTournament` writes `bountyWinnings` only in the **progressive** branch — an ordinary bounty game
folds the money into `prizeMoney` and writes nothing else — while `PokerTimer`'s recorder passed that
field straight through. So the night's own table showed the bounty and the season's standings showed
nothing, in every league using plain bounties: the fault *"A league result is written once, from a
whitelist"* opens with, arriving for the fifth time.

**`lib/resultStats.ts`'s `bountyTakeFor(player, prizeStructure)` is the one derivation**, returning
the count and the money together — there were FOUR answers to this and one of them was the database.
`lib/resultRows.ts` had it inline, both Payouts panels (`TournamentInfoCard`,
`ParticipantTournamentInfoCard`) had an identical copy each, and the recorder had none. All four read
it now. **Progressive prefers the STORED figure** (the `payoutsOf()` trade): a bounty that grows
cannot be rebuilt from a head count and a starting price, so the accumulated `bountyWinnings` plus
the winner's own current bounty is the only honest number, which is what the panels already did.

**`recordedStatsFor(player, prizeStructure)` builds the whole recorded payload**, and it is a
function because the defect was in a call site inside a 1,900-line page effect, which has no test by
construction — the argument `lib/tableBalance.ts` and `lib/seating.ts` were extracted on, and the
trap the results-column arrows fell into.

**THE CONTRACT THIS SETTLES, and it is the thing to remember: `prizeMoney` is everything the player
collected; `bountyWinnings` says how much of that was bounty.** A breakdown, never an addend. So
`lib/playerSeason.ts` stopped adding them — `cash = cashIn(game) + bountyWinningsIn(game)` was the Won
column's double-count with a different name, already live for progressive games (the only ones
populating both fields) and primed to fire for every game the moment ordinary bounties started being
recorded. The test that asserted `30 + 15 = 45` now asserts 30, and says why: an assertion that
changes its mind needs its reason beside it.

The league's **Cash** and **Profit** columns are untouched and were always right — they read the
total. Four mutants are caught: recording nothing for an ordinary bounty (the bug), dropping the
winner's `+1`, deriving for progressive, and adding the breakdown back in the drill-down.

**ITM % and Current streak ask `cashedIn`** (October audit, Low): a paying PLACE, the total less the
bounty breakdown — a player out in 9th with one bounty did not cash. Biggest win keeps the total on
purpose; it answers "most taken home".

**Results recorded before this carry `bountyWinnings: 0` and are not migrated**, so an old league's
Bounties column stays blank. Nothing that reads correctly today changes.

**The bust-out now asks `bountyTakeFor` too** (October audit M6). It computed its own bounty money —
`knockouts × bountyAmount` for EVERY bounty type — so a PKO player out of the money with one knockout
(worth half a bounty) showed a phantom prize and a doubled Won, and the PKO winner's money left out
everything they had taken. A busted player's and the winner's `prizeMoney` are now the place's payout
(`payoutForPlace`) plus `bountyTakeFor`'s money: the derivation the results table, both Payouts panels
and the re-pricing already used. Three more in the same place:

- **A stored `currentBounty: 0` means "carries no bounty"** — a rebuy or re-entry taken without a
  fresh one — and every `currentBounty || bountyAmount` turned it back into a full bounty. They are
  `??` now.
- **A standard bounty pays only for a player who carried one.** It paid per knockout regardless, so
  knocking out somebody who had rebought without a bounty paid out money nobody had put in. The hunter
  counts such knockouts in `bountylessKnockouts`, which `bountyTakeFor` takes off.
- **Undo gives the bounty back** — the knockout, the bountyless count, and in a PKO game the half
  bounty that went into the hunter's winnings and onto their head.

**What a player put in counts every buy-in, at its real price** (October audit M5). The console's
Invested and points charged a rebuy at the BUY-IN while the recorder charged its own price, so the
night and the standings disagreed — invisible because every test fixture priced the two alike.
`investedIn` ignored re-entries on the claim that one "is recorded as its own result"; it is not, so a
player who re-entered twice showed a profit having broken even. And a free game was recorded as £10:
`|| 10` at three writers and in `buyInOf`, the bug the Buy-in tab's `??` once fixed, arriving at the
recorder. An ABSENT price still falls back to 10 for old results; a recorded 0 stays 0.

**The prize-pool breakdown lists re-entries** (October audit M17), on the console and the player's
phone, so its lines add up to the total under them; the average stack counts re-entry chips.

`calculatePoints` arrives as a **callback** rather than an import, because it lives on
`useLeagueSettings` and importing a hook would end the React-free property that lets the export sheet
render from the identical list.

### An export is a different medium, which is why it is BUILT and not photographed

`components/export/` — `exportStyle.ts` (the print tokens), `ExportSheet.tsx` (the frame both images
wear), `ResultsSheet.tsx`, `StandingsSheet.tsx` and `captureSheet.ts` (the one capture).

The console is glass over a near-black page. That is right on a tablet in a dim room and wrong in a
picture, because a picture gets posted to a group chat, recompressed, and looked at on somebody
else's phone in daylight. It is also not merely a preference: **all three card treatments use
`backdrop-filter: blur(12px)`, and html2canvas does not render backdrop-filter at all** — it
composites the translucent background straight onto the canvas colour. A captured glass card is not a
slightly worse glass card; it is a nearly transparent panel. A print style that never uses glass is
the honest option rather than a compromise.

**Deciding that settles the strategy question rather than complicating it.** If an export is
deliberately not the screen, then capturing the live DOM is wrong *by definition*, because the live
DOM is the screen's style. So the off-screen-sheet strategy wins and both sets of hacks go:

| | the old results PNG | the old standings PNG |
|---|---|---|
| Built by | ~130 lines of `createElement` + `cssText` | capturing this very table |
| Therefore needed | `TONE_STYLES`, a hand-kept second badge palette | unsetting the wrapper's `height`/`maxHeight`/`overflow`, then restoring all three |
| And | `font-family: system-ui` — **not the app's typeface at all** | an `onclone` deleting every `<svg>` (the title's trophy vanished) and every `<button>` |
| And | — | a hidden `.movement-arrow-text` twin in the markup, for no other purpose |
| Cleaned up on failure | no — a thrown capture parked the tree for the life of the page | n/a |

**`TONE_STYLES` is deleted and must not come back.** html2canvas reads COMPUTED styles from a node
that is in the document — which is why capturing Tailwind markup always worked — so the sheets are
real JSX with real classes. The print style owns the frame, the type, the page and row colours, the
rank badges and the density, and **deliberately not the chips**: a second badge palette would be
exactly the drift the mirror was.

**The standings export used to invert its own striping.** It passed `backgroundColor: '#1e1e1e'` —
the very literal its even rows were striped with — so in the finished image every other row dissolved
into the backdrop. One module owning both colours is what makes that impossible rather than unlikely,
and a test asserts `SHEET.row !== SHEET.page`.

Three things in `captureSheet` are load-bearing. **Teardown is in a `finally`** — the builder it
replaces removed its off-screen node on the happy path only, so a thrown capture left a whole DOM
tree in the document, invisible, clearable only by reloading mid-tournament; a mutant moving it out
turns a test red. **Fonts are awaited**, because a sheet is measured in px rather than laid out
responsively and arriving a frame early captures the fallback stack. And the host is **off-screen at
-10000px rather than `display:none`**, which has no layout for html2canvas to measure.

`sheetFilename` appends the date SEPARATELY from the descriptive parts — with the date in the list the
stem is never empty, so its own fallback was unreachable and a nameless sheet downloaded as
`2026-10-01.png`. It also strips path separators, because a season called `Winter 25/26` is ordinary
and a slash is how a download quietly fails to save.

**A column header is one style, in `exportStyle.ts`, and it used to be five.** Reported as the text
at the top of the columns having no impact — and it had none: **11px at weight 600 in `inkDim`**,
smaller AND dimmer than the 13px figures beneath it, so the row that tells a reader what they are
looking at was the quietest thing in a picture people post to a group chat. It is **12px, weight 700,
in `SHEET.inkHead`** (a near-white, deliberately not the pure white the player names use — a header
is a label, not a value), with the tracking opened from `0.04em` to `0.08em`, which is most of what
makes uppercase at this size read as a header rather than as shouting.

`headCellStyle(align)` is a function because the style was spelled **five times**: once in
`ResultsSheet` and FOUR separate inline copies in `StandingsSheet` — rank, movement, Player and each
stat column. Two images that exist to look like one product cannot have a change to one header be
four edits in the other.

**The band stays LIGHTER than the rows**, and that is the one thing not to "fix". `SHEET.band` above
`SHEET.row` is what separates the header strip from the first player, so darkening it to make the
header stand out moves it toward the row colour and weakens exactly what it is for. The ink carries
the impact. Five mutants are caught: the colour back to `inkDim`, the weight back to 600, the size
back to 11, the tracking back to `0.04em`, and a SIXTH inline copy diverging in either sheet.

**The rows stripe, and the stripe goes DOWN.** Reported as the console's alternating row shades
being great for legibility and missing from the images — and they were missing: both sheets painted
one `SHEET.row` behind the whole table with a hairline between rows. `SHEET.rowAlt` (`#181B21`) and
`rowStyle(index)` fix it for both at once, beside `headCellStyle` and for the same reason.

**Darker rather than lighter, because of the palette's own geometry.** `band` sits only ~8 steps
above `row`, so a lighter stripe strong enough to survive recompression starts reading as a second
header; going down moves away from the band instead of toward it. **The floor is `page`**, and that
is this file's oldest export bug — the standings capture once set its canvas colour to the literal
its even rows were striped with, and every other row dissolved into the backdrop.

**So the contract is an ORDERING, not four hex values: `page < rowAlt < row < band`.** A test asserts
it by luminance, which is what catches both ends at once. **Odd rows carry the stripe, so the FIRST
row is the base colour** — the header band sits directly above it, and darkening the row under a
header reads as a gap rather than as striping. Five mutants are caught: striping every row, striping
none, striping the first row, `rowAlt` below the page, and `rowAlt` above the row.

The expected colour in the test is **derived from the token** rather than written out, because jsdom
resolves an inline hex to `rgb()` — a literal there would let a changed token pass by changing the
test beside it.

**The standings sheet is handed its columns already resolved**, from the same `enabledStats` +
`getPlayerStat` pair the table renders with and the CSV writes from. A third column list is how the
rake formula reached nine sites.

### The standings table ignored the app's own type ramp

`RealTimeLeagueTable` was ten `text-xs` and **zero** uses of the `caption`/`label`/`body` ramp that
`tailwind.config.ts` declares *for table cells* — with **no `font-mono` anywhere**, so money, points
and ROI were proportional with no `tabular-nums` and the digits did not line up down a column. Its
own child `PlayerSeasonDialog` had it right all along, so a table and the dialog it opened were
typographically inconsistent with each other.

It also hard-coded `bg-[#2a2a2a]` for the header, `bg-[#1e1e1e]` for the stripe, and **two different
gridline shades** — `border-slate-600` in the header against `border-slate-700` in the body — for one
gridline. All now tokens, one shade, `text-caption`, and `font-mono` on every figure.

**The header's opaque background is still load-bearing** and `bg-muted` keeps it: `--muted` is a
plain HSL with no alpha, and rows slide UNDER that header. Do not reach for a translucent card
treatment there. The `wrapperClassName="max-h-[400px]"` placement and the sticky header are
deliberately untouched — the section above records what moving that cost.

**Dead wiring swept with this:** `export-hide` was applied at three places in `PlayerSection` and
**defined in no stylesheet anywhere**; `exportRef` was declared and attached in both components and
read by nothing. Both were leftovers from when these exports captured live DOM.

### The results are a table, and the columns are the director's

`lib/resultColumns.ts` defines every column a night can show; `components/ResultsTable.tsx` is the
one screen table and `components/export/ResultsSheet.tsx` the picture of it. Both read the same
accessor, so the console, the participant's phone and the exported image cannot disagree about a
column — the trade `RealTimeLeagueTable` and its CSV already make.

**Reported after the exports were unified:** the standings "look crisp and read much easier because
they have definitive columns", and the results did not. The reason is structural rather than
cosmetic. A grid gives every row the same shape, so the eye runs down a column; a strip of chips
changes width and order per player, so nothing lines up and each row has to be parsed on its own.
`components/ResultRow.tsx` is deleted.

**The league's column machinery could not be reused, and the reason is worth knowing before anyone
tries again.** `statsToDisplay` + `statsOrder` persist into a `leagueSettings` document keyed on
`defaultSettingsDocId(userId, leagueId)`, and `LeagueSettingsDialog`'s auto-save **returns early with
no league** — so a STANDALONE tournament could never configure a column, which is exactly the game
where a results table earns its place. The `leagueId: null` path is worse than useless: it lists
every settings document a director owns, unfiltered. And about ten of the twenty-five league stats —
Games, Avg. Points, Attendance, Streak, Final Tables — are aggregates over a season and say nothing
about one night.

**So the choice lives on `settings.resultColumns`, and `timerPiping` is the precedent.** Stored with
the rest of the settings, carried to the account by `useDirectorSetupSync`, and into the tournament
document because `PokerTimer` syncs the whole object — which is how a participant's phone shows the
columns the director picked. No new collection, and **no Firestore rule to publish by hand**, which
is the trap this file opens with.

**One ordered array of enabled keys, not the league's boolean map plus a separate order list.** Those
two can disagree, and visibly do: the ↑/↓ buttons there step through all twenty-five keys including
the hidden ones, so moving an enabled column past a block of disabled ones takes several presses and
appears to do nothing. A single array cannot have that bug, and the picker here disables the arrows
on a column that is switched off rather than letting it be stepped through.

**A column whose FEATURE is off is not drawn** — `requires` on each column, against the prize
structure. The rule the Busted strip already follows: *a feature switched off for the whole
tournament renders nothing.* A game without bounties prints no bounty column even if the key is
enabled, and Points needs league mode. This is what makes a dozen configurable columns usable by a
director who never opens the picker.

Keyed on the **setting, never the data**. A rebuy column of zeros in a game that allowed rebuys is
information — nobody rebought — and hiding a column because tonight was quiet would make the same
tournament print a different table from one week to the next.

**An unknown key is dropped rather than rendered.** Settings travel: to the account, into the
document, out to every phone. A key written by a newer build WILL reach an older one, and a column
nobody can resolve must be absent rather than a header with nothing under it. A mutant that renders
it blank turns a test red.

**`toggleColumn` inserts at the canonical position and leaves the rest of the order alone.** Sorting
the whole array instead is the obvious one-liner and throws away a director's arrangement every time
they tick a box — one control quietly undoing the control beside it. Mutation-tested.

**`ResultRow` carries the FIGURES now, not a finished chip list.** `resultRowsFor` was already
deriving every one of them and handing them straight to `badgesFor`; exposing them as `stats` adds no
derivation, it stops one being discarded. Currency went the other way — out of `resultRows.ts`
entirely, because how a figure is spelled is a formatting question and belongs with the columns.
`lib/playerBadges.ts` is untouched and still right where chips belong: the seating view and the
participant's own check-in row.

**The column order on screen is a decision, not a layout: rank · name · actions · stats.** The table
scrolls sideways on a phone, as the standings do, and the KO button is the most-pressed control of
the night — anything right of the fold can be scrolled out of reach when a director is busiest. Rank
and name are narrow, so the controls sit third and stay on screen at any width while the configurable
columns are what move. **Measured, not eyeballed**, by constraining the CONTAINER rather than the
window, since headless Chrome clamps the viewport to ~500px: at 360px the table's own wrapper scrolls
(659 against 358), the page itself does not, and the KO button's right edge is at 237px.

They are not PINNED, though — scroll right for Points and the controls go with everything else,
exactly as the standings behave. Sticky first columns would need an opaque background under them,
which fights the row striping; worth doing deliberately rather than as a sidecar to this.

**Rows are `py-2`.** The table primitive's `p-4` is 16px above and below 11px type, which reads as a
list rather than a table; both this and the standings were loosened by it and both are tightened.
Measured: 61px per row before, 45px after.

**The picker is `components/ResultColumnsPicker.tsx`, and it is a component because that was the
fix.** Reported as "the move up and down feature isn't working" — and the arrows WERE working: the
stored order changed and the table and the exported image reordered with it. What never moved was the
list in Settings, because its rows were rendered from `offerableResultColumns`, which is always
CANONICAL order. No feedback at all, so it read as a dead control rather than an odd one.

Two more faults sat in the same twenty lines, neither reported. The arrows' **disabled states read
backwards**, being computed from an index into the director's order while the row sat in canonical
order — so the top row's ↑ could work and a lower row's be dead. And a press **silently dropped
configuration**: it wrote back the feature-FILTERED list, so pressing an arrow in a game with
bounties off removed those keys from the stored order for good.

All three shipped with `npm run check` clean and every test green, because `moveColumn` and
`toggleColumn` are correct in isolation and the defect was entirely in the call site — twenty lines
inline in a settings page, which has no test by construction. The extraction is what makes it
testable, the same argument `lib/tableBalance.ts` and `lib/seating.ts` were pulled out on.

**The rule that prevents all three: render in the order the TABLE will use, and edit the STORED array
rather than the filtered one.** Which creates the opposite hazard immediately — a swap could trade
places with a key that is hidden right now and the row would not move, *literally the league picker's
fault this file mocks* — so `moveColumn` takes a `canSwapWith` predicate and skips to the nearest
visible neighbour. A column whose feature is off keeps its place in the stored order and simply is not
a row.

**The test asserts the RENDERED ROW ORDER, not the value handed to `onChange`.** A test on `onChange`
alone passes against the exact bug that shipped — it was always given the right array. The mutant that
restores canonical rendering turns six red. Verified by driving the real picker too: one press, one
visible move, and the hidden `bounties` key still in the stored array afterwards.

**A screenshot of the DOM is not the exported image, and that distinction cost two rounds.** The
badge work above was verified by driving the live page over CDP and photographing it — which proves
the geometry and proves nothing about the PNG, because **html2canvas lays text out differently from
the browser.** The first fix shipped with the label sitting half out of its fill in the real export
while looking perfect on screen. Capture the CANVAS when the thing being checked is an export:
render the sheet, run `html2canvas` on it in the page, and read the resulting data URL.

**Settled empirically, by capturing six variants of one badge and looking at them:** an explicit
`line-height` of any kind — a fixed `height` with a matching `lineHeight`, `lineHeight: 1`,
`lineHeight: 1.2` — and both `inline-flex` centrings ALL drew the label low, half outside the
coloured box. **Only `display: inline-block` with padding and `line-height` left at `normal`
centres.** A browser renders all six correctly, which is exactly why this is invisible on screen.
**Do not set a line-height on anything html2canvas will draw**, and do not reach for flex to centre
inside it.

**A rank is a numeral in the app's own voice, and the box it used to sit in is gone.**
`components/RankLabel.tsx`. The badge was reported twice — first as looking janky in both exported
images, then, once its geometry was right, as **not fitting the app**. The second report is the one
that mattered, and it was structural rather than a matter of taste: `bg-yellow-500`, `bg-gray-300`,
`bg-amber-600`, `bg-red-900` and `bg-green-600` were the **only solid colour blocks anywhere in this
app**, in a vocabulary that is otherwise uniformly a 10% fill, a 30% border and bright text — `TONES`
in `ui/player-badge.tsx`, `TournamentStatusChip`, the break marker in the blind levels, every section
tint. The loudest thing on either table was attached to the least interesting fact in the row.

**The app had already answered this question one card away.** The Payouts panel in
`TournamentInfoCard` marks 1st/2nd/3rd with `text-yellow-400 / text-gray-300 / text-amber-600` and
everything below in `text-muted-foreground`. The results table's medals were a second answer to that,
so the screen palette is now literally the Payouts panel's own. Gold was triple-booked besides —
`#FBBF24` already means tournament-finished on the timer face, and bounty — and `active`'s green
fought money-green and Broadcasting green, so **`Active` takes the app's single accent**; it is the
one label here that is a word rather than a place.

**The box was solving a problem the typeface already solves.** It arrived to stop the column going
ragged — `1st` narrow, `21st` wider — and a `minWidth` was the cure. But `.font-mono` carries
`tabular-nums` app-wide, so a right-aligned mono numeral lines up down a column with nothing done to
it, exactly as every stat column already does. `minWidth`, `padY`, the explicit height and the
`undefined`/`null` tone distinction all went with the fill.

**Marked twice over: hue and weight.** JetBrains Mono is loaded at 500 and 700 and nothing else, so
`emphasis` on the podium is free, and it is what lets the colours be this quiet. A mutant dropping it
turns a test red, as does one restoring a `bg-` class, a `background`, a `padding` or a
`line-height`.

**Two things carried over from the round before and must stay.** The colour is a **LOOKUP on a named
tone, never arithmetic on the position** — `position <= 2 ? black : white` once drew black on green
because an active player's position is 0. And **no line-height, no height, no padding, no flex**: any
explicit line-height, and both `inline-flex` centrings, draw a label out of place in html2canvas while
a browser renders all six correctly. That rule outlives the badge it was found on, because it applies
to any text in a sheet.

**`RANK_PRINT` became `RANK_INK`** — one colour per tone rather than a `{bg, fg}` pair, deeper than
the screen's so it holds up as text on `SHEET.row` after recompression. The screen passes `className`,
the sheets pass `color`; two palettes, one component, which is what `rankTone` returning a NAME buys.

**The rank column in both sheets is given a width now.** Left to size itself it absorbed the table's
spare space and the places drifted a long way from the names they belong to — invisible while a badge
anchored them. 56px in the results sheet, 44px in the standings.

**Measured and then LOOKED AT, in that order.** Captured through the real html2canvas rather than
screenshotting the DOM, per the lesson directly above: podium rows 700 weight and 19.9px on screen /
23.5px in print, the rest 500, no `background` on any of them, and at 360px the table's own wrapper
does not scroll, the page does not scroll, and `21st` is not clipped in a 43px cell.

**The standings table ON SCREEN is deliberately untouched.** Its rank cell is `w-6` — 24px — carrying
the number and the movement arrow in a flex row, and it has no badge today, so this fault never
reached it; adding one would force a deliberately narrow column wider and shove the arrow about.

**An asymmetry this made visible, pinned rather than quietly fixed.** With no `rebuyAmount` stored,
`lib/prizePool.ts` adds nothing to the pool for that rebuy while `lib/resultStats.ts`'s `investedIn`
charges it at the buy-in — its own comment calls that "much closer than charging nothing" for a
result written before prices were stored. Both are defensible; they answer different questions. It
never showed while these were chips, because a row carried one money figure. In a table, Invested and
Prize are adjacent columns and the same rebuy is counted in one and not the other. Changing
`prizePool` is a real money change and does not belong in a display commit; `resultColumns.test.ts`
asserts the current behaviour so the next person meets the fact rather than rediscovering it.

### The exported results name the season, and `Game 4 of 13` had three spellings

Requested: the results PNG for a league game read `Game 4 · 9 players` under the league name, and
should name the season. It reads **`Spring 2026 · Game 4 of 13 · 9 players`** now. The player count
stays, deliberately — it is the one fact a picture loses once the night is over, and the standings
sheet already carries `Season · N players`.

**The format existed three times before this, and they already disagreed.** `TournamentInfoCard`,
the identical line copied onto `ParticipantTournamentInfoCard`, and `LeagueSection` — and only the
League panel ran it through `clampedGameNumber`, so **a fourteenth game of a thirteen-game season
read `Game 14 of 13` on both info cards and `Game 13 of 13` in the panel**, about the same night.
Writing a fourth inline in `PlayerSection` is the fault this file opens with, so
`lib/seasonProgress.ts` owns it: `gameProgressLabel(gameNumber, numberOfGames)` (clamped, inside, so
a call site cannot opt out by forgetting) and `seasonLine({ seasonName, gameNumber, numberOfGames })`.
All four read them.

**No new field, no new prop, no rule to publish.** `PokerTimer`'s one guarded season-block writer
already puts `seasonName`, `numberOfGames` and `gameNumber` on `settings` in league mode, which is
where the participant's card has always read them and where `PlayerSection` already read
`gameNumber` — and `settings` is synced wholesale, so the picture a director exports and the line on
a player's phone cannot disagree.

**Every part is optional and the separator is never stranded**, which is the fault `seasonSubtitle()`
in that same module exists for — a dateless season once read `· 12 games`, leading dot and all. A
STANDALONE game has no season block, so `seasonLine` returns `''` and the exported subtitle is
`9 players` alone. Two mutants are caught: dropping the clamp, and joining unconditionally.

Verified by capturing the real PNG rather than screenshotting the DOM, per the lesson above — the
league sheet reading `Spring 2026 · Game 4 of 13 · 9 players`, a game past the schedule clamping to
`Game 13 of 13`, and a standalone sheet reading `9 players` with no stray dot.

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

**`TONES` in `ui/player-badge.tsx` is now the ONLY colour table, and there used to be a second.**
`TONE_STYLES` repeated all five tones as inline styles, kept in step by hand, because the results PNG
was assembled from plain DOM nodes that could not carry a class. The exports render real JSX now, so
it is deleted — see "An export is a different medium" above. Do not reintroduce it: an export that
wants a different LOOK changes `components/export/exportStyle.ts`, which owns the frame, the type and
the rank colours and deliberately not the chips.

### Icons are lucide, and there are no emoji

**There are no exceptions, and the one there used to be is worth keeping as a warning.** It was
`TournamentOverBanner`'s confetti, justified here as "that screen is shown once a night and a lucide
outline of a party popper would be worse at the job". The screen was shown on NO nights: the banner
was gated on there being exactly one active player, and at the end of a game there are none, so it
had never rendered. The exception had never been looked at by anybody, which is precisely why it
survived — and the moment the gate was fixed and it appeared, it was reported within the hour as
looking like a poker app aimed at children. A gradient from yellow through red to pink, an 8xl
pulsing headline and four bouncing emoji, in an app whose one accent is orange.

The banner is deleted. The end of a game is marked in the app's own language instead: the timer face
turns gold, and the **Tournament Winner** card appears in Tournament Info — a tinted panel, a lucide
`Trophy`, the name. **An exception argued from how something will feel, on a screen nobody has seen,
is not an argument.**

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

**The same trap has a second home, and it caught the standings: `ui/table.tsx` wraps every `<table>`
in its own `overflow-auto` div.** So a sticky `thead` resolves against THAT wrapper, not against the
page and not against whatever box you think you are scrolling in. The league standings carried
`sticky top-0` on its header for months while the `max-h-[400px]` cap sat on a hand-rolled div one
level OUTSIDE the primitive's wrapper — which therefore had no height, never scrolled, and pinned the
header to a box that does not move. It rode away with the rows, looking exactly like no sticky at all.

Measured, not guessed, in the same spirit as the `clip` finding above: in that nesting, scrolling
200px moved the header **-200**; with the cap on the primitive's own wrapper it moves **0**.

`Table` takes a `wrapperClassName` for exactly this — it puts the cap where sticky can see it rather
than adding another container around it. **A height cap and a sticky header must be on the same
scroll container**, and if a table ever needs its header to pin, that is the thing to check first.

Worth knowing for the future: because the standings pin inside their own 400px box rather than
against the page, the console's 56px app bar is irrelevant to them and no `top` offset is needed.
A table that pinned against the PAGE would need one there and not on the participant view, which has
no sticky bar — two mount sites, two answers.

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

**And the digits are spelled once** — `formatClock` in `lib/tournamentClock.ts` (October audit, Low). The
console capped at `99:59` and padded; the phones went to hours. A 60-minute break read `60:00` on the big
screen and `1:00:00` at the table. MM:SS under an hour, H:MM:SS from one, never capped.

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

**And a level change chains from the end time too** — `advanceClock` in the same module (October audit
M11). The tick that noticed a level had ended started the next one at `Date.now() + duration`, one
level per tick, so a tablet that slept or a phone whose director switched apps came back to a next
level at its FULL length: the schedule slipped by however long it had been away, two elapsed levels
collapsed into one, and phones sat on 00:00 meanwhile. The next level now ends `duration` after the
previous END, through every level that fully elapsed, stopping at a break-hold or the end of the
structure as before. `useTournament.clock.test.tsx` drives the real tick with fake timers.

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

### A deploy is a brief outage unless Railway is told how to check

`railway.json` sets `deploy.healthcheckPath` to **`/api/health`**. Without it Railway sends traffic to
a new container as soon as it starts rather than when it can answer, so every push to `main` showed
the edge a dead origin for the length of a rebuild-and-swap — a **Fastly 503 "No healthy backends"**,
reported from a real session while a push was building. The game survives it (the local mirror holds
the roster, the clock derives from `targetEndTime`), so the cost is a reload rather than a
tournament, but a director should not meet a CDN error page mid-night because somebody deployed.

**That endpoint is now load-bearing, and its shape is the point.** `server/routes.ts` answers 200
unconditionally — no auth, no Firestore, no work — and `server/index.ts` registers the SAME path
again on the fallback route path, so it answers even if route registration partly failed. Give it a
dependency and a database blip becomes a failed deploy; put it behind auth and every deploy fails.

The trade is deliberate and runs the other way too: with a healthcheck configured, a container that
never answers **fails the deploy and rolls back** instead of going live broken. That is the point of
having one.

`railway.json` overrides the dashboard only for the fields it names, so the Dockerfile, the build
settings and the environment variables are untouched.

**Every response carries security headers** — `server/securityHeaders.ts`, installed first in
`server/index.ts` (October audit, Low): `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`, because
Take control and Go Live are single presses and the console could be framed by any site; HSTS,
`nosniff` and a referrer policy. **Deliberately not a full CSP yet** — Firebase, Fonts, Stripe and
html2canvas's inline styles would each need an entry, and a wrong CSP breaks the app silently on the one
device nobody tested. `frame-ancestors` restricts who may embed the page, never what it may load.

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

**A signed FIGURE is not a formula** (October audit, Low). The defusing caught `+£40`, `-£30` and `-5`
too, because they begin `+` or `-`, so Profit and ROI arrived as text and did not sum — the very promise
above. `SIGNED_FIGURE` leaves a sign, an optional currency symbol, digits and an optional `%` alone; there
is nothing in such a cell for a spreadsheet to call. A test that expected `'-£5` was asserting the bug.

**The game results export as a CSV too**, beside the image, for the same reason and the same way:
`lib/resultColumns.ts`'s `resultsCsvTable` writes the columns, labels and cells `ResultsTable` and
`ResultsSheet` draw, from `visibleResultColumns`, so a column whose feature is off is absent from the
file exactly as it is from the screen. **One rule is the file's own: the screen's `–` becomes an empty
cell**, because a dash is text and a column with text in it will not sum. The landing page promises
both exports in both formats, which is why it exists — do not remove one without changing that copy.

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

### Recent Players is the one list of names, it follows the account, and a roster admin was removed

Reported as tedious rather than broken: a name typed wrong once sat in the pickers for good.

**What answers it is the × on each row of Recent Players**, which shipped in the first round and was
not spotted — the expanded list is searchable and every name has its own remove control.
`lib/recentPlayers.ts` owns the list: newest first, one entry per person (case-insensitive), **fifty**
kept. Removing a name costs nothing — typing it again puts it back — and needs no confirmation.

**It follows the ACCOUNT**, asked for once it became the only list of names: a new tablet started
empty. `hooks/useRecentPlayers.ts` keeps it on `userSettings/{uid}.recentPlayers` — the owner-only
document the setup sync already uses, whose rule has no field whitelist, so **no rules deploy**.
Every other writer of that document merges or touches only its own field, so nothing clobbers it.
The cap went from twenty to fifty with it: twenty was right for one device, and a list that follows
the account has to hold a league.

Four things are load-bearing:

- **The cloud copy wins outright; an absent one adopts this device's list, once; NEVER a union.**
  `resolveRecent` decides it. A union would resurrect every name removed with × on another device
  whenever an older device signed in, so × would only ever work where it was pressed. An EMPTY cloud
  list is still a list — a director who removed everything has said so. Mutants for union, local
  winning, and empty-as-absent are each caught.
- **Writes happen in `add` and `remove` and nowhere else** — never in an effect reacting to the list,
  which would write on every snapshot including its own echo. The adopt push is the one exception,
  once per uid behind a ref. A hook test asserts a run of snapshots writes nothing, and the mutant
  writing on every snapshot turns five red.
- **A live listener**, so the tablet sees the laptop's names without a reload. Two devices pressing
  Add in the same second is last-writer-wins on the array, and one name gets retyped — a transaction
  would be machinery out of proportion to that.
- **Signed out or anonymous never touches Firestore** (`!user || isAnonymous`, and not before auth
  settles); localStorage is the whole store there and the offline cache everywhere else. A failed
  cloud write logs and keeps the local list: a blocked browser already wears the "Not syncing" chip.

**Reset and Delete EMPTY it — `recentPlayers: []`, never `deleteField()`** (October audit M2). An
absent field reads as "no cloud list" to every other device still holding names, and each of them
pushed its cache straight back, so Delete did not delete. An empty list is still a list, and every
device adopts it.

**Reset and Delete clear it with the setup.** Both used to clear only `setup` on that document, and a
field left behind is pulled straight back by the next sign-in — the trap the setup sync section
records. Delete especially: these are real people's names. `userSettings` had **no rules coverage at
all** until this; three tests now assert the owner can write and read it beside the setup, and that a
stranger, an anonymous session and a signed-out client can do neither. Both denials go red under a
rule opened to any signed-in user.

Driven against the devstub's offline Firestore, which exercises the real signed-in path: the
listener answers with no document, the device's four names are ADOPTED rather than wiped, × on one
leaves three in the screen and the cache, and an added name lands at the head of the stored list. The
cross-device half is the hook test plus the rules tests, since nothing offline can be a second device.

**Two more things were built, and both were removed on request:**

- a **League Roster** list of chips under Add Player, read from `leaguePlayers`, which did Recent
  Players' job a second time; and
- a **Players** tab in Manage League — first Rename and Remove, then Rename, Hide and a guarded
  Delete.

Do not rebuild either without the reason below in hand, because the second round found it the hard
way.

**The league results join is ROSTER-OUTER, so a `leaguePlayers` document can never safely be
deleted.** `useLeague.ts` builds every row by walking players and pulling results in —
`cloudResults.filter(r => r.leaguePlayerId === player.id)` — and nothing in the app iterates
`tournamentResults` as the outer loop: not the standings, not the CSV or PNG, not
`seasonProgress.ts`'s counters. So:

| | what it costs |
|---|---|
| delete the player AND their results | real history, gone — the first round's Remove, reported straight back |
| delete the player, KEEP their results | **invisible orphans** — absent from the standings, from `countGamesPlayed` and therefore from `nextGameNumber`, which goes BACKWARDS, while still stored |

The second is the `lib/accountWipe.ts` `DELETION_ORDER` hazard in miniature. A roster admin that
wants to take a name out must hide it, and rename is free because a result carries `leaguePlayerId`
and **no name**.

Two more findings from the second round, for whoever builds one next:

- **`useLeague` merges duplicate-named documents into one row** (`:265-283`) before any consumer sees
  them, so no screen has ever been able to SEE a stale duplicate. An admin for duplicates needs the
  raw documents.
- **`recordResultByName` matches by lowercased NAME over every document**, so two players sharing a
  name split a league's history invisibly — any rename has to refuse a name another player holds,
  including one that is hidden.

**Data written while the Hide shipped (`922e209`) is left alone.** A player hidden then still carries
`archived: true`; nothing reads the field, so they simply reappear in the standings. No migration.

Removing it was a restore rather than a rewrite: `useLeague.ts` and `RealTimeLeagueTable.tsx` are
byte-identical to before the roster work, checked with `git diff` against `c6fce67` and `0704b34`
after confirming every code line those commits changed was roster code. The three rules tests that
round added stay — **adding a previously-absent field** to a `leaguePlayers` document, a **`setDoc`
that drops `leagueId`** being refused, and **deleting a league player**, owner yes and stranger no —
because they are true statements about the rules that filled real gaps, and nothing in them was ever
about the feature. They use a neutral `note` field, since `archived` would read as a real one.

Verified by driving it in league mode, where the removed block WOULD render: no `League Roster` text
anywhere on the page, `Recent Players (4)` with its search and an × per row, × on one name leaving
`(3)` and the stored list without it, and Manage League reading Seasons, Points, Stats.

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

**Levels are zero-indexed in state and one-indexed on screen** — and **a break is in `levels` but is
not a level on the clock**. Every function here takes a zero-indexed BLIND level and does the `+ 1`
internally; callers pass `blindLevelIndex(state.levels, state.currentLevel)`, never the raw index
(October audit M10). The raw index counted every break as a level, so each break before a cutoff
closed a rebuy, re-entry or late-entry window one level early and the late-entry dialog named a level
the clock was not on.

### A numeric field must accept what typing passes through

The Tables and Seats/Table fields could not be changed at all. Both were controlled inputs whose
`onChange` threw away anything that was not already a valid FINAL number:

```tsx
const v = parseInt(e.target.value);
if (!isNaN(v) && v >= 1 && v <= 20) setNumberOfTables(v);
```

So the field could not be **cleared** — backspacing to empty gives `''`, which is `NaN`, which is
rejected, so the old value re-rendered instantly and there was no way to start a fresh number — and
it could not be **appended to**, because from `3` a second digit makes `"35"`, over the maximum, also
rejected. Select-all-then-type-one-in-range-digit was the only gesture that worked. On a phone it
read as a dead control, and it was reported as one.

**Typing passes through states that are not valid numbers.** An empty field and a half-typed one are
both normal; the value is only decided when the field is LEFT. Each field keeps a **draft string**
while it is being edited and resolves it on blur.

`lib/numberField.ts` owns that rule for the whole app: `commitNumber(raw, {min, max, fallback})` —
empty or unparseable returns the fallback (what it was, so blanking a field is a no-op rather than a
surprise), and out of range **CLAMPS rather than rejects**. Clamping matters: a director who types 30
tables means "lots", and silently keeping 3 is what taught them the control was broken. A test fails
if it goes back to rejecting.

`LevelInput` in `BlindLevelsSection` already had the draft idea right and is the reason this shape
was easy to spot — it now calls the same function, so the two cannot drift. Its `0`-means-none
sentinel survives as `fallback: min` with `min: 0`.

**Verified by driving real keystrokes**, not by reading: clearing gives `""`, `12` commits as 12,
`99` clamps to 20, seats `1` clamps to 2. Note React listens for `focusout`, not `blur`, so a
synthetic `blur` event does not reach `onBlur` — a harness that dispatches one will show the draft
and prove nothing.

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

**The trust boundary that mattered:** the DIRECTOR's league settings are loaded and evaluated in the
PARTICIPANT's browser — by `PlayerSectionReadOnly`'s Points column now (October audit, Low); the
standings themselves do NOT score, they sum each result's stored `points`, which is why **changing the
points scheme mid-season never rescores past results**. So any signed-in director could put arbitrary JavaScript in a points formula and have it
run on this origin, in the browser of everyone who scans their QR code, with access to that visitor's
Firebase session. A stranger could not poison someone else's settings (writes are `userId`-scoped), so
this was director → participant, not attacker → anyone — but it was a real stored-code-execution path.

**The parser can only ever produce arithmetic.** However a formula string is contrived, there is no
path from it to executing anything — the worst outcome is a formula that fails to parse.

**The whitelist is the tables' OWN keys** — `ownKey`, not `in` (October audit, Low). `in` walks the
prototype, so `Math.constructor(5)` and `Math.hasOwnProperty(1)` parsed. One member deep and no route to
code, but the "explicitly enumerated" claim above was false until this.

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

**A check-in names its seat, and the seat must be real** (October audit, M1). The rule used to bound
only the map's type and its key COUNT, so one anonymous visitor could write a 200 KB value — pushing
the live document toward its 1 MiB limit, after which every director write that grew it failed — or
fill the count with junk keys so nobody else could ever check in. Now a check-in writes `lastClaim`
beside its one dotted path, and the rule allows a change to that key only, a string value of at most
64 characters (or none, to unclaim), and only for a seat listed in `playerIds` — which the director's
player sync writes from the roster through `lib/seatClaims.ts`'s `playerIdsOf`, since a rule cannot
look inside the players array. A game written before `playerIds` existed keeps the old count bound
until its next roster write; an unclaim is always allowed, so a removed player's seat can be released.
Each clause has a rules test that goes red when the clause is removed.

**`PlayerClaimView`'s `withRulesFallback` retries a refused check-in in the old shape.** The app ships
on every push and the rules ship by hand, so one is always briefly ahead of the other; the fallback
keeps check-in working in either order. **Remove it once the October rules are live.**

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

**A deterministic id must be created by the uid it names** (October audit, H1). Both halves of
`<ownerId>_<leagueId>` are public, and the create rule checked only the document's own `userId`, so
anyone could create a director's slot first — locking them out of saving it, and, with no `settings`
in it, crashing their console and every participant's phone, since the hook adopted whatever it found.
The rule now requires `settingId` to start with the writer's uid (auto-id templates carry no
underscore), `completedTournaments/<ownerId>_<gameId>` takes the same bind, and the reader adopts a
document only through `currentSettingsFrom` — the director's own, shaped like settings — so documents
squatted before the rule changed are refused too. A participant read never writes the local cache.

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
- **And the signed-out bucket is then ARCHIVED under the adopter** (`::local@<uid>`, October audit
  H2). It used to stay where it was, so every account that signed in later adopted it again: a second
  director inherited the first one's structure, event name, logo, roster and player names, and the
  setup sync and Recent Players pushed them into the second account's cloud copy. Archiving keeps
  copy-never-move's promise — nothing is destroyed, and a source key is removed only once its archive
  copy reads back — while making it nobody else's to inherit. Reset clears the archive with the rest
  of the account's setup.
- **An account change this tab did not make is a logout** — `hooks/useAccountChangeIsALogout.ts`,
  mounted in `PokerTimer` (October audit M4). Signing out in another tab, or signing in as somebody
  else on the "Sign in to run this game" screen, changed the account under a console still holding
  the first account's game in memory; its mirror then wrote that roster into the next bucket every
  second, and the next account's setup sync pushed it to the cloud. Only a change AWAY from an account
  this tab had confirmed counts, so a cold load never fires it and an expired session cannot loop.

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

The same document carries **Recent Players** (`hooks/useRecentPlayers.ts`) beside the setup, on a
different shape on purpose: a live listener rather than a read at sign-in, and writes only from the
two actions. See "Recent Players is the one list of names".

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
`isFinalTable` still true. The arrangement is snapshotted **before** the redraw (now
`state.preConsolidation`), and `consolidationAfterReturn` puts it back at every door a player returns by
when the field outgrows the table again — which is exactly the case that caused the collapse. (A
standalone `undoFinalTable()` did the same and was called by nothing; it was deleted in October.)

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

**And the dismissal is DROPPED once the field grows back past one table.** Latching against the
count fixed the reopening, then caused its own failure one level up: nine players on eight-seat
tables, one busts, the director takes the rebuy offered in the prompt — and when that player busts a
second time, nothing. The latch held 8 and the field had come back to 8, so the answer given about
the first bust-out silently swallowed the question about the second. `dismissalIsStale()` is what
clears it, and `TablesSection` drops the latch when it fires. **A count recurs; a question does not** —
`promptDismissedFor` can only say "the field is still this size", never "this has already been
asked", and must not be relied on for the latter.

Worth knowing about the shape of that write: the dialog's rebuy button fires `onRebuyTrigger()` and
`onClose()` in the same tick, so the latch records the count from BEFORE the rebuy. That is left
alone deliberately — the staleness rule drops the latch the moment the field grows, so the stored
number stops mattering, which is the point.

**The prompt is mounted at PAGE level, in `components/FinalTablePrompt.tsx`, and that is not tidying
up.** It used to live inside `TablesSection` — the **Seating tab** — and this app unmounts inactive
tab content, so the effect that opens it could only run while that one tab was on screen. A director
knocking players out from the **Players** tab, which is where the roster and its KO buttons are, was
never asked about the final table **at all, at any count**. Found by driving it: three bust-outs from
the Players tab, no dialog, which is indistinguishable from the latch bug above and was very nearly
mistaken for it.

Two things that were always meant to last now actually do, because the component no longer unmounts:
a "Not yet" dismissal, and "Not this game". Both used to be rearmed by wandering off to Buy-ins and
back.

`TablesSection` is TOLD whether the prompt is up (`finalTablePromptOpen`) rather than knowing, so the
uneven-tables prompt still stands down while it is open — two dialogs at once would be two questions
about the same bust-out. And `mostRecentlyBusted()` moved to `lib/eliminationOrder.ts`, because both
prompts offer to rebuy whoever just busted and neither may have its own idea of who that is.

Asking on each bust-out is not nagging — each one is genuinely a new question, and
`promptDismissedFor` caps it at one prompt per bust-out. **"Not this game"** silences it for the rest
of the tournament, for the director who means to arrange it themselves. That flag is component state,
NOT tournament state: it is a preference about a question rather than a fact about the game, and in
`state` it would sync to Firestore and out to every participant device. A page refresh therefore asks
once more, which is one dialog rather than lost data.

### A busted player has to be reachable from the screen the director is on

`TablesSection` already had a rebuy button, drawn **inside a seat** and gated on
`isActive === false` — and it could never appear, because `eliminatePlayer` sets `seated: false` and
`tableAssignment: undefined`, so a busted player leaves the grid the instant they bust. There was no
seat left to hang it on. The only route back in was the players list, which is a screen change in the
middle of the one moment a director is busiest.

The **Busted strip** under the tables is where they actually are, most recent first, because the
player a director is reaching for is almost always the one they just knocked out.

**`components/PlayerEntryActions.tsx` is the only implementation of RE-ENTERING someone.** There were
three — the seat, the players list, and the dialog inside each — and they had already diverged on the
interesting question: what to do when the action is NOT available. The players list drew the button
**disabled and silent**; the seating screen **hid** it. A director who set a cap and used it saw a
greyed-out button on one screen, nothing at all on the other, and had no way to tell whether the rule
was working or the app was broken. Both now show it disabled **with the reason on it**, from
`lib/entryLimits.ts`, so the wording lives with the rule.

**It used to carry the rebuy too, and its absence is now the feature** — see the rebuy/re-entry
section above. A rebuy is taken at the bust-out, so the strip carries a single line saying so rather
than a disabled button against every name: without it the missing control reads as the app being
broken, which is the complaint that produced `rebuyUnavailableReason` in the first place. The line
shows only when rebuys are ON, because a director who never enabled them is not owed an explanation
for the absence of something they switched off.

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

**There is ONE bust-out dialog, `components/BustOutDialog.tsx`, and there used to be two** (October
audit, Low). The Players tab's offered everybody still in and closed out the tournament when nobody was;
the Seating tab's offered only the busted player's own table and demanded a pick — so a lone player on a
table, or heads-up across two, could never be knocked out from the Seating tab. The fix had reached one
door of two. `hitmanCandidates` in `lib/eliminationOrder.ts` is the rule, own table first; each screen
keeps only what the bust-out DOES, since the Seating tab passes the chair being left.

### The Seat Players dialog described a seating that was never going to happen

The line under the player list — *"Will seat 8 players evenly on 2 tables"* — worked its own table
count out from **hard-coded constants**:

```tsx
const maxTables = 3;        // Maximum number of tables we support
const maxSeatsPerTable = 6; // Default seats per table
```

The dialog was never passed `settings.tables` at all, so it could not have known better, and it then
picked its own "optimal" split rather than the one `seatPlayersManually` performs. It was right only
by coincidence — and at a final table, where the answer is always "one table", usually not.

`lib/seating.ts`'s `planSeating(count, {numberOfTables, seatsPerTable})` is the single derivation
now, and **the seater takes its per-table counts from it too**, so the sentence a director reads and
the seating they then get cannot disagree. Which SEAT each player takes stays in the component,
because that depends on chairs held by players outside the selection.

**The `count <= seatsPerTable` branch is the one to protect**: everybody who fits on one table goes
to one table, rather than being divided across the tables the game started with. A test fails if it
is removed. It also reports **overflow** — how many will not fit — which nothing said before; the
tables just filled and the rest were left standing.

**The wording follows `allSeated()`**, the same predicate as the Seating tab's button, so the two
controls cannot say different things about one action: at a final table the dialog is *Randomize
Seats* / *Randomize Selected*, otherwise *Seat Players* / *Seat Selected Players*.

Worth knowing for the next harness: the add-player field uses **`onKeyPress`**, not `onKeyDown`, so a
synthetic `keydown` never adds anybody — click the Add button. And the dialog's Select All is a
shadcn `Checkbox` with `id="select-all"`, not a `<button>` with text.

### Nobody gets a seat that does not exist, and there were TWO seaters handing them out

Reported from a real game: 17 players, press **Seat Players**, and 16 are seated with Table 1's
header reading `9/8 seated · -1 empty`.

**A display bug it is not.** A ninth player really was on an eight-seat table, at `seatIndex: 8` —
`seated: true`, drawn nowhere, with no KO button and unreachable by Move mode. A ghost. The header
was a faithful rendering of corrupt data, and `-1 empty` is how the director found out at all.

**There were two seaters, with different arithmetic, and only one of them was the one that bit.**
That is the fault, not either bug:

- `TablesSection`'s `seatPlayersManually` called `planSeating`, which correctly answers
  `{ perTable: [8, 8], overflow: 1 }` — and **used only `perTable`, throwing `overflow` away**. The
  seat list held 16 entries for 17 players and a never-crash fallback,
  `shuffledSeats[i] || { tableIndex: 0, seatIndex: i }`, **fabricated** the seventeenth chair from
  the array index.
- `PlayerSection`'s `seatAllPlayers` — the button on the Players tab, which is the one a director
  presses **having just added the players** — did the whole thing itself. It worked out
  `tablesNeeded = min(ceil(field / seatsPerTable), numberOfTables)` and then divided the field across
  that cap **without consulting `seatsPerTable` again**: `base = 8, extra = 1`, so table one was
  handed NINE chairs, seat indexes 0 to 8. No fallback needed — it minted the chair directly.

Two components, two answers to "how many chairs does a table have", and the app's own `planSeating`
consulted properly by neither. The same shape as `consoleTournamentId()` and the rake formula: one
fact deriving itself twice.

**`lib/seating.ts`'s `assignSeats(count, occupied, plan, cfg)` is the one derivation now**, and both
seaters call it. It returns only chairs that EXIST; the caller leaves anyone it could not place
`seated: false, tableAssignment: undefined` — a state the whole app already understands, unlike a
seat that is not there. **The extraction is the fix rather than tidying**: the defect lived inline in
two components, neither exported and neither testable, which is the argument `lib/tableBalance.ts`
was pulled out on.

**It heals a game already in that state.** A player at a seat index beyond `seatsPerTable` is not
treated as holding a chair, so the next Seat Players frees the ghost. Nothing is migrated — the
`payoutsOf()` trade.

**The count is clamped in the header too**, `Math.max(0, seatsPerTable - tablePlayers.length)`. Belt
as well as braces: nothing new can go negative, but a game seated before this shipped still carries
the ghost. `9/8` is left honest rather than hidden — a table genuinely over capacity should say so.

**It warns and never refuses**, the call `lateEntryClosedReason()` already makes. Seating most of a
field is a legitimate thing to want and the director is the one standing there; what is not
legitimate is doing it silently, which is what "16 of 17 and one ghost" was. Both entry points now
put the same three choices up — Cancel, **Use N tables and seat everyone**, and a confirm that says
what it will do (**Seat 16 of 17**) so the number is in front of the director as they press it.
`tablesNeededFor(count, seatsPerTable)` works the count out, clamped to the Tables field's own
maximum of 20, because offering a count the input would refuse is worse than offering none.

**The Seating tab's warning already existed and was unreadable.** It carried a literal `\u2013` in a
JSX **text node**, where it is not an escape — so it printed those six characters on screen. That is
most of why a warning that was there read as the app being broken.

**Two traps in the "add tables" button, both real.** `numberOfTables` is `useState` synced from
settings by an effect and `updateSettings` does not reach it in the same tick, so **the new count is
passed explicitly** to the seating and to `saveTableConfig` rather than read back from state. And
the Tables input keeps its own draft string, so `setTablesDraft` has to move with it or the field
shows the stale number.

`tableNamesFor(existing, n)` is in the lib for the same one-derivation reason: **two places add a
table now**, and a second spelling of `Table {n}` is how one table ends up named and another not.

Verified by driving the reported sequence in the devstub and reading the MIRROR, not the picture —
a ghost at seat 8 and a correctly unseated player look identical on the grid, which is how this
survived. Before: `perTable [9, 8], maxSeat 8`. After, both entry points: the prompt, then
`[8, 8], maxSeat 7`, one honestly unseated — or **Use 3 tables**, giving `[6, 6, 5]`, all 17 seated,
no duplicate chair and nothing out of range.

**A seating plans against the chairs that are FREE** (October audit, Low). `planSeating` takes the
`occupied` set too, and `assignSeats` spills anyone a table's share left over into any free chair — Seat
Selected with table 1 full and ten selected across three eight-seat tables used to promise ten and seat
six. `occupiedChairs` is the one spelling of "held by somebody outside this selection", shared by the
seater and the dialog, and the dialog counts its summary from the seats actually handed out.

**Changing the tables mid-game asks first, and the grid draws every table** (October audit, Low). The
Seating tab drew at most six while the Tables field allows twenty — table 7 onward was in the game and on
no screen, behind a "+N more tables" card — and lowering Tables or Seats/Table saved at once, leaving
whoever sat in a removed chair `seated` and drawn nowhere. `strandedBy` finds them and `reseatStranded`
moves only them into free chairs of the new configuration, unseating anyone there is no chair for. It warns
and never refuses. Radix's `AlertDialogAction` also fires `onOpenChange(false)`, and that close is what
Cancel and Escape revert on — `confirmingConfigRef` is what stops a confirm reverting itself.

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

`lib/tournamentMode.ts`'s `modeLockReason()` closes it, **at the first bust-out and not before**.
Until someone has a finishing position there is nothing to back-fill and flipping is a legitimate
correction — a director realising this should be tonight's league game after all. It is the moment
results become recordable that the choice stops being free. `handleEnableLeague` re-checks it so no
other caller can walk around the disabled button.

**Once the game is OVER the two directions stop being the same question, and that took a second
pass.** The first version was `gameTypeIsLocked(players)` — has anybody got a finishing position —
which is true from the first bust-out and true for good, so the slider was still dead on a game that
had finished hours before. A director whose league night was over could not say "the next one is a
casual game" in the one control that means exactly that, and the route that did work was to press
**Next Game** — i.e. start the next LEAGUE game — and flip afterwards. Reported, fairly, as
counter-intuitive.

- **A finished league game → Standalone is allowed.** Its results were written at each bust-out and
  are already in the standings; the game itself is already in History. Nothing is half-recorded and
  nothing is abandoned.
- **A finished standalone game → League is not.** `syncLeagueResults` would back-fill that whole
  night into whichever league is selected, as real results with real points. The game being over
  does not make that any safer.

**Stopping takes nothing back. Starting invents a night the league never had.** A test asserts the
asymmetry and fails if it is ever collapsed back into one predicate — which it will look like it
wants to be.

Sliding a FINISHED league game to Standalone therefore starts the next game rather than editing the
finished one, because a finished game's type is not a setting anybody wants to change: what they
want is the casual night after it. It asks first — everything is already saved, but a table
disappearing unannounced is not something to do to a screen somebody is looking at — and the
confirmation says where the night went (History, and the standings) rather than advertising that the
blinds are kept, which templates make cheap anyway.

`hooks/useNewGame.tsx` is the one implementation of starting a fresh game, shared by that slider and
by `NextGameControl`. A one-off button inside the next-game dialog was tried first and removed: the
slider is where "what kind of game is this" lives, and a dialog headed *Start next league game* is
the wrong place to offer a game that is not one.

It says why. An unexplained dead control is what sent a director to ask what the slider does in the
first place — and the reason shown is for the mode the game is NOT in, because that is the button
somebody would actually press.

**Already-contaminated data is not migrated.** Stray results come out through normal league admin; a
migration guessing which results were a demo and which were real is how a league loses its standings.

**The LEAGUE cannot be switched mid-game either, by the same logic** (October audit H5). Manage
League's league picker — and its New button, which switches to the league it creates — moved the
console's selected league, and the recorder writes into the SELECTED league: every later bust-out went
into the other one, scored by its scheme against its season, while the game still named the first.
Two layers, as with the mode:

- **The rule, at the recorder:** it never writes while the selected league differs from the game's
  own `settings.leagueId` (if the account still has that league — a game naming a deleted one must
  not stop recording silently). Results wait and land once the two agree. Inline in the page effect,
  so no unit test reaches it.
- **The screen:** `leagueSwitchLockReason` in `lib/tournamentMode.ts` — locked from the first result
  to the end of the game, the `modeLockReason` window — and `LeagueScopeBar` then renders neither the
  picker nor New, with one line saying why. Rename stays; it changes no results.

### At the end of a game NOBODY is active, and three screens were gated on the opposite

`eliminatePlayer` awards the last player standing `position: 1` **and `isActive: false`, in the same
state update** — that is how the rest of the app tells a finished game from one still in play. So at
the moment a tournament ends, a count of active players is **zero**, never one.

FOUR pieces of UI asked for exactly one active player, and therefore none of them had ever been seen
on a completed game: the **Tournament Winner card** in Tournament Info, **the identical card on a
player's phone** (`ParticipantTournamentInfoCard`, found a day later — the same line, copied), and
the Tournament Over banner on both screens. Not subtly wrong — dead. It is why the end of a night had
no marker on screen at all, and why a director asked whether the app needed an "End Game" button.

The banner has since been deleted on sight (see the emoji note above), so the winner card is the
marker on both screens. The count is worth keeping: one bad predicate, copied four times, each copy
invisible because the thing it hid was invisible.

`lib/gameOver.ts` answers it once: `gameIsOver(players)` (at least two players, nobody still in,
somebody holding position 1) and `winnerOf(players)`. The winner has to come from the **position**,
because there is no active player left to read a name from.

**"Still in" is `isActive !== false` AND no finishing position.** An absent flag means active
everywhere in this app — `eliminatePlayer`'s own comment records what reading it as inactive cost
last time — but a player restored from an older document can carry a position with no flag. A player
still in the game never has one, so the extra clause can only add players the flag alone would miss,
and it makes one predicate right for both console state and a document read back from Firestore.

A test asserts the real end state (every player inactive, one with position 1) is over, and it
**fails against any predicate rewritten as "exactly one active player"** — mutation-tested, since
that is the shape that hid all three.

**Three more spellings were left after that, and they are gone too** (October audit M16): the
participant view's own "TOURNAMENT FINISHED" predicate, the timer tick's "all but one eliminated", and
`getCurrentBlinds`'s "Finished" — while `TimerCard` beside them already asked `gameIsOver`. They could
disagree after an undo of the final hand; since the undo now puts the champion back in play that state
is not reachable by undo any more, but one question has one answer.

`useTournament`'s exported `isComplete` went with this. Nothing consumed it, and it ORed "the blind
structure ran out" into "the game is over", which are different questions. `PlayerSectionReadOnly`'s
`isFinished` deliberately stays as it is: it decides whether a seat badge is worth drawing and is
already ORed with an active count.

### The winner did not bust out, and five places thought they did

`eliminatePlayer` awards the last player standing `position: 1` **and** `isActive: false` in one
update — the fact the section above exists for. `lib/eliminationOrder.ts`'s `isFinished` is
`isActive === false && position > 0`, which the champion satisfies, and `mostRecentlyBusted` takes
the **smallest** position. 1 is the smallest number there is, so **at the end of every game it
returned the winner.**

What that reached: the rebuy offer opened on the champion — *"{Name} is out in 1st — rebuy?"* — they
were handed a **persisted** failsafe Rebuy button, they headed the **"Busted — most recent first"**
strip (position 1 sorts to the top, directly under the caption), and their row in the Players list
and their seat both carried a **Re-enter** button.

**On default settings.** `DEFAULT_PRIZE_STRUCTURE` allows rebuys with no period, and `canRebuy`
deliberately does not ask whether the player is eliminated. The last hand of an ordinary tournament
ended with a dialog asking the winner whether they would like to buy back in.

**"A player who busted" was spelled out five times** — `isFinished` here, twice more inline in
`lib/rebuyOffer.ts` (`failsafeRebuyId` and `bustedKeys`), and a bare `isActive === false` at the
strip and the Players row. `isBustOut` and `bustedPlayers` in `lib/eliminationOrder.ts` are the one
spelling now, and all five read it.

**The exclusion is `position !== 1` FLAT, not "unless `gameIsOver`", and that is the whole fix rather
than a shortcut.** Gating it on the roster looks tighter and hands the champion straight back,
because a roster really can hold a winner at position 1 with somebody active:

- **Add a player to a finished game.** `addPlayer` WAS unconditional and wrote `isActive: true`. It
  is refused now (see "A finished game takes no new entries" below), but this bullet is why the
  exclusion was made flat, and the case below still needs it.
- **Undo the RUNNER-UP's bust-out.** `undoBustOut` clears a false winner only when two or more
  players are active afterwards, and restoring 2nd place makes exactly one. The champion is left
  stranded, inactive at position 1.

Bustedness is a fact about the player's own row, like `isFinished`, so no other row can resurrect
it. A test asserts both states and a mutant re-introducing the `gameIsOver` gate turns six red.

**`isFinished` survives, and must.** `nextEliminationPosition` and `positionsAfterReEntry` ask who
already holds a finishing NUMBER, which the winner does — routing them through `bustedPlayers` hands
the next bust-out a position somebody already has, the collision that module exists to fix. **Two
predicates, and they are not the same predicate.** The test that catches it needs a roster of four
(a late player added to a finished game): with only three, `Math.max(1, …)` clamps both answers to 1
and the mutant survives.

**A SECOND gate was needed, at the two sites that act on it: a finished game has no rebuy.**
Excluding the champion hands the question to the runner-up, whose key is unseen and who passes
`canRebuy` — so the dialog would open on a tournament `PokerTimer` has already written to history,
and taking it runs `positionsAfterReEntry`, which shifts the winner from 1st to **2nd** and leaves
nobody holding the title. `lib/rebuyOffer.ts` calls `gameIsOver` at the top of `rebuyToOffer` and
`failsafeRebuyId`. Note the division of labour: **`position !== 1` is a fact about a player** and
lives in `eliminationOrder.ts`; **"the game has ended" is a fact about the roster** and lives where
it is acted on.

**`failsafeRebuyId` is the leg nothing else covers.** It never calls `mostRecentlyBusted` — it
resolves a key restored from localStorage itself, which is why its inline copy left the champion
holding a Rebuy button across a refresh after the dialog was already fixed. A mutant restoring that
copy turns a test red only because one fixture is a **stranded** champion; the finished-game gate
returns early and hides it otherwise.

**The way back from a misrecorded final hand is Undo bust-out, which still lists the winner** — free
and reversible, where a re-entry charges a buy-in, increments `reEntries` and renumbers every finish.
`components/PlayerEntryActions.tsx` is where the winner is refused, because CLAUDE.md already names
it the only implementation of re-entering someone: one gate, not one per call site.

**Every existing fixture used positions 2 through 9 and never 1**, in all three test files, which is
why 900 passing tests said nothing. Driving it is what confirmed the fix: a real 3-player game to the
final hand shows no dialog, no entry control anywhere, `Dave 2nd / Amy 3rd` in the Busted strip with
the champion absent, and the Tournament Winner card up.

### The places stay a run from 1 to the field, whatever changes the field

October audit H7 and M7. `nextEliminationPosition` is `field − already placed`, which is only right
while the field never changes underneath it — and three actions changed it without renumbering:

- **A late entry** (`positionsAfterAdd`): nine players, three out (9th, 8th, 7th), one added — and the
  next one out was ALSO 7th, while nobody was ever 10th. Everybody already out now moves one place
  worse, because in the bigger field that is where they finished.
- **A removal** (`positionsAfterRemove`): everybody who finished below the removed player moves up
  one, or a place larger than the field — 9th of eight — was left for a points formula built on
  `p ≤ f`.
- **Undo bust-out** now renumbers exactly as a re-entry does, and **whoever held 1st goes back into
  play**, keyed on who held it BEFORE the renumbering. Undoing the FIRST player out of a finished game
  used to leave the champion at 1st with one player in; busting that player again awarded a second
  1st and recorded two winners. The Undo dialog lists the most recent bust-out first now — the row a
  director reaches for — with the winner last, since the winner did not bust. Its no-id fallback took
  the HIGHEST position (the first player out); it is `mostRecentlyBusted` now.

**A moved finisher is re-priced** (`repricedForNewPlaces` in `lib/resultStats.ts`, through one helper
in `useTournament` at all four doors). `prizeMoney` was fixed at the bust-out, so a 3rd-place
finisher pushed to 4th by a re-entry kept the 3rd-place money — shown by the results table's fallback,
recorded as Cash, and paid again to the eventual 3rd. Their money is now the payout for the place they
hold, from the pool as it stands (`payoutForPlace`), plus `bountyTakeFor`'s bounty money.

`useTournament.positions.test.tsx` drives every one of these through the real hook; dropping the
renumbering at any door, or the re-pricing, turns it red.

**And a chair must exist and be free** (October audit M15). `seatToReclaim` takes the table
configuration and refuses a chair on a table no longer in play or past the end of one — after a table
break a rebuy returned a player to table 3 of two, the ghost again. `breakTable` carries busted
players' remembered chairs with the renumbering, and forgets one on the table that went.
`restoreSeating` puts back only players still in — a player who busted AT the final table is in the
snapshot and was being handed a chair — and moves anyone whose chair it hands back to a free seat at
the same table, or unseats them. One `finalTable.test.ts` fixture had been asserting a double-booked
chair; it was the fixture that was wrong.

### A finished game takes no new entries

Reported: a player was added to a tournament after it had finished. Nothing stopped it, and a second
door with a worse version of the same fault had been open all along.

**Adding a player un-finishes the game.** `gameIsOver` reads "nobody still in, somebody holding 1st",
and `addPlayer` writes `isActive: true` — so one added player took away the Tournament Winner card
and the gold timer face on the console and every participant's phone, after `status: 'completed'`
and History had already been written. Bust them out and they are the last one standing, a second
claim on 1st, with a league result for a night they never played.

**Re-entering the runner-up demoted the champion.** `PlayerEntryActions` refused the WINNER but
`reEntryUnavailableReason` never asked whether the game was over, so 2nd place could still be
re-entered — which runs `positionsAfterReEntry` and moved the winner from 1st to 2nd. Driven with the
gate taken out and re-entries allowed: `Amy:out#2 Dave:in`. The rebuy offer and failsafe were already
gated by `lib/rebuyOffer.ts` for exactly this reason; the re-entry had been missed, and neither
action was gated at all.

**Why this REFUSES when late entry only warns.** Late entry warns because someone arriving at the
door is a fact about the world and the director is standing there. After the final hand there is no
game left to arrive at — what a director actually wants is the next game, or a corrected ending.

Two layers, and both are wanted:

- **The rule is at the actions.** `addPlayer`, `processReEntry` and `processRebuy` in
  `useTournament` return `prev` when `gameIsOver(prev.players)`, inside the updater — enforced where
  every caller passes. **`undoBustOut` and `removePlayer` are deliberately NOT gated**: they are the
  way back from a wrong ending and the way to take back a mistaken add.
- **The screen does not offer what the action refuses** — not mounted, the `DirectorOnly` rule.
  `PlayerSection` replaces Add Player, its autocomplete and Recent Players (every name there is an add
  button) with one line; `PlayerEntryActions` takes a `gameOver` prop and renders nothing, game-wide
  like a feature switched off, rather than a disabled button against every name.

`processAddon` is gated at the action too (October audit, Low) — the add-on window, a player still in,
one each, and not after the final hand — for the same reason: it checked only `allowAddons` and relied
on the screen for the rest.

`lib/gameOver.ts`'s `finishedGameNote` owns the sentence — *"This game is over. To correct the
result, undo the last bust-out — otherwise start the next game."* — because a line that only says no
is what `rebuyUnavailableReason` was written to replace.

**The action gates have no unit test**, because `useTournament` imports Firebase and has no test file.
They were proved by driving the REAL hook in the devstub: three players to the final hand, then add,
re-entry and rebuy each refused with Amy holding 1st, Undo bust-out reopening the game and the add box
coming back. Each gate was then taken out by hand and the drive re-run, and the fault reappeared —
`Late Arrival:in` on a finished game, and the champion demoted. **Clear storage between such runs**:
the first mutant run read the previous run's roster back out of the local mirror and proved nothing.
`PlayerEntryActions` had no test at all; it has one now, and dropping the `gameOver` check turns it
red.

### Starting the next game is league business, and the number it offers is a different question

`components/NextGameControl.tsx` is the only implementation of starting a game, and in league mode it
mounts in **`LeagueSection`'s header row**, beside Manage League. It used to live in the *Tournament
Setup* card's header — two sections below the league panel, with the banner block in between — which
is the wrong neighbourhood for moving to the next game of a season. A standalone game keeps it in the
setup card, because there is no league panel to hold it; it renders once either way. It goes in the
panel's HEADER rather than its body so that collapsing the panel does not fold the night's next
action away with it.

**`nextGameNumber` is not `gameNumberFor`.** The dialog's button used to read the latter, which
answers *"which game is the one in progress"* — correct for the headers, because a game that has just
been played and is still on screen IS game 1. The dialog asks what number the NEXT game will get, and
nothing added one, so a director who had just finished game 1 was offered **"Start Game 1"**.
`nextGameNumber(seasonId, leaguePlayers)` is `countGamesPlayed + 1`, and it deliberately does **not**
take the in-progress `localGameId` — taking it is the invitation to reintroduce the bug. One test
asserts both contracts against the same fixture so neither can be collapsed into the other.

**The next game is not always this season's next game** — but only the LEAGUE part of that belongs
in this dialog, and its picker already does it. Going standalone is a change of the game's TYPE, so
it belongs on the mode slider, and that is where it lives (see the section above). A third button
here reading "One-off game, not in a league" was built and removed the same day: a director whose
league night has ended reaches for the slider, not for a dialog headed *Start next league game*.
`standaloneSettings()` in `lib/tournamentMode.ts` is the one answer to "make this game standalone",
shared by the slider's two paths. A red **"Full reset (clears structure & switches to standalone)"** link
at the foot of the same dialog went later for the same reason — reported as making no sense there. The
standalone game's own **New** dialog keeps its Keep structure / Full reset choice, where it does.

**A finished game reopens when its ending is undone** (October audit M12). The completion effect writes
`status: 'completed'` and History at the final hand, and nothing un-wrote either — so after Undo
bust-out, the documented correction for a misrecorded final hand, resume and handover skipped the game
and History kept the first winner. `shouldReopen` (`lib/gameOver.ts`) spots a finished status on a game
no longer over; `PokerTimer` clears it through the door and forgets the history key, so the next ending
re-saves History over the same record. The rule is tested; the effect is inline in the page and was
verified by reading — the offline devstub cannot round-trip the status.

**There is deliberately no "End Game" button.** A finished game already marks itself — `PokerTimer`'s
completion effect writes `status: 'completed'` and a `completedTournaments` record — and the mode lock
staying on after the final hand is correct, not a bug: `syncLeagueResults` records every eliminated
player not yet processed, so flipping a finished standalone night to League would back-fill the whole
thing into a league. Starting the next game is what clears the roster and releases the lock, and a
second control that also ends a game is the "two ways to create a tournament" trap with the sign
flipped.

### An ended season takes no next game, and ending one must leave the way forward on screen

Reported: after the last game of a season the director pressed **End Season**, then **Next Game**
offered — and started — **"Game 13 of 12"**, recording a night into the season they had just closed.
Three faults lined up, and each one alone looked harmless:

1. **Ending a season does not move `activeSeasonId`.** `endCurrentSeason` sets `status: 'completed'`
   and nothing else, so the ended season stays the current one every new game is attributed to.
   That is deliberate — ending and starting the next are separate decisions — and it is why
   everything downstream has to ask about status rather than assume.
2. **Ending removed the way forward.** `SeasonDashboard`'s "looks finished" banner carried both End
   Season and Start Next Season, gated `!isCompleted`, so pressing End Season took Start Next Season
   off the screen with it. Next Game was the only thing left to press.
3. **Next Game never asked.** It listed ended seasons in its picker, offered `nextGameNumber` (games
   played + 1) for whichever season was current, and printed its own inline `Game ${n} of ${total}`.

`lib/seasonProgress.ts`'s **`nextGameState(season, gamesPlayed)`** is the one answer —
`'ended' | 'full' | 'open'` — and the dialog acts on it:

- **`ended`** — no button starts a game in it. The dialog says so and offers **Start next season**
  (see below — it leads to the season set-up). `handleLeagueNewGame` refuses an ended season too, so no future caller walks round the
  button. Ended seasons are dropped from the picker. **Ended outranks full.**
- **`full`** — every scheduled game played, not yet ended. Start next season is the main action and
  an extra game is still offered underneath — **warned, never refused**, the `lateEntryClosedReason`
  call: a rescheduled night is real and the director is the one standing there.
- **`open`** — as before.

**Full is by GAME COUNT only, never the end date.** `isSeasonComplete` reads the end date too, which
is right for its advisory banner; a past end date with games still owed is a cancelled week, and
steering a director away from them would be wrong. A mutant reading the end date turns a test red.

**`nextGameLabel` deliberately does not clamp**, unlike `gameProgressLabel`. Clamping is the kinder
lie on the header of a game already being played; in a dialog about to START a 13th game it would
print "Game 12 of 12" over it. Past the schedule it reads **`Game 13 — beyond the 12 scheduled`**.

**The default season moves on with the league.** The finished game on screen still carries the season
it was played in; once that has ended and the league has a current season that has not, Next Game
defaults to the current one.

`SeasonDashboard` now shows **"{season} has ended"** with Start Next Season once the current season is
ended — the way forward survives the act of ending. `NextGameControl` and `SeasonDashboard` had no
tests; both do now, mocking their hooks, and seven mutants across the rule, the label, the default
and the two screens are caught. Seasons come from Firestore, offline in the devstub, so the dialog
could not be driven with real seasons there — the component tests are the cover, stated not implied.

**A game already started into an ended season is not cleaned up.** Results are written at each
bust-out, so one nobody has busted from yet has recorded nothing; one that has needs the stray rows
removed by hand in the Firebase console, since there is no in-app result admin.

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

**It stands down for a table BREAK too** — `shouldAskToBalance` (October audit, Low). The break prompt
lives in `FinalTablePrompt` and reports itself open through an effect, so for one commit after the
bust-out that caused both, this prompt could not see it and opened on top. Asking the break predicate
directly closes that window, the way `shouldPromptForFinalTable()` already did; a break also evens the
tables that remain, so it is the question to answer.

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

**And the timing is half the distinction, which the app got wrong for longer.** A rebuy is taken
IMMEDIATELY: the player has just busted, is still in their chair, and buys chips there and then.
Coming back later, to a new seat, is a re-entry. The seat behaviour above was right all along while
the timing treated the two as identical — both gated on nothing but `withinPeriod(currentLevel, …)`
— so a Rebuy button sat beside every busted player's name for as long as the rebuy period ran, and a
director could bust someone in level 2 and "rebuy" them in level 6. That is not a rebuy in any
cardroom.

`lib/rebuyOffer.ts` and `hooks/useRebuyOffer.ts` ask ONCE, at the bust-out, through
`components/RebuyOffer.tsx`.

**One Rebuy button survives that, deliberately, and it is a failsafe rather than a relaxation.** The
offer arrives at the busiest moment of the night and "No — they are out" is one tap away from
"Rebuy"; under a strict reading a stray press ends a player's night with no way back. So
`failsafeRebuyId` keeps a Rebuy button on **exactly one player** — and it goes the moment anybody
else busts, that player rebuys, or the period ends. The window is until the next bust-out, which is
minutes, not the whole rebuy period. What it is not is the old behaviour, where every busted player
kept one and a level-2 bust-out could be "rebought" in level 6.

**It hangs on the bust-out this console WITNESSED, not on whoever is most recently busted, and that
distinction was a shipped bug.** Asking the roster "who busted last" is a question whose answer
**moves backwards**: taking the failsafe makes that player active, so the next-most-recent bust-out —
an older one — became the answer and inherited the button. Reported from a real game: rebuy Amy, and
Dave, who busted before her, gets a button he should never have again.

Positions cannot correct it. `positionsAfterReEntry` renumbers only players who finished AFTER the
returning one, and there were none below Amy, so the roster ends up indistinguishable from "Dave
busted first and nobody has busted since".

It is **the same trap `rebuyToOffer` takes a SET for** rather than a single key, and its comment said
so — the dialog was already safe and this was not, because the fix had not been carried across.
`useRebuyOffer` tracks the latest key it has witnessed, advancing only for a key **not already in
`seen`**, which is what keeps an older bust-out out of the running. `offerKey` carrying the rebuy
count then makes it self-closing: once that player rebuys their key moves from `id:0` to `id:1` and
stops matching, so all three ways the button should vanish fall out of one comparison. A mutant that
derives it from the roster again turns two tests red.

It is **independent of the answered-set on purpose**: declining the dialog must not take the failsafe
away, or it would not be one. And it is shown-or-absent, never shown-disabled — "somebody else has
since busted" is not a rule about this player that a director can act on, so a greyed Rebuy against
every name would be the noise this change removed. The Busted strip says it once at the top instead.

**It survives a refresh, and that cost one localStorage entry rather than the schema change it was
first costed at.** The estimate assumed surviving across DEVICES; a refresh is the same device, so
only the KEY has to persist — everything else recomputes from the roster and `failsafeRebuyId` needed
no change at all. Every property came along for free: a player who rebought before the reload has
moved from `id:0` to `id:1`, so the stored key stops matching and nobody holds the button; a later
bust-out means the stored key is already the newer one; and a period that lapsed while the page was
away fails `canRebuy` on restore.

**It is stored WITH the game id**, or a key left over from last night would be matched against
tonight's roster. `failsafeRebuyId` would almost certainly reject it, wanting a player with that exact
id still busted — but "almost certainly", resting on player ids never colliding, is a coincidence
rather than a reason. Restored in the same breath as the `seen` seeding, because the two answer one
question — what did this console already know? — and must not disagree by a render.

**Bare `localStorage`, deliberately NOT `lib/scopedStorage.ts`.** A failed `setItem` through the
scoped helpers flips a storage-health flag that is GLOBAL — any key, not just its own — which raises
`PokerTimer`'s standing *"This device cannot keep a backup"* banner. That banner is about the local
mirror, the thing whose loss costs a director their tournament. Raising it because a rebuy-failsafe
key could not be written would be a false alarm about losing the game, over a convenience whose worst
failure is a button not coming back. So it joins the other tier `scopedStorage`'s own header
describes — `leaguePanelExpanded`, `smgo_unlocked`, `activeDirectorTournamentId` — which write if they
can and stay silent if they cannot. **Do not "tidy" it into the scoped helpers.**

Persisted from an EFFECT rather than from render: the ref advances during render, matching the seeding
above it, but a storage write is a real side effect and React may render twice and discard one.

**It DOES cross devices now, and only because the answered set became shared** — see "Taking control
is not a bust-out" below. Taking control hands the failsafe button to a bust-out **nobody has
answered**, which is the case where the other device died holding the question. It hands it to nobody
otherwise, and specifically not to Dave: with Amy rebought on the other device, `mostRecentlyBusted`
moves backwards to him, and the only thing that can tell a fresh device his bust-out was dealt with is
the shared set. This note used to say it would need the bust-out ORDER on the document; what it
actually needed was the ANSWERS.

Everything else beside a busted player is the **re-entry**, which is exactly the action that is meant
to be available later.

**`lib/entryLimits.ts` still owns whether a rebuy is ALLOWED** — the cap and the period are
unchanged and every one of their rules still bites. This only decides when it is ASKED.

**A happy consequence worth knowing before anyone "fixes" it back:** at the moment of the bust-out
the current level IS the level the player busted in, so the period check needs no record of when
they went out. Making the rebuy immediate removed an off-by-one rather than needing a new
`eliminatedAtLevel` field to correct it — the period was being tested against the current level
while the button lingered for hours.

**The offer outranks the other two prompts and must be derived, not reported.** It asks about the
bust-out that just happened; the final-table and uneven-tables prompts ask about what that bust-out
caused, and answering the first may remove the need for either. The dialog originally owned the
answer and reported it up through `onOpenChange` — an effect — so "an offer is up" became true only
on the NEXT render, and the final-table prompt's effect ran inside that window and opened on top of
it. Two dialogs about one bust-out, which is what the stand-down existed to prevent. Caught by
driving a real bust-out, not by reading. `useRebuyOffer` is a hook so every consumer sees the same
answer in the same render.

**The answered set is keyed `playerId:rebuyCount`, not on the id.** A player who busts, rebuys and
busts again is a NEW question — "a count recurs; a question does not", the same rule the final-table
latch needed. It is a SET rather than a single "last answered" key for a sharper reason: accepting an
offer makes that player active, so `mostRecentlyBusted` immediately returns the next most recent
bust-out and a single-key guard would not match it, reopening the dialog to offer a rebuy for someone
who busted long before — the lingering offer rebuilt as a popup. It is seeded from the roster on the
first render that has one, so a refresh mid-game does not re-ask about a bust-out from an hour ago.

**The dialog states the RULES, and used to explain the alternative.** It ended with *"A rebuy is taken
now, in the same seat. Later they would have to re-enter."* The second sentence was put there so "No"
would not read as "they can never return", and it was reported as confusing — fairly. At the busiest
moment of the night it asked the director to hold a second concept, with its own cap, window and price,
while answering a question about a rebuy: it explained the thing they were NOT doing. The first
sentence stays, because it is a fact about what is about to happen — the player does not move — and it
says what makes a rebuy not a re-entry without naming re-entry.

`rebuyRules()` in `lib/entryLimits.ts` replaced it, and lives there rather than in the dialog because
it is the positive counterpart to `rebuyUnavailableReason`: `PlayerEntryActions` prints that one when a
rebuy is BLOCKED, so the two halves of one question would otherwise be worded in two files.
**A row only appears when there is a rule to state** — no cap and no rebuys yet shows nothing, since
`1 of Unlimited` is not English; no period shows nothing, since "All game" is the absence of a window.
An unlimited, all-game tournament therefore adds no rows at all. Same instinct as the Busted strip
rendering nothing when rebuys are off for the whole game. Three mutants are caught, all in the
omissions, because those are the half that only misbehaves in a game with no limits.

**Both downstream rebuy offers are gone with it.** `FinalTableDialog` and the uneven-tables dialog
each carried a "{name} is rebuying" button; with the rebuy asked at every bust-out, first, those
became a second question about one bust-out — and by the time either is on screen the rebuy moment
has passed anyway.

`seatInfo` used to be **passed in by the caller**, and only `TablesSection` passed it; busting a
player out from the Players list lost their seat outright, and undo could not restore it either. The
hook has the player, so it takes the seat from them when the caller says nothing.

### Taking control is not a bust-out, and an answered question is a fact about the game

Reported from a real night: bust a player out on the laptop, press **No — they are out**, take control
on the phone, and the identical dialog opens straight away.

**`seenRef` was in-memory, per device, seeded ONCE** at the first render with a roster and never
re-seeded. The hook runs on a read-only console too — only the dialog was unmounted — so the phone
seeded its set BEFORE the bust-out, watched the bust-out arrive by snapshot, and never heard the
answer, which lived in a ref on the laptop and was written nowhere. `RebuyOffer` renders
`<AlertDialog open>` as a literal, so the moment `readOnly` flipped it rendered open.

**All three prompts re-ask on a takeover; only this one is wrong to.** The final-table and
uneven-tables prompts re-derive a condition that is **still true right now**, and the director who has
just picked the device up has not answered it. The rebuy asks about a **moment that has passed**, and
nothing in the roster tells "just happened" from "happened while you were watching". The seeding was the
only thing that ever did.

Two halves, and each is what makes the other safe:

**1. The answered set is SHARED** — `rebuysAnswered: string[]` on the live document, the
`playerId:rebuyCount` keys answered either way, unioned on read by `answeredKeys`. "Was this bust-out
offered a rebuy" is a fact about how the night was run, not a preference about a question — the line the
final-table dismissal sits on the other side of. **It only ever GROWS, and that is what makes it cheap:
a set that cannot shrink cannot be reverted by its own echo, so this needs none of
`lib/pendingRoster.ts`'s machinery** — a stale snapshot can only be a subset and the union heals it.
That is the whole difference between this field and `isFinalTable`, which can go back to false and
therefore needed a guard. Its own sync effect, because DECLINING changes the answered set and changes
nothing about the roster, so folding it into that payload would mean a "No" was never written. And it
is read in the initial `getDoc` transform as well as through the snapshot, because that transform is
where `isFinalTable: false` was hard-coded and threw the previous cross-device fix away.

**2. Taking control never pops a dialog.** While read-only, the hook keeps a `watchedRef` of the
bust-outs it has merely observed; the dialog is suppressed by answered ∪ watched, so it can only ever
open for a bust-out this device witnessed itself.

**`watched` and `answered` are two sets, and collapsing them is a bug I nearly shipped.** Suppressing
the dialog by marking the watched bust-out ANSWERED would have synced that claim — telling the other
device, and every later one, that a question nobody answered is closed. It fixes the dialog at this end
by breaking the dead-other-device case at the far end. So the failsafe BUTTON keys off the shared
answers alone, which is exactly what keeps an unanswered bust-out reachable. A mutant folding the two
turns a test red.

**The other two prompts go silent at takeover without losing anything**, because both latch against
what they asked about and both re-arm when it changes:

- `FinalTablePrompt` **stays mounted** while read-only and takes `readOnly`. That is the fix rather than
  an inconsistency with `DirectorOnly` — it renders nothing until the question is due, so it is not a
  control, and it needs to WATCH: a prompt that starts blind on takeover opens on a condition it has
  never had the chance to answer. While read-only it latches `dismissedAt` to the field as it stands, and
  `dismissalIsStale` drops that the moment the field changes.
- The uneven-tables prompt cannot watch, because `TablesSectionReadOnly` stands in for `TablesSection`
  on a read-only console. So it seeds `balanceDismissedKey` from the imbalance present on its first
  render instead. That also makes a tab switch silent, which is a fair reading of the same rule.

**And what a console FOUND at load is not an answer either** (October audit M13). The seen set is
seeded with every bust-out on the roster at the first render, so a refresh does not re-ask about an
hour-old one — and that seed was being synced as ANSWERS. A phone opened after the laptop died holding
Amy's question wrote "answered" for her and lost the failsafe, the exact case above. The hook now keeps
`answeredHereRef` apart from the seed: the seed still suppresses the dialog, only real answers are
synced, and where the game carries the shared record the failsafe follows it. Two more in the same
place: **`offerKey` adds the re-entry and bust counts** (`bustCount`, incremented at every bust-out and
never decremented) once either is non-zero — a re-entry or an undone bust-out left the rebuy count
unchanged, so an answered "No" swallowed a rebuy the rules allowed on the second bust-out; keys stored
before keep their old shape — and **the hook's memory resets when the game changes**, which on the home
route it never did.

A hook test drives the whole thing across a control change, because the fault was never in the
predicate — `lib/rebuyOffer.ts` was right throughout. Three mutants are caught: dropping the read-only
levelling reopens the dialog, folding watched into answered leaks a false answer, and keying the
failsafe off watched instead of answered hands Dave a button.

### A player coming back has to meet the final table, whichever door they use

Reported from a real game: nine players, bust one out, collapse to the final table via the prompt,
then press the failsafe **Rebuy** — and he was seated **on table 2 on his own**, with the tournament
still flagged as its own final table.

**Two faults met, and the first is the one this codebase keeps paying for.** `undoBustOut` had unwound
the collapse since the day it was written; `processRebuy` and `processReEntry` **never mentioned the
final table at all**. A rule enforced at one door out of three is not a rule.

**The second is subtler and is why the seat looked plausible.** `lib/seating.ts`'s `seatToReclaim` asks
one question — *is any other active, seated player on this exact (table, seat)?* It knows nothing of
which tables are in USE. So after a collapse moves everybody onto table 1, a pre-collapse chair on
table 2 matches nobody and reads as **free — precisely because the collapse emptied that table.** A
chair being unoccupied is not the same as it being part of the game. `freeSeatAt` exists for the
question `seatToReclaim` cannot answer.

`finalTableAfterReturn()` in `lib/finalTable.ts` is the one rule, and `undoBustOut` moved onto it
rather than keeping its copy. Three outcomes:

- **Not at a final table** — nothing changes.
- **At one and the field now OUTGROWS it** — unwind: pre-collapse seating back, flag dropped, snapshot
  cleared.
- **At one and the field still FITS** — the collapse stands and the returning player joins it, in a free
  seat at the table being played on. Never reported and far more common than the overflow case.

**ORDER IS LOAD-BEARING and is why the unwind composes.** `seatToReclaim` runs FIRST and this goes over
the top — the order `undoBustOut` already used. `snapshotSeating` keeps only ACTIVE players, so someone
already busted at the moment of the collapse is **not in the snapshot**; `restoreSeating` leaves them
alone and everyone else goes back across both tables, so the lone-player-on-table-2 state cannot arise.

**`oneTableIndex` replaced the inline walk in `alreadyAtOneTable`**, which now delegates to it.
`goToFinalTable` hard-codes `tableIndex: 0`; a second literal elsewhere would be two answers to one
question. And it derives the table from everyone EXCEPT the returning player — by then `seatToReclaim`
has already put them on their old chair, so "which one table is the field at" otherwise has two answers
and theirs is the wrong one.

**Driving the real game caught a residue no unit test would have.** The first version unwound correctly
and left the player **unseated**: `seatToReclaim` had asked its question against the COLLAPSED roster,
where the redraw had handed his chair to somebody else, so it returned null — and the unwind then
vacated that very seat. `reclaimSeat` re-asks after the restore, which is the only moment the answer is
true. *"A rebuy is chips bought in the chair they never left"* now survives a collapse.

`processReEntry` deliberately gets **no** `reclaimSeat`: a re-entry stays unseated by design, so only
the unwind branch can change anything there. Six mutants are caught across the rule and `freeSeatAt`,
including the one that treats seat **zero** as falsy.

Verified by driving the reported sequence in the devstub: nine seated 5+4 → bust → 4+4 → collapse →
8 on one table → **rebuy → back to 5+4 with the flag cleared**, the exact state before the bust-out.

### The final table is one size of a question the app only ever asked at one size

Reported from a real league on **three tables of eight**: at sixteen players the field
plainly fits two tables, and nothing said so. The only question ever asked was about the
FINAL table, at eight.

**Most of the mechanism already existed, unprompted and untested.** `TablesSection` carried
a `breakTable(breakIdx)` behind a small `TableProperties` icon in each table header, which a
director had to notice and know the meaning of. It also never lowered
`settings.tables.numberOfTables`, so the table it broke went on rendering as an empty felt
with a full row of seats; never renumbered, so breaking the middle table of three left
players on table 3 while only tables 1 and 2 were in play; snapshotted nothing, so there was
no undo; read `seatsPerTable` from a second source defaulting to 9 against the component's
own 6; and sat inline in a component, so it had no test and could not have one.

`lib/tableBreak.ts` owns it now, and both doors — the icon and the new prompt — go through
one action.

**A break is NOT a small final table, and the difference is the whole feature.** The final
table REDRAWS every seat at random, which is what a final table draw is supposed to be. A
break moves **only the players at the table that goes**; everybody else keeps the chair they
were already in, which is what a cardroom does and what makes a director say yes without
hesitating. The copy says so out loud: *"Only Table 3 moves — everyone else keeps their
seat."*

**The emptiest table breaks, ties to the HIGHEST index.** Fewest people moved, and a tie
goes to the table added last rather than the feature table. An empty table is the ideal
answer, not an excluded one: breaking it moves nobody. A mutant narrowing `<=` to `<` picks
table 1 and turns a test red.

**The renumber is why breaking the middle table is safe.** `settings.tables` stores a COUNT,
not a set, and every render walks `0..numberOfTables-1` — "tables 1 and 3" cannot be
expressed. Players left on index 2 of a two-table game would be drawn nowhere, with no KO
button and out of reach of Move mode: the 17-player ghost by another route. Names and felts
move WITH their tables through `reindexAfterBreak`, because `tableNamesFor` trims the LAST
entry, which is wrong when the table that went was in the middle.

**Two predicates, deliberately.** `consolidationDue` returns null at one table and leaves it
to `shouldPromptForFinalTable`, which carries the stored `isFinalTable` flag read
preferred-then-derived and the `<=` a real bug turned on. One predicate answering both at
overlapping sizes is how a single bust-out gets two dialogs. The prompt reads them in order
of size, so even if they ever did overlap, one bust-out still gets one dialog.

**ONE prompt component, not a fourth.** Three dialogs already race over one bust-out — the
rebuy offer, the final table and the uneven-tables prompt — wired together by `standDown`
and `finalTablePromptOpen`. `FinalTablePrompt` asks both questions and renders whichever
dialog fits; everything that makes it behave is untouched, including the page-level mount
that made it tab-independent and the read-only watching that keeps a takeover silent.

**`dismissalIsStale` had to take the QUESTION rather than the field size, and that is
load-bearing.** It asked `activeCount > seatsPerTable`, which is right for exactly one
prompt: the final table only ever fires at or below one table's worth, so growing past that
is the only way its answer goes stale. **A break is dismissed far above that line** — sixteen
on three eights — so every such dismissal read as stale the instant it was made, dropping the
latch on the next render and reopening the dialog. That is the "Ignore for now" loop
`lib/tableBalance.ts` exists to end, rebuilt with a different number.

**The final table now lowers the count too**, so it no longer renders with every other table
under it as an empty felt. `goToFinalTable` also stopped minting chairs that do not exist: it
computed `seatsPerTable` and threw it away, assigning `seatIndex: playerIndex` to every
active player, so collapsing more than the table seats produced seat 8 of an eight-seat
table. The prompt cannot reach it — it only asks at or below one table's worth — but the
Seating tab's button can.

**Undo restores the table with the chairs.** `preFinalTableSeating` became
`preConsolidation`, carrying the seats AND the configuration: restoring the seating alone
would leave it pointing at tables the render loop no longer walks. `finalTableAfterReturn`
became `consolidationAfterReturn` and unwinds on `tablesNeededFor(active) > numberOfTables`
rather than "outgrows one table" — same three outcomes, same load-bearing ordering
(`seatToReclaim` first, this over the top).

**It was NOT widened to "the field outgrows the tables", and three tests are why.** After a
break the remaining tables are exactly full — sixteen on two eights — so the very next rebuy
has nowhere to go, and `preConsolidation` is local state that no reload of a live game
survives. Raising the count automatically looked like the fix and broke three well-considered
assertions: that shape is true of any game with more players than chairs, consolidated or
not, so it would silently add a table on an ordinary rebuy. **The app already ASKS in that
situation**, through the Seat Players overflow offer. So the limitation stands: refresh
between a break and a rebuy and the unwind is gone, exactly as the final table has always
worked.

**Settings are persisted by one writer now, and finding that was the point of driving it.**
`updateSettings` saved to localStorage from inside its own `setState` updater, and it was the
ONLY thing that saved settings at all — so every other writer of `state.settings` was a
memory-only change. Both consolidations lower the table count, and a reload put it straight
back while the players stayed where the consolidation left them: orphaned on a table that no
longer exists, again. One guarded effect owns it, serialised like the Firestore sync effects
because the snapshot handler spreads `...data` over state on every snapshot.

**The shared dialog warns when a manual break leaves people standing.** The prompted path
cannot reach it — it only fires when the field fits — but the Break icon has no such guard and
never had one, so breaking a table on a full house left players unseated while the copy
claimed everyone kept their seat. Warns and never refuses, the call `lateEntryClosedReason()`
already makes.

Nine mutants are caught across `lib/tableBreak.ts`. The `>=` in `consolidationDue` needs a
fixture with an active player UNSEATED, or the already-consolidated guard catches the mutant
first and it survives. Verified by driving the reported game: seventeen on 6/6/5, one KO →
the prompt names **Table 3** (tied with table 1, tie to the highest) → 8+8 on two tables,
`numberOfTables: 2`, names trimmed to `['Table 1','The Kitchen']`, no duplicate chairs — then
a rebuy back to seventeen restores 6/6/5, three tables and all three names. Nine down to
eight then asks **Final table?** and collapses to one.

**A rebuy after a BREAK keeps its own chair** (October audit, Low — reproduced). When the consolidation
stands, `consolidationAfterReturn` used to send the returner to the emptiest table — right at a final
table, wrong after a break, where only the broken table moved and their chair on a table still in play was
sitting empty. `ownChairIfStillGood` asks first: on a table in play, inside the table, at THE table when it
is a final table, and free.

**The toast's Undo of a return puts the tables back too** (October audit, Low). A rebuy can unwind a
consolidation — the flag, the snapshot and the table count — and the undo restored only the roster, leaving
the players on one table under a two-table configuration with the collapse no longer undoable. The undo
snapshot carries all three now.

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

**`customer.subscription.created` takes the same mapping** (October audit, Low). It granted Pro on
sight, and a subscription whose first payment needs 3-D Secure is created `incomplete`.

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

### Start Next Season leads to the season set-up, and there is ONE

Every **Start Next Season** — both `SeasonDashboard` banners and the ended/full footer of Next Game —
opens **Manage League on the Seasons tab with the New Season form already open**. That form already
handles both kinds of league: a set number of games, and a date range with the games counted from it.

It used to create the next season **silently**: the next period's dates and the SAME number of games,
never shown to anyone. Right for a fixed-count league, wrong for a calendar one — January to March and
April to June hold different numbers of nights. `useSeasonRollover.startNextSeason` is deleted.

**A second season form was built for this and removed the same day**, at the director's request: a
popup asking "set number of games or between two dates", sharing an extracted form that changed the
Seasons tab too. The Seasons tab was already right, and two places to set up a season is the drift this
file keeps recording. Do not rebuild it — send people to the one that exists.

How it is wired: `LeagueSection` owns the Manage League dialog and provides `hooks/useSeasonSetup.ts`'s
context; the season panel and Next Game both render inside it. `LeagueSettingsDialog` takes
`startNewSeason` and passes `startNew` to `LeagueSeasonsTab`, which opens its form **only when the
account may create seasons** — the same Pro gate as its New Season button. A read-only console gets no
context, so no Start Next Season. Next Game closes its own dialog first, so two dialogs are never
stacked.

Creating a season there makes it current but does **not** end the old one, exactly as the form always
has. The old season's End button is beside it in the list, and the dashboard still offers End Season.

Verified in Chromium through the devstub: opened with `startNewSeason`, Manage League lands on Seasons
with Season Name, Number of Games and Date Range showing; opened normally it shows the list. The
devstub's account is not Pro (no payments server), so that run forced Pro behind a grep marker —
without it the form correctly stays shut, as the New Season button does.

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

**The date boxes are the browser's own, and on desktop Chrome they showed no calendar at all.**
Reported from Chrome on Windows while an iPad worked. Desktop Chrome opens its calendar only from a
small icon inside the box, and nothing in this dark-only app set `color-scheme: dark`, so that icon
was drawn dark on a near-black field — invisible — while a click on the text only selected a segment
to type over. `ui/date-range-picker.tsx` now sets `color-scheme: dark` (a light icon, a dark popup)
and calls `showPicker()` on a click anywhere in the box, in a `try` so a browser that refuses it
still takes typing. Verified in real Chromium: one click on the TEXT opened a dark calendar. Any
future `<input type="date">` needs the same two things.

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

There is ONE evaluator now — the "Formula valid" tick goes through `lib/formulaEval.ts` like
everything else, and since October it checks **every place** (`checkFormula`): fields of 2, 9 and the
previewed size, with no knockouts and with all of them, naming the first place that fails. It tested
first place only, so `100 / (p - f)` read valid and scored last place 0 in every game. A formula that
fails at scoring time still scores 0 for that place, but **keeps the bonuses** now.

**The grammar accepts what the old `new Function` engine did** — `**` (right-associative, tighter than
`*`, `-2 ** 2` read as `-(2 ** 2)`) and exponent literals like `1e2`. Both used to fail to parse and
score 0 for the whole league; a saved formula may use either.

### `'default-season'`, and the `'default-league'` that went with it

A synthetic season id used before Firestore resolves. Results tagged with it match no real season
and vanish from every filtered view. Guard with `isRealSeasonId()` from `lib/seasonProgress.ts`
before writing `seasonId` anywhere.

**`LeagueSettings` carried the same shape and it is deleted.** `id: 'default-league'`, read by
nothing, sitting in the object every league's settings are built from — one
`where('leagueId', '==', settings.id)` away from a query that returns nothing and gets blamed on the
data. It was **worse than the one above**, because `'default-season'` at least has a guard and a
section warning about it; an unguarded synthetic id is invisible until it costs somebody a
standings table.

**`'pending'` is the third, and the league one.** `useLeague` hands out a placeholder league whose
id is `'pending'` while the director's leagues load, and `useSeasons` took it for a real league:
it listened for seasons of `'pending'`, read `leagues/pending`, found no season, and tried to
CREATE `seasons/pending-season-1` on every load. The rules refused it, so nothing landed — but it
was a failing write each time, found while taking the landing-page screenshots. It is
`PLACEHOLDER_LEAGUE_ID` in `lib/seasonProgress.ts` now, beside `isRealLeagueId()`, which
`useSeasons` applies at its entry and `RealTimeLeagueTable` uses instead of its own inline
`!== 'pending'`. A hook test asserts the placeholder neither reads nor writes, and that a real
league with no seasons still gets its first one.

**A settings object is not an entity and does not need an id.** The leagueSettings DOCUMENT has a
real one, which is what `savedSettings` rows carry and what `loadSettings` matches on. The interface
says so where the field used to be, next to the same note about `name`.

### The landing page is short on purpose

`components/ComingSoonGate.tsx` is the door AND the marketing — everyone who hears about StackMate
before launch arrives here. The unlock contract has not changed and must not: no
`VITE_ACCESS_PASSWORD` means open, a correct code sets `smgo_unlocked` and the app renders instead.

A long version of this page was written and cut the same day. Nobody reads a landing page; they scan
one. It is a headline, three lines of what it is, four short pillars and the pictures. **Adding a
paragraph here is nearly always the wrong instinct** — if something matters, it replaces a pillar.

**The two pillars in the middle are the ones a director reacts to, and neither was there.** The page
sold the QR view, "the league runs itself" and the exports, while the standings updating on a
player's phone AS PEOPLE BUST OUT went unmentioned — and so did the drill-down behind a name, which
is the feature a TD on other software described the absence of: going back through every previous
game one at a time to add up somebody's hits. Both were already built. `RealTimeLeagueTable` is
mounted in the participant view for every league game and fed by live listeners, and results are
written at each elimination rather than at the end of the night (`PokerTimer`'s `syncLeagueResults`
→ `addResultMutation`), so the table genuinely moves mid-game; `PlayerSeasonDialog` opens from any
standings row with **no participant gate**, so a phone can open anyone's season night by night.

Two claims are qualified because the code qualifies them. "In a league game" is load-bearing — the
table hides itself entirely for a standalone tournament — and the copy says "any name" rather than
"your stats", because standings are shared and there is no private per-player page.

**An empty state is copy, and this one had drifted into contradicting the product.** Before a
season's first result, `RealTimeLeagueTable` told participants "standings update live once the game
concludes" — five lines under its own correct line saying points land "as soon as the first player
hits the rail" — and told the director to "record results from the League tab after tonight's game",
naming a manual step that does not exist and a tab that stopped existing when the league became a
section on the page. One screen, two answers, and the wrong one was the one that undersold the whole
feature. Empty states age out of sight because nobody looks at a screen that only shows before there
is any data.

**Screenshots go through the local `Shot` component, and the frame is load-bearing.** Every screen in
this app is near-black, and so is the page, so an unframed screenshot reads as a hole rather than a
picture. `Shot` also draws a labelled placeholder at the exact aspect ratio the real image will be
cropped to, so the layout does not move when one lands. Images live in `client/public/shots/`; bound
them before committing (this is the first thing anyone loads), and everything below the hero is lazy.

**The three screenshots are the app's own screens with invented data**, captured through the devstub
in October 2026: `console.webp` (16:9), `standings.webp` (4:3, Marcus's season opened over the
table) and `phone.webp` (the participant view of a live league game). No real league, venue or
person appears. They were made with a throwaway build config that (a) wrapped Firestore's write
calls to report success immediately, so the offline devstub stops raising "Not syncing", and (b)
seeded a demo league, season, results and live tournament straight into the offline cache, so every
screen read them through its normal code — no hooks were faked. Three traps worth knowing if they
are ever retaken: the devstub stubs `@/hooks/useAuth` but several hooks import `./useAuth`, which
then sees nobody signed in; headless Chromium does not trust this environment's proxy CA, so Google
Fonts must be fetched with `curl` and served to the page, or every shot is in a fallback face; and
the participant view's first read is a REST GET that must fail as a 503, not a network error, or it
never attaches the listener. Capture at the device-pixel size and encode WebP in Chrome; each file is
under 50KB.

**The hero shows the QR code, and that needed a SAVED, PUBLISHED game.** `TimerCard` draws it only
for `details.id && isPublished !== false`, so the hero seeds a published `activeTournaments` document
owned by the stub director and opens it at `/tournament/{id}/director` — offline, that is enough for
the QR and the Broadcasting chip. The code encodes a `localhost` URL; nobody can tell from a picture.

**Below the standings, ONE row of three set-up shots** (`seating.webp`, `season-dates.webp`,
`stats.webp`, 4:3 each) under a single "Set up once" eyebrow, stacked on a phone. A row of three is
the ceiling for this page — a fourth is a pillar's worth of attention and should replace one. Traps
from taking them: the season form is Pro-gated, so route `/api/payments-status` to
`{"enabled":false}` (every registered user is Pro then); a date box shows US order unless the
**process** runs with `LANG=en_GB.UTF-8` — Playwright's `locale` does not reach it; the context needs
`colorScheme: 'dark'` or the native calendar renders light; and once that calendar is open,
Playwright's `page.screenshot` hangs, so capture through CDP's `Page.captureScreenshot` with the scale
set by `--force-device-scale-factor` rather than the context's `deviceScaleFactor`, which CDP
ignores.

**The trust line leads with credibility, never with failure.** A draft was headed *"Built by people
who have lost a tournament"* — which reads to someone arriving cold as *lost tournament data*, the
one thing this category of software must never do. It says "made by people who know poker, and know
running a poker league" instead.

**A player never registers themselves**, in the copy as in the app: they scan a code and see the
night, including their own table and seat. "Check in" and "sign up" both read as self-registration.
See the comment block in the file.

---

## Architecture decisions worth knowing

### The October correctness debt, cleared — what each one answers now

Each was right today and primed to drift; each now has one answer and a test.

- **`settings` and `prizeStructure` have one writer**: PokerTimer's guarded settings sync. The Seating
  tab's felt picker and the Buy-in tab's Apply each wrote them too, keyed on `details.type`.
- **The initial `getDoc`** takes league and season from the GAME — it fell back to this device's own, and
  the sync then wrote them into the game — carries `isPublished`, and never overwrites a snapshot already
  applied (`snapshotAppliedForRef`).
- **useTournament reads its stored setup once**, in a `useState` initialiser. It re-read and re-parsed
  settings (logo included), levels, prize structure and mirror every second, and wrote storage in render.
- **`tablesOf(settings)`** in `lib/seating.ts` is the one table default, 2×8 — there were seven.
  `randomFreeSeat` + `tablesEmptiestFirst` are the one single-player seat draw, used by late seating and
  the uneven-tables move; the two inline walks counted busted players' chairs as taken. So
  CLAUDE.md's "both seaters call assignSeats" is now: the MULTI-player seaters call `assignSeats`; the
  single-player ones call `randomFreeSeat`.
- **`lib/firestoreRest.ts`** is the one REST decoder; the wake-up copy dropped timestamps.
- **`isLeagueGame(state)`** in `lib/tournamentMode.ts` is the console's league test — an explicit flag wins
  either way, then a local `'season'` type, then a linked league. About ten sites spelled their own, the
  league recorder among them.
- **`secondsUntilNextBreak`** (with `formatClock`) and **`blindLevelNumber`** are the clock's vocabulary on
  both screens.
- **`z` in a points formula is the real pool** (`prizePoolFor`), at both scoring sites; it was
  `buyIn × players`, which left out every rebuy, re-entry and add-on. A game with no price has a pool of 0.
- **The participant's Payouts panel normalises on read** (`withNormalisedPayouts`); older structures
  showed players no payouts.

### `client/src/lib/` holds pure, tested logic

Anything non-trivial and testable lives here with a colocated `.test.ts`, kept free of React and
Firebase imports so tests need no mocking. Follow this pattern rather than growing components.

| Module | Owns |
|---|---|
| `prizePool.ts` | Prize pool, rake and what one entry costs. **Rake is charged ON TOP of the buy-in**, so `net === gross` is deliberate, not a bug. Every money figure on screen comes from here. |
| `seasonProgress.ts` | Game numbering, games played, season completion, next-season dates — and whether a season can take a next game at all (`nextGameState`: **ended refuses, full only warns**). |
| `tournamentMode.ts` | Whether a tournament is a league game, and whether that can still be changed — **per direction**, since a finished game may stop being a league game but never become one. An explicit flag wins either way; `leagueId` is consulted only when no flag exists. |
| `eventName.ts` | The display name, per above. |
| `sharedSnapshot.ts` | Refcounted Firestore listener sharing. |
| `eliminationOrder.ts` | Finishing positions, who busted most recently, and the renumbering a re-entry forces. **The winner did not bust** — `isBustOut` excludes position 1, while `isFinished` still counts it for numbering. |
| `payoutTemplates.ts` | Payout percentages: non-increasing, ≥1 each, summing to 100. |
| `liveTournament.ts` | Which of an account's tournaments is the one being run right now — and whether that is the one this console is on. |
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
| `seating.ts` | Whether a returning player's chair is still free, and which chairs a seating hands out — only ones that exist. |
| `tournamentDocument.ts` | The single creation path for a tournament document. |
| `seatClaims.ts` | Who has checked in as whom — `claims`, a top-level map, playerId to device id. |
| `formulaEval.ts` | A custom points formula, evaluated without ever handing the string to a JS engine. |
| `leagueSettingsId.ts` | Where a director's CURRENT settings for one league live — a predictable document id, not a query. |
| `scopedStorage.ts` | Which account a localStorage key belongs to, and what signing in may adopt. |
| `setupSync.ts` | Whether the director's setup travels up to the account, down to this device, or stays put. |
| `accountWipe.ts` | What deleting an account removes, and the one order that does not strand it. |
| `finalTable.ts` | Whether to ask for a final table, whether a dismissal still applies, and how to put the seats back if it is undone. |
| `tableBalance.ts` | Whether the tables are uneven enough to say so, and what a dismissal remembers. |
| `tableBreak.ts` | When the field fits fewer tables, which one breaks, and where its players sit. **Only the broken table moves**; the rest renumber, because the model stores a table COUNT, not a set. |
| `csv.ts` | Turning a table into a spreadsheet file, without letting a player's name execute in Excel. |
| `playerSeason.ts` | One player's season game by game, and its totals — and `seasonRoster`, who is in a season's standings at all. |
| `recentPlayers.ts` | The names Add Player offers, and the ONLY list of them: newest first, one entry per person, fifty kept, each with an ×. Which copy wins when the account's and the device's differ — **never a union**. |
| `gameOver.ts` | Whether the game being run has finished, and who won it. |
| `resultRows.ts` | The finishing order of the game being run: the order, the ordinal, the named rank tone and every figure one night knows about a player. **One derivation for the console, the participant's phone and the exported image** — there were four, and only one spelled `21st` correctly. |
| `resultColumns.ts` | Which columns a results table can show, what each cell says, and which ones this game can offer at all — and the same columns as a CSV. **A column whose feature is switched off is not drawn.** |
| `rebuyOffer.ts` | Who is offered a rebuy, and when — once, at the bust-out — and who holds the failsafe after. |
| `snapshotMerge.ts` | How an incoming snapshot's roster meets the one on screen — biased toward local, except on a takeover. |
| `pendingRoster.ts` | Whether a roster change is still waiting on Firestore, so its own echo cannot revert it. |
| `localGameId.ts` | Which games carry a stable local id — the one that becomes the document id — and `gameIdOf`, the ONE answer to "which game is this" for the recorder, History, the game number and the mirror. |
| `leagueRecorder.ts` | What the league recorder must remove, correct and record tonight — and what is ALREADY recorded, read from the league's results with this tab's memory first. |
| `liveGameWrite.ts` | The one door every director-side write to the live tournament goes through. |
| `directorControl.ts` | Which device is driving the live game, whether this one may write to it, and what to say when it may not — **that a device has control, never that anyone is running the game**. |
| `numberField.ts` | What a half-typed number field commits to when it is left — the fallback when empty, and clamped, never rejected. |
| `statusChip.ts` | Which one status chip the app bar shows, and why a blocked browser outranks a live game. |
| `standingsOrder.ts` | The order of a league's standings — points, fewer games, best finish — shared by the table and its movement arrows. |
| `deadline.ts` | Stop waiting for a Firestore write that never settles (8s), for the actions that must not hang on a blocked browser. |

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

- **A misspelt league name with a recorded result has no in-app fix.** It stays as its own row in
  the standings. The roster admin that could rename it was built and removed on request — see
  "Recent Players is the one list of names". The data can be corrected by hand in the Firebase
  console: rename the `leaguePlayers` document, and never delete it, for the roster-outer reason
  recorded in that section.

---

## Scenario tests: whole nights, in sequence

`client/src/scenarios/`. A new season's standings listed every past player on 0 games, and no test could
see it: every function involved was right on its own, and the fault only exists once one season has
ended and the next has begun. So these play NIGHTS through the real `useTournament` hook and push every
roster change through the recorder's real decisions into an in-memory league (`leagueHarness.ts`), then
assert what the standings — and `RealTimeLeagueTable` itself — say.

**What is real and what is a stand-in is written at the top of `leagueHarness.ts`, and it matters.** Every
decision is the real function. Firestore is two arrays, and the LOOP in `PokerTimer`'s
`syncLeagueResults` plus `useLeague`'s two writers are mirrored line for line, because they live in a page
effect and a Firebase hook. **Change the mirror when either changes shape**, or the scenarios test a
recorder the app no longer has.

**Each night starts with New Tournament** (`resetTournament`), exactly as a director's does — without it
the local mirror correctly restores last night's finished roster and tonight's players are refused.

Covered so far: a season ending and the next beginning (data and screen, old season unchanged); rebuys,
a re-entry renumbering, an undo of the final hand; a reload mid-night (memory gone, the league is the
record); a second console and a duplicate player document. Four real faults are each caught by putting
them back: the empty-season rows, removal by the merged row's id only, a recorder that trusts memory
over the league (H6), and a rebuy that leaves its old result.

**Found while building them: a withdrawn result went from ONE document.** `removeTournamentResultForPlayer`
found the player through the merged standings row and deleted under that id, so a result recorded
against a duplicate document survived a rebuy and counted twice — the same hole `alreadyRecorded` had.
`resultsToWithdraw` / `playerIdsForName` in `lib/leagueRecorder.ts` are the one answer to "every
document that is this person", for both.

**`handover.scenario.test.tsx` — two consoles on one game.** Two real `useTournament` + `useRebuyOffer`
hooks share one in-memory document; `lib/consoleId` is switched per console as each snapshot is
delivered, so `controlOf` answers as that device. The laptop claims, the phone watches (and sees a rebuy
land — M14), the phone takes control without being re-asked, the laptop's own change is refused by the
door and replaced by the document, and the league records the night once across the switch. Two more:
taking control mid-question (no dialog, the failsafe instead — the reported bug), and a phone opened after
the laptop died holding an unanswered bust-out. **`lib/pendingRoster.ts`'s "last written" is per TAB in the
app and shared here** (one module); harmless for these sequences, and the file says so. Four mutants are
caught: the watcher merging instead of adopting, the takeover re-asking (watched set dropped), the seed
synced as answers (M13), and the door not enforced.

**`seasonOverrun.scenario.test.tsx` — a two-game season gets a third night, then ends.** Next Game,
the season panel, the header line and the standings, read at each step: the extra game labelled
"beyond the 2 scheduled", the header clamped, "2 of 2 played", an ended season taking no game, and the
next season defaulting to Game 1. Four mutants caught: an ended season still open, "Game 3 of 2" in the
dialog, an unclamped header, and Next Game defaulting to the ended season.

## Working style that has paid off here

- **Measure before and after.** A `manualChunks` catch-all once silently cancelled a lazy import;
  only inspecting the built chunks caught it.
- **Check tests can fail.** Mutation-testing the listener registry found a real coverage gap that
  12 passing tests had missed.
- **Assert every scripted edit.** A `str.replace` whose anchor does not match changes nothing and
  says nothing. One that was meant to render the Next Game guard silently did not, and the feature
  looked finished — `npm run check` and every test passed, because an unrendered dialog breaks no
  type and no assertion. It was caught only by driving the button in a browser. Anchor, assert,
  then verify the result is on screen.
- **A patch made to photograph a state must be removed by grep, not by memory.** Forcing
  `controlOf('d_other_device', …)` to screenshot the read-only console left that line in the commit,
  and it shipped: every console in production went read-only, no writes landed, and the timer's
  transport disappeared. Nothing failed — `npm run check`, all 730 tests and the build were green,
  because `lib/directorControl.ts` was correct and the fault was in what the PAGE passed it. A forced
  UI state has no test to fail by construction. `git grep` the marker before committing, and put a
  marker in to grep for.
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

**`docs/audit-2026-10.md` is the October 2026 audit and the CURRENT to-do list** — September's is fully
cleared. It covers the 117 commits since, ranked C/H/M/Low with file:line, the rules tests each rules
finding needs, and its own "What is clean". Fix commits cite its findings as "Oct H3" and update its
status line.

`docs/league-seasons-rework-plan.md` is the archived plan the League & Seasons rework was executed
from. Read it for *why* the model looks the way it does — the single `activeSeasonId` pointer, the
derived game number, league-as-scope in the Manage League dialog. It is a record, not a to-do list.
