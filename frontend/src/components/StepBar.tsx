"use client";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const STEPS = [
  { label: "Upload",   href: "/builder/upload" },
  { label: "Profile",  href: "/builder/profile" },
  { label: "Job",      href: "/builder/job" },
  { label: "Preview",  href: "/builder/preview" },
  { label: "Template", href: "/builder/template" },
];

export default function StepBar() {
  const pathname = usePathname();
  const current = STEPS.findIndex((s) => pathname.startsWith(s.href));
  const progressPct = current >= 0 ? Math.round(((current + 1) / STEPS.length) * 100) : 0;

  return (
    <div className="w-full bg-white border-b border-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">

        {/* Desktop step pills */}
        <ol className="hidden sm:flex items-center gap-1 py-2.5">
          {STEPS.map((step, i) => {
            const done   = i < current;
            const active = i === current;
            return (
              <li key={step.href} className="flex items-center gap-1 flex-1">
                <div
                  className={clsx(
                    "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap",
                    active && "bg-brand-600 text-white shadow-sm",
                    done   && "text-brand-600",
                    !active && !done && "text-slate-400",
                  )}
                >
                  <span
                    className={clsx(
                      "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      active && "bg-white/20 text-white",
                      done   && "bg-brand-600 text-white",
                      !active && !done && "bg-slate-200 text-slate-400",
                    )}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  {step.label}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={clsx("h-px flex-1 mx-1", done ? "bg-brand-300" : "bg-slate-200")} />
                )}
              </li>
            );
          })}
        </ol>

        {/* Mobile: label + progress bar */}
        <div className="sm:hidden flex items-center justify-between py-2 text-xs text-slate-500 font-medium">
          {current >= 0 && (
            <span>Step {current + 1} of {STEPS.length} · <span className="text-brand-600 font-semibold">{STEPS[current].label}</span></span>
          )}
          <span className="text-slate-400">{progressPct}%</span>
        </div>
        <div className="sm:hidden h-1 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-brand-600 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

      </div>
    </div>
  );
}
