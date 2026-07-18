// TRIGGER — how the content script detects a save (the adapter contract's
// third export, alongside SELECTORS and normalize). On eBay the save signal is
// a click on the watchlist button ("Add to watchlist" heart / link) on a
// listing page. Capture is one-way: un-watch clicks are ignored (users remove
// items from the dashboard).

export const EBAY_TRIGGER = {
  kind: 'button-click',
  /**
   * Selector for the watch button. The content script uses a DELEGATED click
   * listener + closest() against this (the button re-renders; never bind to the
   * node directly). eBay tags the watch heart with a stable data-testid that
   * resolves on every live listing (auction / BIN / auction+BIN) and is absent
   * on ended listings — exactly the pages where a save should / shouldn't fire.
   */
  watchButton: '[data-testid="x-watch-heart"]',
} as const;
