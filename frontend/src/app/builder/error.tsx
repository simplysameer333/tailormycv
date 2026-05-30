"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FiAlertTriangle, FiRefreshCw, FiArrowLeft, FiHome } from "react-icons/fi";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BuilderError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[BuilderError]", error);
  }, [error]);

  const router = useRouter();
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-5">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-5">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
            <FiAlertTriangle className="w-7 h-7 text-amber-500" />
          </div>
        </div>

        <div>
          <h1 className="text-xl font-bold text-slate-900">Resume builder error</h1>
          <p className="text-sm text-slate-500 mt-2">
            Something went wrong on this step. Your progress is saved — try reloading the step or returning to the start.
          </p>
        </div>

        {isDev && error.message && (
          <pre className="text-left text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-red-600 overflow-auto max-h-40 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition"
          >
            <FiRefreshCw className="w-4 h-4" />
            Reload this step
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => router.back()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              <FiArrowLeft className="w-4 h-4" />
              Go back
            </button>
            <button
              onClick={() => router.push("/builder/upload")}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              <FiHome className="w-4 h-4" />
              Start over
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          If this keeps happening, contact{" "}
          <a href="mailto:support@tailormycv.com" className="text-brand-600 hover:underline">
            support@tailormycv.com
          </a>
        </p>
      </div>
    </div>
  );
}
