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
| Listing data — eBay | eBay Browse API (official JSON; no scraping) |
| Server-side HTML parsing — GovDeals & scrape-only sites | cheerio |

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

Money is stored as integer **minor units (cents)**, never floats — always paired with `currency` (ISO 4217). Times are Firestore `Timestamp`. Types live in `packages/firebase/src/types.ts`; adapters emit SDK-free `ItemData` (epoch-ms times) which the write path maps onto `Item`.

```
users/{uid}
  createdAt: timestamp
  email: string | null
  displayName: string | null
  itemCount: number              // denormalized item-cap counter; maintain transactionally. NOT enforced until the Phase 3 trigger Function (no trigger Functions pre-Blaze) — advisory/dev-only before then.
  defaultNotify: NotificationPrefs
  fcmTokens: { [token]: { platform: 'extension'|'web', updatedAt } }   // map keyed by token (NOT an array) — avoids multi-device write races

  items/{itemId}
    url: string
    site: 'ebay' | 'govdeals' | ...
    listingType: 'auction' | 'bin' | 'auction_bin'
    addedVia: 'capture' | 'manual'
    createdAt: timestamp
    title: string | null
    imageUrl: string | null
    currency: string             // ISO 4217
    currentPrice: number | null  // minor units (cents)
    buyItNowPrice: number | null // minor units (cents); null if not BIN
    bidCount: number | null      // null for pure BIN
    endTime: timestamp | null    // null for BIN / Good-'Til-Cancelled
    status: 'pending' | 'active' | 'ended' | 'stale' | 'error'
    bidStatus: 'winning' | 'outbid' | 'unknown'   // ONLY settable from a logged-in page (content script); the public-page poller/API CANNOT read it — stays at last content-script value or 'unknown'
    lastPolled: timestamp | null
    nextPollAt: timestamp | null // adaptive polling; null once ended
    consecutiveErrorCount: number
    lastError: string | null
    notify: { onOutbid, minutesBefore, priceThreshold, priceThresholdDirection }
    notificationState: { endingSoonSentAt, outbidNotifiedPrice, priceThresholdSentAt }
    group: string | null         // watchlist grouping; null = ungrouped

    items/{itemId}/history/{snapshotId}
      price: number              // minor units (cents)
      bidCount: number | null
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
- **Store FCM tokens as a map keyed by the token string** (`fcmTokens: { [token]: { platform, updatedAt } }`), not an array. Users may have multiple devices; a token-keyed map lets each device write its own entry (`fcmTokens.<token> = …`) without the read-modify-write races that clobber a shared array, and dedups naturally. Fan out notifications to every token and prune any that return `messaging/registration-token-not-registered`.
- **Use the official eBay Browse API for eBay — do not scrape it.** It returns price, bid count, and end time as JSON on a free tier: immune to DOM drift, dodges datacenter-IP blocking (GCP egress IPs are on every scraper blocklist), and sidesteps the ToS / Chrome-Web-Store-review risk of scraping a site that offers an API. It needs an app-token (client-credentials OAuth, separate from user auth) and has a daily call quota (~5k/day default) the adaptive poller must budget against. **Scrape only sites with no API (GovDeals, Sites 3/4).** This does NOT help outbid detection — the API is app-authed, so it can't see whether *you* are the high bidder either.
- **Outbid detection is best-effort, not authoritative.** Whether *you* are the high bidder is account state that no public listing page or API exposes — only a logged-in page (a content script) can set `bidStatus`. The background poller sees price/bid-count rise but cannot distinguish "someone outbid you" from "your own proxy bid incremented" or "two other bidders are fighting." Treat outbid as **"possibly outbid since your last visit"**: fire it only on a confident signal (a content script re-reads a logged-in page, or price rose above the user's known max bid) and word the notification as best-effort. Never present a poller-derived outbid as certain.
- **Firebase Blaze (pay-as-you-go) is required only to deploy a Cloud Function** — the poller and the kill-switch. Since the Spark→Blaze deprecation there is no free Function deploy, and outbound HTTP from Functions does not run on Spark. **Everything before Phase 3 (auth, Firestore, FCM, schema, rules, emulators) runs on Spark at $0**, so the Blaze upgrade is deferred to the start of Phase 3. Note **Blaze = Spark's free tier + pay-as-you-go beyond it; you are billed $0 until you exceed free quota** — the real cost risk is a runaway poller, guarded by the kill-switch below, not by the plan itself.
- **Ship baseline Firestore security rules with the first write (Phase 1), harden before release (Phase 5).** Rules are **path-based, not field-based**: items live at `users/{uid}/items/{itemId}` and carry no `uid` field, so match on the path wildcard — `match /users/{uid}/{document=**} { allow read, write: if request.auth.uid == uid; }`. Use `request.resource.data` (not `resource.data`, which is null on creates) for any create/update predicate. Test the baseline rules with `@firebase/rules-unit-testing` against the emulator so Phase 1 doesn't ship untested rules. Never run user data through default/open rules across multiple phases. The poller Function uses a service account that bypasses client rules.
- **Blaze upgrade + budget alert + hard kill-switch ship together, immediately before the first Function deploy (start of Phase 3) — not in Phase 0.** A buggy adaptive-polling loop bills real money. A GCP budget alert is **notification-only and does not stop spending**, so also wire budget → Pub/Sub → a Cloud Function that disables project billing. Cap items per user and add a poller circuit breaker. **Invariant: never deploy the poller without Blaze + the kill-switch already live.** The item-cap / circuit-breaker constants are written down in Phase 0 (cheap, no billing); the kill-switch Function itself deploys in Phase 3 alongside the poller. (This keeps Functions in Phase 3 as originally scoped — the earlier plan to deploy the kill-switch early in Phase 0 is reverted now that we start on Spark.) **Recovery:** the kill-switch disables project billing, which reverts the project to Spark and kills all Functions instantly (intended). To recover, re-attach a billing account in the GCP console, redeploy Functions, and resolve the budget condition that tripped it — write this down so a 3am page doesn't cause panic.

## Features

- Auto-capture of saved auctions via per-site content-script adapters (**one-way: captures saves, does not detect un-saves** — users remove items from the dashboard)
- Manual add by pasting a listing URL (creates a `pending` item; data is hydrated by the Phase 3 poller, **not** by an extension-side fetch — keeps `host_permissions` narrow for CWS review)
- Unified real-time dashboard with filter, sort, search, and watchlist grouping
- Background price/bid/end-time polling independent of browser state
- Push notifications: outbid (**best-effort** — see constraints), ending soon, price threshold
- Snipe reminders (user-configurable minutes before close)
- Per-item price history chart
- Cross-device sync via Firestore

## Site adapters

Each adapter is a self-contained module that exports:
- `TRIGGER` — how to detect a save (button click, URL pattern, localStorage write)
- `SELECTORS` — DOM selectors for price, end time, bid count, title (imported from shared config)
- `normalize(doc) → ItemData` — extracts structured data from the page

**Two input flavors per site, not one.** The content script reads the **live DOM** (after JS runs); the server-side poller reads either the **eBay Browse API JSON** (eBay) or **raw fetched HTML via cheerio** (scrape-only sites) — frequently *not* the same document. So `SELECTORS` are a true shared source of truth only for scrape-only sites; for eBay the poller-side `normalize` maps an API response while `SELECTORS` stay content-script-only (capture + logged-in `bidStatus`). Don't assume "update selectors once" holds for eBay.

| Site | Status |
|---|---|
| eBay | not started |
| GovDeals | not started |
| Site 3 | TBD |
| Site 4 | TBD |

## Current phase

| Phase | Scope | Status |
|---|---|---|
| 0 | WXT scaffold, Firebase project (Spark; **Blaze deferred to Phase 3**), OAuth client, Firestore schema, CI, **Firebase Emulator Suite, adapter-fixture test harness, cost-safety constants written down** — see [Phase 0 — plan of operations](#phase-0--plan-of-operations) | ✅ complete |
| 1 | OAuth flow, dashboard/popup UI shell (built in the extension), Firestore listener, item cards, **baseline security rules** | not started |
| 2 | Content scripts + **eBay adapter only (auction / BIN / ended)**, service worker write path | not started |
| 3 | Cloud Functions + Scheduler, fetch/diff, adaptive polling (**eBay via Browse API**; cheerio reserved for scrape-only sites) — poller uses a `collectionGroup('items')` query on `status`+`nextPollAt` (needs a composite collection-group index), paginates, and rate-limits per domain; **prove the full eBay vertical slice end-to-end before adding any second adapter** | not started |
| 4 | FCM setup, Firestore-trigger Functions, snipe reminders | not started |
| 5 | Remaining adapters (GovDeals, Sites 3/4), error states, retries, **security-rules hardening pass**, **account-deletion / delete-my-data path** (Auth user delete + recursive Firestore delete + FCM token cleanup), store submission | not started |

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
- [x] **5. Wire Firebase into the repo.** `packages/firebase/` exports lazy singletons — `getFirebaseApp` / `getFirebaseAuth` / `getDb` / `getFirebaseMessaging` (`client.ts`) + `getFirebaseConfig` / `useEmulators` (`config.ts`); emulator-aware behind `WXT_PUBLIC_USE_EMULATORS` (auth 9099 / firestore 8080, defaults match step 8). Web App registered (`1:457724432660:web:1a1d1253259f220286b201`); config read via `import.meta.env` (cast through `unknown` so it typechecks both in the package's own `tsc` and inside the extension's WXT-typed build — WXT's generated `ImportMetaEnv` doesn't include custom keys). Vars in `apps/extension/.env.local` (gitignored), placeholders in committed `apps/extension/.env.example`. `entrypoints/background.ts` calls `getFirebaseApp()` and logs the env-derived `projectId`. ⚠️ `pnpm` v11 hard-errors on unbuilt deps — `@firebase/util`/`protobufjs` set to `false` in `pnpm-workspace.yaml allowBuilds` (web SDK doesn't need them in a bundler). *Done-when ✅: extension build inlines `projectId` from env (no hardcoded config); typecheck/lint/format/build all clean.*
- [x] **6. Define the Firestore schema.** `firestore.rules` at repo root with a strict **deny-all baseline** (`allow read, write: if false`; per-user rules land in Phase 1, hardening in Phase 5). TS types in **`packages/firebase/src/types.ts`** (src layout), future-proofed against the full feature set: `Item`/`ItemHistory`/`ItemData`/`User`/`FcmToken` + `Site`/`ListingType`/`ItemStatus`/`BidStatus` unions, `NotificationPrefs`/`NotificationState`, plus `WithId<T>` and `FsTimestamp` helpers — all re-exported from `src/index.ts`. Key decisions: **money as integer minor units (cents)** + `currency`; **`FsTimestamp`** structural type so the model isn't coupled to client vs Admin SDK; poll-derived fields **nullable** (covers manual-add `pending` items + BIN/GTC listings); `listingType` discriminator for auction/BIN/both; notification fields cover outbid/ending-soon/**price-threshold** with dedup state; `bidStatus` (only set from a logged-in page); `group` for watchlists; `addedVia`/`createdAt`/error fields; richer `User` (`itemCount` for cap checks, `defaultNotify`, `{token,platform,updatedAt}[]` FCM tokens). SDK-free `ItemData` is the adapter contract. CLAUDE.md schema block updated to match. ⚠️ Deny-all blocks client writes, so Phase 0 dev/test writes go through the Admin SDK or seeded emulator data. *Done-when ✅: types compile + are exported; rules file present; typecheck/lint/format clean.*
- [x] **7. Configure the OAuth client (blocks all of Phase 1).** Reused the Firebase **auto-created "Web application" OAuth client** (`457724432660-…apps.googleusercontent.com`, created when the Google Auth provider was enabled in step 3) — added the redirect URI **`https://bjicpagnabmhmkodglkgjcpdklngdmgo.chromiumapp.org/`** to it (no separate client needed; Firebase accepts a Google `id_token` whose `aud` is any OAuth client in the project). Client ID lives in `apps/extension/.env.local` as `WXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` (placeholder in `.env.example`); `identity` permission added to the manifest. Flow: popup → message → **background service worker** runs `launchWebAuthFlow` (implicit `response_type=id_token` + nonce) → `GoogleAuthProvider.credential(idToken)` → `signInWithCredential`. ⚠️ **Auth MUST run in the background, not the popup** — `launchWebAuthFlow` opens a focused window that tears the popup down mid-flow, aborting the credential exchange. ⚠️ Auth persists via `initializeAuth(app, { persistence: indexedDBLocalPersistence })` so the popup and worker (separate JS contexts, shared extension-origin IndexedDB) see the same session and it survives worker restarts. ⚠️ **Smoke-test in a real Chrome via "Load unpacked" — NOT the `pnpm dev` browser**: WXT launches Chrome with automation flags and Google blocks OAuth there ("This browser or app may not be secure"). Helpers in `packages/firebase/src/auth.ts` (`signInWithGoogleIdToken`/`signOutUser`/`observeAuthState`, `AuthUser` type) keep `firebase/*` out of the extension; a temporary sign-in button in the popup is the test surface (becomes the Phase 1 OAuth UI). *Done-when ✅: manual click completed sign-in end-to-end → Firebase user (uid `eiceSTeiXxem7epuwkDcaKn6Yvm2`).*
- [x] **8. Stand up the Firebase Emulator Suite.** `firebase.json` with **Auth (9099) + Firestore (8080) + Emulator UI (4000)**, `singleProjectMode: true`, Firestore using the repo `firestore.rules`. Root scripts `emulators:start` / `emulators:exec` (`firebase emulators:start|exec`); **`firebase-tools` added as a root devDependency** so it's reproducible for CI (step 9), not a global. ⚠️ pnpm v11 hard-errored on firebase-tools' optional native `re2` — set `re2: false` in `pnpm-workspace.yaml allowBuilds` (falls back to JS; emulators don't need it). Ports match `packages/firebase/src/client.ts` so `WXT_PUBLIC_USE_EMULATORS=true` makes the extension connect locally. ⚠️ **Functions emulator deferred to Phase 3** — `functions/src` is an empty `export {}` stub with no `firebase-functions` dep, so wiring it now adds fragility for no Phase-0 value (consistent with the rest of the Functions/Blaze deferral). Verified: `emulators:exec` boots auth+firestore cleanly (JARs cached after first run), and a REST write+read against the Firestore emulator (admin `owner` token, which bypasses the deny-all rules) round-trips. *Done-when ✅: `pnpm emulators:start` runs; local Firestore read/write confirmed. (Authenticated **client** read/write from the extension stays blocked by deny-all rules until the Phase 1 per-user rules — to eyeball the connection now, set `WXT_PUBLIC_USE_EMULATORS=true`, rebuild, load unpacked, and the background SW logs `useEmulators: true`.)*
- [x] **9. Set up CI (GitHub Actions).** `.github/workflows/ci.yml` runs on every `push` + `pull_request` (with `concurrency` cancelling superseded runs): checkout → `pnpm/action-setup` (version from the `packageManager` field) → `setup-node@v4` (Node 22, pnpm cache) → ⚠️ **`setup-java@v4` (temurin 21) so the Emulator Suite has a JRE** → cache `~/.cache/firebase/emulators` (keyed on lockfile hash) → `pnpm install --frozen-lockfile` → `typecheck` → `lint` → `format:check` → `pnpm emulators:exec --only auth,firestore "pnpm test"`. The test step boots the emulators to validate the harness even though no package defines tests yet (those land in step 10 / Phase 1, so `turbo test` is currently a clean no-op). All steps verified locally (frozen install, typecheck, lint, format, and the emulator-exec test step all pass). *Done-when: a pushed PR shows green type-check, lint, and emulator tests — confirmed on first push (CI needs the step 8 + step 9 commits: `firebase.json`, `firebase-tools` dep, lockfile, workflow).*
- [x] **10. Bootstrap the adapter-fixture harness.** `packages/adapters/` now has `src/selectors.ts` (`SiteSelectors` + `SELECTORS` stub — shared content-script/poller source of truth, eBay excepted per CLAUDE.md), `src/normalize.ts` (placeholder `normalize(_input): ItemData` that throws — the adapter contract; real per-site parsing is Phase 2/5), a `fixtures/` folder with a placeholder `ebay-auction.sample.html`, and **Vitest** (`pnpm test` = `vitest run`; wired into `turbo test`). The harness test `test/normalize.test.ts` reads the fixture → calls `normalize` → asserts a full expected `ItemData`. ⚠️ Implemented as an **expected-failure** so CI stays green and mergeable: it uses **`it.fails`** (Vitest's marker — *not* Jest's `it.failing`, which threw `is not a function`). It passes today because the stub throws, and flips RED the moment `normalize()` is implemented — a built-in reminder to remove the marker and write real expectations. Also added `@dvl/firebase` as an adapters dep (for the `ItemData`/`Site` types) and configured `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: '^_'` repo-wide so `_`-prefixed contract params (e.g. `_input`) are allowed. Verified: lint/format/typecheck clean, and `pnpm emulators:exec --only auth,firestore "pnpm test"` runs the test green inside the booted emulators. *Done-when ✅: the harness test runs in CI (real test, not a no-op) and is green-as-expected-failure for the right reason — harness works end-to-end, parsing logic stubbed.*

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
- Google **OAuth consent-screen verification is a separate multi-day Google review** from Chrome Web Store review; an unverified app shows a scary warning to every user. Start it early, alongside the privacy policy.
- FCM push differs between the extension and the web companion site: MV3 service-worker push is finicky and uses a different setup than web push. Don't assume one config covers both. Concretely: the Firebase Messaging JS SDK's `getToken` expects a `window`/`document` and **won't run in an MV3 service worker** — use an **offscreen document** (or self-managed `chrome.gcm` / Web Push) for the extension. Choose this approach in Phase 4; don't discover it mid-build.
- The `history` subcollection is unbounded and grows fast near close (1-min polling). Set a **Firestore TTL policy** on `recordedAt` (TTL is free) to auto-expire old snapshots. And remember **deleting an item doc does NOT delete its subcollections** — item deletion (and account deletion) needs a **recursive delete**.
- `endTime` from the DOM is error-prone: eBay often renders **relative** times ("2d 3h left"), and converting to an absolute `Timestamp` is timezone-sensitive. Prefer the absolute ISO value from the Browse API (eBay) / embedded JSON over parsing rendered text.
- Selector drift won't be caught by tests against live sites. Maintain a fixture corpus so CI catches regressions in your *parsing logic* — and save **both flavors per site**: a content-script **live-DOM** snapshot AND the poller's actual input (**eBay Browse API JSON**, or **raw fetched HTML** for scrape-only sites), each mapped to expected `ItemData`. They're different documents, so a single flavor hides bugs. Use the Firebase Emulator Suite to test Functions, Firestore, and rules locally.
- No one watches `consecutiveErrorCount` by default. Add a cheap aggregate drift signal in Phase 5 (e.g. a scheduled check: % of polls returning all-null `ItemData` per site → email) so silent selector/API breakage surfaces.
- Tests run on **Vitest** (`pnpm test` → `turbo test` → `vitest run` per package). The expected-failure marker is **`it.fails`**, NOT Jest's `it.failing` (which throws `it.failing is not a function`). Use `it.fails` for tests asserting against not-yet-implemented logic (e.g. the stub `normalize()`): it stays green while stubbed and flips RED once the code is implemented — a built-in reminder to remove the marker and write real expectations.