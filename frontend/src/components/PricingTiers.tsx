"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { FiCheck } from "react-icons/fi";
import { getPricing, detectCurrencyFromConfig, getTierLimitDynamic } from "@/lib/tierConfig";

export type Tier = "free" | "plus" | "pro";

export const TIERS: {
  id: Tier;
  name: string;
  highlight?: boolean;
}[] = [
  { id: "free", name: "Free" },
  { id: "plus", name: "Plus", highlight: true },
  { id: "pro",  name: "Pro" },
];

/** Build the feature bullet list for a tier using the live dynamic config. */
export function buildFeatures(tierId: Tier): string[] {
  const lim = (key: string, tier: string): number | string => {
    const v = getTierLimitDynamic(tier, key);
    return v === null ? "Unlimited" : (v ?? 0);
  };
  switch (tierId) {
    case "free":
      return [
        "6-step AI resume builder",
        "DOCX export",
        "3 resume templates",
        `${lim("evaluators", "free")} AI quality evaluator`,
        `${lim("key_skills", "free")} key skills extracted from JD`,
        "Job search (browse only)",
      ];
    case "plus":
      return [
        "Everything in Free",
        "PDF export",
        `${lim("evaluators", "plus")} AI quality evaluators`,
        `${lim("key_skills", "plus")} key skills extracted`,
        `Save up to ${lim("saved_jobs", "plus")} jobs`,
        `Resume Library (${lim("resume_library", "plus")} resumes)`,
        "One-click Tailor from job listings",
        `Daily job alerts (${lim("job_alerts", "plus")} saved searches)`,
      ];
    case "pro":
      return [
        "Everything in Plus",
        `${lim("evaluators", "pro")} AI quality evaluators`,
        `${lim("key_skills", "pro")} key skills extracted`,
        "Section-level regeneration",
        "Locked Facts panel",
        "Sample CV reference",
        "Unlimited Resume Library",
        "Unlimited saved jobs",
        "Unlimited daily job alerts",
      ];
  }
}

interface PricingTiersProps {
  /** Controlled selected tier — supply to enable selectable mode */
  selectedTier?: Tier;
  /** Called when user clicks a card — supply to enable selectable mode */
  onSelect?: (tier: Tier) => void;
}

export default function PricingTiers({ selectedTier, onSelect }: PricingTiersProps) {
  const selectable = !!onSelect;
  const [currency, setCurrency] = useState<string>("USD");

  useEffect(() => {
    setCurrency(detectCurrencyFromConfig());
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
      {TIERS.map((t) => {
        const isSelected = selectedTier === t.id;
        const features = buildFeatures(t.id);
        const pricingMap = getPricing();
        const curr = pricingMap[currency] || pricingMap["USD"] || { symbol: "$", plus: 9, pro: 19 };
        const price = t.id === "free"
          ? `${curr.symbol}0 / mo`
          : t.id === "plus"
          ? `${curr.symbol}${curr.plus} / mo`
          : `${curr.symbol}${curr.pro} / mo`;

        const cardClass = `relative flex flex-col rounded-2xl border-2 p-5 transition-all text-left ${
          selectable
            ? isSelected
              ? "border-brand-500 bg-brand-50 shadow-sm"
              : "border-slate-200 bg-white hover:border-brand-300 cursor-pointer"
            : t.highlight
            ? "border-brand-400 bg-brand-50 shadow-md"
            : "border-slate-200 bg-white hover:border-brand-300"
        }`;

        const inner = (
          <>
            {t.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-brand-600 text-white px-3 py-0.5 rounded-full whitespace-nowrap">
                Most popular
              </span>
            )}

            {/* Header row */}
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-slate-900 text-base">{t.name}</span>
              {selectable && (
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isSelected ? "border-brand-500 bg-brand-500" : "border-slate-300"
                }`}>
                  {isSelected && <FiCheck className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
              )}
            </div>

            {/* Price */}
            <p className="text-sm font-bold text-brand-600 mb-4">{price}</p>

            {/* Feature list */}
            <ul className="flex flex-col gap-2 flex-1">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                  <FiCheck className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA in display mode */}
            {!selectable && (
              <Link
                href="/auth/register"
                className={`mt-5 w-full text-center text-sm font-semibold rounded-xl py-2 px-4 transition ${
                  t.highlight
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "border border-slate-300 text-slate-700 hover:border-brand-400 hover:text-brand-600"
                }`}
              >
                Get started
              </Link>
            )}
          </>
        );

        return selectable ? (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cardClass}
          >
            {inner}
          </button>
        ) : (
          <div key={t.id} className={cardClass}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
