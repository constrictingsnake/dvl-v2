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
- **Use the official eBay Browse API for eBay — do not scrape it.** It returns price, bid count, and end time as JSON on a free tier: immune to DOM drift, dodges datacenter-IP blocking (GCP egress IPs are on every scraper blocklist), and sidesteps the ToS / Chrome-Web-Store-review risk of scraping a site that offers an API. It needs an app-token (client-credentials OAuth, separate from user auth) and has a daily call quota (~5k/day default) the adaptive poller must budget against. **Verified API reference (auth, endpoints, sandbox-vs-production gates, quotas, error semantics): `docs/ebay-browse-api.md`.** **Scrape only sites with no API (GovDeals, Sites 3/4).** This does NOT help outbid detection — the API is app-authed, so it can't see whether *you* are the high bidder either.
- **Outbid detection is best-effort, not authoritative.** Whether *you* are the high bidder is account state that no public listing page or API exposes — only a logged-in page (a content script) can set `bidStatus`. The background poller sees price/bid-count rise but cannot distinguish "someone outbid you" from "your own proxy bid incremented" or "two other bidders are fighting." Treat outbid as **"possibly outbid since your last visit"**: fire it only on a confident signal (a content script re-reads a logged-in page, or price rose above the user's known max bid) and word the notification as best-effort. Never present a poller-derived outbid as certain.
- **Firebase Blaze (pay-as-you-go) is required only to deploy a Cloud Function** — the poller and the kill-switch. Since the Spark→Blaze deprecation there is no free Function deploy, and outbound HTTP from Functions does not run on Spark. **Everything before Phase 3 (auth, Firestore, FCM, schema, rules, emulators) runs on Spark at $0**, so the Blaze upgrade is deferred to the start of Phase 3. Note **Blaze = Spark's free tier + pay-as-you-go beyond it; you are billed $0 until you exceed free quota** — the real cost risk is a runaway poller, guarded by the kill-switch below, not by the plan itself.
- **Ship baseline Firestore security rules with the first write (Phase 1), harden before release (Phase 5).** Rules are **path-based, not field-based**: items live at `users/{uid}/items/{itemId}` and carry no `uid` field, so match on the path wildcard — `match /users/{uid}/{document=**} { allow read, write: if request.auth.uid == uid; }`. Use `request.resource.data` (not `resource.data`, which is null on creates) for any create/update predicate. Test the baseline rules with `@firebase/rules-unit-testing` against the emulator so Phase 1 doesn't ship untested rules. Never run user data through default/open rules across multiple phases. The poller Function uses a service account that bypasses client rules.
- **Blaze upgrade + budget alert + hard kill-switch ship together, immediately before the first Function deploy (start of Phase 3) — not in Phase 0.** A buggy adaptive-polling loop bills real money. A GCP budget alert is **notification-only and does not stop spending**, so also wire budget → Pub/Sub → a Cloud Function that disables project billing. Cap items per user and add a poller circuit breaker. **Invariant: never deploy the poller without Blaze + the kill-switch already live.** The item-cap / circuit-breaker constants are written down in Phase 0 (cheap, no billing); the kill-switch Function itself deploys in Phase 3 alongside the poller. (This keeps Functions in Phase 3 as originally scoped — the earlier plan to deploy the kill-switch early in Phase 0 is reverted now that we start on Spark.) **Recovery:** the kill-switch disables project billing, which reverts the project to Spark and kills all Functions instantly (intended). To recover, re-attach a billing account in the GCP console, redeploy Functions, and resolve the budget condition that tripped it — write this down so a 3am page doesn't cause panic.

## Features

- Auto-capture of saved auctions via per-site content-script adapters (**one-way: captures saves, does not detect un-saves** — users remove items from the dashboard)
- Manual add by pasting an **eBay** listing URL (creates a `pending` item; data hydrated by the Phase 3 poller via the **Browse API**, **not** an extension-side fetch — keeps `host_permissions` narrow and the app token server-side). **Scoped to eBay** because the API path is robust: no scraping, so no datacenter-IP-ban risk. Scrape-only sites (GovDeals, 3/4) are **deferred** from manual add — a pasted URL there could only be hydrated by a cold server-side scrape (fragile, block-prone; from prior experience their scrape support is shoddy at best), so they join only if/when that proves reliable.
- Unified real-time dashboard with filter, sort, search, and watchlist grouping
- Background price/bid/end-time polling independent of browser state
- Push notifications: outbid (**best-effort** — see constraints), ending soon, price threshold
- Snipe reminders (user-configurable minutes before close)
- Per-item price history chart
- Cross-device sync via Firestore

## Design language

**Editorial brutalism with a single hot-pink pop.** Hard black rules, sharp corners, monospace data, and Bodoni display type — a fashion-magazine layout rendered as a wireframe. Themed (loosely) on Diavolo from JoJo's Bizarre Adventure: Italian high-fashion, restrained, one vivid pop. The structure is loud (the frames do the work); the color is disciplined. **When in doubt, keep it structural — add a rule, not a fill.** All UI is Tailwind, built directly in the extension.

- **Color — neutral base, one pink pop per view.** Warm-grey surfaces `bg-neutral-50` (default page), `bg-white` where a cell needs to lift. Text hierarchy carries most of the work: `text-neutral-900` (primary/structural) → `text-neutral-500` (muted/labels) → `text-neutral-400` (quiet meta). The hot-pink token **`brand` (`#ec4899`)** appears **once per view**, as a **solid fill that inverts** — `bg-brand` + white text on the primary action or the ending-soon badge, inverting to `bg-neutral-900` on hover; or a tiny `h-2 w-2 bg-brand` status dot. The moment pink is on two things it stops being the pop. **Pink is a fill, never body text.** If a soft surface is ever needed, add a separate token rather than overloading `brand`.
- **Type — three roles, no more.** `font-display` (**Bodoni Moda**) → titles, wordmarks, item names ONLY. `font-mono` (default monospace stack — not a token) → all data columns, labels, badges, and metadata, always **uppercase + `tracking-wider`/`tracking-wide`** at tiny sizes (`text-[9px]`/`text-[10px]`/`text-xs`). Everything else is Inter (the `sans` token is overridden so Inter is the app-wide default — no class on `body`). Both display+body self-hosted via Fontsource (`@fontsource-variable/{inter,bodoni-moda}`, bundled — no CDN, CWS-safe). `font-bold` is allowed **only** on the pink invert badge; elsewhere let Bodoni and the mono caps carry the weight.
- **Borders & corners — hard rules, sharp everywhere.** Borders are the primary structural device, always `border-neutral-900` (near-black), never grey: `border-b-2` for major section bands / container edges, `border`/`border-b` (1px) for cards and inner strips. **Corners are sharp — no `rounded-*` anywhere.** No shadows, no gradients. A diagonal-stripe fill (`repeating-linear-gradient`) stands in for missing images rather than a soft placeholder.
- **Layout — banded, full-bleed, gridded.** Compose surfaces as **stacked full-width bands** separated by `border-b-2 border-neutral-900` (header → add-form → toolbar → list), each with generous padding (`px-10 py-8` on the dashboard, tighter on the popup). Cards sit in a `grid grid-cols-2 gap-4`. Numbered "lot" swatches (mono `01`, `02`, … zero-padded) reinforce the auction-catalog feel. Left-align text — editorial, never centered (`<button>` defaults to centered; add `text-left`).
- **Components — one loud thing, everything else quiet.** One primary action per view (the pink invert block); secondary actions are ghost/text buttons (mono uppercase, `text-neutral-400 hover:text-neutral-900`, no background). Status/metadata read as mono caps separated by `·`.

## Site adapters

Each adapter is a self-contained module that exports:
- `TRIGGER` — how to detect a save (button click, URL pattern, localStorage write)
- `SELECTORS` — DOM selectors for price, end time, bid count, title (imported from shared config)
- `normalize(doc) → ItemData` — extracts structured data from the page

**Two input flavors per site, not one.** The content script reads the **live DOM** (after JS runs); the server-side poller reads either the **eBay Browse API JSON** (eBay) or **raw fetched HTML via cheerio** (scrape-only sites) — frequently *not* the same document. So `SELECTORS` are a true shared source of truth only for scrape-only sites; for eBay the poller-side `normalize` maps an API response while `SELECTORS` stay content-script-only (capture + logged-in `bidStatus`). Don't assume "update selectors once" holds for eBay.

| Site | Status |
|---|---|
| eBay | in progress — Phase 2 (content-script capture flavor); Browse-API poller flavor lands in Phase 3 |
| GovDeals | not started |
| Site 3 | TBD |
| Site 4 | TBD |

## Current phase

| Phase | Scope | Status |
|---|---|---|
| 0 | WXT scaffold, Firebase project (Spark; **Blaze deferred to Phase 3**), OAuth client, Firestore schema, CI, **Firebase Emulator Suite, adapter-fixture test harness, cost-safety constants written down** — see [Phase 0 — plan of operations](#phase-0--plan-of-operations) | ✅ complete |
| 1 | OAuth flow, dashboard/popup UI shell (built in the extension), Firestore listener, item cards, **baseline security rules** | code complete · load-unpacked check pending |
| 2 | Content scripts + **eBay adapter only (auction / BIN / ended)**, service worker write path — see [Phase 2 — plan of operations](#phase-2--plan-of-operations) | in progress |
| 3 | Cloud Functions + Scheduler, fetch/diff, adaptive polling (**eBay via Browse API**; cheerio reserved for scrape-only sites) — poller uses a `collectionGroup('items')` query on `status`+`nextPollAt` (needs a composite collection-group index), paginates, and rate-limits per domain; **prove the full eBay vertical slice end-to-end before adding any second adapter**; Browse API specifics in `docs/ebay-browse-api.md` | not started |
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
- [x] **4. Write down cost-safety constants now; defer Blaze + the kill-switch deploy to the start of Phase 3.** Constants committed in **`functions/src/limits.ts`**: `MAX_ITEMS_PER_USER` (200 — ⚠️ **relocated to `packages/firebase/src/limits.ts` in Phase 1 step 7** since the client reads it too; a shared contract belongs in the package both tiers depend on, and functions/ keeps only server-only knobs), adaptive-poll floor/ceiling (`MIN`/`MAX_POLL_INTERVAL_SECONDS` = 60s / 1h) + reference `ADAPTIVE_POLL_SCHEDULE`, the `CIRCUIT_BREAKER` object (max items/run, error-rate + consecutive-failure trips, cooldown, per-item daily poll ceiling), and `MONTHLY_BUDGET_USD` (10). ⚠️ The actual safety net — **Blaze upgrade**, a **$10/mo budget with 50/90/100% email alerts**, and **budget → Pub/Sub → kill-switch Function that disables project billing** — lands immediately before the poller in Phase 3, because deploying any Function requires Blaze. Alerts don't stop spending; the kill-switch does. **Invariant: never deploy the poller without Blaze + the kill-switch already live.** *Done-when (Phase 0 portion) ✅: item-cap / circuit-breaker constants written down and committed.* (Blaze upgrade + budget + kill-switch deploy + forced-alert test all happen in Phase 3 — see the constraint above.)
- [x] **5. Wire Firebase into the repo.** `packages/firebase/` exports lazy singletons — `getFirebaseApp` / `getFirebaseAuth` / `getDb` / `getFirebaseMessaging` (`client.ts`) + `getFirebaseConfig` / `useEmulators` (`config.ts`); emulator-aware behind `WXT_PUBLIC_USE_EMULATORS` (auth 9099 / firestore 8080, defaults match step 8). Web App registered (`1:457724432660:web:1a1d1253259f220286b201`); config read via `import.meta.env` (cast through `unknown` so it typechecks both in the package's own `tsc` and inside the extension's WXT-typed build — WXT's generated `ImportMetaEnv` doesn't include custom keys). Vars in `apps/extension/.env.local` (gitignored), placeholders in committed `apps/extension/.env.example`. `entrypoints/background.ts` calls `getFirebaseApp()` and logs the env-derived `projectId`. ⚠️ `pnpm` v11 hard-errors on unbuilt deps — `@firebase/util`/`protobufjs` set to `false` in `pnpm-workspace.yaml allowBuilds` (web SDK doesn't need them in a bundler). *Done-when ✅: extension build inlines `projectId` from env (no hardcoded config); typecheck/lint/format/build all clean.*
- [x] **6. Define the Firestore schema.** `firestore.rules` at repo root with a strict **deny-all baseline** (`allow read, write: if false`; per-user rules land in Phase 1, hardening in Phase 5). TS types in **`packages/firebase/src/types.ts`** (src layout), future-proofed against the full feature set: `Item`/`ItemHistory`/`ItemData`/`User`/`FcmToken` + `Site`/`ListingType`/`ItemStatus`/`BidStatus` unions, `NotificationPrefs`/`NotificationState`, plus `WithId<T>` and `FsTimestamp` helpers — all re-exported from `src/index.ts`. Key decisions: **money as integer minor units (cents)** + `currency`; **`FsTimestamp`** structural type so the model isn't coupled to client vs Admin SDK; poll-derived fields **nullable** (covers manual-add `pending` items + BIN/GTC listings); `listingType` discriminator for auction/BIN/both; notification fields cover outbid/ending-soon/**price-threshold** with dedup state; `bidStatus` (only set from a logged-in page); `group` for watchlists; `addedVia`/`createdAt`/error fields; richer `User` (`itemCount` for cap checks, `defaultNotify`, `{token,platform,updatedAt}[]` FCM tokens). SDK-free `ItemData` is the adapter contract. CLAUDE.md schema block updated to match. ⚠️ Deny-all blocks client writes, so Phase 0 dev/test writes go through the Admin SDK or seeded emulator data. *Done-when ✅: types compile + are exported; rules file present; typecheck/lint/format clean.*
- [x] **7. Configure the OAuth client (blocks all of Phase 1).** Reused the Firebase **auto-created "Web application" OAuth client** (`457724432660-…apps.googleusercontent.com`, created when the Google Auth provider was enabled in step 3) — added the redirect URI **`https://bjicpagnabmhmkodglkgjcpdklngdmgo.chromiumapp.org/`** to it (no separate client needed; Firebase accepts a Google `id_token` whose `aud` is any OAuth client in the project). Client ID lives in `apps/extension/.env.local` as `WXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` (placeholder in `.env.example`); `identity` permission added to the manifest. Flow: popup → message → **background service worker** runs `launchWebAuthFlow` (implicit `response_type=id_token` + nonce) → `GoogleAuthProvider.credential(idToken)` → `signInWithCredential`. ⚠️ **Auth MUST run in the background, not the popup** — `launchWebAuthFlow` opens a focused window that tears the popup down mid-flow, aborting the credential exchange. ⚠️ Auth persists via `initializeAuth(app, { persistence: indexedDBLocalPersistence })` so the popup and worker (separate JS contexts, shared extension-origin IndexedDB) see the same session and it survives worker restarts. ⚠️ **Smoke-test in a real Chrome via "Load unpacked" — NOT the `pnpm dev` browser**: WXT launches Chrome with automation flags and Google blocks OAuth there ("This browser or app may not be secure"). Helpers in `packages/firebase/src/auth.ts` (`signInWithGoogleIdToken`/`signOutUser`/`observeAuthState`, `AuthUser` type) keep `firebase/*` out of the extension; a temporary sign-in button in the popup is the test surface (becomes the Phase 1 OAuth UI). *Done-when ✅: manual click completed sign-in end-to-end → Firebase user (uid `eiceSTeiXxem7epuwkDcaKn6Yvm2`).*
- [x] **8. Stand up the Firebase Emulator Suite.** `firebase.json` with **Auth (9099) + Firestore (8080) + Emulator UI (4000)**, `singleProjectMode: true`, Firestore using the repo `firestore.rules`. Root scripts `emulators:start` / `emulators:exec` (`firebase emulators:start|exec`); **`firebase-tools` added as a root devDependency** so it's reproducible for CI (step 9), not a global. ⚠️ pnpm v11 hard-errored on firebase-tools' optional native `re2` — set `re2: false` in `pnpm-workspace.yaml allowBuilds` (falls back to JS; emulators don't need it). Ports match `packages/firebase/src/client.ts` so `WXT_PUBLIC_USE_EMULATORS=true` makes the extension connect locally. ⚠️ **Functions emulator deferred to Phase 3** — `functions/src` is an empty `export {}` stub with no `firebase-functions` dep, so wiring it now adds fragility for no Phase-0 value (consistent with the rest of the Functions/Blaze deferral). Verified: `emulators:exec` boots auth+firestore cleanly (JARs cached after first run), and a REST write+read against the Firestore emulator (admin `owner` token, which bypasses the deny-all rules) round-trips. *Done-when ✅: `pnpm emulators:start` runs; local Firestore read/write confirmed. (Authenticated **client** read/write from the extension stays blocked by deny-all rules until the Phase 1 per-user rules — to eyeball the connection now, set `WXT_PUBLIC_USE_EMULATORS=true`, rebuild, load unpacked, and the background SW logs `useEmulators: true`.)*
- [x] **9. Set up CI (GitHub Actions).** `.github/workflows/ci.yml` runs on every `push` + `pull_request` (with `concurrency` cancelling superseded runs): checkout → `pnpm/action-setup` (version from the `packageManager` field) → `setup-node@v4` (Node 22, pnpm cache) → ⚠️ **`setup-java@v4` (temurin 21) so the Emulator Suite has a JRE** → cache `~/.cache/firebase/emulators` (keyed on lockfile hash) → `pnpm install --frozen-lockfile` → `typecheck` → `lint` → `format:check` → `pnpm emulators:exec --only auth,firestore "pnpm test"`. The test step boots the emulators to validate the harness even though no package defines tests yet (those land in step 10 / Phase 1, so `turbo test` is currently a clean no-op). All steps verified locally (frozen install, typecheck, lint, format, and the emulator-exec test step all pass). *Done-when: a pushed PR shows green type-check, lint, and emulator tests — confirmed on first push (CI needs the step 8 + step 9 commits: `firebase.json`, `firebase-tools` dep, lockfile, workflow).*
- [x] **10. Bootstrap the adapter-fixture harness.** `packages/adapters/` now has `src/selectors.ts` (`SiteSelectors` + `SELECTORS` stub — shared content-script/poller source of truth, eBay excepted per CLAUDE.md), `src/normalize.ts` (placeholder `normalize(_input): ItemData` that throws — the adapter contract; real per-site parsing is Phase 2/5), a `fixtures/` folder with a placeholder `ebay-auction.sample.html`, and **Vitest** (`pnpm test` = `vitest run`; wired into `turbo test`). The harness test `test/normalize.test.ts` reads the fixture → calls `normalize` → asserts a full expected `ItemData`. ⚠️ Implemented as an **expected-failure** so CI stays green and mergeable: it uses **`it.fails`** (Vitest's marker — *not* Jest's `it.failing`, which threw `is not a function`). It passes today because the stub throws, and flips RED the moment `normalize()` is implemented — a built-in reminder to remove the marker and write real expectations. Also added `@dvl/firebase` as an adapters dep (for the `ItemData`/`Site` types) and configured `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: '^_'` repo-wide so `_`-prefixed contract params (e.g. `_input`) are allowed. Verified: lint/format/typecheck clean, and `pnpm emulators:exec --only auth,firestore "pnpm test"` runs the test green inside the booted emulators. *Done-when ✅: the harness test runs in CI (real test, not a no-op) and is green-as-expected-failure for the right reason — harness works end-to-end, parsing logic stubbed.*

## Phase 1 — plan of operations

**Workflow this phase (changed from Phase 0):** the human writes the important code. For each step: (1) Claude scaffolds the files as **stubs — signatures, types, and `// TODO:` comments spelling out what to implement** (no real logic); (2) the human codes it; (3) Claude verifies against the **done-when** gate (typecheck/lint/format/tests + the behavioral check). Resume from the first unchecked box. Branch `phase-1-…`; commit per step. ⚠️ Corrections/notes flagged ⚠️.

**Dev setup for this phase:** run with the emulators (`WXT_PUBLIC_USE_EMULATORS=true` in `.env.local`, `pnpm emulators:start`) so all **client writes land locally, not in prod**. The real Google consent still appears (step 7 flow runs against live Google), but the resulting session lands in the **Auth emulator** (it accepts the Google `id_token` without signature checks), and its uid drives the Firestore-emulator rules — so the full signed-in → write → listener loop works locally. ⚠️ **Rules-first ordering:** baseline rules (step 3) land *before* the first real client write (step 4 user-doc bootstrap), because the deny-all baseline would reject that write otherwise.

- [x] **0. Repo hygiene (ongoing).** Branch `phase-1-…` off `main` (after Phase 0 merges); commit per step; keep `pnpm typecheck/lint/format:check/test` green before each commit. *Done-when: work is on a `phase-1` branch, each step committed.* ✅ On branch **`phase-1-ui-shell`**, committing per step.
- [x] **1. UI foundation (Tailwind + surfaces).** Install/configure **Tailwind CSS** (+ PostCSS) and **Lucide** icons in `apps/extension`; strip the WXT demo chrome; establish the two UI surfaces — a compact **popup** and a full-page **dashboard** entrypoint (`apps/extension/entrypoints/dashboard/`) opened from the popup. (Sidepanel deferred — full page is simpler for the rich view.) *Stubs Claude generates:* `tailwind.config`, PostCSS wiring, base CSS, `<Popup>` + `<Dashboard>` shells with `// TODO:` layout. *Done-when: both surfaces build and render styled placeholders; Tailwind utility classes apply in the production build; lint/format/typecheck clean.* ✅ (commit `d571534`).
- [x] **2. App state store (Zustand).** Install **Zustand**; scaffold `apps/extension/store/` typed against `AuthUser`, `WithId<Item>[]`, and a UI slice (`status: 'loading'|'ready'|'error'`, `error`, and placeholders for filter/sort/search). Actions/selectors stubbed. *Stubs:* `store/useAppStore.ts` with typed state + `// TODO:` action bodies. *Done-when: store is typed and imported by popup/dashboard; typecheck clean.* ✅ `store/useAppStore.ts` typed (auth/items/ui slices) + actions wired (commit `edb491a`).
- [x] **3. Baseline security rules + rules tests.** Replace the deny-all `firestore.rules` with **path-based per-user** rules: `match /users/{uid}/{document=**} { allow read, write: if request.auth.uid == uid; }` (use `request.resource.data`, not `resource.data`, for any create/update predicate). Add **`@firebase/rules-unit-testing`** tests on the Firestore emulator (own-doc R/W allowed; other-uid denied; unauthenticated denied), wired into Vitest + CI. *Stubs:* updated `firestore.rules` with `// TODO:` predicates, `tests/firestore.rules.test.ts` with `// TODO:` cases + emulator harness. *Done-when: rules tests green in CI; own-user R/W allowed, cross-user + unauth denied.* ✅ (commit `0d83e7a`).
- [x] **4. Auth flow + user-doc bootstrap.** Turn the Phase-0 smoke button into a real **signed-out (sign-in screen) ↔ signed-in (dashboard)** flow driven by `observeAuthState` → store. On first sign-in, **transactionally create `users/{uid}`** (`createdAt`, `email`, `displayName`, `itemCount: 0`, `defaultNotify`, `fcmTokens: {}`) — idempotent on repeat sign-in. Wire sign-out. This is the **first client Firestore write** (permitted by step 3's rules). *Stubs:* `ensureUserDoc(user)` with `// TODO:` transaction, an auth-gating route/wrapper component, sign-in/out UI shells. *Done-when: sign-in creates the user doc (visible in the emulator/console), idempotent on repeat; sign-out returns to the sign-in screen; auth persists across reopen.* ✅ `lib/user.ts` (`ensureUserDoc`, transactional + idempotent), `lib/useAuthSync.ts` (auth→store bridge), `components/AuthGate.tsx` + `SignInScreen.tsx` (commit `d197f72`).
- [x] **5. Firestore real-time listener.** `onSnapshot` on `users/{uid}/items` → store; **subscribe on sign-in, unsubscribe on sign-out**; docs map to `WithId<Item>` keeping the `FsTimestamp` (converted to epoch-ms only at the step-6 UI edge). *Done-when ✅:* `lib/items.ts` `subscribeToItems(uid, onItems, onError?): Unsubscribe` + `lib/useItemsSync.ts` (subscribe-on-user / unsub-on-signout, mirrors `useAuthSync`, swallows `permission-denied`), mounted in the dashboard.
- [x] **6. Item card + dashboard list.** `<ItemCard>` (title, image, price from minor-units + ISO `currency`, bid count, end time, `status`/`bidStatus` as mono caps) and `<ItemList>` rendering store items with **loading** + **empty** states, in the brutalist design language (see Design language). *Done-when ✅:* `components/ItemCard.tsx`, `components/ItemList.tsx`, `lib/formatMoney.ts` (`Intl.NumberFormat`), `lib/formatTime.ts` (`formatEndTime` + `isEndingSoon`). Behavioral load-unpacked check still pending.
- [x] **7. Manual add — eBay only (paste eBay URL → `pending` item).** A form that validates a listing URL, **detects `site` from the host** (small `siteFromUrl` util in `packages/adapters`), and **rejects non-eBay hosts** (the gate lives in `createPendingItem`, not the detector, so a scrape site can be promoted later by flipping one check). On a valid eBay URL, **transactionally** write a `pending` `Item` to `users/{uid}/items` while bumping `itemCount` — enforcing the **advisory** `MAX_ITEMS_PER_USER` cap imported from `@dvl/firebase` (⚠️ client-side/advisory only; real enforcement is the Phase 3 trigger). Data hydration is deferred to the Phase 3 poller **via the Browse API** (item stays `pending`); no extension-side fetch, so `host_permissions` stay narrow and the app token stays server-side. Completes the write→listener→card loop with no content scripts. **Why eBay-only:** the API path has no scraping and thus no IP-ban risk; scrape-only sites (GovDeals, 3/4) are deferred until their poller support is proven reliable. *Done-when ✅:* `components/AddItemForm.tsx`, `adapters/siteFromUrl.ts`, `lib/items.ts` `createPendingItem(uid, url)` (transaction + eBay gate + advisory cap) (commit `aa9ef7e`).
- [x] **8. Remove item.** Capture is one-way (no un-save detection), so the dashboard owns removal: **transactionally** delete the item doc and decrement `itemCount`. (Recursive history-subcollection delete is noted for later — no `history` docs exist until Phase 3.) *Done-when ✅:* `lib/items.ts` `removeItem(uid, itemId)` (`tx.delete` + `itemCount: Math.max(0, count-1)`) wired through `ItemList` → `ItemCard`'s Remove control. Behavioral load-unpacked check still pending.
- [x] **9. Dashboard shell polish — filter / sort / search / grouping.** Client-side over the store: title **search**, **sort** (end time / price / date added), **status filter**, and watchlist **`group`** surfacing. Keep it minimal — this is shell polish, not the engine. *Done-when ✅:* `store/useAppStore.ts` `selectVisibleItems` (filter search→status→group, then sort — nulls last, `createdAt` newest-first), `components/DashboardToolbar.tsx` (search + sort/status/group `<select>`s; group picker hidden until `group` is populated), `ItemList` reads the selector + a distinct "no matches" empty state. Behavioral load-unpacked check still pending.

## Phase 2 — plan of operations

**Workflow (changed 2026-07-17 — review-a-draft, not stubs-only):** the goal is to move faster while the human still understands every line. Per step: (1) **Claude states the approach + why** in one or two sentences before writing (the plan, the tradeoff, any SDK quirk) so it can be steered before code exists; (2) **Claude writes a working first draft** — real logic, but in **small reviewable chunks**, one file/function at a time, never a big dump; (3) **Claude explains the non-obvious parts in the chat** (not code comments — the codebase keeps those lean): the decisions, the "this is a transaction because…", the race the early-return handles — i.e. the parts the human would otherwise have to discover; (4) **the human reviews to understand + steer** (reads with the reasoning attached, asks "why this not X," changes what they disagree with); (5) Claude verifies against the **done-when** gate (typecheck/lint/format/tests + the behavioral check). This replaces the old Phase-1 "Claude scaffolds bare stubs, human writes all logic from scratch" loop — reviewing a real draft with the why attached is faster than writing from blank and keeps the understanding.

**Guardrails (so "faster" never quietly becomes "stopped understanding"):**
- Hand work over in **reviewable chunks**; if a step is large, split it.
- **Flag every real decision** explicitly (data shape, where a check lives, an SDK quirk) rather than silently picking — those are exactly where understanding slips.
- On the **load-bearing, decision-heavy code** — the eBay adapter's `normalizeEbayDom`, the write-path dedupe transaction (`upsertCapturedItem`) — **slow back down**: the human may say "I want to write this one," and Claude drops to stub-or-collaborate mode for it.
- If any chunk goes by that the human doesn't fully get, they say so and Claude **stops and unpacks it before moving on**.

**Session continuity (pick up anywhere, any session):** state lives in this file, not in chat memory. The **checkbox list below is the source of truth** — resume from the **first unchecked box**; its **done-when** gate is how you know it's actually finished. Each step is its own commit on **`phase-2-capture`** (off `main` at the Phase 1 merge), so `git log --oneline` shows exactly how far the work got. When a step completes, **check its box and append a `✅ <what landed / file paths>` note** (as earlier steps do) before committing — that note is what a fresh session reads to regain context. Branch **`phase-2-capture`**; commit per step. All step stubs below are already scaffolded and green (typecheck/lint/format/tests/build) — the draft work now fills them in.

**Dev setup this phase:** emulators as in Phase 1 (`WXT_PUBLIC_USE_EMULATORS=true`, `pnpm emulators:start`). Content-script/capture testing needs a **real eBay page and a signed-in worker**, so behavioral checks run via **Load unpacked in real Chrome** (the `pnpm dev` browser blocks Google OAuth — see gotchas). ⚠️ Phase 1's pending load-unpacked behavioral check folds into step 6's E2E.

**Scope decisions (locked 2026-07-16):**
- **Trigger = watch-button click + passive refresh.** A watch click (`capture:save`) may create; every visit to a listing page (`capture:visit`) may only *update* an already-tracked item. The content script always parses and sends; the **worker owns all policy** (signed-in, tracked-or-not, cap, dedupe, diff) — same philosophy as the eBay gate living in `createPendingItem`.
- **Dedupe = upsert on deterministic doc ids.** Item doc ids become `itemDocId(site, listingId)` (e.g. `ebay-123456789012`) derived via `ebayListingIdFromUrl` — URLs for one listing vary (slugs, tracking params, legacy `?item=`), so identity keys on the listing id and a transaction `get()` on the derived ref IS the dedupe check (client-SDK transactions can't run queries). Manual add refactors onto the same identity, so capture hydrates a `pending` manual-add for free and duplicates become impossible.
- **`bidStatus` parsed best-effort at capture** ('winning'/'outbid' banners on logged-in pages; `null` otherwise — and a `null` never clobbers a stored value).
- **Captured items land `'active'` with full data** (`'ended'` if the page shows closure) — unlike manual add's sparse `pending`. ⚠️ `ItemData` grew **`ended: boolean`** so adapters can convey closure; the write path maps it to `status`.
- ⚠️ The Phase-0 placeholder `normalize()` + its `it.fails` harness test + sample fixture are **retired**, replaced by the real eBay adapter module (`src/ebay/`) and `it.todo` test scaffolds (**happy-dom** added for DOM-flavor tests; flip todos into real tests as steps land).

- [ ] **0. Repo hygiene (ongoing).** Work on `phase-2-capture`, commit per step, keep `pnpm typecheck/lint/format:check/test` green. *Done-when: each step is its own commit on the branch.*
- [ ] **1. Listing identity + dedupe foundation.** Implement `ebayListingIdFromUrl` / `canonicalEbayUrl` (`packages/adapters/src/ebay/identity.ts`) and `itemDocId` (`packages/adapters/src/itemDocId.ts`); flip `test/ebay-identity.test.ts` todos into real cases (id from `/itm/<id>`, slugged, `?item=` forms; null for search/watchlist/garbage). Refactor `createPendingItem` per its TODO: deterministic doc id, store the canonical URL, reject non-listing eBay URLs, throw 'already tracking' on a duplicate (no write, no count bump). *Done-when: identity tests green; in the emulator, pasting the same listing twice under different URL shapes yields ONE doc, ONE count bump, and a clear duplicate error.*
- [x] **2. Fixture corpus + selectors.** Capture the 6-fixture live-DOM matrix per `packages/adapters/fixtures/README.md` (auction / BIN-GTC / auction+BIN / ended / winning / outbid; ⚠️ redact your username from logged-in snapshots). Fill `EBAY_SELECTORS` (`src/ebay/selectors.ts`) and `EBAY_TRIGGER.watchButton` (`src/ebay/trigger.ts`) against those fixtures, not the live page. *Done-when: fixtures committed; every selector resolves (`querySelector` non-null) on each fixture where its element should exist.* ✅ **4 of 6 fixtures** captured (auction / auction-bin / bin / ended) — **winning/outbid deferred** (need a logged-in page where you're actively the high/losing bidder; bidStatus is best-effort anyway). ⚠️ Capture how-to changed: pages are ~4 MB and personalized — capture **logged-out** (incognito → `copy(document.documentElement.outerHTML)`) so there's no name/userId/address, then trim on disk with `scripts/trim-fixture.mjs` (4 MB → ~0.6 MB; keeps listing DOM + 2 ld+json + the embedded `TimerModel` state script). `EBAY_SELECTORS` filled from the corpus (`x-*`/`ux-*` classes, watch = `[data-testid="x-watch-heart"]`); `bidStatusWinning/Outbid` left empty until those fixtures exist. Resolution matrix locked by `test/ebay-selectors.test.ts` (32 cases). Step-3 parsing findings recorded in `src/ebay/normalize.ts` (absolute end time lives in the TimerModel JSON, not the DOM; `ended` via ld+json `OutOfStock`; two `.x-price-primary` on auction+BIN).
- [ ] **3. `normalizeEbayDom` + fixture tests.** Implement `src/ebay/normalize.ts` per its TODO checklist — money → integer minor units; **prefer the absolute end time from embedded JSON over rendered "2d 3h" text** (gotcha); `ended`; best-effort `bidStatus`; canonical `url`; throw on missing-required so drift can't write garbage. Unskip/complete `test/ebay-normalize.test.ts` (happy-dom): one real full-`ItemData` assertion per fixture, no `it.todo`/`it.skip` left. *Done-when: all fixture tests green in CI; typecheck/lint/format clean.*
- [ ] **4. Content script + messaging contract.** Implement `sendCapture` (`apps/extension/lib/capture-messages.ts`) and `entrypoints/ebay.content.ts` `main()` per its checklist: readiness via MutationObserver/poll (target elements are JS-rendered), `capture:visit` once ready, delegated-click TRIGGER → `capture:save`, debounce, parse failures log-and-skip. *Done-when: load-unpacked on a real listing logs the parsed `ItemData` and the worker's response for both visit and watch-click (worker still answers 'not implemented' — the round-trip is what's under test).*
- [ ] **5. Service-worker write path.** Implement `upsertCapturedItem` (`apps/extension/lib/items.ts`) per its checklist (diff-aware transactional upsert on the deterministic ref; 'created'/'updated'/'unchanged'/'ignored') and the background `capture:*` branch (⚠️ `await authStateReady()` first — the worker may have just woken for this message). *Done-when (emulator): save on untracked → 'created' + count bump; save/visit on tracked → 'updated' only when data changed, else 'unchanged' with NO write; visit on untracked → 'ignored'; over-cap save rejected; signed-out → error; rules tests still green.*
- [ ] **6. E2E behavioral check (absorbs Phase 1's pending load-unpacked check).** Real Chrome, Load unpacked, emulators, signed in: watch a live auction → card appears `'active'` with full data; revisit after a price/bid change → card refreshes via a single diff write; a manual-add `pending` item hydrates on visiting its page; an ended listing shows ENDED; re-watching a tracked item neither duplicates nor bumps the count. Also run the deferred Phase 1 checks (sign-in/out persistence, add/remove, filter/sort/search). *Done-when: full capture → write → listener → card loop verified; Site-adapters + Current-phase tables updated.*

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
- **Monorepo path-drift trap: never write workspace-relative paths after a `cd`.** A persistent shell whose working directory has drifted into a subdir (e.g. `cd apps/extension && …`) will resolve a later relative path like `apps/extension/entrypoints/foo.tsx` *against that subdir*, silently creating a nested duplicate (`apps/extension/apps/extension/entrypoints/…`) that the build never sees — so "my edits aren't showing up." Two rules: (1) **always use absolute paths** for file writes/edits in this monorepo, or `cd` back to the repo root in the same command (`cd /…/dvl-v2 && …`); (2) when adding deps, target the package (`pnpm --filter @dvl/extension add …` from root, or `cd apps/extension` first) — a bare `pnpm add` at root errors `ERR_PNPM_ADDING_TO_ROOT` on purpose. To detect a drift after the fact: `find . -type d \( -path '*/apps/*/apps' -o -path '*/packages/*/packages' \)` should return nothing.