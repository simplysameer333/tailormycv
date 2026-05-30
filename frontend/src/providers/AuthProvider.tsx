"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { setApiToken, fetchTierConfig } from "@/lib/api";
import { setTierConfig } from "@/lib/tierConfig";
import DevProvider from "./DevProvider";

const DEV = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

// Keys that are tier-sensitive: generated resume, eval results, locked facts.
// Cleared when session tier changes so stale Pro content doesn't linger.
const TIER_SENSITIVE_KEYS = [
  "tailormycv_generated",
  "tailormycv_eval_summary",
  "tailormycv_locked_facts",
  "tailormycv_custom_sections",
];

function TokenSync() {
  const { data: session } = useSession();
  const prevTierRef = useRef<string | null>(null);

  // Fetch tier config from MongoDB at app startup — populates the runtime store
  // so hasFeature() and getTierLimit() reflect the live database config.
  useEffect(() => {
    fetchTierConfig()
      .then((cfg) => setTierConfig(cfg.features, cfg.limits, cfg.pricing, cfg.currency_zones))
      .catch(() => { /* keep hardcoded defaults on network failure */ });
  }, []);

  // Sync Bearer token on session change
  useEffect(() => {
    setApiToken(session?.accessToken ?? null);
  }, [session?.accessToken]);

  // Clear tier-sensitive localStorage when tier changes mid-session.
  // Prevents a downgraded user from retaining a Pro-tier generated resume or
  // locked facts that the generator would otherwise silently re-use.
  useEffect(() => {
    const newTier = session?.user?.tier ?? null;
    if (!newTier) return;
    const prev = prevTierRef.current;
    if (prev !== null && prev !== newTier) {
      TIER_SENSITIVE_KEYS.forEach((k) => localStorage.removeItem(k));
    }
    prevTierRef.current = newTier;
  }, [session?.user?.tier]);

  return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  if (DEV) {
    // Dev bypass: no NextAuth cookie dance, no Google OAuth required.
    return <DevProvider>{children}</DevProvider>;
  }
  return (
    <SessionProvider>
      <TokenSync />
      {children}
    </SessionProvider>
  );
}
