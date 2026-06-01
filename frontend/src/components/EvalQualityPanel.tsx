"use client";
/**
 * Resume quality score panel — shared between builder/preview and builder/template.
 * Displays the multi-evaluator score, quality label, progress bar, and cycle count.
 */
import { FiAward, FiCheckCircle, FiShield } from "react-icons/fi";
import type { EvalSummary } from "@/lib/api";

function qualityLabel(score: number, threshold: number): string {
  if (score >= threshold + 30) return "Excellent";
  if (score >= threshold + 15) return "Strong";
  if (score >= threshold) return "Good";
  return "Reviewed";
}

function qualityColors(score: number, threshold: number) {
  const delta = score - threshold;
  if (delta >= 30) return { bg: "bg-green-50",  border: "border-green-200", badge: "bg-green-100 text-green-700",  bar: "bg-green-500"  };
  if (delta >= 15) return { bg: "bg-teal-50",   border: "border-teal-200",  badge: "bg-teal-100  text-teal-700",   bar: "bg-teal-500"   };
  if (delta >= 0)  return { bg: "bg-blue-50",   border: "border-blue-200",  badge: "bg-blue-100  text-blue-700",   bar: "bg-blue-500"   };
  return               { bg: "bg-slate-50",  border: "border-slate-200", badge: "bg-slate-100 text-slate-600", bar: "bg-slate-400"  };
}

// ── Compact variant — used on builder/template ────────────────────────────────

export function EvalQualityPanel({ evalSummary }: { evalSummary: EvalSummary }) {
  const { min_score, pass_threshold, all_passed, evaluator_results, cycles } = evalSummary;
  const label  = qualityLabel(min_score, pass_threshold);
  const colors = qualityColors(min_score, pass_threshold);

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <FiAward className="w-5 h-5 text-slate-500 shrink-0" />
        <p className="font-semibold text-slate-700 text-sm">Resume Quality</p>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>{label}</span>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-2 bg-white/70 rounded-full overflow-hidden border border-white">
          <div className={`h-full rounded-full ${colors.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, min_score))}%` }} />
        </div>
        <span className="text-sm font-bold text-slate-700 shrink-0">
          {min_score}<span className="text-xs font-normal text-slate-400">/100</span>
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {evaluator_results.length} evaluator{evaluator_results.length !== 1 ? "s" : ""} · {cycles} cycle{cycles !== 1 ? "s" : ""} · {all_passed ? "All passed" : "Best version selected"}
      </p>
    </div>
  );
}

// ── Expanded variant — used on builder/preview ────────────────────────────────

export function EvalSummaryPanel({ summary }: { summary: EvalSummary }) {
  const { min_score, pass_threshold, all_passed, evaluator_results, cycles, profession } = summary;
  const label  = qualityLabel(min_score, pass_threshold);
  const colors = qualityColors(min_score, pass_threshold);

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${colors.border} ${colors.bg}`}>
      <div className="flex items-center gap-2">
        {all_passed
          ? <FiCheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          : <FiShield      className="w-5 h-5 text-blue-600  shrink-0" />}
        <span className="font-semibold text-sm text-slate-800">
          {all_passed
            ? `Fully tailored — reviewed across ${cycles} iteration${cycles !== 1 ? "s" : ""}`
            : `Optimized over ${cycles} iteration${cycles !== 1 ? "s" : ""} — best version selected`}
        </span>
        {profession && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 capitalize shrink-0">
            {profession}
          </span>
        )}
      </div>
      {evaluator_results.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {evaluator_results.map(r => (
            <div key={r.model} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="capitalize font-medium">{r.model} review</span>
              <span className={`px-2 py-0.5 rounded font-semibold ${qualityColors(r.score, pass_threshold).badge}`}>
                {qualityLabel(r.score, pass_threshold)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
