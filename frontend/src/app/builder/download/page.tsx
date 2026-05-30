"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { exportResume, downloadUrl, saveResumeFromSession } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import {
  FiDownload, FiCheckCircle,
  FiAlertCircle, FiRefreshCw, FiArrowLeft, FiBookmark, FiLock,
} from "react-icons/fi";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";

function WordLogo({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#2B579A"/>
      <text x="24" y="34" textAnchor="middle" fill="white" fontSize="26" fontWeight="700" fontFamily="Arial, sans-serif">W</text>
    </svg>
  );
}

function PdfLogo({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#E12025"/>
      <text x="24" y="30" textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="Arial, sans-serif" letterSpacing="0.5">PDF</text>
    </svg>
  );
}

function getResumeFilename(): string {
  try {
    const stored = localStorage.getItem("tailormycv_generated");
    if (stored) {
      const resume = JSON.parse(stored);
      if (resume?.name) {
        return resume.name
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "");
      }
    }
  } catch { /* fall through */ }
  return "resume";
}

type ExportResult = { docx_file_id?: string; pdf_file_id?: string; pdf_error?: string };

export default function DownloadPage() {
  useStepGuard("download");
  const router = useRouter();
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const canSaveToLibrary = hasFeature(tier, "save_to_library");
  const canExportPdf     = hasFeature(tier, "pdf_export");

  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<ExportResult | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);

  async function generate() {
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session found."); return; }
    const boldKeywords = localStorage.getItem("tailormycv_bold_keywords") !== "false";
    setLoading(true);
    try {
      const result = await exportResume(sessionId, canExportPdf, boldKeywords);
      setFiles(result);
      if (result.pdf_error) {
        toast(`PDF error: ${result.pdf_error}`, { icon: "⚠️", duration: 8000 });
      } else {
        toast.success("Files ready!");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Export failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToLibrary() {
    const sessionId = getSessionId();
    if (!sessionId) return;
    const resumeName = getResumeFilename().replace(/_/g, " ");
    setSavingToLibrary(true);
    try {
      await saveResumeFromSession(sessionId, `Tailored — ${resumeName}`);
      setSavedToLibrary(true);
      toast.success("Saved to your Resume Library.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Could not save to library.");
    } finally {
      setSavingToLibrary(false);
    }
  }

  const filename = getResumeFilename();
  const hasFiles = !!(files?.docx_file_id || files?.pdf_file_id);

  return (
    <div className="max-w-lg mx-auto">

      {/* Hero */}
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">{hasFiles ? "🎉" : "📄"}</div>
        <h1 className="text-2xl font-bold text-slate-900">
          {hasFiles ? "Your Resume is Ready!" : "Export Your Resume"}
        </h1>
        <p className="text-slate-500 mt-2 text-sm">
          {hasFiles
            ? "Download your tailored resume below. Files expire after 24 hours."
            : "Generate DOCX and PDF versions of your tailored resume."}
        </p>
      </div>

      {/* Format cards */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <FormatCard
          logo={<WordLogo size={44} />}
          label="Word Document"
          sub=".docx · fully editable"
          fileId={files?.docx_file_id}
          filename={`${filename}.docx`}
          error={null}
          generated={!!files}
          onRetry={generate}
        />
        {canExportPdf ? (
          <FormatCard
            logo={<PdfLogo size={44} />}
            label="PDF Document"
            sub=".pdf · print-ready"
            fileId={files?.pdf_file_id}
            filename={`${filename}.pdf`}
            error={files?.pdf_error ?? null}
            generated={!!files}
            onRetry={generate}
          />
        ) : (
          <Link
            href="/settings/plan"
            className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-2xl p-5 text-center hover:border-brand-300 transition group"
          >
            <div className="relative">
              <PdfLogo size={44} />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center">
                <FiLock className="w-3 h-3 text-slate-500" />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">PDF Document</p>
              <p className="text-xs text-brand-600 font-medium mt-0.5">Plus / Pro feature</p>
              <p className="text-xs text-slate-400 mt-0.5">Tap to upgrade</p>
            </div>
          </Link>
        )}
      </div>

      {/* PDF note */}
      {files?.pdf_error && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-xs text-amber-700">
          <FiAlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{files?.pdf_error}</span>
        </div>
      )}

      {/* Save to Library — only shown after generation, Plus+ only */}
      {hasFiles && canSaveToLibrary && (
        <button
          onClick={handleSaveToLibrary}
          disabled={savingToLibrary || savedToLibrary}
          className="w-full btn-secondary py-2.5 flex items-center justify-center gap-2 mb-3"
        >
          {savedToLibrary ? (
            <><FiCheckCircle className="w-4 h-4 text-teal-500" /> Saved to Library</>
          ) : savingToLibrary ? (
            <><FiRefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
          ) : (
            <><FiBookmark className="w-4 h-4" /> Save to Resume Library</>
          )}
        </button>
      )}

      {/* Generate / retry button */}
      <button
        onClick={generate}
        disabled={loading}
        className="w-full btn-primary py-3 text-base flex items-center justify-center gap-2 disabled:opacity-50 mb-6"
      >
        {loading ? (
          <><FiRefreshCw className="w-5 h-5 animate-spin" /> Generating…</>
        ) : hasFiles ? (
          <><FiRefreshCw className="w-4 h-4" /> Regenerate Files</>
        ) : (
          <><FiDownload className="w-5 h-5" /> Generate Files</>
        )}
      </button>

      {/* Footer actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 transition"
        >
          <FiArrowLeft className="w-4 h-4" /> Edit Resume
        </button>
        <Link
          href="/builder/upload"
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 transition"
        >
          Start New Resume <span className="text-base">→</span>
        </Link>
      </div>

    </div>
  );
}

function FormatCard({
  logo,
  label,
  sub,
  fileId,
  filename,
  error,
  generated,
  onRetry,
}: {
  logo: React.ReactNode;
  label: string;
  sub: string;
  fileId?: string;
  filename: string;
  error: string | null;
  generated: boolean;
  onRetry: () => void;
}) {
  const ready = !!fileId;
  const unavailable = generated && !ready;

  return (
    <div className={`card p-5 flex flex-col items-center gap-3 text-center transition ${unavailable ? "opacity-50 grayscale" : ""}`}>
      <div className="flex items-center justify-center">
        {logo}
      </div>

      <div>
        <p className="font-semibold text-slate-800 text-sm">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>

      {!generated && (
        <span className="text-xs text-slate-400">Not yet generated</span>
      )}

      {ready && (
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
          <FiCheckCircle className="w-3.5 h-3.5" /> Ready
        </span>
      )}

      {unavailable && !error && (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <FiAlertCircle className="w-3.5 h-3.5" /> Not available
        </span>
      )}

      {unavailable && error && (
        <span className="flex items-center gap-1 text-xs text-amber-600">
          <FiAlertCircle className="w-3.5 h-3.5" /> Unavailable
        </span>
      )}

      {ready ? (
        <a
          href={downloadUrl(fileId!)}
          download={filename}
          className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-2"
        >
          <FiDownload className="w-4 h-4" /> Download
        </a>
      ) : (
        <button
          disabled={!generated || !!error}
          onClick={!error ? onRetry : undefined}
          className="w-full btn-secondary text-sm py-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generated && !error ? "Retry" : "Download"}
        </button>
      )}
    </div>
  );
}
