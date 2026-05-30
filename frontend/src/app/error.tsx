"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FiAlertTriangle, FiRefreshCw, FiArrowLeft } from "react-icons/fi";
import { SUPPORT_EMAIL } from "@/lib/config";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: Props) {
  useEffect(() => {
    // Log to console in dev; swap for a real error service (Sentry etc.) in prod
    console.error("[AppError]", error);
  }, [error]);

  const router = useRouter();
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-5">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-5">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <FiAlertTriangle className="w-7 h-7 text-red-500" />
          </div>
        </div>

        <div>
          <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
          <p className="text-sm text-slate-500 mt-2">
            An unexpected error occurred. Your data has not been lost — try reloading or going back.
          </p>
        </div>

        {isDev && error.message && (
          <pre className="text-left text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-red-600 overflow-auto max-h-40 whitespace-pre-wrap">
            {error.message}
            {error.digest && `\n\nDigest: ${error.digest}`}
          </pre>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            <FiArrowLeft className="w-4 h-4" />
            Go back
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition"
          >
            <FiRefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>

        <p className="text-xs text-slate-400">
          If this keeps happening, contact{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
