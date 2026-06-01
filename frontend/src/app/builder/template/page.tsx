"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";
import {
  listTemplates, uploadSampleCv, exportResume, downloadUrl,
  setSessionTemplate, saveResumeFromSession,
  type Template, type GeneratedResume, type EvalSummary,
} from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import Link from "next/link";
import clsx from "clsx";
import {
  FiUploadCloud, FiCheckCircle, FiFile, FiLock, FiZap,
  FiDownload, FiRefreshCw, FiBookmark, FiAward,
} from "react-icons/fi";
import {
  ALL_TEMPLATES, LargeTemplatePreview, TemplateThumbnail, SAMPLE,
  type PreviewData, type TemplateInfo,
} from "@/components/TemplatePreviews";

// ── Convert generated resume → PreviewData for live template preview ──────────

function toPreviewData(resume: GeneratedResume): PreviewData {
  const skills: string[] =
    resume.skills?.length
      ? resume.skills
      : (resume.sections?.find(s => s.title.toLowerCase().includes("skill"))?.items ?? SAMPLE.skills);

  return {
    name:     resume.name     || SAMPLE.name,
    title:    resume.experience?.[0]?.role || SAMPLE.title,
    email:    resume.contact?.email    || SAMPLE.email,
    phone:    resume.contact?.phone    || SAMPLE.phone,
    location: resume.contact?.location || SAMPLE.location,
    linkedin: resume.contact?.linkedin || SAMPLE.linkedin,
    summary:  resume.summary  || SAMPLE.summary,
    skills,
    experience: resume.experience?.length
      ? resume.experience.map(e => ({ title: e.role, company: e.company, date: e.dates, bullets: e.bullets }))
      : SAMPLE.experience,
    education: resume.education?.length
      ? resume.education.map(e => ({ degree: e.degree, school: e.institution, year: e.dates }))
      : SAMPLE.education,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getResumeFilename(resume: GeneratedResume | null): string {
  if (resume?.name) {
    return resume.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  }
  return "resume";
}

type ExportResult = { docx_file_id?: string; pdf_file_id?: string; pdf_error?: string };

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatePage() {
  useStepGuard("template");
  const router = useRouter();
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const isPro          = hasFeature(tier, "sample_cv");
  const canExportPdf   = hasFeature(tier, "pdf_export");
  const canSaveLibrary = hasFeature(tier, "save_to_library");
  const canUseAll      = tier === "plus" || tier === "pro";

  const [dbTemplates, setDbTemplates]         = useState<Template[]>([]);
  const [selected, setSelected]               = useState<string | null>(null);
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null);
  const [evalSummary, setEvalSummary]         = useState<EvalSummary | null>(null);
  const [previewData, setPreviewData]         = useState<PreviewData>(SAMPLE);

  // Export / download state
  const [exporting, setExporting] = useState(false);
  const [files, setFiles]         = useState<ExportResult | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  // Sample CV (Pro)
  const [sampleFile, setSampleFile]         = useState<File | null>(null);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [sampleUploaded, setSampleUploaded] = useState(false);

  // Merge DB templates with local preview metadata
  const templatesWithPreview: (TemplateInfo & { _id: string })[] = ALL_TEMPLATES.map(info => {
    const dbMatch = dbTemplates.find(t => t.name === info.key || t.name === info.name);
    return { ...info, _id: dbMatch?._id ?? info.key };
  });

  const selectedInfo = selected
    ? (templatesWithPreview.find(t => t._id === selected) ?? null)
    : null;

  useEffect(() => {
    listTemplates().then(setDbTemplates).catch(() => {});

    // Load generated resume from localStorage
    try {
      const storedResume = localStorage.getItem("tailormycv_generated");
      const storedEval   = localStorage.getItem("tailormycv_eval_summary");
      if (storedResume) {
        const parsed = JSON.parse(storedResume) as GeneratedResume;
        setGeneratedResume(parsed);
        setPreviewData(toPreviewData(parsed));
      }
      if (storedEval) setEvalSummary(JSON.parse(storedEval));
    } catch { /* ignore */ }

    // Restore previously selected template
    const savedTemplate = localStorage.getItem("tailormycv_template_id");
    if (savedTemplate) setSelected(savedTemplate);
  }, []);

  // ── Sample CV dropzone ────────────────────────────────────────────────────

  const onDropSample = useCallback((files: File[]) => {
    if (files[0]) setSampleFile(files[0]);
  }, []);

  const { getRootProps: getSampleRootProps, getInputProps: getSampleInputProps, isDragActive: isSampleDrag } = useDropzone({
    onDrop: onDropSample,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1, maxSize: 5 * 1024 * 1024,
  });

  async function handleUploadSample() {
    if (!sampleFile) return;
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session — please start from Step 1."); return; }
    setUploadingSample(true);
    try {
      const res = await uploadSampleCv(sessionId, sampleFile);
      setSampleUploaded(true);
      toast.success(`Formatting reference saved (${res.characters.toLocaleString()} chars)`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Upload failed.";
      toast.error(msg);
    } finally { setUploadingSample(false); }
  }

  // ── Generate + download ───────────────────────────────────────────────────

  async function handleGenerate() {
    if (!selected && !sampleUploaded) {
      toast.error("Select a template to continue.");
      return;
    }
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session found."); return; }

    setExporting(true);
    try {
      if (selected) {
        await setSessionTemplate(sessionId, selected);
        localStorage.setItem("tailormycv_template_id", selected);
      }
      const boldKeywords = localStorage.getItem("tailormycv_bold_keywords") !== "false";
      const result = await exportResume(sessionId, canExportPdf, boldKeywords);
      setFiles(result);
      if (result.pdf_error) {
        toast(`PDF note: ${result.pdf_error}`, { icon: "⚠️", duration: 6000 });
      } else {
        toast.success("Resume ready to download!");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Export failed.";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }

  async function handleSaveToLibrary() {
    const sessionId = getSessionId();
    if (!sessionId) return;
    const name = getResumeFilename(generatedResume).replace(/_/g, " ");
    setSaving(true);
    try {
      await saveResumeFromSession(sessionId, `Tailored — ${name}`);
      setSaved(true);
      toast.success("Saved to your Resume Library.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Could not save to library.");
    } finally { setSaving(false); }
  }

  const filename = getResumeFilename(generatedResume);
  const hasFiles = !!(files?.docx_file_id || files?.pdf_file_id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Choose a Template</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {canUseAll
            ? `All ${ALL_TEMPLATES.length} templates available. Your tailored CV will be applied to the chosen design.`
            : `5 templates on Free — upgrade to Plus or Pro for all ${ALL_TEMPLATES.length}.`}
        </p>
      </div>

      {/* Large preview of selected template */}
      {selectedInfo && (
        <LargeTemplatePreview info={selectedInfo} data={previewData} />
      )}

      {/* Template gallery — all 15 */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {templatesWithPreview.map((info) => {
          const locked = !canUseAll && info.tier === "plus";
          return (
            <TemplateThumbnail
              key={info._id}
              info={info}
              isSelected={selected === info._id}
              locked={locked}
              onClick={() => !locked && setSelected(info._id)}
              data={previewData}
            />
          );
        })}
      </div>

      {/* Upgrade nudge for free users */}
      {!canUseAll && (
        <Link href="/settings/plan"
          className="card flex items-center gap-3 hover:border-brand-300 transition p-4">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
            <FiLock className="w-4 h-4 text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700">
              Unlock 10 more templates
              <span className="ml-1.5 text-[10px] font-semibold bg-brand-100 text-brand-700 rounded px-1.5 py-0.5">Plus+</span>
            </p>
            <p className="text-xs text-slate-500">Sidebar, Creative, Timeline, Two Column, Elegant and more.</p>
          </div>
          <FiZap className="w-4 h-4 text-brand-500 shrink-0" />
        </Link>
      )}

      {/* Sample CV — Pro only */}
      {isPro && (
        <div className="card p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <FiFile className="w-3.5 h-3.5 text-brand-500" />
            <span className="text-sm font-semibold text-slate-800">Formatting Reference</span>
            <span className="text-xs text-slate-400 ml-1">(optional)</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">Upload your own CV as a layout guide. The AI will mirror its section structure — without copying any content.</p>
          {!sampleFile ? (
            <div {...getSampleRootProps()}
              className={clsx("border-2 border-dashed rounded-lg py-4 text-center cursor-pointer transition",
                isSampleDrag ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400")}>
              <input {...getSampleInputProps()} />
              <FiUploadCloud className="w-5 h-5 mx-auto text-slate-400 mb-1" />
              <p className="text-sm font-medium text-slate-600">{isSampleDrag ? "Drop it here!" : "Drag & drop a CV"}</p>
              <p className="text-xs text-slate-400 mt-0.5">PDF or DOCX · max 5 MB</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
              <FiFile className="w-4 h-4 text-brand-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{sampleFile.name}</p>
                <p className="text-xs text-slate-400">{(sampleFile.size / 1024).toFixed(1)} KB</p>
              </div>
              {sampleUploaded ? (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium whitespace-nowrap">
                  <FiCheckCircle className="w-3.5 h-3.5" /> Saved
                </span>
              ) : (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setSampleFile(null)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
                  <button onClick={handleUploadSample} disabled={uploadingSample} className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50">
                    {uploadingSample ? "Saving…" : "Use as reference"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quality score (from preview step) */}
      {evalSummary && <QualityPanel evalSummary={evalSummary} />}

      {/* ── Generate + Download ── */}
      {hasFiles ? (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-700">
            <FiCheckCircle className="w-5 h-5 shrink-0" />
            <p className="font-semibold">Your resume is ready to download!</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {files?.docx_file_id && (
              <a href={downloadUrl(files.docx_file_id)} download={`${filename}.docx`}
                className="flex items-center justify-center gap-2 btn-primary py-3">
                <FiDownload className="w-4 h-4" /> Download DOCX
              </a>
            )}
            {files?.pdf_file_id && (
              <a href={downloadUrl(files.pdf_file_id)} download={`${filename}.pdf`}
                className="flex items-center justify-center gap-2 btn-secondary py-3">
                <FiDownload className="w-4 h-4" /> Download PDF
              </a>
            )}
            {!canExportPdf && (
              <Link href="/settings/plan"
                className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-3 text-sm text-brand-600 font-medium hover:border-brand-300 transition">
                <FiLock className="w-4 h-4" /> PDF — Plus / Pro
              </Link>
            )}
          </div>

          {canSaveLibrary && (
            <button onClick={handleSaveToLibrary} disabled={saving || saved}
              className="w-full btn-secondary py-2.5 flex items-center justify-center gap-2">
              {saved
                ? <><FiCheckCircle className="w-4 h-4 text-teal-500" /> Saved to Library</>
                : saving
                ? <><FiRefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
                : <><FiBookmark className="w-4 h-4" /> Save to Resume Library</>}
            </button>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={handleGenerate} disabled={exporting}
              className="flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-brand-600 border border-slate-200 rounded-xl py-2.5 transition disabled:opacity-50">
              <FiRefreshCw className={`w-3.5 h-3.5 ${exporting ? "animate-spin" : ""}`} />
              Regenerate
            </button>
            <Link href="/builder/upload"
              className="flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-brand-600 border border-slate-200 rounded-xl py-2.5 transition">
              Start New Resume →
            </Link>
          </div>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={exporting || (!selected && !sampleUploaded)}
          className="w-full btn-primary py-4 text-base flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exporting
            ? <><FiRefreshCw className="w-5 h-5 animate-spin" /> Generating files…</>
            : <><FiDownload className="w-5 h-5" /> Generate &amp; Download</>}
        </button>
      )}

      {/* Back */}
      {!hasFiles && (
        <div className="flex justify-start pb-2">
          <button onClick={() => router.back()} className="btn-secondary">← Back</button>
        </div>
      )}

    </div>
  );
}

// ── Quality score panel ───────────────────────────────────────────────────────

function QualityPanel({ evalSummary }: { evalSummary: EvalSummary }) {
  const { min_score, pass_threshold, all_passed, evaluator_results, cycles } = evalSummary;
  const delta = min_score - pass_threshold;
  const label  = delta >= 30 ? "Excellent" : delta >= 10 ? "Strong" : delta >= 0 ? "Good" : "Reviewed";
  const colors = delta >= 30
    ? { bg: "bg-green-50",  border: "border-green-200", badge: "bg-green-100 text-green-700",  bar: "bg-green-500"  }
    : delta >= 10
    ? { bg: "bg-teal-50",   border: "border-teal-200",  badge: "bg-teal-100  text-teal-700",   bar: "bg-teal-500"   }
    : delta >= 0
    ? { bg: "bg-blue-50",   border: "border-blue-200",  badge: "bg-blue-100  text-blue-700",   bar: "bg-blue-500"   }
    : { bg: "bg-slate-50",  border: "border-slate-200", badge: "bg-slate-100 text-slate-600",  bar: "bg-slate-400"  };

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <FiAward className="w-5 h-5 text-slate-500 shrink-0" />
        <p className="font-semibold text-slate-700 text-sm">Resume Quality</p>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>{label}</span>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 bg-white/70 rounded-full overflow-hidden border border-white">
          <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${Math.min(100, Math.max(0, min_score))}%` }} />
        </div>
        <span className="text-sm font-bold text-slate-700 shrink-0">{min_score}<span className="text-xs font-normal text-slate-400">/100</span></span>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span>{evaluator_results.length} evaluator{evaluator_results.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{cycles} cycle{cycles !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{all_passed ? "All evaluators passed" : "Best version selected"}</span>
      </div>
    </div>
  );
}
