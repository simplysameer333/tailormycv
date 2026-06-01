"use client";
/**
 * Shared display components for /cv-score and /cv-score/[id].
 * Single source of truth for score colours, the score circle,
 * category cards, and the category mini-score column.
 */
import { useState } from "react";
import Link from "next/link";
import {
  FiCheckCircle, FiXCircle, FiLock, FiArrowRight, FiAlertCircle,
  FiUser, FiFileText, FiBriefcase, FiTag, FiAward, FiCpu, FiLayout,
  FiChevronDown, FiChevronUp,
} from "react-icons/fi";
import type { CheckCategory } from "@/lib/api";

// ── Score colour palette ──────────────────────────────────────────────────────

export function scoreColor(score: number) {
  if (score >= 80) return { text: "text-green-600",  bg: "bg-green-50",  border: "border-green-200",  bar: "bg-green-500",  ring: "stroke-green-500"  };
  if (score >= 60) return { text: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200",  bar: "bg-amber-500",  ring: "stroke-amber-500"  };
  if (score >= 40) return { text: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", bar: "bg-orange-500", ring: "stroke-orange-500" };
  return              { text: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    bar: "bg-red-500",    ring: "stroke-red-500"    };
}

export function statusLabel(s: CheckCategory["status"]) {
  return { excellent: "Excellent", good: "Good", needs_work: "Needs work", missing: "Missing" }[s];
}

// ── Score circle ──────────────────────────────────────────────────────────────

export function ScoreCircle({ score }: { score: number }) {
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

// ── Category icons (keyed by category key) ────────────────────────────────────

export const CATEGORY_ICONS: Record<string, React.ElementType> = {
  contact: FiUser, summary: FiFileText, experience: FiBriefcase,
  skills: FiTag, education: FiAward, ats: FiCpu, design: FiLayout,
};

// ── Category descriptions (shown in expanded card on main page) ───────────────

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  contact:    "We verify your name, email, phone, LinkedIn URL, and location are all present — every missing field reduces your chances of a recruiter reaching out.",
  summary:    "We assess whether your summary is compelling, the right length, and highlights your years of experience and core expertise without generic filler phrases.",
  experience: "We check roles are in reverse chronological order with company names, dates, quantified achievements (numbers, %, $), and strong action verbs.",
  skills:     "We evaluate your skills section for technical depth, organisation by category, and relevance to your apparent target role — not just a list of buzzwords.",
  education:  "We confirm your degrees, institutions, graduation years, and relevant certifications are clearly listed — certifications are increasingly important for ATS matching.",
  ats:        "We analyse structure, section headings, date formatting, and keyword density to ensure your CV passes applicant tracking systems used by 98% of major employers.",
  design:     "We assess your CV's structure, length, visual hierarchy, and formatting consistency — and suggest which of our templates would best suit your profile.",
};

// ── Category card (expandable) ────────────────────────────────────────────────

export function CategoryCard({
  cat, canSeeImprovements, showDescription = false,
}: {
  cat: CheckCategory;
  canSeeImprovements: boolean;
  showDescription?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const c      = scoreColor(cat.score);
  const passed = cat.checks.filter(ch => ch.passed).length;
  const failed = cat.checks.filter(ch => !ch.passed);
  const Icon   = CATEGORY_ICONS[cat.key] ?? FiFileText;

  return (
    <div className={`rounded-2xl border ${c.border} bg-white overflow-hidden`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition text-left border-b border-slate-100"
      >
        <div className={`shrink-0 w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800">{cat.name}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
              {statusLabel(cat.status)}
            </span>
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
            <span className={`text-sm font-bold ${c.text} shrink-0`}>
              {cat.score}<span className="text-xs font-normal text-slate-400">/100</span>
            </span>
          </div>
        </div>
        {expanded
          ? <FiChevronUp   className="w-4 h-4 text-slate-400 shrink-0" />
          : <FiChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-4">
          {showDescription && CATEGORY_DESCRIPTIONS[cat.key] && (
            <p className="text-xs text-slate-500 leading-relaxed">{CATEGORY_DESCRIPTIONS[cat.key]}</p>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Checks — {passed}/{cat.checks.length} passed
            </p>
            <ul className="space-y-2">
              {cat.checks.map((ch, i) => (
                <li key={i} className={`flex items-start gap-2.5 text-sm rounded-lg px-3 py-2 ${
                  ch.passed ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                }`}>
                  {ch.passed
                    ? <FiCheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    : <FiXCircle     className="w-4 h-4 text-red-400   shrink-0 mt-0.5" />}
                  <span>{ch.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {cat.improvements.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                How to improve
              </p>
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
                  <p className="text-sm font-semibold text-slate-700 mb-1">
                    {cat.improvements.length} improvement suggestion{cat.improvements.length > 1 ? "s" : ""} available
                  </p>
                  <p className="text-xs text-slate-500 mb-3">
                    Upgrade to Plus to see exactly how to fix each issue in this category.
                  </p>
                  <Link href="/auth/register"
                    className="inline-flex items-center gap-1.5 btn-primary text-xs px-4 py-1.5">
                    Unlock improvements <FiArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {failed.length > 0 && (
            <Link href="/builder/upload"
              className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 hover:bg-brand-100 transition group">
              <div>
                <p className="text-xs font-semibold text-brand-700">Fix {failed.length} issue{failed.length > 1 ? "s" : ""} with AI</p>
                <p className="text-[10px] text-brand-500 mt-0.5">Tailor your CV with the AI builder</p>
              </div>
              <FiArrowRight className="w-4 h-4 text-brand-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── Category mini-scores column (right panel of the overall score card) ────────

export function CategoryMiniScores({ categories }: { categories: CheckCategory[] }) {
  return (
    <div className="hidden sm:flex flex-col justify-center gap-1.5 shrink-0 border-l border-slate-200/60 pl-5 min-w-[160px]">
      {categories.map(cat => {
        const c = scoreColor(cat.score);
        const label = cat.key === "ats" ? "ATS" : cat.name.split(" ")[0];
        return (
          <div key={cat.key} className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 w-[72px] shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-white/70 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${cat.score}%` }} />
            </div>
            <span className={`text-[11px] font-bold ${c.text} w-6 text-right shrink-0`}>{cat.score}</span>
          </div>
        );
      })}
    </div>
  );
}
