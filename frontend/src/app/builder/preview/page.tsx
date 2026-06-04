"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  generateResume,
  setLockedFacts,
  setSessionTemplate,
  syncResumeToSession,
  isPipelineResult,
  type GeneratedResume,
  type EvalSummary,
} from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import { useAuth } from "@/lib/useAuth";
import Link from "next/link";
import { FiRefreshCw, FiCheckCircle, FiShield, FiLock, FiX, FiPlus, FiMessageSquare, FiTrash2, FiZap } from "react-icons/fi";
import { SUPPORT_EMAIL, hasFeature } from "@/lib/config";
import { EvalSummaryPanel } from "@/components/EvalQualityPanel";

const LS_RESUME = "tailormycv_generated";
const LS_EVAL = "tailormycv_eval_summary";
const LS_TEMPLATE = "tailormycv_template_id";
const LS_LOCKED_FACTS = "tailormycv_locked_facts";
const LS_CUSTOM_SECTIONS = "tailormycv_custom_sections";

interface CustomSection {
  id: string;
  name: string;
  content: string;
}

export default function PreviewPage() {
  useStepGuard("preview");
  const router = useRouter();
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const isPro = hasFeature(tier, "section_regen"); // true only for Pro
  const [resume, setResume] = useState<GeneratedResume | null>(null);
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSection, setLoadingSection] = useState<string | null>(null);
  const [lockedFacts, setLockedFactsState] = useState<string[]>([]);
  const [newFact, setNewFact] = useState("");
  const [savingFacts, setSavingFacts] = useState(false);
  const [sectionComments, setSectionComments] = useState<Record<string, string>>({});
  const [globalComment, setGlobalComment] = useState("");
  const [showGlobalComment, setShowGlobalComment] = useState(false);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [boldKeywords, setBoldKeywords] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("tailormycv_bold_keywords");
    return saved === null ? true : saved === "true";
  });
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(0);

  useEffect(() => {
    const storedResume = localStorage.getItem(LS_RESUME);
    const storedEval = localStorage.getItem(LS_EVAL);
    const storedFacts = localStorage.getItem(LS_LOCKED_FACTS);
    if (storedFacts) {
      try { setLockedFactsState(JSON.parse(storedFacts)); } catch { /* ignore */ }
    }
    const storedCustom = localStorage.getItem(LS_CUSTOM_SECTIONS);
    if (storedCustom) {
      try { setCustomSections(JSON.parse(storedCustom)); } catch { /* ignore */ }
    }
    if (storedResume) {
      try {
        const parsed = JSON.parse(storedResume);
        setResume(parsed);
        if (storedEval) setEvalSummary(JSON.parse(storedEval));
        // Sync back to MongoDB so export can always find it
        const sid = getSessionId();
        if (sid) syncResumeToSession(sid, parsed).catch(() => {});
        return;
      } catch { /* fall through */ }
    }
    runGenerate();
  }, []);

  async function persistTemplateToSession(sessionId: string) {
    const templateId = localStorage.getItem(LS_TEMPLATE);
    if (!templateId) return;
    try {
      await setSessionTemplate(sessionId, templateId);
    } catch { /* non-critical */ }
  }

  function setComment(section: string, value: string) {
    setSectionComments((prev) => ({ ...prev, [section]: value }));
  }

  function addCustomSection() {
    const name = newSectionName.trim();
    if (!name) return;
    const section: CustomSection = { id: crypto.randomUUID(), name, content: "" };
    const updated = [...customSections, section];
    setCustomSections(updated);
    localStorage.setItem(LS_CUSTOM_SECTIONS, JSON.stringify(updated));
    setNewSectionName("");
    setAddingSection(false);
  }

  function updateCustomSection(id: string, content: string) {
    const updated = customSections.map((s) => s.id === id ? { ...s, content } : s);
    setCustomSections(updated);
    localStorage.setItem(LS_CUSTOM_SECTIONS, JSON.stringify(updated));
  }

  function removeCustomSection(id: string) {
    const updated = customSections.filter((s) => s.id !== id);
    setCustomSections(updated);
    localStorage.setItem(LS_CUSTOM_SECTIONS, JSON.stringify(updated));
  }

  async function runGenerate(section?: string, comment?: string) {
    const sessionId = getSessionId();
    if (!sessionId) {
      toast.error("No session found. Please start from Step 1.");
      return;
    }

    setGenerationError(null);
    if (!section) await persistTemplateToSession(sessionId);

    const additionalInstructions = section
      ? (comment?.trim() || undefined)
      : (comment?.trim() || localStorage.getItem("tailormycv_instructions") || undefined);

    section ? setLoadingSection(section) : setLoading(true);
    try {
      const result = await generateResume(sessionId, section, additionalInstructions);

      if (isPipelineResult(result)) {
        setResume(result.resume);
        setEvalSummary(result.eval_summary);
        localStorage.setItem(LS_RESUME, JSON.stringify(result.resume));
        localStorage.setItem(LS_EVAL, JSON.stringify(result.eval_summary));
        toast.success("Resume optimized for your target role!");
      } else {
        setResume(result);
        localStorage.setItem(LS_RESUME, JSON.stringify(result));
        toast.success(section ? `${section} regenerated!` : "Resume generated!");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; code?: string; message?: string };
      const detail = e?.response?.data?.detail;
      const isTimeout = e?.code === "ECONNABORTED" || e?.message?.includes("timeout");
      const msg = detail
        ?? (isTimeout ? "Generation timed out — the AI is taking longer than usual. Please try again." : "Resume generation failed. Please try again.");
      setGenerationError(msg);
    } finally {
      setLoading(false);
      setLoadingSection(null);
    }
  }

  function updateField(path: string[], value: unknown) {
    setResume((prev) => {
      if (!prev) return prev;
      const updated = structuredClone(prev) as unknown as Record<string, unknown>;
      let node: Record<string, unknown> = updated;
      for (let i = 0; i < path.length - 1; i++) {
        node = node[path[i]] as Record<string, unknown>;
      }
      node[path[path.length - 1]] = value;
      localStorage.setItem(LS_RESUME, JSON.stringify(updated));
      return updated as unknown as GeneratedResume;
    });
  }

  async function addLockedFact() {
    const trimmed = newFact.trim();
    if (!trimmed) return;
    const updated = [...lockedFacts, trimmed];
    await persistLockedFacts(updated);
    setNewFact("");
  }

  async function removeLockedFact(index: number) {
    const updated = lockedFacts.filter((_, i) => i !== index);
    await persistLockedFacts(updated);
  }

  async function persistLockedFacts(facts: string[]) {
    const sessionId = getSessionId();
    if (!sessionId) return;
    setSavingFacts(true);
    try {
      await setLockedFacts(sessionId, facts);
      setLockedFactsState(facts);
      localStorage.setItem(LS_LOCKED_FACTS, JSON.stringify(facts));
    } catch {
      toast.error("Failed to save locked facts.");
    } finally {
      setSavingFacts(false);
    }
  }

  const LOADING_MESSAGES = [
    { title: "Analysing your resume and job description…",     sub: "Matching your background to the role requirements" },
    { title: "Extracting key skills from the job description…", sub: "Identifying the terms that matter most to this employer" },
    { title: "Generating your tailored resume draft…",          sub: "AI writer crafting a targeted version of your experience" },
    { title: "Quality evaluators reviewing the draft…",         sub: "Multiple AI models scoring the result" },
    { title: "Refining based on evaluation feedback…",          sub: "Addressing gaps and strengthening weak areas" },
    { title: "Selecting the best version…",                     sub: "Picking the highest-scoring iteration for you" },
    { title: "Final polish underway…",                          sub: "Almost there — wrapping up your tailored resume" },
  ];

  // Advance loading message every 7 s — never wraps back to start
  useEffect(() => {
    if (!loading) return;
    setLoadingMsg(0);
    const id = setInterval(
      () => setLoadingMsg(n => Math.min(n + 1, LOADING_MESSAGES.length - 1)),
      7000,
    );
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) {
    const msg = LOADING_MESSAGES[loadingMsg];
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-5">
        {/* Spinner */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
          <div className="absolute inset-0 rounded-full border-4 border-brand-600 border-t-transparent animate-spin" />
        </div>

        {/* Rotating message */}
        <div className="text-center max-w-sm">
          <p className="text-slate-800 font-semibold text-lg leading-snug transition-all duration-500">
            {msg.title}
          </p>
          <p className="text-sm text-slate-500 mt-1.5 transition-all duration-500">{msg.sub}</p>
        </div>

        {/* Forward-only progress bar */}
        <div className="w-64 mt-2">
          <div className="flex gap-1">
            {LOADING_MESSAGES.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-all duration-700 ${
                  i < loadingMsg  ? "bg-brand-300" :
                  i === loadingMsg ? "bg-brand-600" :
                  "bg-slate-200"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            Step {loadingMsg + 1} of {LOADING_MESSAGES.length} · Usually 30–90 seconds
          </p>
        </div>
      </div>
    );
  }

  // Error state — generation failed, resume is still null
  if (!resume && generationError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-5">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
          <FiRefreshCw className="w-7 h-7 text-red-400" />
        </div>
        <div className="text-center max-w-md">
          <h2 className="text-lg font-semibold text-slate-800">Resume generation failed</h2>
          <p className="text-sm text-slate-500 mt-2">{generationError}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => runGenerate()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition"
          >
            <FiRefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition"
          >
            Go back
          </button>
        </div>
        <p className="text-xs text-slate-400">
          If the problem persists, contact{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    );
  }

  if (!resume) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Preview &amp; Edit</h1>
            <p className="text-slate-500 text-sm mt-1">
              Click any field to edit inline, or regenerate sections with guidance.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={() => setShowGlobalComment((s) => !s)}
              className={`flex items-center gap-1 text-sm btn-secondary ${showGlobalComment || globalComment ? "text-brand-600 border-brand-300" : ""}`}
            >
              <FiMessageSquare className="w-3.5 h-3.5" />
              {globalComment ? "Edit guidance" : "Regenerate with guidance"}
            </button>
            <button
              onClick={() => { runGenerate(undefined, globalComment || undefined); }}
              disabled={loading}
              className="btn-secondary gap-2"
            >
              <FiRefreshCw className={loading ? "animate-spin" : ""} /> Regenerate All
            </button>
          </div>
        </div>
        {showGlobalComment && (
          <div className="card p-3 space-y-2">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <FiMessageSquare className="w-3 h-3 text-brand-500" />
              Guidance for full regeneration
            </label>
            <textarea
              autoFocus
              className="input text-sm resize-none h-16"
              placeholder={`e.g. "I'm transitioning to product management, emphasise stakeholder experience"`}
              value={globalComment}
              onChange={(e) => setGlobalComment(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowGlobalComment(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Close
              </button>
              <button
                onClick={() => { runGenerate(undefined, globalComment || undefined); setShowGlobalComment(false); }}
                disabled={loading}
                className="btn-primary text-xs py-1 px-3 disabled:opacity-50 flex items-center gap-1"
              >
                <FiRefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Regenerate All with feedback →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quality status panel */}
      {evalSummary && <EvalSummaryPanel summary={evalSummary} />}

      {/* Locked facts panel — Pro only */}
      {isPro ? (
        <LockedFactsPanel
          facts={lockedFacts}
          newFact={newFact}
          saving={savingFacts}
          onNewFactChange={setNewFact}
          onAdd={addLockedFact}
          onRemove={removeLockedFact}
        />
      ) : (
        <Link
          href="/settings/plan"
          className="card flex items-center gap-3 hover:border-brand-300 transition group"
        >
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-brand-50">
            <FiLock className="w-4 h-4 text-slate-400 group-hover:text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700">
              Locked Facts <span className="text-[10px] font-semibold bg-brand-100 text-brand-700 rounded px-1.5 py-0.5 ml-1">PRO</span>
            </p>
            <p className="text-xs text-slate-500">Pin facts the AI must never change — upgrade to Pro to unlock.</p>
          </div>
          <FiZap className="w-4 h-4 text-brand-500 shrink-0" />
        </Link>
      )}

      {/* Contact */}
      <Section
        title="Contact"
        onRegenerate={(comment) => runGenerate("contact", comment)}
        loading={loadingSection === "contact"}
        comment={sectionComments["contact"] ?? ""}
        onCommentChange={(v) => setComment("contact", v)}
        isPro={isPro}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EditableField
            label="Full Name"
            value={resume.name}
            onChange={(v) => updateField(["name"], v)}
          />
          {(["email", "phone", "linkedin", "github", "website", "location"] as const).map((f) => (
            <EditableField
              key={f}
              label={f.charAt(0).toUpperCase() + f.slice(1)}
              value={resume.contact?.[f] ?? ""}
              onChange={(v) => updateField(["contact", f], v)}
            />
          ))}
        </div>
      </Section>

      {/* Summary */}
      <Section
        title="Summary"
        onRegenerate={(comment) => runGenerate("summary", comment)}
        loading={loadingSection === "summary"}
        comment={sectionComments["summary"] ?? ""}
        onCommentChange={(v) => setComment("summary", v)}
        isPro={isPro}
      >
        <textarea
          className="input h-28 resize-none text-sm"
          value={resume.summary}
          onChange={(e) => updateField(["summary"], e.target.value)}
        />
      </Section>

      {/* Experience */}
      <Section
        title="Experience"
        onRegenerate={(comment) => runGenerate("experience", comment)}
        loading={loadingSection === "experience"}
        comment={sectionComments["experience"] ?? ""}
        onCommentChange={(v) => setComment("experience", v)}
        isPro={isPro}
      >
        {resume.experience.map((job, i) => (
          <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2 mb-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <EditableField
                label="Role"
                value={job.role}
                onChange={(v) => {
                  const exp = [...resume.experience];
                  exp[i] = { ...exp[i], role: v };
                  updateField(["experience"], exp);
                }}
              />
              <EditableField
                label="Company"
                value={job.company}
                onChange={(v) => {
                  const exp = [...resume.experience];
                  exp[i] = { ...exp[i], company: v };
                  updateField(["experience"], exp);
                }}
              />
              <EditableField
                label="Dates"
                value={job.dates}
                onChange={(v) => {
                  const exp = [...resume.experience];
                  exp[i] = { ...exp[i], dates: v };
                  updateField(["experience"], exp);
                }}
              />
            </div>
            {job.bullets.map((b, bi) => (
              <div key={bi} className="flex gap-2 items-start">
                <span className="text-brand-500 mt-1.5">•</span>
                <textarea
                  className="input flex-1 text-sm resize-none"
                  rows={2}
                  value={b}
                  onChange={(e) => {
                    const exp = [...resume.experience];
                    const bullets = [...exp[i].bullets];
                    bullets[bi] = e.target.value;
                    exp[i] = { ...exp[i], bullets };
                    updateField(["experience"], exp);
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </Section>

      {/* Education */}
      <Section
        title="Education"
        onRegenerate={(comment) => runGenerate("education", comment)}
        loading={loadingSection === "education"}
        comment={sectionComments["education"] ?? ""}
        onCommentChange={(v) => setComment("education", v)}
        isPro={isPro}
      >
        {resume.education.map((ed, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <EditableField
              label="Institution"
              value={ed.institution}
              onChange={(v) => {
                const edu = [...resume.education];
                edu[i] = { ...edu[i], institution: v };
                updateField(["education"], edu);
              }}
            />
            <EditableField
              label="Degree"
              value={ed.degree}
              onChange={(v) => {
                const edu = [...resume.education];
                edu[i] = { ...edu[i], degree: v };
                updateField(["education"], edu);
              }}
            />
            <EditableField
              label="Dates"
              value={ed.dates}
              onChange={(v) => {
                const edu = [...resume.education];
                edu[i] = { ...edu[i], dates: v };
                updateField(["education"], edu);
              }}
            />
          </div>
        ))}
      </Section>

      {/* Dynamic sections (new format) — each section from the AI output */}
      {resume.sections && resume.sections.map((sec, i) => (
        <Section
          key={`sec-${i}`}
          title={sec.title}
          onRegenerate={(comment) => runGenerate(sec.title.toLowerCase(), comment)}
          loading={loadingSection === sec.title.toLowerCase()}
          comment={sectionComments[sec.title] ?? ""}
          onCommentChange={(v) => setComment(sec.title, v)}
          isPro={isPro}
        >
          <textarea
            className="input text-sm resize-none"
            rows={Math.max(2, Math.min(sec.items.length + 1, 6))}
            value={sec.items.join("\n")}
            onChange={(e) => {
              const updated = [...(resume.sections ?? [])];
              updated[i] = { ...updated[i], items: e.target.value.split("\n").filter(Boolean) };
              updateField(["sections"], updated);
            }}
          />
          <p className="text-xs text-slate-400 mt-1">One item per line</p>
        </Section>
      ))}

      {/* Legacy Skills + Certifications (old format sessions without sections[]) */}
      {!resume.sections && resume.skills && resume.skills.length > 0 && (
        <Section
          title="Skills"
          onRegenerate={(comment) => runGenerate("skills", comment)}
          loading={loadingSection === "skills"}
          comment={sectionComments["skills"] ?? ""}
          onCommentChange={(v) => setComment("skills", v)}
          isPro={isPro}
        >
          <textarea
            className="input text-sm resize-none"
            rows={3}
            value={resume.skills.join(", ")}
            onChange={(e) =>
              updateField(["skills"], e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
            }
          />
        </Section>
      )}
      {!resume.sections && resume.certifications && resume.certifications.length > 0 && (
        <Section
          title="Certifications"
          onRegenerate={(comment) => runGenerate("certifications", comment)}
          loading={loadingSection === "certifications"}
          comment={sectionComments["certifications"] ?? ""}
          onCommentChange={(v) => setComment("certifications", v)}
          isPro={isPro}
        >
          <textarea
            className="input text-sm resize-none"
            rows={2}
            value={resume.certifications.join(", ")}
            onChange={(e) =>
              updateField(["certifications"], e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
            }
          />
        </Section>
      )}

      {/* Custom sections */}
      {customSections.map((cs) => (
        <Section
          key={cs.id}
          title={cs.name}
          onRegenerate={(comment) => runGenerate(cs.name.toLowerCase(), comment)}
          loading={loadingSection === cs.name.toLowerCase()}
          comment={sectionComments[cs.id] ?? ""}
          onCommentChange={(v) => setComment(cs.id, v)}
          onDelete={() => removeCustomSection(cs.id)}
          isPro={isPro}
        >
          <textarea
            className="input text-sm resize-none"
            rows={3}
            placeholder={`Content for ${cs.name}…`}
            value={cs.content}
            onChange={(e) => updateCustomSection(cs.id, e.target.value)}
          />
        </Section>
      ))}

      {/* Add section */}
      {addingSection ? (
        <div className="card p-4 flex gap-2 items-center">
          <input
            autoFocus
            className="input text-sm flex-1"
            placeholder="Section name (e.g. Projects, Publications, Volunteer Work)"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustomSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
          />
          <button onClick={addCustomSection} disabled={!newSectionName.trim()} className="btn-primary text-sm py-2 disabled:opacity-40">
            Add
          </button>
          <button onClick={() => { setAddingSection(false); setNewSectionName(""); }} className="text-sm text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingSection(true)}
          className="w-full card p-3 text-sm text-slate-500 hover:text-brand-600 hover:border-brand-300 flex items-center justify-center gap-2 transition"
        >
          <FiPlus className="w-4 h-4" /> Add Section
        </button>
      )}

      {/* Bold keywords option */}
      <div className="card p-4 flex items-start gap-3">
        <input
          id="bold-keywords"
          type="checkbox"
          checked={boldKeywords}
          onChange={e => {
            setBoldKeywords(e.target.checked);
            localStorage.setItem("tailormycv_bold_keywords", String(e.target.checked));
          }}
          className="mt-0.5 w-4 h-4 accent-brand-600 cursor-pointer shrink-0"
        />
        <div>
          <label htmlFor="bold-keywords" className="text-sm font-semibold text-slate-800 cursor-pointer">
            Bold key skills in the exported document
          </label>
          <p className="text-xs text-slate-500 mt-0.5">
            When checked, skills and keywords matched from the job description are highlighted bold in the generated DOCX and PDF — making them stand out to recruiters.
          </p>
        </div>
      </div>

      {/* Additional Instructions */}
      <div className="card p-4">
        <label className="text-sm font-semibold text-slate-800">
          Additional Instructions <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <p className="text-xs text-slate-500 mt-0.5 mb-2">Used when regenerating — e.g. &ldquo;Focus on leadership experience&rdquo; or &ldquo;I&apos;m switching to product management&rdquo;.</p>
        <textarea
          className="input resize-none text-sm h-20"
          placeholder={`e.g. "Emphasise open-source work", "I'm switching to product management"`}
          defaultValue={typeof window !== "undefined" ? (localStorage.getItem("tailormycv_instructions") ?? "") : ""}
          onChange={(e) => localStorage.setItem("tailormycv_instructions", e.target.value)}
        />
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={() => router.back()} className="btn-secondary">
          ← Back
        </button>
        <button onClick={() => router.push("/builder/template")} className="btn-primary">
          Choose Template →
        </button>
      </div>
    </div>
  );
}


function LockedFactsPanel({
  facts,
  newFact,
  saving,
  onNewFactChange,
  onAdd,
  onRemove,
}: {
  facts: string[];
  newFact: string;
  saving: boolean;
  onNewFactChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); onAdd(); }
  }

  return (
    <div className="card">
      <button
        className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 hover:text-brand-600"
        onClick={() => { setOpen((o) => !o); if (!open) setTimeout(() => inputRef.current?.focus(), 100); }}
      >
        <span className="flex items-center gap-2">
          <FiLock className="w-4 h-4 text-brand-500" />
          Locked Facts
          {facts.length > 0 && (
            <span className="text-xs font-normal bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
              {facts.length} locked
            </span>
          )}
        </span>
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            Pin specific facts (company names, job titles, dates, degrees) that the AI must never change when regenerating.
          </p>

          {facts.length > 0 && (
            <ul className="space-y-1.5">
              {facts.map((fact, i) => (
                <li key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700">
                  <FiLock className="w-3 h-3 text-brand-400 shrink-0" />
                  <span className="flex-1">{fact}</span>
                  <button
                    onClick={() => onRemove(i)}
                    disabled={saving}
                    className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    aria-label="Remove"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input text-sm flex-1"
              placeholder='e.g. "Senior Engineer at Google, 2019–2023"'
              value={newFact}
              onChange={(e) => onNewFactChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
            />
            <button
              onClick={onAdd}
              disabled={saving || !newFact.trim()}
              className="btn-secondary flex items-center gap-1 text-sm disabled:opacity-50"
            >
              {saving ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiPlus className="w-3.5 h-3.5" />}
              Lock
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  onRegenerate,
  loading,
  comment,
  onCommentChange,
  onDelete,
  isPro = true,
}: {
  title: string;
  children: React.ReactNode;
  onRegenerate: (comment: string) => void;
  loading: boolean;
  comment: string;
  onCommentChange: (v: string) => void;
  onDelete?: () => void;
  isPro?: boolean;
}) {
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-slate-300 hover:text-red-500 transition-colors"
              title="Remove section"
            >
              <FiTrash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {isPro ? (
            <>
              <button
                onClick={() => setShowFeedback((s) => !s)}
                className={`flex items-center gap-1 text-xs transition ${showFeedback || comment ? "text-brand-600" : "text-slate-400 hover:text-brand-500"}`}
              >
                <FiMessageSquare className="w-3 h-3" />
                {comment ? "Guidance added" : "Regenerate with guidance"}
              </button>
              <button
                onClick={() => onRegenerate("")}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
              >
                <FiRefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            </>
          ) : (
            <Link
              href="/settings/plan"
              title="Section-level regeneration is a Pro feature"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600 transition"
            >
              <FiZap className="w-3 h-3" />
              Regenerate <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 rounded px-1 py-0.5">PRO</span>
            </Link>
          )}
        </div>
      </div>

      {children}

      {showFeedback && isPro && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <textarea
            autoFocus
            className="input text-sm resize-none h-16"
            placeholder={`Feedback for ${title.toLowerCase()} — e.g. "highlight leadership and cross-team projects"`}
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
          />
          <div className="flex justify-between items-center">
            <button
              onClick={() => setShowFeedback(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
            <button
              onClick={() => { onRegenerate(comment); setShowFeedback(false); }}
              disabled={loading || !comment.trim()}
              className="btn-primary text-xs py-1 px-3 disabled:opacity-40 flex items-center gap-1"
            >
              <FiRefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Regenerate with feedback →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
