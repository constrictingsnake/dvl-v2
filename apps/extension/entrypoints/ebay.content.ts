// eBay capture content script (Phase 2). Runs on listing pages only; parses
// the live DOM via the adapter and ships ItemData to the background worker,
// which owns every write decision. Declaring `matches` here is what grants
// access (MV3 content_scripts) — no host_permissions widening.
import { normalizeEbayDom, EBAY_SELECTORS, EBAY_TRIGGER } from '@dvl/adapters';
import { sendCapture, type CaptureMessage } from '@/lib/capture-messages';

const READY_TIMEOUT_MS = 15_000;
const SAVE_DEBOUNCE_MS = 1_000;

/**
 * Resolve true once `selector` exists in the DOM, false if `timeoutMs` elapses
 * first. The listing is JS-rendered, so the element is usually absent at
 * injection; a MutationObserver on the whole tree is cheaper than a poll loop
 * and self-disconnects the moment the element (or the deadline) arrives.
 */
function whenReady(selector: string, timeoutMs: number): Promise<boolean> {
  if (document.querySelector(selector)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        obs.disconnect();
        clearTimeout(timer);
        resolve(true);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      obs.disconnect();
      resolve(false);
    }, timeoutMs);
  });
}

export default defineContentScript({
  // .com only for Phase 2; international hosts (*.ebay.co.uk, …) deferred.
  // NOTE: the legacy `/itm?item=<id>` form has no path segment after /itm — if
  // it still exists in the wild, add '*://*.ebay.com/itm*'.
  matches: ['*://*.ebay.com/itm/*'],
  main() {
    // Parse the live DOM and ship it to the worker. A parse failure (drifted
    // selector, half-rendered page) logs and returns — never throws up the
    // stack, never asks the worker to write garbage.
    async function capture(type: CaptureMessage['type']) {
      let data;
      try {
        data = normalizeEbayDom(document, location.href);
      } catch (e) {
        console.warn('[capture] parse failed, skipping', type, e);
        return;
      }
      const res = await sendCapture({ type, data } as CaptureMessage);
      console.log('[capture]', type, data, '→', res);
    }

    // 1. READINESS + 2. PASSIVE REFRESH — once the title exists, send one
    //    capture:visit. The worker updates only an already-tracked listing.
    void whenReady(EBAY_SELECTORS.title, READY_TIMEOUT_MS).then((ready) => {
      if (!ready) {
        console.warn('[capture] title never appeared; giving up on this page');
        return;
      }
      void capture('capture:visit');
    });

    // 3. TRIGGER (save) — DELEGATED click on document (capture phase): the watch
    //    heart re-renders, so we match with closest() instead of binding the
    //    node. We don't distinguish watch from un-watch: the worker only ever
    //    creates/updates (never un-tracks), so an un-watch click merely re-updates
    //    an already-tracked item — harmless, and no reliable "watching" state to
    //    read anyway. Debounce guards a single click firing twice.
    let lastSave = 0;
    document.addEventListener(
      'click',
      (e) => {
        if (!(e.target instanceof Element)) return;
        if (!e.target.closest(EBAY_TRIGGER.watchButton)) return;
        const now = Date.now();
        if (now - lastSave < SAVE_DEBOUNCE_MS) return;
        lastSave = now;
        void capture('capture:save');
      },
      true,
    );
  },
});
