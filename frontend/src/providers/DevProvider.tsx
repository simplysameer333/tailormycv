"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { setApiToken } from "@/lib/api";

export type Tier = "free" | "plus" | "pro";

interface DevSession {
  data: {
    user: { id: string; name: string; email: string; tier: Tier; is_superadmin: boolean };
    accessToken: string;
    expires: string;
  };
  status: "authenticated";
}

const DEV_USERS: Record<Tier, DevSession["data"]["user"]> = {
  free: { id: "dev-free", name: "Dev User (Free)", email: "dev-free@tailormycv.dev", tier: "free", is_superadmin: true },
  plus: { id: "dev-plus", name: "Dev User (Plus)", email: "dev-plus@tailormycv.dev", tier: "plus", is_superadmin: true },
  pro:  { id: "dev-pro",  name: "Dev User (Pro)",  email: "dev-pro@tailormycv.dev",  tier: "pro",  is_superadmin: true },
};

const STORAGE_KEY = "tailormycv_dev_tier";

interface DevContextValue {
  session: DevSession;
  tier: Tier;
  setTier: (t: Tier) => void;
}

export const DevSessionContext = createContext<DevContextValue>({
  session: { data: { user: DEV_USERS.pro, accessToken: "dev-pro", expires: "" }, status: "authenticated" },
  tier: "pro",
  setTier: () => {},
});

export function useDevSession() {
  const { session } = useContext(DevSessionContext);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...session, update: async (_data?: any) => null };
}

export function useDevContext() {
  return useContext(DevSessionContext);
}

export default function DevProvider({ children }: { children: React.ReactNode }) {
  // Always start with "pro" on both server and client to avoid hydration mismatch.
  // localStorage is read in useEffect (client-only) after hydration.
  const [tier, setTierState] = useState<Tier>("pro");

  function setTier(t: Tier) {
    setTierState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Tier | null;
    if (saved && saved !== tier) setTierState(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setApiToken(`dev-${tier}`);
  }, [tier]);

  const session: DevSession = {
    data: { user: DEV_USERS[tier], accessToken: `dev-${tier}`, expires: "" },
    status: "authenticated",
  };

  return (
    <DevSessionContext.Provider value={{ session, tier, setTier }}>
      {children}
    </DevSessionContext.Provider>
  );
}
