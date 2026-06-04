"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";
import {
  uploadSampleCv, exportResume, downloadUrl,
  setSessionTemplate, saveResumeFromSession,
  type GeneratedResume, type EvalSummary,
} from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import Link from "next/link";
import clsx from "clsx";
import {
  FiUploadCloud, FiCheckCircle, FiFile, FiLock, FiZap,
  FiDownload, FiRefreshCw, FiBookmark, FiX,
} from "react-icons/fi";
import {
  CATEGORY_COLORS, CATEGORY_HEADER, useCvTemplateInfos,
  type PreviewData, type TemplateInfo,
} from "@/components/TemplatePreviews";
import { getTemplateHtml } from "@/lib/templateHtml";
import { EvalQualityPanel } from "@/components/EvalQualityPanel";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPreviewData(resume: GeneratedResume): PreviewData {
  const skills: string[] =
    resume.skills?.length
      ? resume.skills
      : (resume.sections?.find(s => s.title.toLowerCase().includes("skill"))?.items ?? []);
  return {
    name:     resume.name                   || "",
    title:    resume.experience?.[0]?.role  || "",
    email:    resume.contact?.email         || "",
    phone:    resume.contact?.phone         || "",
    location: resume.contact?.location      || "",
    linkedin: resume.contact?.linkedin      || "",
    summary:  resume.summary                || "",
    skills,
    experience: resume.experience?.length
      ? resume.experience.map(e => ({ title: e.role, company: e.company, date: e.dates, bullets: e.bullets }))
      : [],
    education: resume.education?.length
      ? resume.education.map(e => ({ degree: e.degree, school: e.institution, year: e.dates }))
      : [],
  };
}

function getFilename(resume: GeneratedResume | null): string {
  if (resume?.name) return resume.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return "resume";
}

type ExportResult = { docx_file_id?: string; pdf_file_id?: string; pdf_error?: string };
type TemplateWithId = TemplateInfo & { _id: string };

// ── Gallery card — accent-colour header strip, text visible at a glance ─────

function GalleryCard({
  info, isSelected, locked, onPreview,
}: {
  info: TemplateWithId; isSelected: boolean; locked: boolean; onPreview: () => void;
}) {
  return (
    <button
      onClick={onPreview}
      disabled={locked}
      className={clsx(
        "relative flex flex-col text-left rounded-2xl overflow-hidden border-2 transition group",
        locked
          ? "opacity-50 cursor-not-allowed border-slate-200 bg-white"
          : isSelected
          ? "border-brand-500 shadow-lg scale-[1.02]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5",
      )}
    >
      {/* Coloured header strip — shows template accent colour */}
      <div
        className="h-14 w-full flex items-end pb-2.5 px-3 shrink-0"
        style={{ background: info.accentColor }}
      >
        <div className="space-y-1 w-full">
          <div className="bg-white/80 h-2 w-28 rounded-full" />
          <div className="bg-white/40 h-1 w-16 rounded-full" />
        </div>
        {isSelected && !locked && (
          <FiCheckCircle className="w-4 h-4 text-white absolute top-2.5 right-2.5 shrink-0" />
        )}
        {locked && (
          <FiLock className="w-3.5 h-3.5 text-white/70 absolute top-2.5 right-2.5 shrink-0" />
        )}
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-center gap-1 mb-1.5 flex-wrap">
          <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", CATEGORY_COLORS[info.category])}>
            {info.category}
          </span>
          <span className="text-[9px] font-medium text-slate-400">{info.pages}p</span>
        </div>
        <p className="text-xs font-bold text-slate-900 leading-tight mb-1">{info.name}</p>
        <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 flex-1">{info.description}</p>
        {!locked ? (
          <p className={clsx("text-[9px] font-semibold mt-2 transition",
            isSelected ? "text-brand-600" : "text-slate-300 group-hover:text-brand-400")}>
            {isSelected ? "✓ Selected" : "Click to preview"}
          </p>
        ) : (
          <Link href="/settings/plan" onClick={e => e.stopPropagation()}
            className="text-[9px] font-semibold text-brand-500 hover:underline mt-2">
            Plus / Pro
          </Link>
        )}
      </div>
    </button>
  );
}

// ── Template detail view — large preview + all info ───────────────────────────

// ── Template modal — full-screen overlay matching competitor design ───────────

function TemplateModal({
  info, previewData, isSelected, onSelect, onClose,
}: {
  info: TemplateWithId; previewData: PreviewData | null;
  isSelected: boolean; onSelect: () => void; onClose: () => void;
}) {
  const SCALE    = 0.62;
  const IFRAME_W = 794;
  const PREVIEW_W = Math.round(IFRAME_W * SCALE);
  const PREVIEW_H = Math.round(IFRAME_W * 1.414 * SCALE);
  const html = previewData ? getTemplateHtml(info.key, previewData) : "";
  const isPersonalised = !!(previewData?.name);
  const hdr = CATEGORY_HEADER[info.category] ?? CATEGORY_HEADER["Classic"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden flex max-w-5xl w-full max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left: live preview ── */}
        <div className="bg-slate-100 flex items-start justify-center p-6 shrink-0 overflow-y-auto">
          <div
            className="rounded-lg shadow-xl overflow-hidden border border-slate-200"
            style={{ width: PREVIEW_W, height: PREVIEW_H, position: "relative", background: "#fff" }}
          >
            <iframe
              srcDoc={html}
              sandbox="allow-same-origin"
              scrolling="no"
              title={`${info.name} preview`}
              style={{
                position: "absolute", top: 0, left: 0,
                width: IFRAME_W,
                height: Math.round(IFRAME_W * 1.414),
                border: "none",
                transform: `scale(${SCALE})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        {/* ── Right: info panel ── */}
        <div className="flex-1 flex flex-col overflow-y-auto">

          {/* Coloured header — category colour matches gallery card */}
          <div className={clsx("px-6 pt-5 pb-4 shrink-0", hdr.bg)}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx("text-[10px] font-bold px-2.5 py-0.5 rounded-full", hdr.badge)}>
                  {info.category}
                </span>
                <span className="text-[10px] font-medium text-white/70">
                  {info.pages}-page
                </span>
                {info.tier === "plus" && (
                  <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">Plus+</span>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition shrink-0"
              >
                <FiX className="w-4 h-4 text-white" />
              </button>
            </div>
            <h2 className={clsx("text-2xl font-bold mt-2 leading-tight", hdr.text)}>{info.name}</h2>
            <p className="text-sm text-white/80 mt-1 leading-relaxed">{info.description}</p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-5 flex-1">

            {/* Colour */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Template Colour</p>
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full border-2 border-white shadow-sm"
                  style={{ background: info.accentColor, outline: `2px solid ${info.accentColor}`, outlineOffset: 1 }}
                />
                <span className="text-xs text-slate-500 font-medium">Primary accent</span>
              </div>
            </div>

            {/* Features */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Features</p>
              <ul className="space-y-2">
                {info.traits.map(trait => (
                  <li key={trait} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <FiCheckCircle className="w-4 h-4 shrink-0" style={{ color: info.accentColor }} />
                    {trait}
                  </li>
                ))}
              </ul>
            </div>

            {/* Best for */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Best For</p>
              <div className="flex flex-wrap gap-1.5">
                {info.bestFor.split(",").map(s => (
                  <span key={s}
                    className="text-xs font-medium px-3 py-1 rounded-full border"
                    style={{ color: info.accentColor, borderColor: info.accentColor, background: `${info.accentColor}12` }}
                  >
                    {s.trim()}
                  </span>
                ))}
              </div>
            </div>

            {/* Preview note */}
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0",
                isPersonalised ? "bg-brand-500" : "bg-slate-300")} />
              {isPersonalised ? "Showing your tailored CV content" : "Sample content — replaced with your CV on export"}
            </p>
          </div>

          {/* CTAs */}
          <div className="px-6 pb-6 pt-2 space-y-2 shrink-0 border-t border-slate-100">
            <button
              onClick={onSelect}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98]"
              style={{ background: info.accentColor }}
            >
              {isSelected
                ? <><FiCheckCircle className="w-4 h-4" /> Selected — click Generate &amp; Download below</>
                : <>Use this template →</>}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition"
            >
              Back to gallery
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

  const [selected, setSelected]               = useState<string | null>(null);
  const [detailId, setDetailId]               = useState<string | null>(null); // which template is previewed
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null);
  const [evalSummary, setEvalSummary]         = useState<EvalSummary | null>(null);
  const [previewData, setPreviewData]         = useState<PreviewData | null>(null);

  const [exporting, setExporting] = useState(false);
  const [files, setFiles]         = useState<ExportResult | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  // Sample CV (Pro)
  const [sampleFile, setSampleFile]           = useState<File | null>(null);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [sampleUploaded, setSampleUploaded]   = useState(false);

  const templates = useCvTemplateInfos();
  // Each gallery card's id is its cv_template key — exported as selected_template_id.
  const templatesWithId: TemplateWithId[] = templates.map(info => ({ ...info, _id: info.key }));

  const detailInfo   = detailId   ? (templatesWithId.find(t => t._id === detailId)   ?? null) : null;
  const selectedInfo = selected   ? (templatesWithId.find(t => t._id === selected)   ?? null) : null;

  useEffect(() => {
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
    const savedTemplate = localStorage.getItem("tailormycv_template_id");
    if (savedTemplate) setSelected(savedTemplate);
  }, []);

  const onDropSample = useCallback((files: File[]) => { if (files[0]) setSampleFile(files[0]); }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
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
    if (!sessionId) { toast.error("No session."); return; }
    setUploadingSample(true);
    try {
      const res = await uploadSampleCv(sessionId, sampleFile);
      setSampleUploaded(true);
      toast.success(`Formatting reference saved (${res.characters.toLocaleString()} chars)`);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Upload failed.");
    } finally { setUploadingSample(false); }
  }

  async function handleGenerate() {
    if (!selected && !sampleUploaded) { toast.error("Select a template to continue."); return; }
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
      if (result.pdf_error) toast(`PDF note: ${result.pdf_error}`, { icon: "⚠️", duration: 6000 });
      else toast.success("Resume ready to download!");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Export failed.");
    } finally { setExporting(false); }
  }

  async function handleSaveToLibrary() {
    const sessionId = getSessionId();
    if (!sessionId) return;
    const name = getFilename(generatedResume).replace(/_/g, " ");
    setSaving(true);
    try {
      await saveResumeFromSession(sessionId, `Tailored — ${name}`);
      setSaved(true);
      toast.success("Saved to your Resume Library.");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Could not save.");
    } finally { setSaving(false); }
  }

  const filename = getFilename(generatedResume);
  const hasFiles = !!(files?.docx_file_id || files?.pdf_file_id);

  // ── Download screen ───────────────────────────────────────────────────────

  if (hasFiles) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h1 className="text-2xl font-bold text-slate-900">Your Resume is Ready!</h1>
          <p className="text-sm text-slate-500 mt-1">
            {selectedInfo ? `Generated with the ${selectedInfo.name} template.` : "Your tailored resume is ready."}
          </p>
        </div>

        {evalSummary && <EvalQualityPanel evalSummary={evalSummary} />}

        <div className="card p-5 space-y-3">
          {files?.docx_file_id && (
            <a href={downloadUrl(files.docx_file_id)} download={`${filename}.docx`}
              className="w-full flex items-center justify-center gap-2 btn-primary py-3 text-base">
              <FiDownload className="w-5 h-5" /> Download Word (.docx)
            </a>
          )}
          {files?.pdf_file_id && (
            <a href={downloadUrl(files.pdf_file_id)} download={`${filename}.pdf`}
              className="w-full flex items-center justify-center gap-2 btn-secondary py-3">
              <FiDownload className="w-4 h-4" /> Download PDF
            </a>
          )}
          {!canExportPdf && (
            <Link href="/settings/plan"
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-3 text-sm text-brand-600 font-medium hover:border-brand-300 transition">
              <FiLock className="w-4 h-4" /> PDF export — Plus / Pro
            </Link>
          )}
          {canSaveLibrary && (
            <button onClick={handleSaveToLibrary} disabled={saving || saved}
              className="w-full btn-secondary py-2.5 flex items-center justify-center gap-2">
              {saved ? <><FiCheckCircle className="w-4 h-4 text-teal-500" /> Saved to Library</>
                : saving ? <><FiRefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
                : <><FiBookmark className="w-4 h-4" /> Save to Resume Library</>}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setFiles(null); setSaved(false); setDetailId(null); }}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 transition"
          >
← Different template
          </button>
          <Link href="/builder/upload"
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 transition">
            New Resume →
          </Link>
        </div>
      </div>
    );
  }

  // ── Gallery + modal overlay ───────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Modal overlay — renders over the gallery */}
      {detailInfo && (
        <TemplateModal
          info={detailInfo}
          previewData={previewData}
          isSelected={selected === detailInfo._id}
          onSelect={() => { setSelected(detailInfo._id); setDetailId(null); }}
          onClose={() => setDetailId(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Choose a Template</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {canUseAll
            ? `All ${templates.length} templates — click any to preview with your CV content.`
            : `5 free templates · ${templates.length - 5} more on Plus / Pro — click to preview.`}
        </p>
      </div>

      {/* Selected template banner */}
      {selectedInfo && (
        <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
          <FiCheckCircle className="w-4 h-4 text-brand-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-800">
              {selectedInfo.name} selected
            </p>
            <p className="text-xs text-brand-600">{selectedInfo.description}</p>
          </div>
          <button onClick={() => setDetailId(selectedInfo._id)}
            className="text-xs font-semibold text-brand-600 hover:underline shrink-0">
            Change
          </button>
        </div>
      )}

      {/* Template gallery */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {templatesWithId.map((info) => {
          const locked = !canUseAll && info.tier === "plus";
          return (
            <GalleryCard
              key={info._id}
              info={info}
              isSelected={selected === info._id}
              locked={locked}
              onPreview={() => !locked && setDetailId(info._id)}
            />
          );
        })}
      </div>

      {/* Upgrade nudge */}
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
      {isPro && <SampleCvCard
        sampleFile={sampleFile} setSampleFile={setSampleFile}
        uploadingSample={uploadingSample} sampleUploaded={sampleUploaded}
        onUpload={handleUploadSample}
        getRootProps={getRootProps} getInputProps={getInputProps} isDragActive={isDragActive}
      />}

      {evalSummary && <EvalQualityPanel evalSummary={evalSummary} />}

      {/* Generate */}
      <button
        onClick={handleGenerate}
        disabled={exporting || (!selected && !sampleUploaded)}
        className="w-full btn-primary py-4 text-base flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {exporting
          ? <><FiRefreshCw className="w-5 h-5 animate-spin" /> Generating files…</>
          : <><FiDownload className="w-5 h-5" /> Generate &amp; Download</>}
      </button>

      <div className="flex justify-start pb-2">
        <button onClick={() => router.back()} className="btn-secondary">← Back</button>
      </div>
    </div>
  );
}

// ── Sample CV card (extracted for reuse in both gallery + detail view) ─────────

function SampleCvCard({
  sampleFile, setSampleFile, uploadingSample, sampleUploaded,
  onUpload, getRootProps, getInputProps, isDragActive,
}: {
  sampleFile: File | null;
  setSampleFile: (f: File | null) => void;
  uploadingSample: boolean;
  sampleUploaded: boolean;
  onUpload: () => void;
  getRootProps: () => object;
  getInputProps: () => object;
  isDragActive: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <FiFile className="w-3.5 h-3.5 text-brand-500" />
        <span className="text-sm font-semibold text-slate-800">Formatting Reference</span>
        <span className="text-xs text-slate-400 ml-1">(optional — overrides template)</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Upload your own CV as a layout guide. The AI mirrors its section structure without copying content.</p>
      {!sampleFile ? (
        <div {...getRootProps()}
          className={clsx("border-2 border-dashed rounded-lg py-4 text-center cursor-pointer transition",
            isDragActive ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400")}>
          <input {...getInputProps()} />
          <FiUploadCloud className="w-5 h-5 mx-auto text-slate-400 mb-1" />
          <p className="text-sm font-medium text-slate-600">{isDragActive ? "Drop it here!" : "Drag & drop a CV"}</p>
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
              <button onClick={onUpload} disabled={uploadingSample}
                className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50">
                {uploadingSample ? "Saving…" : "Use as reference"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

