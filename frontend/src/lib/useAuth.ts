"use client";
import { useSession } from "next-auth/react";
import { useDevSession } from "@/providers/DevProvider";

// DEV is resolved at build time — the exported function is permanently one or the other,
// so hook call counts never change at runtime (no rules-of-hooks violation).
function useAuthReal() {
  const { data, status, update } = useSession();
  return { data: data ?? null, status, update };
}

function useAuthDev() {
  return useDevSession();
}

export const useAuth =
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true" ? useAuthDev : useAuthReal;
