"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  FiUploadCloud, FiFile, FiZap, FiShield, FiTarget, FiStar,
  FiAlertCircle, FiArrowRight,
  FiUser, FiFileText, FiBriefcase, FiTag, FiAward, FiCpu, FiLayout, FiEdit3,
} from "react-icons/fi";
import { useEffect, useRef } from "react";
import { checkResume, type ResumeCheckResult } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import { TemplateSuggestions } from "@/components/TemplatePreviews";
import { scoreColor, ScoreCircle, CategoryCard, CategoryMiniScores } from "./_components";

// ── static content ────────────────────────────────────────────────────────────

const CATEGORIES_INFO = [
  {
    key: "contact",
    icon: FiUser,
    name: "Contact Information",
    desc: "We verify your name, email, phone, LinkedIn URL, and location are all present — every missing field reduces your chances of a recruiter reaching out.",
  },
  {
    key: "summary",
    icon: FiFileText,
    name: "Professional Summary",
    desc: "We assess whether your summary is compelling, the right length, and highlights your years of experience and core expertise without generic filler phrases.",
  },
  {
    key: "experience",
    icon: FiBriefcase,
    name: "Work Experience",
    desc: "We check roles are in reverse chronological order with company names, dates, quantified achievements (numbers, %, $), and strong action verbs.",
  },
  {
    key: "skills",
    icon: FiTag,
    name: "Skills",
    desc: "We evaluate your skills section for technical depth, organisation by category, and relevance to your apparent target role — not just a list of buzzwords.",
  },
  {
    key: "education",
    icon: FiAward,
    name: "Education & Certifications",
    desc: "We confirm your degrees, institutions, graduation years, and relevant certifications are clearly listed — certifications are increasingly important for ATS matching.",
  },
  {
    key: "ats",
    icon: FiCpu,
    name: "ATS Compatibility",
    desc: "We analyse structure, section headings, date formatting, and keyword density to ensure your CV passes applicant tracking systems used by 98% of major employers.",
  },
  {
    key: "design",
    icon: FiLayout,
    name: "Design & Format",
    desc: "We assess your CV's structure, length, visual hierarchy, and formatting consistency — and suggest which of our templates would best suit your profile.",
  },
  {
    key: "grammar",
    icon: FiEdit3,
    name: "Grammar & Spelling",
    desc: "We proofread your CV for spelling, grammar, punctuation, and tense errors — and suggest the exact correction for each, since a single typo can cost you an interview.",
  },
];

// A distinct accent per category so the "What we'll analyse" grid is colourful
// and scannable (full class strings so Tailwind JIT keeps them).
const CATEGORY_ACCENT: Record<string, { bg: string; text: string; border: string }> = {
  contact:    { bg: "bg-blue-50",    text: "text-blue-600",    border: "hover:border-blue-300" },
  summary:    { bg: "bg-violet-50",  text: "text-violet-600",  border: "hover:border-violet-300" },
  experience: { bg: "bg-emerald-50", text: "text-emerald-600", border: "hover:border-emerald-300" },
  skills:     { bg: "bg-amber-50",   text: "text-amber-600",   border: "hover:border-amber-300" },
  education:  { bg: "bg-rose-50",    text: "text-rose-600",    border: "hover:border-rose-300" },
  ats:        { bg: "bg-cyan-50",    text: "text-cyan-600",    border: "hover:border-cyan-300" },
  design:     { bg: "bg-fuchsia-50", text: "text-fuchsia-600", border: "hover:border-fuchsia-300" },
  grammar:    { bg: "bg-teal-50",    text: "text-teal-600",    border: "hover:border-teal-300" },
};


const WHY_CHECK = [
  { icon: FiShield, stat: "98%", label: "of employers use ATS",    desc: "Most CVs are filtered out before a human ever reads them." },
  { icon: FiTarget, stat: "3×",  label: "more interview callbacks", desc: "Tailored, well-structured CVs get significantly more responses." },
  { icon: FiZap,    stat: "~45s", label: "thorough AI analysis",    desc: "A deep AI review across 54 checks — worth the wait." },
  { icon: FiStar,   stat: "54",  label: "individual checks",        desc: "8 categories · 54 checks across contact, summary, experience, skills, ATS, design and grammar." },
];

const LOADING_MESSAGES = [
  { title: "Reading your CV…",               sub: "Extracting text and structure" },
  { title: "Checking contact information…",  sub: "Name, email, phone, LinkedIn and location" },
  { title: "Reviewing professional summary…", sub: "Clarity, length and impact" },
  { title: "Evaluating work experience…",    sub: "Structure, quantification and action verbs" },
  { title: "Scoring ATS compatibility…",     sub: "Section headings, keywords and formatting" },
  { title: "Reviewing skills section…",      sub: "Technical depth and relevance to your role" },
  { title: "Checking design and format…",    sub: "Length, visual hierarchy and consistency" },
  { title: "Proofreading for grammar & spelling…", sub: "Spelling, grammar, punctuation and tense" },
  { title: "Finalising your score…",         sub: "Compiling results across all 54 checks" },
];

// ── upload zone ───────────────────────────────────────────────────────────────

function UploadZone({
  file, isDragActive, getRootProps, getInputProps, loading, onCheck,
}: {
  file: File | null;
  isDragActive: boolean;
  getRootProps: () => object;
  getInputProps: () => object;
  loading: boolean;
  onCheck: () => void;
}) {
  return (
    <div className="card">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
          isDragActive ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-brand-300 hover:bg-slate-50"
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FiFile className="w-6 h-6 text-brand-500 shrink-0" />
            <span className="font-medium text-slate-700 truncate max-w-xs">{file.name}</span>
          </div>
        ) : (
          <>
            <FiUploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="font-medium text-slate-600">
              {isDragActive ? "Drop your resume here" : "Drag & drop your resume"}
            </p>
            <p className="text-xs text-slate-400 mt-1">or click to browse · PDF or DOCX · max 5 MB</p>
          </>
        )}
      </div>
      <button
        onClick={onCheck}
        disabled={!file || loading}
        className="mt-4 w-full btn-primary py-3 text-base flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading
          ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Analysing…</>
          : <>Score My CV — It&apos;s Free</>}
      </button>
      <p className="text-center text-xs text-slate-400 mt-2">No sign-in required · Results in around 30–60 seconds</p>
    </div>
  );
}


// ── main page ─────────────────────────────────────────────────────────────────

export default function CvScorePage() {
  const router = useRouter();
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const canSeeImprovements = hasFeature(tier, "pdf_export"); // Plus+

  const [file, setFile]         = useState<File | null>(null);
  const [loading, setLoading]   = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [result, setResult]     = useState<ResumeCheckResult | null>(null);
  const spinnerRef = useRef<HTMLDivElement | null>(null);

  // Rotate loading message every 7 s while analysing
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (loading) {
      setLoadingMsg(0);
      msgTimerRef.current = setInterval(
        () => setLoadingMsg(n => (n + 1) % LOADING_MESSAGES.length),
        7000,
      );
      // Scroll to spinner so user sees progress, not the page below
      setTimeout(() => spinnerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    } else {
      if (msgTimerRef.current) clearInterval(msgTimerRef.current);
    }
    return () => { if (msgTimerRef.current) clearInterval(msgTimerRef.current); };
  }, [loading]);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setResult(null); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    onDropRejected: () => toast.error("Please upload a PDF or DOCX under 5 MB."),
  });

  async function handleCheck() {
    if (!file) return;
    setLoading(true);
    try {
      const res = await checkResume(file);
      setResult(res);
      // Redirect to permalink if we got a result_id
      if (res.result_id) {
        router.push(`/cv-score/${res.result_id}`);
      } else {
        setTimeout(() => document.getElementById("checker-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const c = result ? scoreColor(result.overall_score) : null;

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-6 py-10 space-y-10">

      {/* ── Hero ── */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
          Free · No sign-in required
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-3">Free CV Score</h1>
        <p className="text-slate-500 text-base max-w-xl mx-auto">
          Upload your CV and get a full AI-powered breakdown across 8 categories and 54 checks —
          no account needed.
        </p>
      </div>

      {/* ── Upload ── */}
      <UploadZone
        file={file} isDragActive={isDragActive}
        getRootProps={getRootProps} getInputProps={getInputProps}
        loading={loading} onCheck={handleCheck}
      />

      {/* ── What we'll analyse — shown BELOW upload ── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center mb-4">
          What we&apos;ll analyse
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CATEGORIES_INFO.map(({ key, icon: Icon, name, desc }) => {
            const a = CATEGORY_ACCENT[key] ?? { bg: "bg-brand-50", text: "text-brand-600", border: "hover:border-brand-300" };
            return (
              <div key={key} className={`flex items-start gap-3 card p-4 transition hover:shadow-md ${a.border}`}>
                <div className={`w-10 h-10 rounded-xl ${a.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`w-5 h-5 ${a.text}`} />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{name}</p>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{desc}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-slate-400 mt-3">
          Analysis takes around 30–60 seconds · Results are shareable via a permanent link
        </p>
      </div>

      {/* ── Loading overlay ── */}
      {loading && (
        <div ref={spinnerRef} className="card flex flex-col items-center justify-center py-12 gap-5">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
            <div className="absolute inset-0 rounded-full border-4 border-brand-600 border-t-transparent animate-spin" />
          </div>
          <div className="text-center max-w-xs">
            <p className="font-semibold text-slate-800 text-base leading-snug">
              {LOADING_MESSAGES[loadingMsg].title}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {LOADING_MESSAGES[loadingMsg].sub}
            </p>
          </div>
          <div className="flex gap-1.5">
            {LOADING_MESSAGES.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-500 ${
                i === loadingMsg ? "w-5 bg-brand-600" : "w-2 bg-slate-200"
              }`} />
            ))}
          </div>
          <p className="text-xs text-slate-400">Usually takes 30–60 seconds</p>
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div id="checker-results" className="space-y-6">
          <div className={`card flex flex-col sm:flex-row items-center sm:items-stretch gap-5 p-5 sm:p-6 ${c!.bg} border ${c!.border}`}>
            {/* Score circle */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <ScoreCircle score={result.overall_score} />
            </div>
            {/* Summary */}
            <div className="flex-1 min-w-0 text-center sm:text-left flex flex-col justify-center">
              <h2 className="text-xl font-bold text-slate-900">
                {result.overall_score >= 80 ? "Strong resume" :
                 result.overall_score >= 60 ? "Good resume — room to improve" :
                 result.overall_score >= 40 ? "Needs some work" : "Significant improvements needed"}
              </h2>
              <p className="text-slate-600 text-sm mt-1">{result.summary}</p>
              {!canSeeImprovements && (
                <Link href="/auth/register"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700 self-center sm:self-start">
                  Upgrade to Plus for detailed fixes <FiArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
            <CategoryMiniScores categories={result.categories} />
          </div>

          {/* Issue summary banner */}
          {(() => {
            const totalIssues = result.categories.reduce(
              (sum, cat) => sum + cat.checks.filter(ch => !ch.passed).length, 0
            );
            const totalChecks = result.categories.reduce((sum, cat) => sum + cat.checks.length, 0);
            return totalIssues > 0 ? (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
                <FiAlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">
                    {totalIssues} issue{totalIssues > 1 ? "s" : ""} found across {totalChecks} checks
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Use the AI builder to resolve these and tailor your CV for a specific job.
                  </p>
                </div>
                <Link href="/builder/upload" className="btn-primary text-xs px-3 py-1.5 shrink-0 flex items-center gap-1">
                  Fix with AI <FiArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ) : null;
          })()}

          <div>
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">
              Detailed Breakdown — {result.categories.length} categories
            </h3>
            <div className="space-y-4">
              {result.categories.map((cat) => (
                <CategoryCard key={cat.key} cat={cat} canSeeImprovements={canSeeImprovements} showDescription />
              ))}
            </div>
          </div>

          {/* Template suggestions */}
          <TemplateSuggestions extractedProfile={result.extracted_profile} />

          <div className="card text-center py-6">
            <p className="font-semibold text-slate-800 mb-1">Ready to tailor your CV for a specific job?</p>
            <p className="text-sm text-slate-500 mb-4">Our AI rewrites your CV to match any job description — pick a template and go.</p>
            <Link href="/builder/upload" className="btn-primary px-6 py-2.5 inline-flex items-center gap-2">
              Start tailoring <FiArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* ── Why it matters ── */}
      {!result && !loading && (
        <div className="bg-slate-50 rounded-3xl p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WHY_CHECK.map(({ icon: Icon, stat, label, desc }) => (
              <div key={label} className="text-center">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <Icon className="w-5 h-5 text-brand-600" />
                </div>
                <div className="text-2xl font-bold text-brand-600 mb-0.5">{stat}</div>
                <div className="text-sm font-semibold text-slate-700 mb-1">{label}</div>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

