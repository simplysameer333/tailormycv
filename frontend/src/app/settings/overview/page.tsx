"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { getUserStats, type AccountStats, type ResumeSession } from "@/lib/api";
import { type Tier } from "@/components/PricingTiers";
import {
  FiFileText, FiBookmark, FiBell, FiBriefcase,
  FiArrowRight, FiClock, FiLock,
} from "react-icons/fi";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LIMITS: Record<string, {
  sessions: string; resumes: string; saved_jobs: string; alerts: string;
}> = {
  free: { sessions: "5",         resumes: "—",         saved_jobs: "—",         alerts: "—" },
  plus: { sessions: "20",        resumes: "5",          saved_jobs: "25",         alerts: "5" },
  pro:  { sessions: "Unlimited", resumes: "Unlimited",  saved_jobs: "Unlimited",  alerts: "Unlimited" },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const QUALITY_STYLES: Record<ResumeSession["quality_label"], string> = {
  Excellent: "bg-teal-50 text-teal-700 border border-teal-200",
  Strong:    "bg-brand-50 text-brand-700 border border-brand-200",
  Good:      "bg-amber-50 text-amber-700 border border-amber-200",
  Reviewed:  "bg-slate-100 text-slate-500 border border-slate-200",
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value = 0, sub, comingSoon = false,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number | string;
  sub?: string;
  comingSoon?: boolean;
}) {
  return (
    <div className={`card p-5 flex flex-col gap-3 ${comingSoon ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="p-2 rounded-xl bg-slate-100 text-slate-500">{icon}</span>
        {comingSoon && (
          <span className="flex items-center gap-1 text-xs font-medium text-slate-400">
            <FiLock className="w-3 h-3" /> Coming soon
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{comingSoon ? "—" : value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        {sub && !comingSoon && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Usage bar (compact) ───────────────────────────────────────────────────────

function UsageRow({ label, used, limit }: { label: string; used: number; limit: string }) {
  const isUnlimited = limit === "Unlimited" || limit === "—";
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / Number(limit)) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-teal-500";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        {!isUnlimited && <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />}
      </div>
      <span className="text-xs font-medium text-slate-600 w-20 shrink-0 text-right">
        {used} / {limit === "—" ? "not included" : limit}
      </span>
    </div>
  );
}

// ── Resume history row ────────────────────────────────────────────────────────

function HistoryRow({ session }: { session: ResumeSession }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <FiClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-xs text-slate-500 shrink-0">{formatDateTime(session.created_at)}</span>
        <span className="text-sm font-medium text-slate-800 truncate">
          {session.target_role || <span className="text-slate-400 italic">No role specified</span>}
        </span>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${QUALITY_STYLES[session.quality_label]}`}>
        {session.quality_label}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { data: session, status } = useAuth();
  const tier = (session?.user?.tier ?? "free") as Tier;
  const [stats, setStats] = useState<AccountStats | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      getUserStats().then(setStats).catch(() => {});
    }
  }, [status]);

  if (status === "loading") return null;

  const limits = LIMITS[tier] ?? LIMITS.free;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your activity, usage, and plan at a glance.
        </p>
      </div>

      {/* ── Activity stats ── */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-4">Activity</h2>
        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={<FiFileText className="w-4 h-4" />}
              label="Resumes generated"
              value={stats.generated_count}
            />
            <StatCard
              icon={<FiBookmark className="w-4 h-4" />}
              label="Jobs saved"
              value={stats.saved_job_count}
            />
            <StatCard
              icon={<FiBell className="w-4 h-4" />}
              label="Active alerts"
              value={stats.active_alert_count}
              sub={stats.alert_count > stats.active_alert_count ? `${stats.alert_count} total` : undefined}
            />
            <StatCard
              icon={<FiBriefcase className="w-4 h-4" />}
              label="Jobs applied"
              comingSoon
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card p-5 h-28 animate-pulse" />
            ))}
          </div>
        )}
      </section>

      {/* ── Resume history ── */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-4">Resume History</h2>
        <div className="card p-5">
          {!stats ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : stats.recent_sessions.length === 0 ? (
            <div className="text-center py-8">
              <FiFileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No resumes generated yet.</p>
              <Link
                href="/builder/upload"
                className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                Start tailoring →
              </Link>
            </div>
          ) : (
            <div>
              {stats.recent_sessions.map((s) => (
                <HistoryRow key={s.id} session={s} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Plan snapshot ── */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-4">Your Plan</h2>
        <div className="card p-5">
          {!stats ? (
            <div className="h-32 animate-pulse" />
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <span className="font-bold text-slate-900 text-base">{tierLabel} Plan</span>
                  <span className="ml-2 text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5">
                    Current
                  </span>
                </div>
                <Link
                  href="/settings/plan"
                  className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
                >
                  View details <FiArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="space-y-3">
                <UsageRow label="Resume sessions"  used={stats.session_count}    limit={limits.sessions} />
                <UsageRow label="Saved resumes"    used={stats.resume_count}     limit={limits.resumes} />
                <UsageRow label="Saved jobs"       used={stats.saved_job_count}  limit={limits.saved_jobs} />
                <UsageRow label="Job alerts"       used={stats.alert_count}      limit={limits.alerts} />
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
