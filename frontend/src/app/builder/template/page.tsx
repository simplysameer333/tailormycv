"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";
import { listTemplates, uploadSampleCv, type Template } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import Link from "next/link";
import clsx from "clsx";
import { FiUploadCloud, FiCheckCircle, FiFile, FiFileText, FiLayers, FiLock, FiZap } from "react-icons/fi";

type OutputFormat = "docx" | "pdf" | "both";

const FORMAT_OPTIONS: { value: OutputFormat; label: string; sub: string; icon: React.ElementType }[] = [
  { value: "docx", label: "DOCX", sub: "Word document", icon: FiFileText },
  { value: "pdf",  label: "PDF",  sub: "PDF document",  icon: FiFile },
  { value: "both", label: "Both", sub: "DOCX + PDF",    icon: FiLayers },
];

const LS_INSTRUCTIONS  = "tailormycv_instructions";
const LS_OUTPUT_FORMAT = "tailormycv_output_format";

// ── Template mini-previews ────────────────────────────────────────────────────
// Each component renders a scaled-down visual mockup of the actual DOCX design.

function CleanPreview() {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1.5 font-sans text-[5px] leading-tight select-none overflow-hidden">
      {/* Name */}
      <div className="font-bold text-[8px] text-gray-900">Jane Smith</div>
      {/* Contact */}
      <div className="text-gray-500 flex gap-1 flex-wrap">
        <span>jane@email.com</span><span className="text-gray-300">|</span>
        <span>+44 7700 900000</span><span className="text-gray-300">|</span>
        <span>London</span>
      </div>
      {/* Rule */}
      <div className="border-t border-gray-200 mt-0.5" />
      {/* Section heading */}
      <div className="font-bold text-gray-800 tracking-wide uppercase text-[5.5px] mt-0.5">Summary</div>
      <div className="border-t border-gray-200" />
      <div className="text-gray-600 leading-snug">
        Experienced software engineer with 8 years building scalable systems. Delivered critical infrastructure at Google serving 50M users.
      </div>
      {/* Section heading */}
      <div className="font-bold text-gray-800 tracking-wide uppercase text-[5.5px] mt-1">Experience</div>
      <div className="border-t border-gray-200" />
      <div className="text-gray-700 font-semibold">Senior Engineer — Google</div>
      <div className="text-gray-500">2020 – 2024</div>
      <div className="text-gray-600 pl-1">• Led migration of 50TB database with zero downtime</div>
      <div className="text-gray-600 pl-1">• Reduced latency by 40% across 3 AWS regions</div>
      {/* Section heading */}
      <div className="font-bold text-gray-800 tracking-wide uppercase text-[5.5px] mt-1">Skills</div>
      <div className="border-t border-gray-200" />
      <div className="text-gray-600">Python • TypeScript • AWS • PostgreSQL • Kubernetes</div>
    </div>
  );
}

function ModernPreview() {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1 font-sans text-[5px] leading-tight select-none overflow-hidden">
      {/* Name — large blue */}
      <div className="font-bold text-[10px] text-[#2B579A]">Jane Smith</div>
      {/* Contact — teal dots */}
      <div className="text-[#0D9488] flex gap-1 flex-wrap text-[4.5px]">
        <span>jane@email.com</span><span className="text-gray-300">·</span>
        <span>+44 7700 900000</span><span className="text-gray-300">·</span>
        <span>London</span><span className="text-gray-300">·</span>
        <span>linkedin.com/in/jane</span>
      </div>
      {/* Thick blue rule */}
      <div className="border-t-2 border-[#2B579A] mt-1 mb-0.5" />
      {/* Section heading — blue */}
      <div className="font-bold text-[#2B579A] text-[6px]">Professional Summary</div>
      <div className="border-t border-[#2B579A] mb-0.5" />
      <div className="text-gray-700 leading-snug">
        Experienced software engineer with 8 years building scalable systems. Delivered critical infrastructure at Google serving 50M users.
      </div>
      {/* Section heading */}
      <div className="font-bold text-[#2B579A] text-[6px] mt-1">Experience</div>
      <div className="border-t border-[#2B579A] mb-0.5" />
      <div className="text-gray-800 font-semibold text-[5.5px]">Senior Engineer · Google</div>
      <div className="text-gray-500 italic text-[4.5px]">2020 – 2024</div>
      <div className="text-gray-700 pl-1">• Led migration of 50TB database with zero downtime</div>
      <div className="text-gray-700 pl-1">• Reduced latency by 40% across 3 AWS regions</div>
      {/* Section heading */}
      <div className="font-bold text-[#2B579A] text-[6px] mt-1">Skills & Certifications</div>
      <div className="border-t border-[#2B579A] mb-0.5" />
      <div className="text-gray-700">• Python  • TypeScript  • AWS  • PostgreSQL</div>
    </div>
  );
}

function ExecutivePreview() {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1 font-serif text-[5px] leading-tight select-none overflow-hidden">
      {/* Top rule */}
      <div className="border-t-2 border-gray-900 mb-0.5" />
      {/* Name — centered, large */}
      <div className="font-bold text-[9px] text-gray-900 text-center tracking-wide">JANE SMITH</div>
      {/* Contact — centered */}
      <div className="text-gray-500 text-center flex justify-center gap-1 flex-wrap text-[4.5px]">
        <span>jane@email.com</span><span className="text-gray-300">—</span>
        <span>+44 7700 900000</span><span className="text-gray-300">—</span>
        <span>London</span>
      </div>
      {/* Bottom double rule */}
      <div className="border-t-2 border-gray-900 mt-1 mb-1" />
      {/* Section heading */}
      <div className="font-bold text-gray-900 uppercase tracking-widest text-[5px]">Professional Summary</div>
      <div className="border-t border-b border-gray-600 py-0.5 mb-0.5" />
      <div className="text-gray-700 leading-snug">
        Experienced software engineer with 8 years building scalable systems. Delivered critical infrastructure at Google serving 50M users.
      </div>
      {/* Section heading */}
      <div className="font-bold text-gray-900 uppercase tracking-widest text-[5px] mt-1">Professional Experience</div>
      <div className="border-t border-b border-gray-600 py-0.5 mb-0.5" />
      <div className="text-gray-800 font-bold text-[5.5px]">Senior Engineer — Google</div>
      <div className="text-gray-500 italic text-[4.5px]">2020 – 2024</div>
      <div className="text-gray-700 pl-1">• Led migration of 50TB database with zero downtime</div>
      <div className="text-gray-700 pl-1">• Reduced latency by 40% across 3 AWS regions</div>
    </div>
  );
}

const TEMPLATE_PREVIEWS: Record<string, { component: React.FC; traits: string[] }> = {
  Clean: {
    component: CleanPreview,
    traits: ["Calibri font", "Monochrome", "ATS-optimised"],
  },
  Modern: {
    component: ModernPreview,
    traits: ["Blue accents", "Contemporary", "Tech & creative"],
  },
  Executive: {
    component: ExecutivePreview,
    traits: ["Georgia serif", "Centred header", "Senior & C-suite"],
  },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatePage() {
  useStepGuard("template");
  const router = useRouter();
  const { data: session } = useAuth();
  const isPro = hasFeature(session?.user?.tier ?? "free", "sample_cv");
  const [templates, setTemplates]             = useState<Template[]>([]);
  const [selected, setSelected]               = useState<string | null>(null);
  const [instructions, setInstructions]       = useState("");
  const [sampleFile, setSampleFile]           = useState<File | null>(null);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [sampleUploaded, setSampleUploaded]   = useState(false);
  const [outputFormat, setOutputFormat]       = useState<OutputFormat>("docx");

  useEffect(() => {
    listTemplates().then(setTemplates).catch(() => toast.error("Could not load templates."));
    const saved = localStorage.getItem(LS_INSTRUCTIONS);
    if (saved) setInstructions(saved);
    const savedFmt = localStorage.getItem(LS_OUTPUT_FORMAT) as OutputFormat | null;
    if (savedFmt) setOutputFormat(savedFmt);
  }, []);

  const onDropSample = useCallback((files: File[]) => {
    if (files[0]) setSampleFile(files[0]);
  }, []);

  const { getRootProps: getSampleRootProps, getInputProps: getSampleInputProps, isDragActive: isSampleDrag } = useDropzone({
    onDrop: onDropSample,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
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

  function handleContinue() {
    if (!selected && !sampleUploaded) { toast.error("Select a template or upload a formatting reference."); return; }
    if (selected) localStorage.setItem("tailormycv_template_id", selected);
    localStorage.setItem(LS_INSTRUCTIONS, instructions);
    localStorage.setItem(LS_OUTPUT_FORMAT, outputFormat);
    router.push("/builder/preview");
  }

  const canContinue = !!(selected || sampleUploaded);

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Choose a Template</h1>
        <p className="text-sm text-slate-500 mt-0.5">Each template has a distinct visual style. Pick one, or upload your own formatting reference.</p>
      </div>

      {/* Template gallery */}
      <div className="grid grid-cols-3 gap-4">
        {templates.map((t) => {
          const preview = TEMPLATE_PREVIEWS[t.name];
          const PreviewComponent = preview?.component;
          const isSelected = selected === t._id;
          return (
            <button
              key={t._id}
              onClick={() => setSelected(t._id)}
              className={clsx(
                "relative card p-0 text-left transition overflow-hidden hover:shadow-lg",
                isSelected
                  ? "ring-2 ring-brand-500 border-brand-400 shadow-md"
                  : "border-slate-200 hover:border-brand-300",
              )}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 z-10 bg-brand-500 rounded-full p-0.5">
                  <FiCheckCircle className="w-3.5 h-3.5 text-white" />
                </div>
              )}

              {/* Mini preview — 160px tall scaled-down resume */}
              <div className="h-44 border-b border-slate-100 overflow-hidden bg-white">
                {PreviewComponent ? (
                  <div className="w-full h-full">
                    <PreviewComponent />
                  </div>
                ) : (
                  <div className="w-full h-full bg-slate-50 flex items-center justify-center text-3xl">📄</div>
                )}
              </div>

              {/* Card footer */}
              <div className="p-3">
                <p className="font-semibold text-sm text-slate-900">{t.name}</p>
                {t.description && (
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug line-clamp-2">{t.description}</p>
                )}
                {preview?.traits && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {preview.traits.map(trait => (
                      <span key={trait} className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{trait}</span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Formatting reference — Pro only */}
      {!isPro ? (
        <Link href="/settings/plan" className="card p-4 flex items-center gap-3 hover:border-brand-300 transition group">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-brand-50">
            <FiLock className="w-4 h-4 text-slate-400 group-hover:text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700">
              Formatting Reference <span className="text-[10px] font-semibold bg-brand-100 text-brand-700 rounded px-1.5 py-0.5 ml-1">PRO</span>
            </p>
            <p className="text-xs text-slate-500">Upload your own CV as a layout guide — upgrade to Pro to unlock.</p>
          </div>
          <FiZap className="w-4 h-4 text-brand-500 shrink-0" />
        </Link>
      ) : (
      <div className="card p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <FiFile className="w-3.5 h-3.5 text-brand-500" />
          <span className="text-sm font-semibold text-slate-800">Formatting Reference</span>
          <span className="text-xs text-slate-400 ml-1">(optional — overrides template selection)</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">Upload your own CV as a layout guide. The AI will mirror its section structure and ordering — without copying any content.</p>

        {!sampleFile ? (
          <div
            {...getSampleRootProps()}
            className={clsx(
              "border-2 border-dashed rounded-lg py-4 text-center cursor-pointer transition",
              isSampleDrag ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400",
            )}
          >
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

        {sampleUploaded && !selected && (
          <p className="text-xs text-brand-600 mt-2 flex items-center gap-1">
            <FiCheckCircle className="w-3 h-3" /> Your CV will be used as layout guide — no template needed
          </p>
        )}
      </div>
      )}

      {/* Output format */}
      <div className="card p-4">
        <p className="text-sm font-semibold text-slate-800 mb-3">Output Format</p>
        <div className="flex gap-3">
          {FORMAT_OPTIONS.map(({ value, label, sub, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setOutputFormat(value)}
              className={clsx(
                "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition text-sm font-medium",
                outputFormat === value
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 hover:border-brand-300 text-slate-600",
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
              <span className="text-xs font-normal text-slate-400">{sub}</span>
            </button>
          ))}
        </div>
        {(outputFormat === "pdf" || outputFormat === "both") && (
          <p className="text-xs text-amber-600 mt-2">PDF requires LibreOffice on the server; falls back to DOCX if unavailable.</p>
        )}
      </div>

      {/* Additional instructions */}
      <div className="card p-4">
        <label className="text-sm font-semibold text-slate-800">
          Additional Instructions <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          className="input resize-none text-sm mt-2 h-36"
          placeholder={`e.g. "Focus on leadership experience", "I'm switching to product management", "Emphasise open-source work"`}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pb-2">
        <button onClick={() => router.back()} className="btn-secondary">← Back</button>
        <div className="relative group">
          {!canContinue && (
            <div className="absolute bottom-full mb-2 right-0 w-56 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Select a template or upload a formatting reference to continue.
              <span className="absolute top-full right-4 border-4 border-transparent border-t-slate-800" />
            </div>
          )}
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue →
          </button>
        </div>
      </div>

    </div>
  );
}
