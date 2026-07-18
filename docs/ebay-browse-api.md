# eBay Browse API — implementation reference

Researched 2026-07-17 against developer.ebay.com (Browse API reference, Buying Integration Guide, OAuth guide, API Call Limits, Application Growth Check, Marketplace Account Deletion guide). This is the source of truth for the Phase 3 poller's eBay side. Facts below were verified against the live docs; the two open items are flagged at the bottom.

## TL;DR

- Browse API is app-token-only (client-credentials OAuth) — no eBay user auth anywhere.
- A free developer account gets both keysets. **Production Browse at the default 5,000 calls/day needs NO eBay Partner Network approval** — the EPN/contract language in the Buy docs applies to the Limited Release APIs (Deal, Feed, Offer, Order), not Browse.
- **Production gate:** the production keyset is inactive until the app completes the Marketplace Account Deletion notification step (subscribe, or file the "Not persisting eBay data" opt-out — we qualify: we store listing data, not eBay user data).
- **Sandbox is an empty world** — real listing IDs don't resolve there. Use it only to smoke-test auth plumbing; test parsing against committed production-JSON fixtures.
- Cache the app token: the token endpoint allows only **1,000 client-credentials mints/day** (token lives 2h, so ~12/day when cached).

## Auth — client credentials grant

```
POST https://api.ebay.com/identity/v1/oauth2/token          (production)
POST https://api.sandbox.ebay.com/identity/v1/oauth2/token  (sandbox)
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(<client_id>:<client_secret>)

grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope
```

Response: `{ "access_token": "...", "expires_in": 7200, "token_type": "Application Access Token" }`.

- All Browse methods run on the basic `https://api.ebay.com/oauth/api_scope` — every keyset has it.
- Token is valid 2 hours. Cache it (module-level in the Function; survives warm invocations) and re-mint on expiry or 401. Never mint per call — the token endpoint's own limit is 1,000 client-credentials requests/day.
- Sandbox and production tokens/keysets are NOT interchangeable in either direction.

## The two calls the poller makes

Request headers on both: `Authorization: Bearer <token>` (required), `X-EBAY-C-MARKETPLACE-ID: EBAY_US` (recommended).

### 1. `getItemByLegacyId` — first fetch / hydration

```
GET https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=<12-digit id>
```

The 12-digit number from `/itm/<id>` URLs (what `ebayListingIdFromUrl` extracts) is a *legacy* listing ID. This bridge method takes it directly and returns the full item **plus the RESTful `itemId`** (format `v1|123456789012|0`). So the first poll of a `pending` item hydrates it and stores the RESTful ID for subsequent polls. For multi-variation listings the plain legacy ID resolves to the listing; that's sufficient for our tracking use case.

### 2. `getItem` with `fieldgroups=COMPACT` — every subsequent poll

```
GET https://api.ebay.com/buy/browse/v1/item/v1|123456789012|0?fieldgroups=COMPACT
```

COMPACT is purpose-built for change detection ("only those fields necessary to determine if any item detail has changed" — price, bid data, end date, availability, `sellerItemRevision`). It cannot be combined with other fieldgroups (error 11018). Cheapest possible diff input.

### Scaling lever: `getItems`

`GET /item?item_ids=<comma-separated RESTful ids>` bulk-fetches multiple items and has its **own separate 5,000 calls/day quota**. If per-item polling ever gets quota-tight, batching moves most load here.

## Sandbox vs production

Two fully separate environments: separate keysets, separate token endpoints, separate base URLs (`api.ebay.com` ↔ `api.sandbox.ebay.com`; every Browse method supports both).

| | Sandbox | Production |
|---|---|---|
| Access | Any dev account, immediately | Any dev account, **after the account-deletion step** |
| Data | Only fake listings you create via `TESTUSER_*` accounts | Real listings |
| Real listing IDs | **Do not resolve at all** | Work |
| Quota | Effectively unconstrained for our use | 5,000 Browse calls/day default |

Key points:

1. **Sandbox is not a smaller eBay — it's empty.** Testing `getItemByLegacyId` there requires registering sandbox test users and having one create an auction listing through the (notoriously flaky) sandbox seller flow. Its only value to us: smoke-testing auth + request plumbing. Parsing/diff logic is tested against committed production-response JSON fixtures (the "poller flavor" fixtures CLAUDE.md already requires).
2. **No EPN application for Browse.** The Buy APIs Requirements page's "production is intended for eBay partners only" language covers the Limited Release Buy APIs (Deal, Feed beta, Offer, Order — checkout/affiliate features). Browse is not Limited Release; the Application Growth Check page confirms the check is required only to *increase* call limits or use *restricted* APIs in production.
3. **Marketplace Account Deletion compliance is the real production gate.** Before the first production call, every app must either (a) run an HTTPS endpoint that answers eBay's SHA-256 challenge (`sha256(challengeCode + verificationToken + endpoint)`) and 200-acks deletion notifications, or (b) toggle the **"Not persisting eBay data" opt-out** with an exemption reason. Until then the production keyset is not activated. We store listing data, not eBay *user* data (no buyer/seller identities), so the opt-out is the sensible route — revisit if we ever store seller usernames.

## Quotas and budget

- Browse API default: **5,000 calls/day** (per app; all methods except `getItems`), no approval needed. `getItems` has a separate 5,000/day.
- Token minting: 1,000 client-credentials requests/day.
- Higher limits: free Application Growth Check (working app, API License Agreement compliance, OWASP/UTF-8/latest-versions hygiene).
- Budget math vs our constants (`functions/src/limits.ts`): an auction in its final hour at 1-min polls costs ~60 calls; a distant item at hourly costs 24/day. `MAX_ITEMS_PER_USER = 200` → the default quota comfortably covers MVP-scale usage; the adaptive scheduler + circuit breaker must treat 5,000/day as the hard ceiling.
- **API License Agreement constraint:** no deriving aggregate eBay statistics (average selling prices, category GMV, activity rates). Per-item price history for a user's own tracked items falls under the "specific to the logged-in user" carve-out — never build cross-user analytics on polled data.

## Response → `ItemData` mapping

From the official getItem sample (fixed-price item) + method docs:

| Browse field | Notes → `ItemData` |
|---|---|
| `price: { value: "29.00", currency: "USD" }` | **Decimal string** — parse to integer cents without float math → `currentPrice`/`buyItNowPrice` + `currency` |
| `currentBidPrice` | Auctions only — same MoneyType shape → `currentPrice` |
| `bidCount`, `uniqueBidderCount`, `minimumPriceToBid`, `reservePriceMet` | Auctions only → `bidCount` etc. |
| `itemEndDate` | Absolute ISO timestamp → `endTime` (the reliable source; never parse rendered "2d 3h" text). Absent for GTC/BIN |
| `buyingOptions: ["AUCTION" \| "FIXED_PRICE" \| "BEST_OFFER"]` | → `listingType` (`AUCTION`+`FIXED_PRICE` → `auction_bin`) |
| `title`, `image.imageUrl`, `itemWebUrl` | → `title`, `imageUrl`, canonical `url` |
| `legacyItemId` | Round-trips to `itemDocId`/`ebayListingIdFromUrl` |
| `itemId` (`v1\|…\|0`) | Store on the item doc after first hydration; used for `getItem`/`getItems` polls |
| `sellerItemRevision` | Cheap "seller revised the listing" change signal |
| `estimatedAvailabilities[].estimatedAvailabilityStatus` | Availability/ended signal |

## Ended listings and error handling

- Ended listings can still be returned for a while — detect via past `itemEndDate` / availability status ("If the item has an EndDate in the past, the listing should not be pulled in" — Buying Integration Guide).
- Error semantics (API_BROWSE domain):
  - **11001** "The specified item ID was not found" → removed or long-ended → mark `ended`/`stale`, stop polling.
  - **11004 / 11008** "item (group) is not available… such as when the listing is being updated by the seller. Wait a few minutes and try again" → transient; skip this cycle, do NOT bump `consecutiveErrorCount`.
  - **11018** invalid fieldgroups (COMPACT combined with another group) — programming error.
  - **11015** too many ids in `getItems` (`{maxAllowedItemIds}`).
- An Application token has zero user context → the API can never report whether *we* are the high bidder. `bidStatus` remains content-script-only (existing constraint stands).

## Phase 3 setup checklist

1. Create an eBay Developers Program account (free); grab sandbox + production keysets.
2. File the Marketplace Account Deletion **opt-out** ("Not persisting eBay data") on the Alerts & Notifications page — this activates the production keyset.
3. Put the production keyset in Cloud Functions secrets (never in the extension; `host_permissions` stay narrow).
4. One manual production `getItemByLegacyId` against a live auction → commit the JSON as the first poller-flavor fixture (also resolves the open items below).
5. Build `functions/src/ebay/client.ts` (token cache + the two wrappers, env-switchable base URL) and `packages/adapters/src/ebay/normalizeApi.ts` (Browse JSON → `ItemData`), fixture-tested.

## Open items (resolve with the first real call)

- Exact COMPACT field list — docs describe it functionally but the rendered page doesn't enumerate it; confirm it includes `bidCount`/`currentBidPrice`/`itemEndDate` for auctions.
- Max ids per `getItems` batch (`{maxAllowedItemIds}` — historically 20).
- How long an ended auction keeps returning data before flipping to 11001.
