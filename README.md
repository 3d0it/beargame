# Gioco dell'Orso

This project explores agent-driven programming through an implementation of a traditional game played in Alpine villages, especially in the Cervo Valley.

Single-codebase implementation of Gioco dell'Orso with:
- `human vs human` mode
- `human vs AI` mode with `easy`, `medium`, and `hard` levels
- web distribution (GitHub Pages)
- Android packaging + Play Store publishing through GitHub Actions

## Implemented Rules
- The bear moves first.
- The 3 hunters choose the initial arc.
- The bear chooses a free starting position.
- Hunter objective: completely trap the bear.
- If the bear is not trapped within 40 bear moves, the round is a draw.
- Match format: 2 rounds with role swap, with a manual tiebreaker if needed by starting a new game.

## Local Web Run
Prerequisite: Node.js `>= 22`.

```bash
npm ci
npm run serve
```
Then open `http://localhost:4173`.

## CI And Quality Gates
Workflow: `.github/workflows/ci.yml`
- Trigger: pull requests and pushes to `main`
- Runs tests with coverage (`npm run test:coverage`) and minimum thresholds
- Runs a runtime dependency audit (`npm audit --omit=dev --audit-level=high`)

## Test Strategy
- Game logic unit tests: `web/game.test.js`
- SVG rendering unit tests: `web/board-renderer.test.js`
- UI bootstrap unit/integration tests: `web/main.test.js`
- Real DOM UI integration tests (jsdom): `web/ui.integration.test.js`
- Service worker tests: `web/sw.test.js`

Useful commands:
```bash
npm test
npm run build
npm run test:ui
npm run test:coverage
npm run test:e2e:smoke
npm run release:check
npm run ai:generate
npm run ai:validate:reachable
npm run ai:scenarios
npm run ai:benchmark
npm run ai:report
```

For AI difficulty tuning:
- regenerate the exact table: `npm run ai:generate`
- run exhaustive reconstruction on reachable states only: `npm run ai:validate:reachable`
- run tactical regression scenarios: `npm run ai:scenarios`
- run repeatable match and probe benchmarks: `npm run ai:benchmark`
- run the easy/medium calibration sweep: `npm run ai:report`

For release preflight:
- `npm run release:check` runs tests, coverage, build, UI smoke checks, and runtime audit
- `npm run release:check:full` replaces the smoke suite with full viewport coverage
- `npm run release:ai:guard` verifies updated AI tables, tactical scenarios, monotonic benchmark ordering, and the current calibration
- `npm run ai:validate:reachable` intentionally stays outside automatic gates: it is a heavier manual check that reconstructs `outcome/distance` across all reachable states and compares it against the runtime tablebase

## Automatic Web Publishing
Workflow: `.github/workflows/deploy-web.yml`
- Trigger: completion of the `CI` workflow started by a `push` to `main`
- Deployment runs only if `CI` succeeds and publishes the exact commit SHA that was just validated
- Automatic deploy to GitHub Pages

## Automatic Play Store Publishing
Workflow: `.github/workflows/publish-playstore.yml`
- Trigger: manual (`workflow_dispatch`)
- Builds the AAB, signs it, and uploads it to the selected track (`internal` by default, or `beta`)

### Required Secrets
- `SIGNING_KEY_BASE64`
- `KEY_ALIAS`
- `KEYSTORE_PASSWORD`
- `KEY_PASSWORD`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`

## Architectural Notes
- UI and game logic live in `web/`
- `npm run build` copies the static web app into `dist/`, which is used for both GitHub Pages and Capacitor/Android
- Capacitor wraps the same web app for Android, without duplicating the game logic

## Artwork
Original illustrations generated with AI.

## Disclaimer
All trademarks, names, and distinctive signs mentioned, if any, belong to their respective owners.
This project is independent and has no official affiliation with or endorsement from third parties.

## License
MIT, see `LICENSE`.
