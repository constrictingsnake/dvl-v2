// eBay capture content script (Phase 2). Runs on listing pages only; parses
// the live DOM via the adapter and ships ItemData to the background worker,
// which owns every write decision. Declaring `matches` here is what grants
// access (MV3 content_scripts) — no host_permissions widening.
export default defineContentScript({
  // .com only for Phase 2; international hosts (*.ebay.co.uk, …) deferred.
  // NOTE: the legacy `/itm?item=<id>` form has no path segment after /itm — if
  // it still exists in the wild, add '*://*.ebay.com/itm*'.
  matches: ['*://*.ebay.com/itm/*'],
  main() {
    // TODO (human) checklist — Phase 2 step 4
    // (imports: normalizeEbayDom + EBAY_SELECTORS + EBAY_TRIGGER from
    //  '@dvl/adapters'; sendCapture from '@/lib/capture-messages'):
    //
    // 1. READINESS — target elements may not exist at injection time (the page
    //    is JS-rendered): MutationObserver (or a short poll loop) waiting for
    //    EBAY_SELECTORS.title to appear, with a timeout that gives up quietly.
    //
    // 2. PASSIVE REFRESH — once ready: normalizeEbayDom(document,
    //    location.href) → sendCapture({ type: 'capture:visit', data }). The
    //    worker updates only if this listing is already tracked. A parse
    //    failure logs and returns — it must never write garbage or throw up
    //    the stack.
    //
    // 3. TRIGGER (save) — DELEGATED click listener on document (the watch
    //    button re-renders; never bind to the node): if
    //    event.target.closest(EBAY_TRIGGER.watchButton) matches, re-parse and
    //    sendCapture({ type: 'capture:save', data }).
    //
    // 4. EDGES — debounce double-fires from one click; capture is one-way
    //    (ignore un-watch if the button state is distinguishable); log the
    //    worker's CaptureResponse for debugging.
  },
});
