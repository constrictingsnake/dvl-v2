# Fixture corpus

Saved inputs the adapter tests parse, so CI catches regressions in *our parsing
logic* when selectors/normalize change. (They can't catch live DOM drift — see
the CLAUDE.md gotcha.) Each site eventually needs **both flavors**: a
content-script **live-DOM** snapshot AND the poller's actual input (Browse API
**JSON** for eBay — lands in Phase 3; raw fetched HTML for scrape-only sites —
Phase 5).

## How to capture a live-DOM fixture

1. Open the listing in an **incognito window** (⚠️ **logged out** — see privacy
   below), let it fully render (the DOM after JS, NOT view-source / curl output).
2. DevTools console: `copy(document.documentElement.outerHTML)`.
3. Paste into the file (raw, ~4 MB — that's fine, next step shrinks it).
4. Trim on disk: `node scripts/trim-fixture.mjs fixtures/<file>.html` — drops
   tracking/rec/style/base64 cruft (~4 MB → ~0.6 MB) but keeps the listing DOM,
   both `ld+json` blocks, and the embedded `TimerModel` state script (where the
   absolute end time lives). Re-run `pnpm test` — the selector matrix must stay
   green.

**Privacy — capture logged OUT.** A signed-in eBay page embeds your name
("Hi <you>"), account `userId`, and address/location JSON — even on a plain
listing. Incognito = no eBay session = none of that. Verify after trimming:
`grep -i` for your name / `"userId":"[^"]` / email should all be empty. (The
only fixtures that genuinely need a logged-in page are winning/outbid; scrub
those by hand.)

## Required eBay live-DOM matrix (Phase 2 step 2)

| File | What it must show | Status |
|---|---|---|
| `ebay-live-auction.html` | Active auction: bids, end time, no BIN | ✅ captured |
| `ebay-live-bin.html` | Pure Buy-It-Now (ideally Good-'Til-Cancelled: no end time) | ✅ captured |
| `ebay-live-auction-bin.html` | Auction with a Buy-It-Now option (both prices) | ✅ captured |
| `ebay-live-ended.html` | Closed listing (ended banner) | ✅ captured |
| `ebay-live-winning.html` | Logged in, "You're the highest bidder" banner | ⏳ deferred (needs a live auction you're winning) |
| `ebay-live-outbid.html` | Logged in, "You've been outbid" banner | ⏳ deferred (needs a live auction you're outbid on) |
