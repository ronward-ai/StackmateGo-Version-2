> Archived. This is the plan the League & Seasons rework (Phases 1–7) was executed from,
> kept for the reasoning behind the current model. It is a historical record, not a to-do list.

# Plan: Rework the League & Seasons model and UI

## Context

The director reports the League/Seasons area is "clunky and confusing", and confirmed all four
symptoms: standings appear in too many places, season states are unclear, actions are buried or
scattered, and the tournament↔season link is fuzzy.

Investigation shows these are four symptoms of one cause: **the data model contradicts itself.**
There are four competing notions of "which season is current", season name is stored in four
places, and `gameNumber` is computed independently in five — with the copies disagreeing about
which season to count against. No amount of UI rearranging fixes a model that cannot answer
"which season is this game in?" consistently.

Domain input from the director: pub poker seasons have set timespans and come in two shapes —
**calendar-based** (usually quarterly, e.g. Jan–Mar) or a **set number of games** ignoring the
calendar. The current model stores dates *and* a game count with neither authoritative, so a
calendar season still renders "Game 3 of 12" where 12 is meaningless.

Note: the `seasonSwitched` / localStorage override in `useSeasons.ts` was added earlier in this
session as a patch for season-picker desync. It is partly self-defeating — its `[leagueId]` effect
clears the key on *every* instance mount, and seven components mount `useSeasons` — so it is
replaced here rather than preserved.

---

## Phase 1 — One source of truth for the current season

**Problem.** Four representations: Firestore `seasons.status === 'active'`; `localActiveSeasonId`
(localStorage + CustomEvent); `tournament.settings.seasonId`; and `useLeague.activeSeasonId`
(per-instance state only ever set by `LeagueSection`, so `PokerTimer`'s instance is always null and
its record paths write `seasonId: null`, orphaning results).

**Change.** Introduce `leagues/{leagueId}.activeSeasonId` as the single stored pointer.

- `client/src/hooks/useSeasons.ts` — `currentSeason` resolves from the league doc's
  `activeSeasonId`, falling back to the most recent season. Delete `localActiveSeasonId`, the
  `seasonSwitched` listener and the `[leagueId]` clearing effect.
- `client/src/hooks/useLeague.ts` — delete the per-instance `activeSeasonId` state and
  `setActiveSeasonId`; expose `setActiveSeason(seasonId)` writing the league doc instead.
- `client/src/components/LeagueSection.tsx` — `handleSeasonChange` becomes one write to the league
  doc, replacing the N+1 loop that rewrote every season's status.
- Viewing a past season becomes **local component state only** and never writes to Firestore.
  Today, merely previewing a past season mutates every season document and changes what
  participants see.

**Rules.** `leagues` update already requires `isExistingDocOwner()` and asserts `ownerId` is
unchanged; adding a field needs no rules change. Verify the existing `leagues` update rule does not
reject the new field (it constrains `name` and `ownerId` only).

**Migration.** On first load, if `activeSeasonId` is absent, backfill it from whichever season has
`status === 'active'`. One-time, idempotent, in `useSeasons`.

**Verify.** `npm run test:rules` still green; switch seasons and confirm exactly one Firestore write;
reload and confirm the choice persists (it currently does not); confirm the participant view does not
change season when the director merely previews a past one.

---

## Phase 2 — Season completion (REVISED)

**The original premise was wrong.** It assumed calendar seasons made `numberOfGames` meaningless
and proposed a `seasonType: 'calendar' | 'games'` discriminator. The director corrected this: a pub
poker season is *both* — Jan–Mar **and** the 12–13 Wednesdays inside it. "Game X of Y" is always
meaningful and is on screen at every game. No discriminator, no either/or. Dates bound the period;
the game count is the schedule within it.

Phase 1 also already removed most of the original status problem: the demote loop that wrote
`'draft'` is gone, so nothing is ever set to draft and nothing displays it, and `'completed'` can
no longer be clobbered by switching seasons.

**What is actually left — a real gap.** `numberOfGames` and `endDate` are display-only. Nothing
reacts when the last game is played or the end date passes: the season keeps counting and will
render "Game 14 of 13". The director has to remember to end the season and create the next one.
For a quarterly league that rolls over four times a year this is the missing workflow.

**Change.**

1. **Season completion awareness.** Add to `client/src/lib/seasonProgress.ts` (already holds
   `gameNumberFor` / `countGamesPlayed` / `isRealSeasonId`, with tests):

   - `isSeasonComplete(season, gamesPlayed)` — true when `gamesPlayed >= numberOfGames`, or the
     end date has passed. Both signals, since either can arrive first.
   - `clampedGameNumber(...)` so the display never exceeds the total.

   `SeasonDashboard.tsx` shows a banner when complete: the season is done, with **End Season** and
   **Start Next Season** actions. Not automatic — ending a season is the director's call, and a
   rained-off week can push a season past its dates without it being over.

2. **Start Next Season prefilled.** Creating the next season from that banner pre-fills the
   following quarter's dates and carries the same game count, since quarterly leagues repeat.
   Reuses `addSeason` and `setActiveSeason` in `client/src/components/LeagueSeasonsTab.tsx`.

3. **Status honesty (small).** `Season.status` declares four values; only `'active'` and
   `'completed'` are reachable. Narrow the type to those two. Also drop the derived `isActive`
   (`status === 'active'`) — the league's `activeSeasonId` pointer decides which season is current,
   so `isActive` is a second, competing notion of exactly that, and legacy data can have several
   seasons marked active. Expose `isEnded` instead. Remove the active-first sort in `useSeasons`;
   order by `startDate` descending, since the pointer decides current.

**Verify.** Unit tests for `isSeasonComplete` — under, exactly at, and over the game count; end
date in the past and future; missing `numberOfGames`; missing dates. Manually: set a season to 2
games, play 2, confirm the banner appears and the display reads "Game 2 of 2" rather than 3 of 2;
use Start Next Season and confirm dates and game count carry over and the pointer moves.

---

## Phase 3 — One `gameNumber`, and attribution that matches the display

**Problem.** Five near-identical `useMemo` blocks (`LeagueSection.tsx:49-60`,
`TournamentInfoCard.tsx:79-90/174-185/188-200`, `PokerTimer.tsx:150-162`) plus a persisted copy in
`settings.gameNumber`. They disagree on which season to count, and **two of them write the same
field**, so they fight whenever `settings.seasonId !== currentSeason.id`.

Worse: `PokerTimer.tsx:385` records `seasonId` from `currentSeason` while the header labels the game
from `settings.seasonId` — so starting a game for Season 2 via the Next Game dialog can file results
under Season 1.

**Change.** New `client/src/lib/seasonProgress.ts` with a colocated `.test.ts`, following the
existing pattern of `lib/prizePool.ts` and `lib/tournamentMode.ts`:

- `gameNumberFor(seasonId, leaguePlayers, localGameId)` — the single derivation.
- `seasonProgress(season, gameCount)` — returns type-appropriate progress for Phase 2.

All five call sites use it. `settings.gameNumber` is written in exactly one place. Record-time
attribution reads the same resolved season the header displays.

**Also guard `'default-season'`.** `PokerTimer.tsx:385` does not, so a game ending before the real
season doc lands writes `seasonId: 'default-season'` onto real results, orphaning them from every
season-filtered view.

**Verify.** Unit tests for `gameNumberFor` including the in-progress-game case. Manually: start a
game for a non-current season via the Next Game dialog and confirm results file under the season
shown on screen.

---

## Phase 4 — Delete dead code

Verified unreferenced (~1,500 lines):

- `client/src/components/LeagueTable.tsx` (378 lines)
- `client/src/components/LeagueSettingsContent.tsx` (734 lines)
- `client/src/components/LeagueTournaments.tsx`, `SeasonTournaments.tsx`
- `client/src/components/RankingsSection.tsx` (returns `null`; imported but never rendered),
  `TournamentRankings.tsx` (stub)
- Local `StandingsTable` + `computeStats` inside `SeasonDashboard.tsx:18-124` — defined, never called
- Unused `RealTimeLeagueTable` import in `PokerTimer.tsx:33`

This removes two of the three parallel stat-label/formatter tables, leaving
`RealTimeLeagueTable` as the single standings renderer.

**Verify.** `npm run check` and `npm run build` clean; confirm each file has no importer before
deleting (`grep -rl` per file, as done for the earlier dead-code removal).

---

## Phase 4b — Duplicate League Settings trigger (small, do now)

**Problem.** The League tab shows both a cog icon and a stray "League Settings" button, both
opening the same dialog.

`LeagueSettingsDialog` renders `<DialogTrigger asChild>{children || <Button>League Settings</Button>}</DialogTrigger>`
unconditionally, in two places — the error branch (~line 68) and the main branch (~line 221).
`LeagueSection.tsx:207` mounts it **controlled** via `open`/`onOpenChange` and passes **no
children**, so the fallback trigger renders regardless. Because the dialog is the first element of
the returned fragment, that button lands *outside* the league Card, which is why it reads as a
stray tab rather than part of the panel.

**Change.** In `client/src/components/LeagueSettingsDialog.tsx`, derive
`const isControlled = controlledOpen !== undefined;` and render the `DialogTrigger` only when the
dialog is uncontrolled. A controlled dialog by definition already has an external trigger — here
the cog at `LeagueSection.tsx:270`. Apply to both branches.

Keep the cog as the single entry point; whether it gains a visible label is a Phase 5 decision,
not this fix.

**Verify.** League tab shows exactly one settings control. The cog still opens the dialog, and the
dialog still closes correctly (it is controlled, so `onOpenChange` must still fire). `npm run check`
and `npm run build` clean.

---

## Phase 5 — UI reorganisation

**Problem.** The header row added earlier in this session
(`🏆 League ▾ › Season ▾ [Active] ⚙ ⋯ ˄`) is dense and unintuitive. Specifically:

- The selectors are styled `border-0 p-0 bg-transparent`, so they render as plain text with no
  affordance — and with only one league or season they render as an actual `<span>`, so the
  dropdown *appears and disappears* depending on data. The interface cannot be learned.
- The `›` is a breadcrumb chevron implying hierarchy/navigation, but both sides are editable pickers.
- Three unlabelled icon buttons in a row (cog, `⋯`, collapse), with the collapse chevron adjacent
  to dropdown chevrons meaning something different.
- The `⋯` is titled "Season actions" but contains **Delete League**.
- New Season is buried in that menu, while the empty state instructs the user to press a
  "New Season button above" that does not exist.

Plus, from the exploration: switch-league exists in 2 places; switch-season in 3 with three
*different meanings*; enable-league-mode in 2 (one unreachable); two standings tables render at
once when previewing a past season.

**Change — header becomes information; management moves to one screen.**

Header (`client/src/components/LeagueSection.tsx`) reduces to read-only context plus a single
labelled button:

```
🏆 Friday Night League — Spring 2026
   Game 3 of 12                    [Manage League]  [˄]
```

League name, season name and type-appropriate progress stay visible, so the user never opens a
dialog to know where they are. Everything else leaves the header.

Management consolidates into the existing `LeagueSettingsDialog`, which already uses a `Tabs`
layout (Points / Stats) — add a **Seasons** tab rather than building a new surface:

- Seasons tab: list of seasons, which is active, create / end / delete, and switching the active
  season.
- **Delete League** moves here, out of a menu titled "Season actions".
- Rename the dialog trigger from a bare cog to a labelled **Manage League** button.

Each of the three "switch season" meanings gets one distinct home:

| Meaning | Home |
|---|---|
| Change which season new games count toward | Manage League → Seasons |
| Preview a past season's standings | The existing "Previous Seasons" picker in `SeasonDashboard.tsx` |
| Choose the season for the next game | The existing Next Game dialog in `TournamentInfoCard.tsx` |

Switching the active season being slightly deliberate is intentional, not a cost: it changes what
every participant sees, and it is a quarterly act, so it should not sit as a one-tap control beside
the title.

Also in this phase:

- **One standings table.** Previewing a past season swaps the table rather than appending a second
  (`SeasonDashboard.tsx:279` and `:305`).
- Remove the unreachable "Enable League Mode" banner in `LeagueSection.tsx`; the segmented toggle
  above the tabs is the single entry point.
- Fix the empty-state copy that points at a non-existent button.

**Verify.** Manual walkthrough: confirm the header shows league, season and progress and nothing
else actionable bar Manage League; create a calendar season and a game-count season from the
Seasons tab; switch the active season and confirm one Firestore write and that the participant view
follows; preview a past season and confirm participants are *unaffected*; end a season and confirm
it stays ended after switching away and back; confirm Delete League is no longer reachable from a
season menu. Check the header on a phone in portrait.

---

## Phase 6 — Manage League dialog hierarchy

**Problem.** The dialog currently has four sibling tabs: **League | Seasons | Points | Stats**.
These are not the same kind of thing. `League` and `Seasons` answer *which one*; `Points` and
`Stats` answer *how the selected league is configured*. Presenting them at one level flattens a
hierarchy that genuinely exists, which is what makes it read wrong.

Confirmed from `client/src/hooks/useLeagueSettings.ts`: settings are per-league — the storage key is
`leagueSettings:${leagueId}` (line 53) and Firestore docs are filtered by `leagueId` (line 306). So
Points and Stats are properties *of* the selected league, and belong underneath the choice of
league rather than beside it.

**Change — league becomes the scope, tabs become aspects of it.**

```
Manage League
┌──────────────────────────────────────────────┐
│ League  [ Friday Night League ▾ ]            │
│                        [Rename]  [+ New]     │
├──────────────────────────────────────────────┤
│   [ Seasons ]   [ Points ]   [ Stats ]       │
└──────────────────────────────────────────────┘
```

- A persistent **league selector** at the top of `client/src/components/LeagueSettingsDialog.tsx`,
  above the tabs, so the scope everything below applies to is always visible and changeable.
  Uses `userLeagues` / `switchLeague` from `useLeague`.
- **Rename** and **New** as labelled buttons beside it — deliberately not a bare `⋯`, which is the
  pattern that hid Delete League inside a menu titled "Season actions".
- Tabs reduce to **Seasons | Points | Stats**, all scoped to the selected league.
- **Delete League** moves to a danger zone at the foot of the dialog, outside the tabs, since it
  applies to the whole league regardless of which tab is open.
- `client/src/components/LeagueDetailsTab.tsx` is absorbed into the header and danger zone, and
  removed. It was added in the previous change and is superseded rather than kept alongside.

Season selection already lives in the Seasons tab and does not move.

**Verify.** With two leagues: switching in the header re-scopes the Seasons list, the Points system
and the Stats columns together; renaming updates the header and the standings title; creating a
league switches to it with its own empty season list; deleting from the danger zone still requires
typing the name. `npm run check`, `npm test`, `npm run test:rules` clean. Check the header does not
crowd on a phone in portrait.

---

## Phase 7 — Hierarchy problems elsewhere in the app

Found while auditing for the same category error fixed in Phase 6.

### 7a. Two different things are both called "league name" (the real bug)

| Field | UI label | Renders as | Edited from |
|---|---|---|---|
| `settings.branding.leagueName` | "Event Name" | the big page header (`PokerTimer.tsx:519-533`) and the participant view | Settings → Branding |
| `leagues/{id}.name` | "League name" | the standings title | Manage League → Rename |

Renaming the league leaves the on-screen header unchanged, because that header reads a different
field — one whose stored key says `leagueName` while its label says "Event Name". Dormant until
Manage League gained a rename, now a live trap.

**Do not merge them.** They are genuinely different: a standalone tournament has an event name and
no league at all. Instead:

- Rename the stored key to `branding.eventName`, matching what the UI has always called it. Read
  `eventName ?? leagueName` for existing data, write `eventName`. Live write sites are only
  `SettingsSection.tsx:112` and `:306`; `QRCodeSection.tsx:143` reads it.
- **Fall back to the league name** in the page header when in league mode and no event name is set,
  so renaming the league visibly does something.
- Say so in the Branding field's hint text.

### 7b. Share — DONE THEN REVERTED

Share was moved out of `TabsList` into a button beside History and New Tournament, on the argument
that it is an **action** rather than a destination and so did not belong among the setup tabs.

**The director rejected it, and was right.** The argument was theoretical tidiness; the cost was
concrete. The tab carried three staggered `radar-ring` pulses that made "you can go live" visible
at a glance during a game. The button reduced that to a single dot in a muted `outline` button,
crowded between two other buttons — quieter *and* harder to find, for a control reached mid-session
in a pub.

Reverted in `client/src/pages/PokerTimer.tsx`: the `TabsTrigger value="qr"` block returns with its
full radar indicator, and the title-row button is removed. No duplicate entry point is left behind.

The taxonomy point stands but does not justify the regression, and the portrait-overflow relief it
gave is better bought elsewhere — the League tab is already conditional, which is the cheaper win.

### 7c. Settings duplicates the tabs above it

`SettingsSection.tsx` → General contains a **Blind Levels** group (`pauseAfterBreak`,
`applyDurationToAll`, `bigBlindAnte`) and a **Players** group (`enableRecentPlayers`) — while
Levels and Players are top-level tabs. `BlindLevelsSection` already *reads*
`state.settings.bigBlindAnte` (line 223) and `applyDurationToAll` (355, 363, 405) but cannot set
them; the toggles are two tabs away. Same split objected to in the dialog.

- Blind Levels settings move into `client/src/components/BlindLevelsSection.tsx`.
- Recent Players moves into `client/src/components/PlayerSection.tsx`.
- Settings keeps Audio, Display and Branding, which are genuinely cross-cutting.
- Notes stays put. It is participant-facing content rather than a preference, but moving it adds
  churn for little gain — noted, not acted on.

### 7d. Dead components (~590 lines)

`ColoredTabsExample.tsx` (a demo), and `BrandingSection.tsx` + `EventBrandingSection.tsx` — 196
lines each, near-identical, both unreferenced. Branding is edited from `SettingsSection`.

**Verify.** Set an Event Name and confirm it still shows; clear it in league mode and confirm the
header falls back to the league name; rename the league and confirm the header follows. Confirm an
existing tournament with the old `branding.leagueName` still renders (back-compat read). Share opens
the same QR flow from its new position. Toggling Big Blind Ante from the Levels tab updates the
level table immediately. `npm run check`, `npm test`, `npm run test:rules` clean.

---

## Assumptions

- Seasons matter and both shapes are needed (director confirmed). Not simplifying seasons away.
- Solo user, tiny data volume — a one-time migration on load is acceptable over a scripted backfill.
- Phases land independently. Phase 1 is the load-bearing one; 4 is safe to do at any point.

## Verification (whole)

`npm run check`, `npm test`, `npm run test:rules` green after each phase. New tests for
`seasonProgress` and the status migration. Manual end-to-end on the director view plus one QR
participant check per phase that touches shared state.
