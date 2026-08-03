# dvl-v2

A browser extension for keeping track of auctions you're watching across multiple sites, all in one dashboard.

The problem: if you're bidding on things across eBay, GovDeals, and wherever else, there's no single place to see what you've saved, what the current price is, or what's about to close. You end up with a dozen tabs and you still miss the end of an auction. This fixes that.

## What it does

- Auto-captures auctions you save on a supported site (via per-site content scripts) and drops them into a unified dashboard.
- Polls saved listings in the background for price, bid count, and end-time changes — independent of whether the browser is open.
- Pushes notifications for the things that matter: outbid (best-effort), ending soon, and price thresholds.
- Snipe reminders a configurable number of minutes before a listing closes.
- Per-item price history and cross-device sync.

You can also add an eBay listing manually by pasting its URL.

## How it's built

- **Extension** — WXT (TypeScript + Vite + React), Tailwind for the UI, Zustand for state.
- **Backend** — Firebase: Firestore as the source of truth, Auth (Google OAuth) for the tracker account, Cloud Functions + Scheduler for polling, FCM for push.
- **Listing data** — eBay's official Browse API (no scraping). Scrape-only sites like GovDeals go through cheerio server-side.

The dashboard is a real-time Firestore listener, so any change — a background poll, a new save, another device — repaints the UI immediately.

A few things worth knowing up front:
- We never store auction-site credentials. The extension reads listings through your existing browser session; the poller only ever fetches public URLs that were already captured.
- OAuth is for the tracker account only. Auction sites are never authenticated by the app.
- Outbid detection is best-effort — no public page or API can tell you whether *you're* the high bidder, only a logged-in page can, so we treat it as "possibly outbid since your last visit" rather than gospel.

## Status

Early. eBay capture works end-to-end (save → dashboard → live updates); background polling and notifications are the next milestones. GovDeals and two more sites come after the eBay slice is proven.

See `CLAUDE.md` for the full architecture, schema, and phase plan.

## Layout

```
apps/extension    the WXT extension (content scripts, service worker, popup, dashboard)
packages/adapters shared per-site selectors + normalizers
packages/firebase  Firebase client init + shared types
functions          Cloud Functions (poller, notification triggers)
firestore.rules    security rules
```

## Development

```
pnpm install
pnpm dev              # build + launch a hot-reloading dev extension
pnpm emulators:start  # local Firebase (Auth + Firestore)
pnpm test
```

Note: Google OAuth is blocked in the automation-flagged dev browser — smoke-test sign-in with "Load unpacked" in a normal Chrome instead.
