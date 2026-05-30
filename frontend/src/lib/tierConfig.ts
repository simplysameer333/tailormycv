/**
 * Runtime tier config store.
 *
 * Initialized at app startup by AuthProvider which fetches GET /api/config/tiers.
 * Until that resolves the hardcoded defaults in config.ts are used as fallback.
 * When an admin saves via the dashboard the backend cache reloads immediately;
 * the frontend picks it up on the next full page load.
 */

import {
  FEATURE_TIERS, TIER_LIMITS,
  type Feature, type LimitKey,
} from "./config";
import type { CurrencyPricing, CurrencyZone } from "./api";

type FeatureMap  = Record<string, string[]>;
type LimitsMap   = Record<string, Record<string, number | null>>;

// ── Hardcoded fallbacks (used before API loads) ────────────────────────────────

const FALLBACK_PRICING: Record<string, CurrencyPricing> = {
  USD: { symbol: "$", plus: 9,  pro: 19 },
  GBP: { symbol: "£", plus: 7,  pro: 15 },
  EUR: { symbol: "€", plus: 8,  pro: 17 },
};

const FALLBACK_CURRENCY_ZONES: CurrencyZone[] = [
  {
    currency: "GBP",
    timezones: ["Europe/London", "Europe/Belfast", "Europe/Isle_of_Man", "Europe/Jersey", "Europe/Guernsey"],
    timezone_prefix: "",
    locale_codes: ["en-GB"],
  },
  {
    currency: "EUR",
    timezones: [],
    timezone_prefix: "Europe/",
    locale_codes: [],
  },
];

// ── Module-level mutable store ─────────────────────────────────────────────────

let _features: FeatureMap = Object.fromEntries(
  Object.entries(FEATURE_TIERS).map(([k, v]) => [k, [...v]])
) as FeatureMap;

let _limits: LimitsMap = Object.fromEntries(
  Object.entries(TIER_LIMITS).map(([k, v]) => [k, { ...v }])
) as LimitsMap;

let _pricing: Record<string, CurrencyPricing> = { ...FALLBACK_PRICING };
let _currency_zones: CurrencyZone[] = [...FALLBACK_CURRENCY_ZONES];

let _initialized = false;

// ── Public API ─────────────────────────────────────────────────────────────────

export function setTierConfig(
  features: FeatureMap,
  limits: LimitsMap,
  pricing?: Record<string, CurrencyPricing>,
  currencyZones?: CurrencyZone[],
): void {
  _features = features;
  _limits   = limits;
  if (pricing && Object.keys(pricing).length > 0) _pricing = pricing;
  if (currencyZones && currencyZones.length > 0) _currency_zones = currencyZones;
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

export function getPricing(): Record<string, CurrencyPricing> {
  return _pricing;
}

export function getCurrencyZones(): CurrencyZone[] {
  return _currency_zones;
}

/** Detect the best-matching currency from browser timezone + locale. */
export function detectCurrencyFromConfig(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localeParts = (navigator.language || "").split("-");
    const localeCountry = localeParts.length >= 2 ? localeParts[localeParts.length - 1].toUpperCase() : "";

    for (const zone of _currency_zones) {
      if (zone.timezones?.includes(tz)) return zone.currency;
      if (zone.timezone_prefix && tz.startsWith(zone.timezone_prefix)) return zone.currency;
      if (localeCountry && zone.locale_codes?.some(c => c.toUpperCase().endsWith(localeCountry))) return zone.currency;
    }
  } catch { /* */ }

  return Object.keys(_pricing)[0] || "USD";
}
