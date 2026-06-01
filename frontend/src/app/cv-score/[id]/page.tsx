"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  FiCheckCircle, FiXCircle, FiLock, FiArrowRight, FiUser, FiFileText,
  FiBriefcase, FiTag, FiAward, FiCpu, FiLayout, FiAlertCircle, FiShare2,
} from "react-icons/fi";
import { getCheckResult, type ResumeCheckResult, type CheckCategory } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import { TemplateSuggestions } from "@/components/TemplatePreviews";

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return { text: "text-green-600",  bg: "bg-green-50",  border: "border-green-200",  bar: "bg-green-500",  ring: "stroke-green-500"  };
  if (score >= 60) return { text: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200",  bar: "bg-amber-500",  ring: "stroke-amber-500"  };
  if (score >= 40) return { text: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", bar: "bg-orange-500", ring: "stroke-orange-500" };
  return              { text: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    bar: "bg-red-500",    ring: "stroke-red-500"    };
}
function statusLabel(s: CheckCategory["status"]) {
  return { excellent: "Excellent", good: "Good", needs_work: "Needs work", missing: "Missing" }[s];
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  contact: FiUser, summary: FiFileText, experience: FiBriefcase,
  skills: FiTag, education: FiAward, ats: FiCpu, design: FiLayout,
};

// ── category card ─────────────────────────────────────────────────────────────

function CategoryCard({ cat, canSeeImprovements }: { cat: CheckCategory; canSeeImprovements: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const c      = scoreColor(cat.score);
  const passed = cat.checks.filter(ch => ch.passed).length;
  const failed = cat.checks.filter(ch => !ch.passed);
  const Icon   = CATEGORY_ICONS[cat.key] ?? FiFileText;

  return (
    <div className={`rounded-2xl border ${c.border} bg-white overflow-hidden`}>
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition text-left border-b border-slate-100">
        <div className={`shrink-0 w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800">{cat.name}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{statusLabel(cat.status)}</span>
            {failed.length > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                <FiAlertCircle className="w-3 h-3" /> {failed.length} issue{failed.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${cat.score}%` }} />
            </div>
            <span className={`text-sm font-bold ${c.text} shrink-0`}>{cat.score}<span className="text-xs font-normal text-slate-400">/100</span></span>
          </div>
        </div>
        <span className="text-xs text-slate-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Checks — {passed}/{cat.checks.length} passed</p>
            <ul className="space-y-2">
              {cat.checks.map((ch, i) => (
                <li key={i} className={`flex items-start gap-2.5 text-sm rounded-lg px-3 py-2 ${ch.passed ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  {ch.passed ? <FiCheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /> : <FiXCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                  <span>{ch.label}</span>
                </li>
              ))}
            </ul>
          </div>
          {cat.improvements.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">How to improve</p>
              {canSeeImprovements ? (
                <ul className="space-y-2">
                  {cat.improvements.map((imp, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 bg-brand-50 rounded-lg px-3 py-2">
                      <span className="text-brand-500 font-bold mt-0.5 shrink-0">→</span>{imp}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                  <FiLock className="w-4 h-4 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-sm font-semibold text-slate-700 mb-1">{cat.improvements.length} improvements available</p>
                  <p className="text-xs text-slate-500 mb-3">Upgrade to Plus to unlock detailed fixes.</p>
                  <Link href="/auth/register" className="inline-flex items-center gap-1.5 btn-primary text-xs px-4 py-1.5">
                    Unlock improvements <FiArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          )}
          {failed.length > 0 && (
            <Link href="/builder/upload" className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 hover:bg-brand-100 transition group">
              <div>
                <p className="text-xs font-semibold text-brand-700">Fix {failed.length} issue{failed.length > 1 ? "s" : ""} with AI</p>
                <p className="text-[10px] text-brand-500 mt-0.5">Tailor your CV with the AI builder</p>
              </div>
              <FiArrowRight className="w-4 h-4 text-brand-500 shrink-0" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── score circle ──────────────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const c = scoreColor(score);
  const r = 44, circ = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center shrink-0">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" className={c.ring} strokeWidth="10"
          strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute text-center">
        <div className={`text-3xl font-bold ${c.text}`}>{score}</div>
        <div className="text-xs text-slate-400 font-medium">/100</div>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function CvScoreResultPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const canSeeImprovements = hasFeature(tier, "pdf_export");

  const [result, setResult] = useState<ResumeCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    getCheckResult(id)
      .then(setResult)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-20 text-center">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500">Loading your CV Score results…</p>
      </div>
    );
  }

  if (notFound || !result) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-20 text-center">
        <p className="text-2xl font-bold text-slate-900 mb-3">Result not found</p>
        <p className="text-slate-500 mb-6">This result may have expired or the link is invalid.</p>
        <Link href="/cv-score" className="btn-primary px-6 py-2.5">Check your CV now</Link>
      </div>
    );
  }

  const c = scoreColor(result.overall_score);
  const totalIssues = result.categories.reduce((sum, cat) => sum + cat.checks.filter(ch => !ch.passed).length, 0);

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-6 py-10 space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CV Score Results</h1>
          <p className="text-sm text-slate-500 mt-1">
            Analysed across 7 categories · 51 checks
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={copyLink}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 hover:border-brand-300 transition text-slate-600">
            <FiShare2 className="w-4 h-4" />
            {copied ? "Copied!" : "Copy link"}
          </button>
          <Link href="/cv-score" className="text-sm px-3 py-2 rounded-lg border border-slate-200 hover:border-brand-300 transition text-slate-600">
            New check
          </Link>
        </div>
      </div>

      {/* Overall score */}
      <div className={`card ${c.border} ${c.bg} flex flex-col sm:flex-row items-center sm:items-stretch gap-5 p-5 sm:p-6`}>
        {/* Score circle */}
        <div className="flex flex-col items-center justify-center shrink-0">
          <ScoreCircle score={result.overall_score} />
        </div>
        {/* Summary */}
        <div className="flex-1 min-w-0 text-center sm:text-left flex flex-col justify-center">
          <h2 className="text-xl font-bold text-slate-900">
            {result.overall_score >= 80 ? "Strong CV" :
             result.overall_score >= 60 ? "Good CV — room to improve" :
             result.overall_score >= 40 ? "Needs some work" : "Significant improvements needed"}
          </h2>
          <p className="text-slate-600 text-sm mt-1">{result.summary}</p>
          {!canSeeImprovements && (
            <Link href="/auth/register" className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700 self-center sm:self-start">
              Upgrade to Plus for detailed fixes <FiArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
        {/* Category mini scores */}
        <div className="hidden sm:flex flex-col justify-center gap-1.5 shrink-0 border-l border-slate-200/60 pl-5 min-w-[160px]">
          {result.categories.map(cat => {
            const cc = scoreColor(cat.score);
            const label = cat.key === "ats" ? "ATS" : cat.name.split(" ")[0];
            return (
              <div key={cat.key} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 w-[72px] shrink-0">{label}</span>
                <div className="flex-1 h-1.5 bg-white/70 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${cc.bar}`} style={{ width: `${cat.score}%` }} />
                </div>
                <span className={`text-[11px] font-bold ${cc.text} w-6 text-right shrink-0`}>{cat.score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Issue summary */}
      {totalIssues > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
          <FiAlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">{totalIssues} issue{totalIssues > 1 ? "s" : ""} found</p>
            <p className="text-xs text-amber-600 mt-0.5">Use the AI builder to resolve these and tailor your CV for a specific job.</p>
          </div>
          <Link href="/builder/upload" className="btn-primary text-xs px-3 py-1.5 shrink-0 flex items-center gap-1">
            Fix with AI <FiArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Category breakdown */}
      <div>
        <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">
          Detailed Breakdown — {result.categories.length} categories
        </h3>
        <div className="space-y-4">
          {result.categories.map(cat => (
            <CategoryCard key={cat.key} cat={cat} canSeeImprovements={canSeeImprovements} />
          ))}
        </div>
      </div>

      {/* Template suggestions */}
      <TemplateSuggestions extractedProfile={result.extracted_profile} />

      {/* CTA */}
      <div className="card text-center py-6">
        <p className="font-semibold text-slate-800 mb-1">Ready to tailor your CV for a specific job?</p>
        <p className="text-sm text-slate-500 mb-4">Our AI rewrites your CV to match any job description — pick a template and go.</p>
        <Link href="/builder/upload" className="btn-primary px-6 py-2.5 inline-flex items-center gap-2">
          Start tailoring <FiArrowRight className="w-4 h-4" />
        </Link>
      </div>

    </div>
  );
}
