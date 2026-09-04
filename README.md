# StackMate Go

A poker tournament timer and league manager.

A **director** runs a game on a laptop or tablet — blinds, clock, seating, rebuys, payouts —
and **participants** join by scanning a QR code to get a read-only live view on their phones.
Games can be standalone or part of a league season, with points, standings and player stats
carried across the season.

React + TypeScript + Vite, Firestore for data, deployed on Railway.

## Run locally

**Prerequisites:** Node.js 20

```
npm install
cp .env.example .env.local   # then fill in your Firebase project's values
npm run dev
```

## Commands

```
npm run dev         # local dev server
npm run check       # tsc
npm test            # unit tests (vitest)
npm run test:rules  # Firestore rules tests against the emulator (needs Java)
npm run build       # production build
npm start           # serve the production build
```

## Notes for contributors

See [CLAUDE.md](CLAUDE.md). It is the real working documentation: how the data model fits
together, which behaviours are load-bearing, and the traps that have already cost live games.
Read it before changing anything around tournament state, handover or league results.

One thing worth knowing up front: **Firestore security rules are deployed by hand.** Editing
`firestore.rules` changes nothing in production until they are published.
