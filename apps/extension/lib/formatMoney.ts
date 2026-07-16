// Money formatting for the UI edge (step 6). Storage is integer MINOR UNITS
// (cents) + ISO 4217 currency (see types.ts); this is the ONLY place cents get
// divided by 100 for display. Returns a placeholder for null (a `pending` item
// has no price until the poller hydrates it).

/**
 * Format minor-units + currency for display, e.g. (123456, 'USD') -> "$1,234.56".
 * Intl handles the currency symbol, grouping, and per-currency minor-unit count.
 */
export function formatMoney(minorUnits: number | null, currency: string): string {
  if (minorUnits == null) return '-';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minorUnits / 100);
}
