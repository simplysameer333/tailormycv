"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { getUserStats, type AccountStats } from "@/lib/api";
import { TIERS, type Tier } from "@/components/PricingTiers";
import { FiCheck, FiZap, FiMail } from "react-icons/fi";
import toast from "react-hot-toast";

// ── Tier limits displayed on the usage card ────────────────────────────────────

const LIMITS: Record<string, {
  sessions: string; resumes: string; saved_jobs: string; alerts: string;
}> = {
  free: { sessions: "5",         resumes: "—",         saved_jobs: "—",         alerts: "—" },
  plus: { sessions: "20",        resumes: "5",          saved_jobs: "25",         alerts: "5" },
  pro:  { sessions: "Unlimited", resumes: "Unlimited",  saved_jobs: "Unlimited",  alerts: "Unlimited" },
};

// ── Usage bar ──────────────────────────────────────────────────────────────────

function UsageBar({ used, limit }: { used: number; limit: string }) {
  const isUnlimited = limit === "Unlimited" || limit === "—";
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / Number(limit)) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-teal-500";

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-slate-800 w-6 text-right shrink-0">{used}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        {!isUnlimited && <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />}
      </div>
      <span className="text-xs text-slate-500 w-16 shrink-0">/ {limit === "—" ? "not included" : limit}</span>
    </div>
  );
}

// ── Current plan card ──────────────────────────────────────────────────────────

function CurrentPlanCard({ tier, stats }: { tier: Tier; stats: AccountStats }) {
  const limits = LIMITS[tier] ?? LIMITS.free;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-slate-900 text-lg">{tierLabel} Plan</h2>
          <p className="text-xs text-slate-400 mt-0.5">Your current subscription</p>
        </div>
        <span className="text-xs font-semibold bg-brand-100 text-brand-700 rounded-full px-3 py-1">
          Current plan
        </span>
      </div>

      <div className="space-y-3">
        {[
          { label: "Resume sessions",  used: stats.session_count,   limit: limits.sessions },
          { label: "Saved resumes",    used: stats.resume_count,    limit: limits.resumes },
          { label: "Saved jobs",       used: stats.saved_job_count, limit: limits.saved_jobs },
          { label: "Job alerts",       used: stats.alert_count,     limit: limits.alerts },
        ].map(({ label, used, limit }) => (
          <div key={label}>
            <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
            <UsageBar used={used} limit={limit} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({ tier, currentTier }: { tier: typeof TIERS[0]; currentTier: Tier }) {
  const isCurrent = tier.id === currentTier;
  const isUpgrade = ["free", "plus", "pro"].indexOf(tier.id) > ["free", "plus", "pro"].indexOf(currentTier);

  return (
    <div className={`relative flex flex-col rounded-2xl border-2 p-5 transition-all ${
      isCurrent
        ? "border-brand-500 bg-brand-50 shadow-sm"
        : tier.highlight
        ? "border-brand-300 bg-white shadow-md"
        : "border-slate-200 bg-white"
    }`}>
      {tier.highlight && !isCurrent && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-brand-600 text-white px-3 py-0.5 rounded-full whitespace-nowrap">
          Most popular
        </span>
      )}
      {isCurrent && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-teal-600 text-white px-3 py-0.5 rounded-full whitespace-nowrap">
          Your plan
        </span>
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-slate-900 text-base">{tier.name}</span>
        {isCurrent && <FiCheck className="w-4 h-4 text-teal-600" />}
      </div>

      <p className="text-sm font-bold text-brand-600 mb-4">
        {/* Price shown by currency — reuse the simple USD default */}
        {tier.id === "free" ? "Free" : tier.id === "plus" ? "$9 / mo" : "$19 / mo"}
      </p>

      <ul className="flex flex-col gap-2 flex-1 mb-5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
            <FiCheck className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div className="w-full text-center text-sm font-medium text-slate-400 py-2 border border-slate-200 rounded-xl">
          Current plan
        </div>
      ) : isUpgrade ? (
        <button
          onClick={() => toast("To upgrade, please contact us at tailormycv.alerts@gmail.com", { icon: "✉️", duration: 6000 })}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-2 px-4 bg-brand-600 text-white hover:bg-brand-700 transition"
        >
          <FiZap className="w-3.5 h-3.5" />
          Upgrade to {tier.name}
        </button>
      ) : (
        <button
          onClick={() => toast("To change your plan, please contact tailormycv.alerts@gmail.com", { icon: "✉️", duration: 6000 })}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium rounded-xl py-2 px-4 border border-slate-300 text-slate-600 hover:border-brand-400 hover:text-brand-600 transition"
        >
          <FiMail className="w-3.5 h-3.5" />
          Contact support
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const { data: session, status, update } = useAuth();
  const tier = (session?.user?.tier ?? "free") as Tier;
  const [stats, setStats] = useState<AccountStats | null>(null);

  // Force session refresh on mount so tier shown is always live (not stale JWT)
  useEffect(() => {
    if (status === "authenticated" && update) {
      update(); // triggers NextAuth jwt callback → re-fetches tier from DB
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") {
      getUserStats().then(setStats).catch(() => {});
    }
  }, [status]);

  if (status === "loading") {
    return <div className="py-20 text-center text-slate-400">Loading…</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plan &amp; Usage</h1>
        <p className="text-sm text-slate-500 mt-1">
          View your current plan, track usage, and upgrade when you&apos;re ready.
        </p>
      </div>

      {/* Current plan + usage */}
      {stats ? (
        <CurrentPlanCard tier={tier} stats={stats} />
      ) : (
        <div className="card p-5 animate-pulse h-40" />
      )}

      {/* All tiers */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-4">All Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TIERS.map((t) => (
            <TierCard key={t.id} tier={t} currentTier={tier} />
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Need help choosing?{" "}
        <a href="mailto:tailormycv.alerts@gmail.com" className="text-brand-600 hover:underline">
          Contact us
        </a>
      </p>
    </div>
  );
}
