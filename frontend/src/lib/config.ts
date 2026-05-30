// ── Support contact ────────────────────────────────────────────────────────────
export const SUPPORT_EMAIL = "tailormycv.alerts@gmail.com";

// ── Tier types ─────────────────────────────────────────────────────────────────
export type Tier = "free" | "plus" | "pro";

// ── Feature gates — SINGLE SOURCE OF TRUTH ────────────────────────────────────
// To grant a feature to a new tier: add the tier name to its array.
// To remove a feature from a tier: remove the tier name from its array.
// All frontend tier checks must read from hasFeature() — never inline strings.
// Backend enforcement stays in routers via require_tier() — keep in sync.
export const FEATURE_TIERS = {
  // ── Builder ──────────────────────────────────────────────────────────────
  pdf_export:      ["plus", "pro"],
  save_to_library: ["plus", "pro"],
  section_regen:   ["pro"],
  locked_facts:    ["pro"],
  sample_cv:       ["pro"],
  // ── Jobs ─────────────────────────────────────────────────────────────────
  job_search:      ["free", "plus", "pro"],   // search/browse only on free
  save_jobs:       ["plus", "pro"],
  tailor_job:      ["plus", "pro"],
  apply_saved:     ["plus", "pro"],
  resume_library:  ["plus", "pro"],
  job_alerts:      ["plus", "pro"],
} as const satisfies Record<string, readonly Tier[]>;

export type Feature = keyof typeof FEATURE_TIERS;

/**
 * Returns true if the given tier has access to the named feature.
 *
 * Reads from the runtime MongoDB-backed store (lib/tierConfig.ts) when it has
 * been initialized, otherwise falls back to the compile-time FEATURE_TIERS
 * defaults.  The runtime store is populated by AuthProvider at app startup.
 */
export function hasFeature(tier: string, feature: Feature): boolean {
  // Lazy import avoids circular deps (tierConfig imports from config)
  try {
    const { hasFeatureDynamic, isInitialized } = require("./tierConfig") as typeof import("./tierConfig");
    if (isInitialized()) return hasFeatureDynamic(tier, feature);
  } catch { /* SSR or module not ready — fall through */ }
  return (FEATURE_TIERS[feature] as readonly string[]).includes(tier);
}

// ── Per-tier numeric limits ────────────────────────────────────────────────────
// null = unlimited.  Update here and the pricing display auto-syncs.
export const TIER_LIMITS = {
  resume_sessions: { free: 5,  plus: 20,  pro: null } as const,
  resume_library:  { free: 0,  plus: 5,   pro: null } as const,
  saved_jobs:      { free: 0,  plus: 25,  pro: null } as const,
  job_alerts:      { free: 0,  plus: 5,   pro: null } as const,
  evaluators:      { free: 1,  plus: 2,   pro: 3    } as const,
  key_skills:      { free: 3,  plus: 5,   pro: 10   } as const,
} as const;

export type LimitKey = keyof typeof TIER_LIMITS;

/** Returns the numeric limit for a tier, or null for unlimited. */
export function getTierLimit(tier: string, limit: LimitKey): number | null {
  try {
    const { getTierLimitDynamic, isInitialized } = require("./tierConfig") as typeof import("./tierConfig");
    if (isInitialized()) return getTierLimitDynamic(tier, limit);
  } catch { /* SSR or module not ready — fall through */ }
  const limits = TIER_LIMITS[limit] as Record<string, number | null>;
  return Object.prototype.hasOwnProperty.call(limits, tier) ? limits[tier] : 0;
}

// ── Job search config ─────────────────────────────────────────────────────────
export const JSEARCH_PAGE_SIZES = [10, 20, 50] as const;
export type JsearchPageSize = (typeof JSEARCH_PAGE_SIZES)[number];
export const JSEARCH_DEFAULT_PAGE_SIZE: JsearchPageSize = 10;
