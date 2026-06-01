"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FiArrowRight, FiShare2, FiAlertCircle } from "react-icons/fi";
import { getCheckResult, type ResumeCheckResult } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import { TemplateSuggestions } from "@/components/TemplatePreviews";
import { scoreColor, ScoreCircle, CategoryCard, CategoryMiniScores } from "../_components";

// ── category card ─────────────────────────────────────────────────────────────

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
        <CategoryMiniScores categories={result.categories} />
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
