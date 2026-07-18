// Capture messaging contract between the eBay content script and the
// background worker (mirrors lib/auth-messages.ts). The content script only
// parses the page and ships ItemData; the WORKER owns all policy — signed-in
// check, tracked-or-not, item cap, dedupe, diffing — because content scripts
// can't touch Firestore and policy shouldn't live in page-world code.
import type { ItemData } from '@dvl/firebase';

/**
 * 'capture:save'  — explicit watch-button click (TRIGGER): may CREATE the item
 *                   (or update it if already tracked).
 * 'capture:visit' — passive listing-page visit: may only UPDATE an
 *                   already-tracked item; never creates.
 */
export type CaptureMessage =
  | { type: 'capture:save'; data: ItemData }
  | { type: 'capture:visit'; data: ItemData };

/** What the worker did with the message (see upsertCapturedItem). */
export type CaptureResponse =
  | { ok: true; outcome: 'created' | 'updated' | 'unchanged' | 'ignored' }
  | { ok: false; error: string };

/**
 * Send a capture message to the background worker.
 * TODO (human): browser.runtime.sendMessage(msg) -> CaptureResponse; normalize
 * undefined / thrown errors -> { ok: false, error } (same shape as
 * requestSignIn in auth-messages.ts).
 */
export async function sendCapture(_msg: CaptureMessage): Promise<CaptureResponse> {
  // TODO (human): implement — Phase 2 step 4
  return { ok: false, error: 'not implemented' };
}
