"use client";
import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  FiUploadCloud, FiFile, FiZap, FiTarget, FiAward, FiX, FiBriefcase,
  FiLoader, FiLinkedin, FiCheckCircle, FiAlertCircle,
} from "react-icons/fi";
import {
  uploadResume, parseLinkedInProfile, listSavedResumes,
  createSessionFromLibraryResume, type LinkedInProfile, type SavedResume,
} from "@/lib/api";
import { setSessionId } from "@/lib/session";

const STALE_KEYS = [
  "tailormycv_generated", "tailormycv_eval_summary", "tailormycv_template_id",
  "tailormycv_output_format", "tailormycv_instructions",
  "tailormycv_locked_facts", "tailormycv_custom_sections",
];

const BENEFITS = [
  { icon: FiZap,    title: "AI-powered tailoring",     desc: "Matches your resume to every job posting" },
  { icon: FiTarget, title: "ATS optimised",             desc: "Keywords that pass automated screening" },
  { icon: FiAward,  title: "Multi-model quality check", desc: "Three AI evaluators until it scores best" },
];

function isValidLinkedInUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%\.]+\/?$/.test(url.trim().split("?")[0]);
}

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Tailor context — read from URL params only, never from localStorage ────
  const jobTitle = searchParams.get("tailor_title") ?? "";
  const employer = searchParams.get("tailor_employer") ?? "";

  // ── Resume file state ──────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);

  // ── LinkedIn state ─────────────────────────────────────────────────────────
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinFetching, setLinkedinFetching] = useState(false);
  const [linkedinProfile, setLinkedinProfile] = useState<LinkedInProfile | null>(null);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  // Manual paste fallback — shown when the LinkedIn API isn't available
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [manualText, setManualText] = useState("");

  // ── Submission state ───────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);

  // ── Library state ──────────────────────────────────────────────────────────
  const [library, setLibrary] = useState<SavedResume[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryLoadingId, setLibraryLoadingId] = useState<string | null>(null);

  useEffect(() => {
    // Clear legacy keys from older app versions.
    localStorage.removeItem("tailormycv_tailor_job_title");
    localStorage.removeItem("tailormycv_tailor_employer");

    // If the user arrived without tailor URL params (i.e. not from Find Jobs),
    // clear the tailor context so the banner doesn't show from a previous session.
    if (!searchParams.get("tailor_title")) {
      localStorage.removeItem("tailormycv_tailor_context");
    }

    listSavedResumes()
      .then(setLibrary)
      .catch(() => {})
      .finally(() => setLibraryLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxSize: 5 * 1024 * 1024,
    maxFiles: 1,
  });

  // ── LinkedIn fetch ─────────────────────────────────────────────────────────
  async function handleFetchLinkedIn() {
    const url = linkedinUrl.trim();
    if (!url) return;
    if (!isValidLinkedInUrl(url)) {
      setLinkedinError("Enter a valid LinkedIn URL — e.g. linkedin.com/in/yourname");
      return;
    }
    setLinkedinError(null);
    setLinkedinProfile(null);
    setLinkedinFetching(true);
    try {
      const profile = await parseLinkedInProfile(url);
      setLinkedinProfile(profile);
      setShowManualPaste(false);
      toast.success(`Found: ${profile.full_name}`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // 503 = LinkedIn API not subscribed on this server — offer manual paste
      if (status === 503) {
        setShowManualPaste(true);
        setLinkedinError(null);
      } else {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          ?? "Could not fetch LinkedIn profile. Check the URL or paste your profile text below.";
        setLinkedinError(msg);
      }
    } finally {
      setLinkedinFetching(false);
    }
  }

  function applyManualPaste() {
    const text = manualText.trim();
    if (!text) return;
    // Wrap the pasted text as a minimal LinkedInProfile so the rest of the
    // flow (combine with resume, send to backend) works identically.
    setLinkedinProfile({
      full_name: "", headline: "", location: "", email: "", summary: "", skills: [],
      raw_text: text,
    });
    setShowManualPaste(false);
    toast.success("Profile text saved — it will be combined with your resume.");
  }

  function clearLinkedin() {
    setLinkedinUrl("");
    setLinkedinProfile(null);
    setLinkedinError(null);
    setShowManualPaste(false);
    setManualText("");
  }

  // ── Upload & continue ──────────────────────────────────────────────────────
  const hasLinkedinContent = !!(linkedinProfile?.raw_text);

  async function handleUpload() {
    if (!file && !hasLinkedinContent) return;
    setUploading(true);
    try {
      const res = await uploadResume(file, linkedinProfile?.raw_text);
      setSessionId(res.session_id);
      STALE_KEYS.forEach((k) => localStorage.removeItem(k));

      const source = file && linkedinProfile ? "Resume + LinkedIn combined"
        : linkedinProfile ? "LinkedIn profile imported"
        : "Resume parsed";
      toast.success(`${source} — continue to fill in your details`);
      router.push("/builder/profile");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Upload failed.";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  // ── Library ────────────────────────────────────────────────────────────────
  async function handleUseLibraryResume(resume: SavedResume) {
    setLibraryLoadingId(resume.id);
    const prefillJd = localStorage.getItem("tailormycv_prefill_jd") ?? "";
    try {
      const { session_id } = await createSessionFromLibraryResume(resume.id, prefillJd);
      setSessionId(session_id);
      STALE_KEYS.forEach((k) => localStorage.removeItem(k));
      toast.success(`Using "${resume.name}" — review your profile to continue.`);
      router.push("/builder/profile");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to load resume.";
      toast.error(msg);
      setLibraryLoadingId(null);
    }
  }

  const isTailoring = !!(jobTitle || employer);
  const hasLibrary  = libraryLoaded && library.length > 0;
  const canContinue = !!(file || hasLinkedinContent);

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Step badge + hero */}
      <div className="text-center space-y-2 pt-2">
        <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-teal-200">
          <FiZap className="w-3.5 h-3.5" /> Step 1 of 6
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
          {hasLibrary ? "Choose your resume" : "Upload your resume"}
        </h1>
        <p className="text-sm text-slate-500">
          Upload a file, import from LinkedIn, or use both.
        </p>
        {isTailoring && (
          <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full">
            <FiBriefcase className="w-3.5 h-3.5 shrink-0" />
            {jobTitle}{employer ? ` · ${employer}` : ""}
          </div>
        )}
      </div>

      {/* Library cards */}
      {hasLibrary && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Your Resume Library</p>
          {library.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-brand-300 transition">
              <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <FiFile className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{r.name}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  r.type === "tailored" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {r.type === "tailored" ? "AI Tailored" : "Uploaded"}
                  {r.tailored_for_employer ? ` · ${r.tailored_for_employer}` : ""}
                </span>
              </div>
              <button
                onClick={() => handleUseLibraryResume(r)}
                disabled={!!libraryLoadingId}
                className="btn-primary text-xs px-3 py-1.5 shrink-0 min-w-[110px] flex items-center justify-center gap-1.5"
              >
                {libraryLoadingId === r.id
                  ? <><FiLoader className="w-3.5 h-3.5 animate-spin" /> Loading…</>
                  : isTailoring ? "Tailor with this" : "Use this resume"
                }
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs text-slate-400">or start fresh</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>
        </div>
      )}

      {/* ── Source 1: Resume file ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">
          Resume file <span className="normal-case font-normal text-slate-400">(PDF or DOCX)</span>
        </p>
        <div
          {...getRootProps()}
          className={`rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
            isDragActive ? "border-brand-500 bg-brand-50 scale-[1.01]"
            : file        ? "border-brand-400 bg-brand-50"
            :               "border-slate-300 hover:border-brand-400 hover:bg-slate-50"
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center gap-3 text-center px-8 py-7">
            {file ? (
              <>
                <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
                  <FiFile className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{file.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB · Ready</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  <FiX className="w-3.5 h-3.5" /> Remove
                </button>
              </>
            ) : (
              <>
                <div className={`rounded-xl flex items-center justify-center transition-colors ${
                  isDragActive ? "w-14 h-14 bg-brand-200" : "w-12 h-12 bg-slate-100"
                }`}>
                  <FiUploadCloud className={`w-6 h-6 ${isDragActive ? "text-brand-600" : "text-slate-400"}`} />
                </div>
                <div>
                  <p className="font-semibold text-slate-700 text-sm">
                    {isDragActive ? "Drop it here!" : "Drag & drop your resume"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">or click to browse · max 5 MB</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">or</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {/* ── Source 2: LinkedIn URL ────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">
          Import from LinkedIn
        </p>

        {linkedinProfile ? (
          /* Success state */
          <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
            <FiCheckCircle className="w-5 h-5 text-teal-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-teal-800">{linkedinProfile.full_name}</p>
              {linkedinProfile.headline && (
                <p className="text-xs text-teal-600 truncate">{linkedinProfile.headline}</p>
              )}
              {linkedinProfile.location && (
                <p className="text-xs text-slate-500">{linkedinProfile.location}</p>
              )}
            </div>
            <button
              onClick={clearLinkedin}
              className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
              title="Remove LinkedIn profile"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Input state */
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <FiLinkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0077B5]" />
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => {
                    setLinkedinUrl(e.target.value);
                    setLinkedinError(null);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleFetchLinkedIn(); }}
                  placeholder="https://linkedin.com/in/yourname"
                  className={`input pl-9 text-sm ${linkedinError ? "border-red-300 focus:ring-red-300" : ""}`}
                />
              </div>
              <button
                onClick={handleFetchLinkedIn}
                disabled={linkedinFetching || !linkedinUrl.trim()}
                className="btn-secondary px-4 py-2 text-sm shrink-0 flex items-center gap-1.5 disabled:opacity-40"
              >
                {linkedinFetching
                  ? <><FiLoader className="w-3.5 h-3.5 animate-spin" /> Fetching…</>
                  : "Import →"
                }
              </button>
            </div>
            {linkedinError && (
              <div className="flex items-start gap-2 text-xs text-red-600">
                <FiAlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {linkedinError}
              </div>
            )}

            {/* Manual paste fallback — shown when LinkedIn API isn't subscribed */}
            {showManualPaste && (
              <div className="space-y-2 border border-brand-100 rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold text-brand-700 flex items-center gap-1.5">
                  <FiLinkedin className="w-3.5 h-3.5" />
                  Paste your LinkedIn profile text
                </p>
                <p className="text-xs text-slate-500">
                  On your LinkedIn profile, copy your About section, experience, and skills,
                  then paste it below. The AI will use it to populate your resume.
                </p>
                <textarea
                  rows={6}
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  placeholder="Paste your LinkedIn About, experience, education and skills here…"
                  className="input text-sm resize-none w-full"
                />
                <div className="flex gap-2">
                  <button
                    onClick={applyManualPaste}
                    disabled={!manualText.trim()}
                    className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40"
                  >
                    Use this text →
                  </button>
                  <button
                    onClick={() => setShowManualPaste(false)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Combined sources note */}
        {file && linkedinProfile && (
          <div className="text-xs text-slate-500 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
            Both sources selected — your uploaded resume takes priority for matching fields.
            LinkedIn fills in any additional context.
          </div>
        )}
      </div>

      {/* ── Continue button ───────────────────────────────────────────────── */}
      <div className="flex justify-center pt-2">
        <button
          onClick={handleUpload}
          disabled={!canContinue || uploading}
          className="btn-primary text-base px-10 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading
            ? <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analysing…
              </span>
            : canContinue
              ? "Continue →"
              : "Upload a resume or import LinkedIn to continue"
          }
        </button>
      </div>

      {/* Benefits */}
      {!hasLibrary && !isTailoring && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-start gap-2 p-4 rounded-xl bg-white border border-slate-100 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                <Icon className="w-4 h-4 text-brand-600" />
              </div>
              <p className="font-semibold text-sm text-slate-800">{title}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
