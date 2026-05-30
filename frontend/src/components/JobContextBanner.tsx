"use client";
import { useState, useEffect } from "react";
import { FiBriefcase, FiExternalLink, FiX } from "react-icons/fi";

interface TailorContext {
  title: string;
  employer: string;
  apply_link: string;
}

const LS_KEY = "tailormycv_tailor_context";

export default function JobContextBanner() {
  const [ctx, setCtx] = useState<TailorContext | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TailorContext;
        // Only show if we have at least a title — guards against empty/corrupt entries
        if (parsed?.title) setCtx(parsed);
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  // Return null until client hydration is complete AND context exists.
  // This prevents any flash of empty space or border during SSR.
  if (!mounted || !ctx) return null;

  const hasLink = ctx.apply_link && ctx.apply_link !== "#";

  return (
    <div className="bg-brand-50 border-b border-brand-100">
      <div className="max-w-4xl mx-auto px-5 sm:px-6 py-2 flex items-center gap-2 min-w-0">
        <FiBriefcase className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span className="text-xs text-brand-600 shrink-0">Tailoring for:</span>

        {hasLink ? (
          <a
            href={ctx.apply_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline underline-offset-2 transition-colors truncate min-w-0"
          >
            <span className="truncate">{ctx.title}</span>
            {ctx.employer && (
              <span className="text-brand-500 font-normal shrink-0">· {ctx.employer}</span>
            )}
            <FiExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          <span className="text-xs font-semibold text-brand-700 truncate min-w-0">
            {ctx.title}{ctx.employer ? ` · ${ctx.employer}` : ""}
          </span>
        )}

        <button
          onClick={() => { localStorage.removeItem(LS_KEY); setCtx(null); }}
          className="ml-auto text-brand-300 hover:text-brand-600 transition-colors shrink-0 p-0.5 rounded"
          title="Dismiss job context"
          aria-label="Dismiss"
        >
          <FiX className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
