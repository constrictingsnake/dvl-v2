// TRIGGER — how the content script detects a save (the adapter contract's
// third export, alongside SELECTORS and normalize). On eBay the save signal is
// a click on the watchlist button ("Add to watchlist" heart / link) on a
// listing page. Capture is one-way: un-watch clicks are ignored (users remove
// items from the dashboard).

export const EBAY_TRIGGER = {
  kind: 'button-click',
  /**
   * Selector for the watch button(s). The content script uses a DELEGATED
   * click listener + closest() against this (the button re-renders; never bind
   * to the node directly).
   * TODO (human): fill from the fixtures — note eBay may render several watch
   * affordances (header heart, sticky bar); cover them comma-separated.
   */
  watchButton: '', // TODO (human)
} as const;
