// End-time formatting for the UI edge (step 6). Items store endTime as an
// FsTimestamp (or null for BIN / Good-'Til-Cancelled); convert to a number only
// HERE — the listener deliberately keeps the Timestamp (see lib/items.ts).

import type { FsTimestamp } from '@dvl/firebase';

/**
 * Human-readable time-until-close, e.g. "2d 3h left", "12m left", "Ended".
 * Terse by design (card label) — the largest 1-2 units, null for BIN / GTC.
 */
export function formatEndTime(endTime: FsTimestamp | null): string {
  const MINUTE = 60000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  if (endTime == null) {
    return '-';
  }

  const ms = endTime.toMillis() - Date.now();
  if (ms <= 0) {
    return 'Ended';
  } else if (ms < HOUR) {
    const minutesLeft = Math.floor(ms / MINUTE);
    return `${minutesLeft}m left`;
  } else if (ms < DAY) {
    const hoursLeft = Math.floor(ms / HOUR);
    const newMs = ms - hoursLeft * HOUR;
    const minutesLeft = Math.floor(newMs / MINUTE);
    return `${hoursLeft}h ${minutesLeft}m left`;
  } else {
    const daysLeft = Math.floor(ms / DAY);
    const newMs = ms - daysLeft * DAY;
    const hoursLeft = Math.floor(newMs / HOUR);
    return `${daysLeft}d ${hoursLeft}h left`;
  }
}

const ENDING_SOON_MS = 3 * 60 * 60 * 1000; // 3h — matches the brutalist card's pink-invert cutoff

/** True when an item ends within the next 3h (drives the ItemCard "ending soon" treatment). */
export function isEndingSoon(endTime: FsTimestamp | null): boolean {
  if (endTime == null) return false;
  const ms = endTime.toMillis() - Date.now();
  return ms > 0 && ms <= ENDING_SOON_MS;
}
