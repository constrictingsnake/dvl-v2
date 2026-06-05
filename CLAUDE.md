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
- **Firebase Blaze (pay-as-you-go) plan is required.** Cloud Functions making outbound HTTP calls do not run on the free Spark plan.
- **Ship baseline Firestore security rules with the first write (Phase 1), harden before release (Phase 5).** Users may only read/write their own documents: `request.auth.uid == resource.data.uid`. Never run user data through default/open rules across multiple phases. The poller Function uses a service account that bypasses client rules.
- **Add a Blaze budget alert in Phase 0.** A buggy adaptive-polling loop bills real money. Cap items per user and consider a poller circuit breaker.

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
| 0 | WXT scaffold, Firebase project (Blaze), OAuth client, Firestore schema, CI, **budget alert, Firebase Emulator Suite, adapter-fixture test harness** | not started |
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