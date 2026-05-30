/**
 * Runtime tier config store.
 *
 * Initialized at app startup by AuthProvider via initTierConfig(), which
 * fetches GET /api/config/tiers from the backend.  Until that resolves
 * (< 1 second on first load) the hardcoded defaults in config.ts are used
 * as fallback — so there is never a broken state.
 *
 * When an admin updates the config via the admin dashboard, the backend cache
 * reloads immediately.  The frontend picks up the new config on the next full
 * page load (browser refresh) or when initTierConfig() is called again.
 */

import {
  FEATURE_TIERS, TIER_LIMITS,
  type Feature, type LimitKey,
} from "./config";

type FeatureMap  = Record<string, string[]>;
type LimitsMap   = Record<string, Record<string, number | null>>;

// ── Module-level mutable store ─────────────────────────────────────────────────
// Starts with the hardcoded defaults from config.ts; overwritten by the API
// response from initTierConfig().

let _features: FeatureMap = Object.fromEntries(
  Object.entries(FEATURE_TIERS).map(([k, v]) => [k, [...v]])
) as FeatureMap;

let _limits: LimitsMap = Object.fromEntries(
  Object.entries(TIER_LIMITS).map(([k, v]) => [k, { ...v }])
) as LimitsMap;

let _initialized = false;

// ── Public API ─────────────────────────────────────────────────────────────────

export function setTierConfig(features: FeatureMap, limits: LimitsMap): void {
  _features = features;
  _limits   = limits;
  _initialized = true;
}

export function hasFeatureDynamic(tier: string, feature: Feature | string): boolean {
  const allowed = _features[feature];
  return Array.isArray(allowed) ? allowed.includes(tier) : false;
}

export function getTierLimitDynamic(tier: string, limit: LimitKey | string): number | null {
  const map = _limits[limit];
  if (!map) return 0;
  return Object.prototype.hasOwnProperty.call(map, tier) ? (map[tier] ?? null) : 0;
}

export function isInitialized(): boolean {
  return _initialized;
}

export function getRawConfig(): { features: FeatureMap; limits: LimitsMap } {
  return { features: _features, limits: _limits };
}
