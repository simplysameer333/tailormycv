"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  FiUploadCloud, FiFile, FiCheckCircle, FiXCircle, FiLock,
  FiArrowRight, FiUser, FiFileText, FiChevronDown, FiChevronUp,
  FiBriefcase, FiTag, FiAward, FiCpu, FiZap, FiShield, FiTarget, FiStar, FiLayout, FiAlertCircle,
} from "react-icons/fi";
import { checkResume, type ResumeCheckResult, type CheckCategory } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import { TemplateSuggestions } from "@/components/TemplatePreviews";

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
];

const HOW_IT_WORKS = [
  { step: "1", title: "Upload your CV", desc: "PDF or DOCX, up to 5 MB. No account needed." },
  { step: "2", title: "AI analyses instantly", desc: "Our AI reviews 7 quality categories in under 20 seconds." },
  { step: "3", title: "Review your score", desc: "Get a full breakdown with specific, actionable improvements." },
];

const WHY_CHECK = [
  { icon: FiShield, stat: "98%", label: "of employers use ATS",    desc: "Most CVs are filtered out before a human ever reads them." },
  { icon: FiTarget, stat: "3×",  label: "more interview callbacks", desc: "Tailored, well-structured CVs get significantly more responses." },
  { icon: FiZap,    stat: "20s", label: "instant analysis",         desc: "Get the feedback a professional writer charges £100+ for — free." },
  { icon: FiStar,   stat: "51",  label: "individual checks",        desc: "7 categories · 51 checks across contact, summary, experience, skills, ATS, design." },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return { text: "text-green-600",  bg: "bg-green-50",  border: "border-green-200",  bar: "bg-green-500",  ring: "stroke-green-500"  };
  if (score >= 60) return { text: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200",  bar: "bg-amber-500",  ring: "stroke-amber-500"  };
  if (score >= 40) return { text: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", bar: "bg-orange-500", ring: "stroke-orange-500" };
  return              { text: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    bar: "bg-red-500",    ring: "stroke-red-500"    };
}

function statusLabel(s: CheckCategory["status"]) {
  return { excellent: "Excellent", good: "Good", needs_work: "Needs work", missing: "Missing" }[s];
}

function ScoreCircle({ score }: { score: number }) {
  const c = scoreColor(score);
  const r = 44, circ = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center shrink-0">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" className={c.ring} strokeWidth="10"
          strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute text-center">
        <div className={`text-3xl font-bold ${c.text}`}>{score}</div>
        <div className="text-xs text-slate-400 font-medium">/100</div>
      </div>
    </div>
  );
}

// ── category card — collapsed by default, expand on click ────────────────────

function CategoryCard({ cat, canSeeImprovements }: { cat: CheckCategory; canSeeImprovements: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const c       = scoreColor(cat.score);
  const passed  = cat.checks.filter((ch) => ch.passed).length;
  const failed  = cat.checks.filter((ch) => !ch.passed);
  const info    = CATEGORIES_INFO.find((i) => i.key === cat.key);
  const Icon    = info?.icon ?? FiFileText;

  return (
    <div className={`rounded-2xl border ${c.border} bg-white overflow-hidden`}>
      {/* Header — clickable, always shows score + issue count */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition text-left border-b border-slate-100"
      >
        <div className={`shrink-0 w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800">{cat.name}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
              {statusLabel(cat.status)}
            </span>
            {failed.length > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                <FiAlertCircle className="w-3 h-3" /> {failed.length} issue{failed.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${cat.score}%` }} />
            </div>
            <span className={`text-sm font-bold ${c.text} shrink-0`}>{cat.score}<span className="text-xs font-normal text-slate-400">/100</span></span>
          </div>
        </div>
        {expanded
          ? <FiChevronUp   className="w-4 h-4 text-slate-400 shrink-0" />
          : <FiChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {expanded && <div className="px-4 pb-4 pt-3 space-y-4">
        {info && <p className="text-xs text-slate-500 leading-relaxed">{info.desc}</p>}

        {/* All checks — always visible */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Checks — {passed}/{cat.checks.length} passed
          </p>
          <ul className="space-y-2">
            {cat.checks.map((ch, i) => (
              <li key={i} className={`flex items-start gap-2.5 text-sm rounded-lg px-3 py-2 ${
                ch.passed ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              }`}>
                {ch.passed
                  ? <FiCheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  : <FiXCircle     className="w-4 h-4 text-red-400   shrink-0 mt-0.5" />}
                <span>{ch.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Improvements */}
        {cat.improvements.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              How to improve
            </p>
            {canSeeImprovements ? (
              <ul className="space-y-2">
                {cat.improvements.map((imp, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 bg-brand-50 rounded-lg px-3 py-2">
                    <span className="text-brand-500 font-bold mt-0.5 shrink-0">→</span>{imp}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <FiLock className="w-4 h-4 text-slate-400 mx-auto mb-1.5" />
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  {cat.improvements.length} improvement suggestion{cat.improvements.length > 1 ? "s" : ""} available
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  Upgrade to Plus to see exactly how to fix each issue in this category.
                </p>
                <Link href="/auth/register"
                  className="inline-flex items-center gap-1.5 btn-primary text-xs px-4 py-1.5">
                  Unlock improvements <FiArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Fix with AI CTA */}
        {failed.length > 0 && (
          <Link href="/builder/upload"
            className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 hover:bg-brand-100 transition group">
            <div>
              <p className="text-xs font-semibold text-brand-700">Fix {failed.length} issue{failed.length > 1 ? "s" : ""} with AI</p>
              <p className="text-[10px] text-brand-500 mt-0.5">Tailor your CV with the AI builder</p>
            </div>
            <FiArrowRight className="w-4 h-4 text-brand-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </Link>
        )}
      </div>}
    </div>
  );
}

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
      <p className="text-center text-xs text-slate-400 mt-2">No sign-in required · Results in under 20 seconds</p>
    </div>
  );
}

// ── FAQ accordion item ────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-slate-50 transition"
      >
        <span className="font-medium text-slate-800 text-sm pr-4">{q}</span>
        {open
          ? <FiChevronUp   className="w-4 h-4 text-slate-400 shrink-0" />
          : <FiChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 text-sm text-slate-600 leading-relaxed border-t border-slate-100">
          {a}
        </div>
      )}
    </div>
  );
}

const FAQS = [
  {
    q: "Is the CV Score really free?",
    a: "Yes — the full analysis across all 6 categories, with scores and pass/fail checks, is completely free with no account required. Detailed improvement suggestions per category are unlocked for Plus and Pro subscribers.",
  },
  {
    q: "Do I need to create an account?",
    a: "No account is needed to use the CV Score. Simply upload your CV and get your results instantly. An account is only required if you want to save results or access improvement suggestions.",
  },
  {
    q: "What file formats are supported?",
    a: "We accept PDF and DOCX files up to 5 MB. For best results, use a plain text-based PDF rather than a heavily designed or image-based one — design-heavy CVs can confuse text extraction.",
  },
  {
    q: "How long does the analysis take?",
    a: "Typically 10–20 seconds. The AI reads your full CV and evaluates it across all 6 quality categories in a single pass using Claude AI.",
  },
  {
    q: "Does the CV Score need a job description?",
    a: "No — the CV Score analyses your CV on its own merits (completeness, structure, ATS compatibility, content quality) without needing a job description. If you want to tailor your CV to a specific role, use the CV Builder instead.",
  },
  {
    q: "How is this different from the CV Builder?",
    a: "The CV Score analyses your existing CV and tells you what's strong and what needs improving. The CV Builder takes your CV plus a job description and rewrites it using multi-model AI to maximise your match for that specific role. Use the Checker first, then the Builder to act on the findings.",
  },
  {
    q: "What is ATS and why does it matter?",
    a: "ATS (Applicant Tracking System) is software used by 98% of large employers to automatically filter CVs before a human sees them. CVs with poor formatting, missing keywords, or non-standard sections are often rejected automatically. Our ATS check ensures your CV can be parsed and ranked correctly.",
  },
  {
    q: "What do the improvement suggestions include?",
    a: "Specific, actionable recommendations per category — for example: 'Add a GitHub profile URL to your contact section' or 'Start your summary with your job title and years of experience rather than a generic phrase'. These are unlocked for Plus and Pro subscribers.",
  },
  {
    q: "Can I check my CV multiple times?",
    a: "Yes, as many times as you like. Each upload is a fresh analysis — there are no limits on how many times you can use the CV Score.",
  },
  {
    q: "Is my CV data stored or shared?",
    a: "Your CV is parsed for analysis only and is not stored beyond the current session. We do not retain your personal data, share it with third parties, or use it to train AI models.",
  },
];

// ── main page ─────────────────────────────────────────────────────────────────

export default function CvScorePage() {
  const router = useRouter();
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const canSeeImprovements = hasFeature(tier, "pdf_export"); // Plus+

  const [file, setFile]       = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<ResumeCheckResult | null>(null);

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
    <div className="max-w-4xl mx-auto px-5 sm:px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
          Free · No sign-in required
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-3">Free CV Score</h1>
        <p className="text-slate-500 text-base max-w-xl mx-auto">
          Get an instant AI-powered quality score across 7 categories and 51 checks — ATS compatibility,
          content quality, design, skills, experience and more. No sign-in required.
        </p>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-8 mt-6 flex-wrap">
          {[
            { val: "51",   label: "checks run"      },
            { val: "7",    label: "categories"      },
            { val: "Free", label: "no credit card"  },
          ].map(({ val, label }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold text-brand-600">{val}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Upload ── */}
      <UploadZone
        file={file} isDragActive={isDragActive}
        getRootProps={getRootProps} getInputProps={getInputProps}
        loading={loading} onCheck={handleCheck}
      />

      {/* ── Results ── */}
      {result && (
        <div id="checker-results" className="space-y-6">
          <div className={`card flex flex-col sm:flex-row items-center gap-6 ${c!.bg} border ${c!.border}`}>
            <ScoreCircle score={result.overall_score} />
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-bold text-slate-900">
                {result.overall_score >= 80 ? "Strong resume" :
                 result.overall_score >= 60 ? "Good resume — room to improve" :
                 result.overall_score >= 40 ? "Needs some work" : "Significant improvements needed"}
              </h2>
              <p className="text-slate-600 text-sm mt-1 max-w-md">{result.summary}</p>
              {!canSeeImprovements && (
                <Link href="/auth/register"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700">
                  Upgrade to Plus for detailed fixes <FiArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
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
                <CategoryCard key={cat.key} cat={cat} canSeeImprovements={canSeeImprovements} />
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

      {/* ── What we check ── */}
      <div>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900">What we analyse</h2>
          <p className="text-slate-500 mt-2 text-sm max-w-lg mx-auto">
            Every resume is scored across 6 categories that recruiters and ATS systems care about most.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES_INFO.map(({ key, icon: Icon, name, desc }) => (
            <div key={key} className="card hover:border-brand-200 transition">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-brand-600" />
              </div>
              <h3 className="font-semibold text-slate-800 mb-1">{name}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ── */}
      <div>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900">How it works</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map(({ step, title, desc }) => (
            <div key={step} className="text-center">
              <div className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center text-lg font-bold mx-auto mb-3">
                {step}
              </div>
              <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
              <p className="text-sm text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Why it matters ── */}
      <div className="bg-slate-50 rounded-3xl p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Why check your CV?</h2>
        </div>
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

      {/* ── FAQ ── */}
      <div>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Frequently asked questions</h2>
        </div>
        <div className="space-y-3 max-w-2xl mx-auto">
          {FAQS.map(({ q, a }) => (
            <FaqItem key={q} q={q} a={a} />
          ))}
        </div>
      </div>

    </div>
  );
}

