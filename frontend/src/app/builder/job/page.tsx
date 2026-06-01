"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveJobDescription } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import { FiBriefcase, FiTarget, FiArrowRight, FiInfo } from "react-icons/fi";

export default function JobPage() {
  useStepGuard("job");
  const router = useRouter();
  const [jd, setJd]         = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const prefill = localStorage.getItem("tailormycv_prefill_jd");
    if (prefill) {
      setJd(prefill);
      localStorage.removeItem("tailormycv_prefill_jd");
      toast.success("Job description pre-filled from your search.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session — please start from Step 1."); return; }
    if (jd.trim().length < 50) { toast.error("Please paste the full job description (min 50 characters)."); return; }
    setLoading(true);
    try {
      await saveJobDescription(sessionId, jd);
      router.push("/builder/preview");
    } catch {
      toast.error("Failed to save job description.");
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    // No JD saved — backend will polish the resume without job-specific tailoring
    router.push("/builder/preview");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Add a Job Description</h1>
        <p className="text-slate-500 text-sm">
          Copy the full job posting from LinkedIn, Indeed, or any source. The more detail, the better the tailoring.
        </p>
      </div>

      {/* ── Optional / comparison banner ── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white">
          <FiInfo className="w-4 h-4 text-brand-500 shrink-0" />
          <p className="text-sm font-semibold text-slate-700">Job description is optional</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          {/* With JD */}
          <div className="px-4 py-4 flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0 mt-0.5">
              <FiTarget className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-1">With a job description</p>
              <ul className="space-y-1">
                {[
                  "AI tailors your CV to this specific role",
                  "Extracts the exact skills the employer wants",
                  "Keywords matched for ATS screening",
                  "Best for active job applications",
                ].map(t => (
                  <li key={t} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <span className="text-brand-500 font-bold mt-0.5 shrink-0">✓</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* Without JD */}
          <div className="px-4 py-4 flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-400 flex items-center justify-center shrink-0 mt-0.5">
              <FiBriefcase className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Without a job description</p>
              <ul className="space-y-1">
                {[
                  "AI polishes and restructures your CV",
                  "Improves clarity, formatting and language",
                  "No role-specific tailoring",
                  "Good for updating your general CV",
                ].map(t => (
                  <li key={t} className="flex items-start gap-1.5 text-xs text-slate-500">
                    <span className="text-slate-400 font-bold mt-0.5 shrink-0">·</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Textarea form ── */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">Job Description</label>
          <textarea
            className="input h-64 resize-none font-mono text-xs"
            placeholder="Paste the full job description here…"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
          />
          <p className="text-xs text-slate-400 mt-1">{jd.length} characters{jd.length > 0 && jd.length < 50 ? " — paste the full description for best results" : ""}</p>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-1">
          <button type="button" onClick={() => router.back()} className="btn-secondary w-full sm:w-auto">
            ← Back
          </button>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSkip}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition w-full sm:w-auto"
            >
              Skip — polish only
            </button>
            <button
              type="submit"
              disabled={loading || jd.trim().length < 50}
              className="btn-primary flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {loading ? "Saving…" : <><FiArrowRight className="w-4 h-4" /> Tailor to this job</>}
            </button>
          </div>
        </div>
      </form>

    </div>
  );
}
