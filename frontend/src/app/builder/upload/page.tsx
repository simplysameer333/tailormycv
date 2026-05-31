"use client";
import { useCallback, useState, useEffect, Suspense } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  FiUploadCloud, FiFile, FiZap, FiTarget, FiAward, FiX, FiBriefcase, FiLoader,
  FiArrowDownCircle, FiUser,
} from "react-icons/fi";
import {
  uploadResume, listSavedResumes, parseLinkedInProfile,
  createSessionFromLibraryResume, type SavedResume,
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

function UploadPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tailor context — read from URL params only, never from localStorage
  const jobTitle = searchParams.get("tailor_title") ?? "";
  const employer = searchParams.get("tailor_employer") ?? "";

  const [file, setFile]                     = useState<File | null>(null);
  const [uploading, setUploading]           = useState(false);
  const [library, setLibrary]               = useState<SavedResume[]>([]);
  const [libraryLoaded, setLibraryLoaded]   = useState(false);
  const [libraryLoadingId, setLibraryLoadingId] = useState<string | null>(null);
  const [linkedinUrl, setLinkedinUrl]       = useState("");
  const [linkedinImporting, setLinkedinImporting] = useState(false);

  useEffect(() => {
    // Clear legacy localStorage keys and any stale tailor context
    localStorage.removeItem("tailormycv_tailor_job_title");
    localStorage.removeItem("tailormycv_tailor_employer");
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

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadResume(file);
      setSessionId(res.session_id);
      STALE_KEYS.forEach((k) => localStorage.removeItem(k));
      toast.success("Resume parsed — continue to fill in your details");
      router.push("/builder/profile");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Upload failed.";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

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

  async function handleLinkedInImport() {
    const url = linkedinUrl.trim();
    if (!url) return;
    setLinkedinImporting(true);
    try {
      const profile = await parseLinkedInProfile(url);
      const res = await uploadResume(null, profile.raw_text);
      setSessionId(res.session_id);
      STALE_KEYS.forEach((k) => localStorage.removeItem(k));
      toast.success(`LinkedIn profile imported — continue to review your details.`);
      router.push("/builder/profile");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "LinkedIn import is temporarily unavailable. Please try again later.");
    } finally {
      setLinkedinImporting(false);
    }
  }

  const isTailoring = !!(jobTitle || employer);
  const hasLibrary  = libraryLoaded && library.length > 0;

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
        {isTailoring && (
          <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full">
            <FiBriefcase className="w-3.5 h-3.5 shrink-0" />
            {jobTitle}{employer ? ` · ${employer}` : ""}
          </div>
        )}
      </div>

      {/* Resume Library */}
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
            <span className="text-xs text-slate-400">or upload a different one</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
          isDragActive ? "border-brand-500 bg-brand-50 scale-[1.01]"
          : file        ? "border-brand-400 bg-brand-50"
          :               "border-slate-300 hover:border-brand-400 hover:bg-slate-50"
        }`}
      >
        <input {...getInputProps()} />
        <div className={`flex flex-col items-center justify-center gap-3 text-center px-8 ${hasLibrary ? "py-5" : "py-10"}`}>
          {file ? (
            <>
              <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
                <FiFile className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{file.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB · Ready to upload</p>
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
                  {isDragActive ? "Drop it here!" : hasLibrary ? "Upload a different resume" : "Drag & drop your resume"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">or click to browse · PDF or DOCX · max 5 MB</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* LinkedIn import */}
      {!file && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs text-slate-400">or import from LinkedIn</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/your-username"
                className="input pl-9 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleLinkedInImport()}
              />
            </div>
            <button
              onClick={handleLinkedInImport}
              disabled={!linkedinUrl.trim() || linkedinImporting}
              className="btn-primary text-sm px-4 gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {linkedinImporting
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing…</>
                : <><FiArrowDownCircle className="w-4 h-4" /> Import</>
              }
            </button>
          </div>
        </>
      )}

      {/* Upload button */}
      {file && (
        <div className="flex justify-center">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn-primary text-base px-10 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading
              ? <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analysing…
                </span>
              : "Upload & Continue →"
            }
          </button>
        </div>
      )}

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

export default function UploadPage() {
  return (
    <Suspense>
      <UploadPageInner />
    </Suspense>
  );
}
