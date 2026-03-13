# AGENTS.md

## General Rules

- Always read PLAN.md and FEATURES.md before starting any implementation task.
- Always read the relevant skill files in `.opencode/skills/` for domain-specific rules (game-rules, socket-events, chakra-components).

## Progress Tracking

- After completing any feature, update its checkbox in `FEATURES.md` from `[ ]` to `[x]`.
- After completing a milestone or group of related features, update `README.md` to reflect current project status (e.g., setup instructions, which features are working, known limitations).
- Never leave completed work untracked — update progress immediately after finishing, not in batches.

## Branching Strategy

- Each feature or feature group must be implemented on its own branch off `main`.
- Branch naming convention: `feature/<short-description>` (e.g., `feature/room-management`, `feature/deck-engine`, `feature/burn-action`).
- Related features may be grouped into a single branch if they are tightly coupled and cannot function independently (e.g., all data model types in one branch).
- Never commit directly to `main`.
- Only merge a feature branch into `main` after it has been fully tested and verified (see Testing & Feature Verification below).
- After a successful merge, delete the feature branch.

## Testing & Feature Verification

After every feature implementation, verify the build before marking the feature complete.

### What Constitutes a Successful Feature Build

A feature is only considered complete when ALL of the following pass:

1. **TypeScript compiles without errors** — run `npx tsc --noEmit` in both `client/` and `server/`. Zero type errors allowed.
2. **Lint passes** — run the configured linter. No errors (warnings are acceptable if pre-existing).
3. **The application starts** — both client and server must start without runtime crashes.
4. **The feature works as specified** — behavior matches the description in FEATURES.md and the rules in PLAN.md and the game-rules skill.
5. **Existing features are not broken** — no regressions in previously completed features.

### How to Test

1. **After every implementation**, run the build checks:

   ```bash
   # Type check both packages
   cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit && cd ..

   # Run linter if configured
   npm run lint --workspaces --if-present

   # Run tests if they exist
   npm test --workspaces --if-present
   ```

2. **Server-side features** (game logic, socket handlers, validators):
   - **Every server-side feature must have unit tests.** When adding new server logic (utility functions, socket handlers, game engine functions, validators, etc.), always write corresponding Vitest tests in `server/src/__tests__/`. No server feature is considered complete without passing tests.
   - Run tests with `npm run test --workspace=server` and confirm they all pass.
   - For socket handlers, confirm the event is registered and the handler executes without errors.

3. **Client-side features** (components, pages, context):
   - Start the dev server (`npm run dev` in client) and confirm no console errors.
   - Visually verify the component renders correctly.
   - Test interactive elements (clicks, inputs, modals) behave as expected.

4. **Integration features** (socket events connecting client and server):
   - Start both client and server.
   - Open multiple browser tabs to simulate multiplayer.
   - Walk through the user flow end-to-end.
   - Confirm state stays synchronized across all clients.

5. **Edge cases to always check**:
   - Invalid inputs (empty strings, wrong types, out-of-range values)
   - Boundary conditions (0 cards in hand, empty deck, max players)
   - Unauthorized actions (wrong player's turn, invalid slots)

### When a Feature Fails Verification

- Do NOT mark the feature as complete in FEATURES.md.
- Fix the issue first, then re-run all checks.
- If fixing one feature breaks another, fix the regression before proceeding.

## Code Quality

- Server is authoritative for all game logic — never trust the client.
- Use TypeScript strict mode.
- Follow existing patterns and conventions in the codebase.
- Validate all inputs server-side before processing.
