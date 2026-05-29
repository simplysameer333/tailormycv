"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { FiUser, FiChevronDown, FiLogOut, FiBriefcase, FiEdit2, FiBell, FiShield } from "react-icons/fi";
import Logo from "./Logo";
import { useAuth } from "@/lib/useAuth";
import { useDevContext, type Tier } from "@/providers/DevProvider";

const DEV = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

const TIER_LABEL: Record<string, string> = { plus: "Plus", pro: "Pro" };
const TIER_COLORS: Record<Tier, string> = {
  free: "bg-slate-100 text-slate-600",
  plus: "bg-teal-100 text-teal-700",
  pro:  "bg-brand-100 text-brand-700",
};

function DevTierSwitcher() {
  const { tier, setTier } = useDevContext();
  return (
    <div className="px-3 py-2 border-t border-slate-100">
      <p className="text-xs text-slate-400 mb-1.5">Dev — switch plan</p>
      <div className="flex gap-1">
        {(["free", "plus", "pro"] as Tier[]).map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={`flex-1 rounded-md px-1.5 py-1 text-xs font-semibold capitalize transition ${
              tier === t ? TIER_COLORS[t] : "text-slate-400 hover:bg-slate-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Navbar() {
  const { data: session, status } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const onBuilder = pathname.startsWith("/builder");
  const onJobs = pathname.startsWith("/jobs");

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const user = session?.user;
  const tier = user?.tier;
  const tierLabel = tier ? TIER_LABEL[tier] : null;

  return (
    <nav className="w-full bg-white border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
        <Logo />

        <div className="flex items-center gap-1 sm:gap-3">

          {/* ── Find Jobs ── */}
          {status === "authenticated" && (
            <>
              {/* Mobile: icon only */}
              <Link
                href="/jobs"
                title="Find Jobs"
                className={`sm:hidden p-2 rounded-lg transition ${
                  onJobs ? "text-brand-600 bg-brand-50" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <FiBriefcase className="w-5 h-5" />
              </Link>
              {/* Desktop: icon + label */}
              <Link
                href="/jobs"
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition ${
                  onJobs
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50"
                }`}
              >
                <FiBriefcase className="w-4 h-4" />
                Find Jobs
              </Link>
            </>
          )}

          {/* ── Builder ── */}
          {status === "authenticated" && (
            <>
              {/* Mobile: icon only */}
              <Link
                href="/builder/upload"
                title="Builder"
                className={`sm:hidden p-2 rounded-lg transition ${
                  onBuilder ? "text-brand-600 bg-brand-50" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <FiEdit2 className="w-5 h-5" />
              </Link>
              {/* Desktop: icon + label */}
              <Link
                href="/builder/upload"
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition ${
                  onBuilder
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50"
                }`}
              >
                <FiEdit2 className="w-4 h-4" />
                Builder
              </Link>
            </>
          )}

          {status === "loading" && (
            <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
          )}

          {/* ── User dropdown ── */}
          {status === "authenticated" && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
              >
                <FiUser className="w-4 h-4 text-brand-600" />
                <span className="hidden sm:block max-w-[120px] truncate">
                  {user?.name ?? user?.email}
                </span>
                {tierLabel && (
                  <span className="hidden sm:block text-xs font-semibold bg-teal-100 text-teal-700 rounded px-1.5 py-0.5">
                    {tierLabel}
                  </span>
                )}
                <FiChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {open && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white shadow-lg z-50 py-1">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    <p className="text-xs font-semibold text-brand-600 mt-0.5 capitalize">
                      {tier ?? "Free"} plan
                    </p>
                  </div>

                  <Link
                    href="/profile"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                  >
                    <FiUser className="w-4 h-4" />
                    My Profile
                  </Link>

                  {(tier === "plus" || tier === "pro") && (
                    <Link
                      href="/jobs?tab=alerts"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                    >
                      <FiBell className="w-4 h-4" />
                      My Alerts
                    </Link>
                  )}

                  {user?.is_superadmin && (
                    <Link
                      href="/admin"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm text-brand-700 hover:bg-brand-50 transition border-t border-slate-100"
                    >
                      <FiShield className="w-4 h-4" />
                      Admin
                    </Link>
                  )}

                  {!DEV && (
                    <button
                      onClick={() => { setOpen(false); signOut({ callbackUrl: "/" }); }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                    >
                      <FiLogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  )}

                  {DEV && <DevTierSwitcher />}
                </div>
              )}
            </div>
          )}

          {status === "unauthenticated" && (
            <Link href="/auth/login" className="btn-secondary text-sm px-4 py-2">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
