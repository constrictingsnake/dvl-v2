# Auction Tracker Extension

Browser extension that lets users track saved auctions across multiple sites (eBay, GovDeals, +2) in a unified real-time dashboard.

## Stack

| Layer | Technology |
|---|---|
| Extension framework | WXT (TypeScript, Vite, React) |
| Frontend / dashboard | React 18 + Tailwind CSS |
| State | Zustand |
| Backend | Firebase — Firestore, Auth, Cloud Functions, Cloud Messaging |
| Auth | OAuth 2.0 via Firebase Auth (Google provider) |
| Polling | Cloud Functions + Cloud Scheduler |
| Charts | Recharts |
| Icons | Lucide |
| Server-side HTML parsing | cheerio |

## Architecture

Four tiers:

```
Auction sites (eBay, GovDeals, +2)
        ↕ in-session read             ↑ poller fetches listing URLs
User's browser
  ├── Browser extension (WXT)         content scripts + service worker
  └── Dashboard (React + Tailwind)    real-time Firestore listener
        ↕ OAuth · real-time sync
Firebase backend
  ├── Auth                            OAuth 2.0 sign-in
  ├── Firestore                       source of truth for all item state
  ├── Functions                       polling logic + notification triggers
  └── Messaging (FCM)                 push to extension and dashboard
        ↕ cron trigger · results
Background polling
  ├── Cloud Scheduler                 cron job
  └── Background poller               Cloud Function (Apify fallback)
```

**Core data flows:**
- Save: content script detects save → service worker writes item to Firestore
- Poll: Cloud Scheduler fires → Function fetches listing URLs → diffs → writes only changes to Firestore
- Sync: Firestore `onSnapshot` listener in dashboard/popup repaints UI on any write
- Notify: Firestore-triggered Function detects outbid/ending-soon → FCM push to all user tokens

## Firestore schema

```
users/{uid}/
  items/{itemId}
    url: string
    site: 'ebay' | 'govdeals' | ...
    title: string
    currentPrice: number
    endTime: timestamp
    bidCount: number
    lastPolled: timestamp
    nextPollAt: timestamp        // adaptive polling
    status: 'active' | 'ended' | 'stale' | 'error'
    notifyOnOutbid: boolean
    notifyMinutesBefore: number
    fcmTokens: string[]          // stored on user doc, not item

  items/{itemId}/history/{snapshotId}
    price: number
    bidCount: number
    recordedAt: timestamp
```

## Key constraints — always follow these

- **Never store credentials for auction sites.** The extension reads them through the user's existing browser session. The poller fetches only public listing URLs that were already captured by the extension.
- **OAuth 2.0 is for the tracker account only** (Firebase Auth, Google provider). Auction sites are not authenticated by the app.
- **The poller must be idempotent.** Cloud Scheduler may fire overlapping invocations. Use `nextPollAt` to skip items not yet due and a write lock or timestamp check to prevent double-writes.
- **Write only diffs.** The poller should compare fetched data against the stored snapshot and write to Firestore only when something changed. This controls costs and avoids spamming the real-time listener.
- **Adaptive polling.** Short intervals (1–2 min) for auctions ending soon; hourly for distant ones. Never poll at a flat rate.
- **DOM selectors live in a shared config** (`packages/adapters/selectors.ts` or equivalent). The content scripts and the server-side poller both import from it. When a site changes its HTML, update the config once — not in two separate places.
- **Use `MutationObserver` or a short polling loop in content scripts** for JS-rendered pages. Target elements may not exist at injection time.
- **Store FCM tokens as an array on the user document.** Users may have multiple devices. Fan out notifications to all tokens and prune any that return `messaging/registration-token-not-registered`.
- **Firebase Blaze (pay-as-you-go) is required only to deploy a Cloud Function** — the poller and the kill-switch. Since the Spark→Blaze deprecation there is no free Function deploy, and outbound HTTP from Functions does not run on Spark. **Everything before Phase 3 (auth, Firestore, FCM, schema, rules, emulators) runs on Spark at $0**, so the Blaze upgrade is deferred to the start of Phase 3. Note **Blaze = Spark's free tier + pay-as-you-go beyond it; you are billed $0 until you exceed free quota** — the real cost risk is a runaway poller, guarded by the kill-switch below, not by the plan itself.
- **Ship baseline Firestore security rules with the first write (Phase 1), harden before release (Phase 5).** Users may only read/write their own documents: `request.auth.uid == resource.data.uid`. Never run user data through default/open rules across multiple phases. The poller Function uses a service account that bypasses client rules.
- **Blaze upgrade + budget alert + hard kill-switch ship together, immediately before the first Function deploy (start of Phase 3) — not in Phase 0.** A buggy adaptive-polling loop bills real money. A GCP budget alert is **notification-only and does not stop spending**, so also wire budget → Pub/Sub → a Cloud Function that disables project billing. Cap items per user and add a poller circuit breaker. **Invariant: never deploy the poller without Blaze + the kill-switch already live.** The item-cap / circuit-breaker constants are written down in Phase 0 (cheap, no billing); the kill-switch Function itself deploys in Phase 3 alongside the poller. (This keeps Functions in Phase 3 as originally scoped — the earlier plan to deploy the kill-switch early in Phase 0 is reverted now that we start on Spark.)

## Features

- Auto-capture of saved auctions via per-site content-script adapters
- Manual add by pasting a listing URL
- Unified real-time dashboard with filter, sort, search, and watchlist grouping
- Background price/bid/end-time polling independent of browser state
- Push notifications: outbid, ending soon, price threshold
- Snipe reminders (user-configurable minutes before close)
- Per-item price history chart
- Cross-device sync via Firestore

## Site adapters

Each adapter is a self-contained module that exports:
- `TRIGGER` — how to detect a save (button click, URL pattern, localStorage write)
- `SELECTORS` — DOM selectors for price, end time, bid count, title (imported from shared config)
- `normalize(doc) → ItemData` — extracts structured data from the page

| Site | Status |
|---|---|
| eBay | not started |
| GovDeals | not started |
| Site 3 | TBD |
| Site 4 | TBD |

## Current phase

| Phase | Scope | Status |
|---|---|---|
| 0 | WXT scaffold, Firebase project (Spark; **Blaze deferred to Phase 3**), OAuth client, Firestore schema, CI, **Firebase Emulator Suite, adapter-fixture test harness, cost-safety constants written down** — see [Phase 0 — plan of operations](#phase-0--plan-of-operations) | in progress |
| 1 | OAuth flow, dashboard/popup UI shell (built in the extension), Firestore listener, item cards, **baseline security rules** | not started |
| 2 | Content scripts + **eBay adapter only (auction / BIN / ended)**, service worker write path | not started |
| 3 | Cloud Functions + Scheduler, fetch/diff, adaptive polling — **prove the full eBay vertical slice end-to-end before adding any second adapter** | not started |
| 4 | FCM setup, Firestore-trigger Functions, snipe reminders | not started |
| 5 | Remaining adapters (GovDeals, Sites 3/4), error states, retries, **security-rules hardening pass**, store submission | not started |

MVP (auth + 1 site + manual polling, no push) ≈ 4–5 weeks solo.

**Phasing rationale:**
- **Security rules ship as a baseline in Phase 1** (the moment of the first Firestore write), not at the end. Rules are code and evolve with the schema; only the *hardening pass* belongs in Phase 5. Never run user data through default/open rules across multiple phases.
- **One adapter (eBay) as a full vertical slice through Phases 2–3.** Prove capture → write → poll → diff on a single site before building a second adapter against unvalidated parsing assumptions. eBay alone covers three HTML structures.
- **Don't extract `packages/ui` for a single consumer.** Build the popup/dashboard UI directly in the extension. Extract to the shared package only when the companion website is greenlit and there's a second consumer.

## Phase 0 — plan of operations

Resume from the first unchecked box. Each step lists its **done-when** gate. Corrections from the original draft are flagged ⚠️.

- [x] **0. Repo hygiene (ongoing).** Work on a branch, not `main`; commit after each step. `.gitkeep` empty placeholder dirs so the structure survives a clone. ⚠️ **Delete `packages/ui`** — CLAUDE.md forbids it until the companion site is greenlit (a second consumer); it's currently scaffolded in violation. *Done-when: `packages/ui` removed, placeholders `.gitkeep`'d, scaffold committed on a branch.*
- [x] **1. Initialize the monorepo.** pnpm workspaces + Turborepo; `/apps`, `/packages`, `/functions`; `.gitignore`; `tsconfig.base.json` + root `tsconfig.json` references. Root ESLint (flat config: TS + React + hooks, Prettier-compatible) + Prettier added; lint runs from root via `eslint .` (removed the dead `turbo` lint task); markdown docs excluded from Prettier so this file stays hand-managed; minimal `src/index.ts` stubs added to the three packages so typecheck passes. ✅ `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all run clean from root. **Not yet committed.**
- [x] **2. Scaffold the WXT extension.** WXT 0.20.26 React+TS template scaffolded into `apps/extension/` via `pnpm dlx wxt@latest init`, joined to the workspace as `@dvl/extension` (React 18, `"private": true`). Extension ID pinned to **`bjicpagnabmhmkodglkgjcpdklngdmgo`** via RSA-2048 `manifest.key` in `wxt.config.ts` (public key only — `extension.pem` is gitignored). Step 7 OAuth redirect URI: `https://bjicpagnabmhmkodglkgjcpdklngdmgo.chromiumapp.org/`. `pnpm dev` builds and opens a hot-reloading dev extension; `pnpm build` produces an MV3 build under `.output/chrome-mv3/`. ✅ `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all clean from root. (Visual hot-reload in Chrome unverifiable in headless agent — `pnpm dev` starts without error and the browser open event fires.)
- [x] **3. Create the Firebase project (Spark — no Blaze yet).** Project **`dvl-auction-tracker`** (number **`457724432660`**), owned by `aarav.verma2024@gmail.com`, on the **Spark** plan. GCP project was created via CLI; Firebase had to be attached via the console (CLI `addFirebase` 403'd on the fresh personal-account project). **Firestore** `(default)` database created — Native mode, **Standard** edition, region **`us-central1`** (permanent), production mode. **Auth → Google** provider enabled with a support email. **Cloud Messaging** on by default. ⚠️ Blaze + Cloud Functions intentionally skipped — deferred to the start of Phase 3 (see step 4). Active project pinned in repo via committed **`.firebaserc`** (no `firebase.json` yet — that lands in step 8, so CLI commands use `--project`). *Done-when ✅: project on Spark with Firestore + Auth (Google) + FCM enabled; `.firebaserc` committed.*
- [x] **4. Write down cost-safety constants now; defer Blaze + the kill-switch deploy to the start of Phase 3.** Constants committed in **`functions/src/limits.ts`**: `MAX_ITEMS_PER_USER` (200), adaptive-poll floor/ceiling (`MIN`/`MAX_POLL_INTERVAL_SECONDS` = 60s / 1h) + reference `ADAPTIVE_POLL_SCHEDULE`, the `CIRCUIT_BREAKER` object (max items/run, error-rate + consecutive-failure trips, cooldown, per-item daily poll ceiling), and `MONTHLY_BUDGET_USD` (10). ⚠️ The actual safety net — **Blaze upgrade**, a **$10/mo budget with 50/90/100% email alerts**, and **budget → Pub/Sub → kill-switch Function that disables project billing** — lands immediately before the poller in Phase 3, because deploying any Function requires Blaze. Alerts don't stop spending; the kill-switch does. **Invariant: never deploy the poller without Blaze + the kill-switch already live.** *Done-when (Phase 0 portion) ✅: item-cap / circuit-breaker constants written down and committed.* (Blaze upgrade + budget + kill-switch deploy + forced-alert test all happen in Phase 3 — see the constraint above.)
- [ ] **5. Wire Firebase into the repo.** `packages/firebase/` with shared client init (`initializeApp`, typed Firestore refs, Auth, Messaging). Web config in `.env.local` (gitignored; `.env.example` committed). ⚠️ **Read env via `import.meta.env` with `WXT_PUBLIC_*` / `VITE_*` prefixes — not `process.env`.** Firebase web config is not secret; service-account keys live only in Functions. *Done-when: the extension initializes Firebase from env at runtime, no hardcoded config.*
- [ ] **6. Define the Firestore schema.** `firestore.rules` with a strict **deny-all baseline** (stronger than, and consistent with, the "no open rules" constraint; per-user rules land in Phase 1, hardening in Phase 5). TS types for `Item`, `ItemHistory`, `User` in `packages/firebase/types.ts` matching the schema above. ⚠️ Deny-all blocks client writes, so **route Phase 0 dev/test writes through the Admin SDK or seeded emulator data.** *Done-when: types compile and are imported; rules file present.*
- [ ] **7. Configure the OAuth client (blocks all of Phase 1).** Use `chrome.identity.launchWebAuthFlow`. ⚠️ This requires a **"Web application"** OAuth client (not "Chrome Extension") with redirect URI **`https://<extension-id>.chromiumapp.org/`** (not `chrome-extension://`), using the ID pinned in step 2. Smoke-test the full round trip: `launchWebAuthFlow` → Google consent → token → exchange into Firebase Auth. *Done-when: a manual click completes sign-in end-to-end and yields a Firebase user.*
- [ ] **8. Stand up the Firebase Emulator Suite.** `firebase.json` with Auth, Firestore, Functions emulators; `emulators:start` script; point the extension at emulators via a flag (e.g. `WXT_PUBLIC_USE_EMULATORS`). Note: the real Google OAuth flow (step 7) runs against live Google, not the Auth emulator. *Done-when: `pnpm emulators:start` runs and the extension reads/writes local Firestore.*
- [ ] **9. Set up CI (GitHub Actions).** On every push: install → type-check → lint → emulator-backed tests. ⚠️ **The Emulator Suite needs a JRE — add `actions/setup-java`** before `firebase emulators:exec`, or emulators won't start. *Done-when: a pushed PR shows green type-check, lint, and emulator tests.*
- [ ] **10. Bootstrap the adapter-fixture harness.** `packages/adapters/` with a `selectors.ts` stub (shared source of truth for content scripts + poller), a `fixtures/` folder for saved HTML snapshots, and **one deliberately failing test** against a placeholder `normalize()`. *Done-when: the failing test runs in CI and fails for the right reason (harness works, logic stubbed).*

## Folder structure (planned)

```
/
├── apps/
│   ├── extension/          WXT project (content scripts, service worker, popup/sidepanel)
│   └── dashboard/          React web app (Firebase Hosting) — optional companion site
├── packages/
│   ├── adapters/           shared site adapter configs and selector maps
│   ├── firebase/           shared Firebase client init and type definitions
│   └── ui/                 shared React component library — create only when the companion site is greenlit (a second consumer); until then, build UI in the extension
├── functions/              Cloud Functions (poller, notification triggers)
└── firestore.rules
```

## Future: companion website

A read-only web dashboard (view items, price history, settings) deployable to Firebase Hosting.
- Reuses `packages/ui` components — extract the popup/dashboard UI from the extension into `packages/ui` at this point (don't pre-extract for a single consumer)
- Web auth uses `signInWithPopup` instead of `chrome.identity`
- No backend changes required
- Cannot capture new auctions (content scripts required for that)
- ~1 week of additional work once Phase 1 is complete

## Gotchas

- `chrome.identity.launchWebAuthFlow` is the correct OAuth entry point in extensions — not `signInWithPopup`. Get this working early in Phase 0; it blocks everything else.
- DOM drift: sites update their HTML without notice, breaking selectors silently (no errors, just missing data). Treat each adapter as ongoing maintenance.
- eBay has different HTML structures for auctions, Buy It Now, and ended listings. Test all three.
- If a site starts blocking the poller (403s, CAPTCHAs), fall back to Apify for that site specifically while keeping the rest server-side.
- Chrome Web Store review takes several days and requires a privacy policy. Don't leave this for last.
- FCM push differs between the extension and the web companion site: MV3 service-worker push is finicky and uses a different setup than web push. Don't assume one config covers both.
- Selector drift won't be caught by tests against live sites. Maintain a fixture corpus (saved HTML snapshots → expected `ItemData`) so CI catches regressions in your *parsing logic*, and use the Firebase Emulator Suite to test Functions, Firestore, and rules locally.