// ── Job search config ─────────────────────────────────────────────────────────
// Change JSEARCH_PAGE_SIZES to add/remove options from the per-page dropdown.
// Change JSEARCH_DEFAULT_PAGE_SIZE to set the initial value.

export const JSEARCH_PAGE_SIZES = [10, 20, 50] as const;
export type JsearchPageSize = (typeof JSEARCH_PAGE_SIZES)[number];
export const JSEARCH_DEFAULT_PAGE_SIZE: JsearchPageSize = 10;
