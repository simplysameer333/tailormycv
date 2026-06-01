"use client";
import { useEffect, useState, useCallback } from "react";
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
  FiDownload, FiRefreshCw, FiBookmark, FiAward, FiArrowLeft,
} from "react-icons/fi";
import {
  ALL_TEMPLATES, SAMPLE, CATEGORY_COLORS,
  type PreviewData, type TemplateInfo,
} from "@/components/TemplatePreviews";
import { getTemplateHtml } from "@/lib/templateHtml";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function getFilename(resume: GeneratedResume | null): string {
  if (resume?.name) return resume.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return "resume";
}

type ExportResult = { docx_file_id?: string; pdf_file_id?: string; pdf_error?: string };
type TemplateWithId = TemplateInfo & { _id: string };

// ── Gallery card — lightweight, no iframe ─────────────────────────────────────

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
        "relative flex flex-col text-left rounded-xl border-2 p-3 transition group",
        locked
          ? "opacity-50 cursor-not-allowed border-slate-200 bg-white"
          : isSelected
          ? "border-brand-500 bg-brand-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      {isSelected && !locked && (
        <div className="absolute top-2 right-2">
          <FiCheckCircle className="w-3.5 h-3.5 text-brand-500" />
        </div>
      )}
      {locked && (
        <div className="absolute top-2 right-2">
          <FiLock className="w-3 h-3 text-slate-400" />
        </div>
      )}

      {/* Category + pages */}
      <div className="flex items-center gap-1 mb-1.5 pr-4 flex-wrap">
        <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0", CATEGORY_COLORS[info.category])}>
          {info.category}
        </span>
        <span className={clsx("text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0",
          info.pages === 1 ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500")}>
          {info.pages}p
        </span>
      </div>

      <p className="text-xs font-semibold text-slate-900 mb-1 leading-snug">{info.name}</p>
      <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">{info.bestFor}</p>

      {/* Preview hover hint */}
      {!locked && (
        <p className={clsx(
          "text-[9px] font-semibold mt-1.5 transition",
          isSelected ? "text-brand-500" : "text-slate-300 group-hover:text-brand-400",
        )}>
          {isSelected ? "Selected ✓" : "Click to preview"}
        </p>
      )}
      {locked && (
        <Link href="/settings/plan" onClick={e => e.stopPropagation()}
          className="text-[9px] font-semibold text-brand-500 hover:underline mt-1.5">
          Plus / Pro
        </Link>
      )}
    </button>
  );
}

// ── Template detail view — large preview + all info ───────────────────────────

function TemplateDetail({
  info, previewData, isSelected, onSelect, onBack,
}: {
  info: TemplateWithId;
  previewData: PreviewData;
  isSelected: boolean;
  onSelect: () => void;
  onBack: () => void;
}) {
  const SCALE = 0.52;
  const IFRAME_W = 794;
  const PREVIEW_W = Math.round(IFRAME_W * SCALE);   // ≈ 413px
  const PREVIEW_H = Math.round(IFRAME_W * 1.414 * SCALE); // ≈ 584px
  const html = getTemplateHtml(info.key, previewData);
  const isPersonalised = previewData.name !== SAMPLE.name;

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 transition">
        <FiArrowLeft className="w-4 h-4" /> Back to gallery
      </button>

      {/* Main detail panel */}
      <div className="card p-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row">

          {/* Left — live preview */}
          <div className="bg-slate-50 flex items-center justify-center p-5 sm:p-6 border-b sm:border-b-0 sm:border-r border-slate-100 shrink-0">
            <div className="rounded-lg shadow-lg overflow-hidden border border-slate-200"
                 style={{ width: PREVIEW_W, height: PREVIEW_H, position: "relative", background: "#fff" }}>
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

          {/* Right — template info */}
          <div className="flex-1 p-5 sm:p-6 flex flex-col gap-4">

            {/* Header */}
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={clsx("text-xs font-bold px-2 py-0.5 rounded-full", CATEGORY_COLORS[info.category])}>
                  {info.category}
                </span>
                <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full",
                  info.pages === 1 ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500")}>
                  {info.pages}-page
                </span>
                {info.tier === "plus" && (
                  <span className="text-[10px] font-semibold bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded">Plus+</span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-slate-900">{info.name}</h2>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{info.description}</p>
            </div>

            {/* Features / traits */}
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Features</p>
              <ul className="space-y-1.5">
                {info.traits.map(trait => (
                  <li key={trait} className="flex items-center gap-2 text-sm text-slate-700">
                    <FiCheckCircle className="w-4 h-4 text-brand-500 shrink-0" />
                    {trait}
                  </li>
                ))}
              </ul>
            </div>

            {/* Best for */}
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Best for</p>
              <div className="flex flex-wrap gap-1.5">
                {info.bestFor.split(",").map(s => (
                  <span key={s} className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 font-medium">
                    {s.trim()}
                  </span>
                ))}
              </div>
            </div>

            {/* Preview note */}
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-auto">
              <span className={clsx("w-1.5 h-1.5 rounded-full inline-block shrink-0",
                isPersonalised ? "bg-brand-500" : "bg-slate-300")} />
              {isPersonalised
                ? "Live preview — showing your tailored CV content"
                : "Sample preview — your CV will replace this content"}
            </p>

            {/* CTAs */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={onSelect}
                className={clsx(
                  "w-full py-3 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2",
                  isSelected
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "bg-brand-600 text-white hover:bg-brand-700",
                )}
              >
                {isSelected
                  ? <><FiCheckCircle className="w-4 h-4" /> Template selected — continue below</>
                  : <>Use this template →</>}
              </button>
              <button onClick={onBack}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:border-brand-300 hover:text-brand-600 transition">
                Back to gallery
              </button>
            </div>

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

  const [dbTemplates, setDbTemplates]         = useState<Template[]>([]);
  const [selected, setSelected]               = useState<string | null>(null);
  const [detailId, setDetailId]               = useState<string | null>(null); // which template is previewed
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null);
  const [evalSummary, setEvalSummary]         = useState<EvalSummary | null>(null);
  const [previewData, setPreviewData]         = useState<PreviewData>(SAMPLE);

  const [exporting, setExporting] = useState(false);
  const [files, setFiles]         = useState<ExportResult | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  // Sample CV (Pro)
  const [sampleFile, setSampleFile]           = useState<File | null>(null);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [sampleUploaded, setSampleUploaded]   = useState(false);

  const templatesWithId: TemplateWithId[] = ALL_TEMPLATES.map(info => {
    const dbMatch = dbTemplates.find(t => t.name === info.key || t.name === info.name);
    return { ...info, _id: dbMatch?._id ?? info.key };
  });

  const detailInfo   = detailId   ? (templatesWithId.find(t => t._id === detailId)   ?? null) : null;
  const selectedInfo = selected   ? (templatesWithId.find(t => t._id === selected)   ?? null) : null;

  useEffect(() => {
    listTemplates().then(setDbTemplates).catch(() => {});
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

        {evalSummary && <QualityPanel evalSummary={evalSummary} />}

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
            <FiArrowLeft className="w-4 h-4" /> Different template
          </button>
          <Link href="/builder/upload"
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 transition">
            New Resume →
          </Link>
        </div>
      </div>
    );
  }

  // ── Detail view — shown when user clicks a template card ─────────────────

  if (detailInfo) {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <TemplateDetail
          info={detailInfo}
          previewData={previewData}
          isSelected={selected === detailInfo._id}
          onSelect={() => {
            setSelected(detailInfo._id);
            setDetailId(null); // back to gallery with this template selected
          }}
          onBack={() => setDetailId(null)}
        />

        {/* Sample CV + Generate — accessible from detail view after selecting */}
        {selected === detailInfo._id && (
          <div className="space-y-4">
            {isPro && <SampleCvCard
              sampleFile={sampleFile} setSampleFile={setSampleFile}
              uploadingSample={uploadingSample} sampleUploaded={sampleUploaded}
              onUpload={handleUploadSample}
              getRootProps={getRootProps} getInputProps={getInputProps} isDragActive={isDragActive}
            />}
            {evalSummary && <QualityPanel evalSummary={evalSummary} />}
            <button
              onClick={handleGenerate}
              disabled={exporting}
              className="w-full btn-primary py-4 text-base flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {exporting
                ? <><FiRefreshCw className="w-5 h-5 animate-spin" /> Generating files…</>
                : <><FiDownload className="w-5 h-5" /> Generate &amp; Download</>}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Gallery view ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Choose a Template</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {canUseAll
            ? `All ${ALL_TEMPLATES.length} templates — click any to preview with your CV content.`
            : `5 free templates · ${ALL_TEMPLATES.length - 5} more on Plus / Pro — click to preview.`}
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

      {evalSummary && <QualityPanel evalSummary={evalSummary} />}

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

// ── Quality panel ─────────────────────────────────────────────────────────────

function QualityPanel({ evalSummary }: { evalSummary: EvalSummary }) {
  const { min_score, pass_threshold, all_passed, evaluator_results, cycles } = evalSummary;
  const delta = min_score - pass_threshold;
  const label  = delta >= 30 ? "Excellent" : delta >= 10 ? "Strong" : delta >= 0 ? "Good" : "Reviewed";
  const colors = delta >= 30
    ? { bg: "bg-green-50", border: "border-green-200", badge: "bg-green-100 text-green-700", bar: "bg-green-500" }
    : delta >= 10
    ? { bg: "bg-teal-50",  border: "border-teal-200",  badge: "bg-teal-100 text-teal-700",   bar: "bg-teal-500"  }
    : delta >= 0
    ? { bg: "bg-blue-50",  border: "border-blue-200",  badge: "bg-blue-100 text-blue-700",   bar: "bg-blue-500"  }
    : { bg: "bg-slate-50", border: "border-slate-200", badge: "bg-slate-100 text-slate-600", bar: "bg-slate-400" };
  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <FiAward className="w-5 h-5 text-slate-500 shrink-0" />
        <p className="font-semibold text-slate-700 text-sm">Resume Quality</p>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>{label}</span>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-2 bg-white/70 rounded-full overflow-hidden border border-white">
          <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${Math.min(100, Math.max(0, min_score))}%` }} />
        </div>
        <span className="text-sm font-bold text-slate-700 shrink-0">{min_score}<span className="text-xs font-normal text-slate-400">/100</span></span>
      </div>
      <p className="text-xs text-slate-500">
        {evaluator_results.length} evaluator{evaluator_results.length !== 1 ? "s" : ""} · {cycles} cycle{cycles !== 1 ? "s" : ""} · {all_passed ? "All passed" : "Best version selected"}
      </p>
    </div>
  );
}
