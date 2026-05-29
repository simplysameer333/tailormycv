"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { FiCheck } from "react-icons/fi";

export type Tier = "free" | "plus" | "pro";
type Currency = "USD" | "GBP" | "EUR";

// UK timezones (Channel Islands + Isle of Man use GBP too)
const GB_TIMEZONES = new Set([
  "Europe/London", "Europe/Belfast", "Europe/Isle_of_Man",
  "Europe/Jersey", "Europe/Guernsey",
]);

function detectCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (GB_TIMEZONES.has(tz)) return "GBP";
    if (tz.startsWith("Europe/")) return "EUR";
  } catch { /* */ }
  return "USD";
}

const PRICES: Record<Currency, Record<Tier, string>> = {
  USD: { free: "$0 / mo",  plus: "$9 / mo",  pro: "$19 / mo" },
  GBP: { free: "£0 / mo",  plus: "£7 / mo",  pro: "£15 / mo" },
  EUR: { free: "€0 / mo",  plus: "€8 / mo",  pro: "€17 / mo" },
};

export const TIERS: {
  id: Tier;
  name: string;
  highlight?: boolean;
  features: string[];
}[] = [
  {
    id: "free",
    name: "Free",
    features: [
      "6-step AI resume builder",
      "DOCX + PDF export",
      "3 resume templates",
      "1 AI quality evaluator",
      "3 key skills extracted from JD",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    highlight: true,
    features: [
      "Everything in Free",
      "2 AI quality evaluators",
      "5 key skills extracted",
      "Job search (Indeed, LinkedIn, Glassdoor)",
      "Save up to 25 jobs",
      "Resume Library (5 resumes)",
      "One-click Tailor from job listings",
      "Daily job alerts (5 saved searches)",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    features: [
      "Everything in Plus",
      "3 AI quality evaluators",
      "10 key skills extracted",
      "Section-level regeneration",
      "Locked Facts panel",
      "Sample CV reference",
      "Unlimited Resume Library",
      "Unlimited saved jobs",
      "Unlimited daily job alerts",
    ],
  },
];

interface PricingTiersProps {
  /** Controlled selected tier — supply to enable selectable mode */
  selectedTier?: Tier;
  /** Called when user clicks a card — supply to enable selectable mode */
  onSelect?: (tier: Tier) => void;
}

export default function PricingTiers({ selectedTier, onSelect }: PricingTiersProps) {
  const selectable = !!onSelect;
  const [currency, setCurrency] = useState<Currency>("USD");

  useEffect(() => {
    setCurrency(detectCurrency());
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
      {TIERS.map((t) => {
        const isSelected = selectedTier === t.id;
        const price = PRICES[currency][t.id];

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
              {t.features.map((f) => (
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
