# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project working rules

This repo also has an `AGENTS.md` at the repository root (`../AGENTS.md`) with mandatory rules for AI coding agents — task-size classification (Tiny/Small/Medium/Large), TDD requirements for Medium/Large changes, and a required final-response summary format (change size, files changed, tests run, commands run, actual results, risks). Read it before starting non-trivial work.

## What this project is

NextGen Play is being migrated from Google Apps Script + Google Sheets to Vite + React + Cloud Firestore, deployed on Firebase Hosting. **Cloud Functions are intentionally not used** — do not add them or design a feature that requires them. This directory (`firebase-app/`) is the new app; `../legacy-gas/` is a snapshot of the old Apps Script system, parts of which are still consumed at build time (see Architecture below). `../DEPLOYMENT.md` is the deploy/migration runbook.

## Commands

Run from this directory (`firebase-app/`), or from the repo root where the same script names delegate here:

```bash
npm run dev             # vite dev server
npm run build            # production build to dist/
npm test                 # vitest run (all *.test.ts / *.test.tsx)
npm run test:watch       # vitest watch mode
npx vitest run src/components/AdventureMap.test.tsx   # single test file
npm run test:rules       # Firestore security rules tests against the real emulator (needs Java 21+ on PATH)
npm run lint
npm run typecheck        # tsc --noEmit
npm run preflight        # validates Firebase deploy shape (hosting->dist, no Cloud Functions, correct project) before any deploy
npm run verify:dist      # scans dist/ to block legacy GAS / Cloud Functions patterns from shipping
npm run verify           # lint + typecheck + test + audit:prod + build + verify:dist — run before considering work done
```

Data/admin scripts (need `GOOGLE_APPLICATION_CREDENTIALS`, run from repo root per README):
```bash
npm run migrate -- path/to/sheet-export.json [--commit]   # one-time Sheets -> Firestore import, dry-run by default
npm run backup                                              # dumps every collection to backups/
npm run backfill:directory                                  # repairs the public `directory` collection from `users`
```

### Test environment notes

- There is no global vitest `environment` config — component tests each start with a `// @vitest-environment jsdom` pragma; pure-logic test files (`*Logic.test.ts`, services, scripts) run under the default node environment. Match whichever pattern the neighboring test file uses.
- `npm run test:rules` uses `vitest.rules.config.ts` (only `emulator/**/*.rules.ts`, serial execution) and requires the Firestore emulator via `firebase emulators:exec`, not plain vitest.

## Architecture

### React mounted inside a legacy DOM shell

`src/App.tsx` is the entire app entry. At build time, `vite.config.ts` (`legacySourcesPlugin`) reads the legacy Apps Script HTML/CSS/JS from `../legacy-gas/` (`Index.html`, `CSS.html`, the `JS_*.html` files), strips/migrates them via `src/legacy/legacyDocument.ts` and `src/legacy/stripLegacyFunctions.ts`, and emits them as string constants (`legacyBody`, `legacyCss`, `legacyScript`) through the virtual module `virtual:legacy-sources`. `App.tsx` injects `legacyBody` via `dangerouslySetInnerHTML`, injects `legacyCss`/`legacyScript` as `<style>`/`<script>` tags, then mounts one React root per feature into DOM nodes that exist inside that legacy body (`#react-landing-root`, `#react-dashboard-root`, `#react-lesson-root`, etc.).

Communication between the React islands and the remaining legacy script (which still owns some navigation/state) goes through a `window.nextGenLegacyBridge` global implementing the `LegacyBridge` interface defined at the top of `App.tsx` — legacy calls into React via bridge methods like `completeLogin`, `getCurrentUser`, `openDashboardTab`. This bridge is the seam: when a page/feature has been fully migrated to React, its legacy markup and script are trimmed via `stripLegacyFunctions`/`removeElementById` in `vite.config.ts`, and the bridge shrinks accordingly. See `firebase-app/README.md` "สถานะ migration" for which surfaces are React vs. still legacy-composed.

### GAS-compatible service call shim

Legacy scripts call the backend as `google.script.run.withSuccessHandler(...).withFailureHandler(...).someFunction(args)`. Rather than rewriting every legacy call site, `src/services/legacyRunner.ts` (`installFirebaseServiceRunner`, called once in `App.tsx`) installs `window.firebaseServices` — a `Proxy`-based object with the same `withSuccessHandler/withFailureHandler` chaining API, but backed by real async Firestore calls from `src/services/firestoreApi.ts`. `vite.config.ts`'s `migrateLegacyBackendCalls` rewrites `google.script.run...` call sites in the legacy JS source to `firebaseServices...` at build time. Production bundles contain no `google.script.run`, `doGet`, or `doPost` — `verify-dist.mjs` enforces this.

### Component / logic-file split

Feature components (`src/components/Foo.tsx`) generally have a co-located pure-logic module (`src/components/fooLogic.ts` or similarly named, e.g. `adventureMapLogic.ts`, `bossCombatLogic.ts`, `lessonCombatLogic.ts`, `dashboardCharacter.ts`) each with its own `*.test.ts`. Business/game logic (combat math, positions, scoring) lives in these logic files so it's testable without rendering; the component wires logic to Firestore-backed `service` props (see below) and DOM/state.

### Service-prop pattern

Every top-level feature component takes a `service` object of async functions (e.g. `LandingService`, `MapService`, `LessonService` — defined next to each component) rather than importing Firestore directly. `App.tsx` is the only place that wires real implementations (`firestoreApi.*`, bridge calls) into these props. This makes components testable with fake services and keeps Firestore access centralized in `src/services/*Api.ts`.

### Two separate Firebase Auth sessions

`src/firebase/client.ts` holds the anonymous/student session (`ensureSignedIn`, anonymous auth) used by the main app. `src/firebase/adminClient.ts` is a **second, independently named Firebase app instance** (`initializeApp(firebaseConfig, 'nextgen-admin')`) used only by the Admin Panel, authenticated via `admin@nextgen-play.local` Email/Password with session-only persistence. Keep these separate — do not reuse `auth`/`db` from `client.ts` for admin operations, and vice versa.

### Firestore collections and security model

See `README.md` "Collections" and "ข้อจำกัดด้านความปลอดภัย" for the full collection list and constraints. Key points to keep in mind when touching data access or `../firestore.rules`:
- `users` is readable only by its owner (`ownerUid`) and admin; anything needed by public UI (leaderboards, name selection) must be mirrored into the separate `directory` collection instead — never expand `users` read access to work around this.
- Firestore rules cap per-write XP/coin deltas (±1000) and validate document shape/allowed-field-diffs (see `userDocumentShapeValid`, `userChangedFieldsAllowed` in `../firestore.rules`) — mirror this validation style (explicit allowed-keys, explicit allowed-diff-keys) if adding new writable fields.
- `AdminPIN` and `GeminiAPIKey` must never be written to `settings/public` or bundled into the frontend — the importer strips them; there is no trusted backend to hold secrets since Cloud Functions are excluded. The runtime Gemini key lives only in the `settings/ai` document (admin-writable, signed-in read — see `firestore.rules`), loaded at runtime by `src/services/aiApi.ts`; never copy it anywhere else and keep the key referrer-restricted in Google Cloud.
- Rule changes must be validated against the real emulator with `npm run test:rules`, not just read for correctness.

### World Boss / standalone mini-games

`src/worldBoss/standaloneGame.ts` + the `worldBossAssetsPlugin` in `vite.config.ts` serve legacy static mini-games (Mario game, fitness, neck quiz) from `../legacy-gas/mario-game/` etc. under `/world-boss/...`, both in dev (middleware) and in the production build (`generateBundle` emits them into `dist/world-boss/`). These games communicate results back to React via `postMessage`, not Firestore or `doPost` directly — see `WorldBoss.tsx`/`worldBossLogic.ts` for the receiving side.

## Conventions

- Field names in Firestore and TypeScript are camelCase (`lessonId`, `questionText`, `isActive`), with real types (number/boolean/array/object), not legacy Sheet-style stringified JSON. `scripts/import-firestore.mjs` / `scripts/map-sheet-export.mjs` do the legacy-header-to-camelCase mapping (e.g. `LessonID` → `lessonId`, `Player1Score` → `p1Hp`) — extend the mapping there if importing a new legacy field, don't hand-roll conversions elsewhere.
- Deploys are `firebase deploy --only hosting,firestore:rules,firestore:indexes` from the **repository root** (not this directory), and Hosting has a `predeploy` hook that runs `npm run preflight && npm run verify` automatically.
