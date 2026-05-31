"use client";
import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import toast from "react-hot-toast";
import {
  FiUpload, FiUser, FiMail, FiPhone,
  FiMapPin, FiBriefcase, FiTag, FiFileText, FiCheck, FiLoader,
  FiDownload, FiTrash2, FiEdit2, FiPlus, FiLock, FiArrowDownCircle,
} from "react-icons/fi";
import {
  getAccountProfile,
  saveAccountProfile,
  uploadProfileResume,
  parseLinkedInProfile,
  searchCatalogRoles,
  searchCatalogSkills,
  listSavedResumes,
  uploadSavedResume,
  deleteSavedResume,
  renameSavedResume,
  savedResumeDownloadUrl,
  type AccountProfile,
  type SavedResume,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { hasFeature, getTierLimit } from "@/lib/config";
import TagInput from "@/components/TagInput";

const EMPTY: Omit<AccountProfile, "id" | "resume_text"> = {
  full_name: "",
  email: "",
  phone: "",
  linkedin: "",
  location: "",
  target_roles: [],
  primary_skill: "",
  key_skills: [],
  summary: "",
};

export default function ProfilePage() {
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const libraryLimit = getTierLimit(tier, "resume_library");
  const canUseLibrary = hasFeature(tier, "resume_library");

  const [form, setForm] = useState(EMPTY);
  const [hasResume, setHasResume] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [linkedinImporting, setLinkedinImporting] = useState(false);

  // Resume library
  const [library, setLibrary] = useState<SavedResume[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryUploading, setLibraryUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    if (canUseLibrary) {
      setLibraryLoading(true);
      listSavedResumes().then(setLibrary).catch(() => {}).finally(() => setLibraryLoading(false));
    }
  }, [canUseLibrary]);

  useEffect(() => {
    getAccountProfile()
      .then((profile) => {
        if (profile) {
          const { id: _id, resume_text, ...rest } = profile;
          // Migrate legacy target_role string → target_roles array
          const normalized = {
            ...rest,
            target_roles: rest.target_roles?.length ? rest.target_roles : [],
          };
          setForm(normalized);
          setHasResume(!!resume_text);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, []);

  function patch(field: keyof typeof EMPTY, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadingResume(true);
    try {
      const { prefilled } = await uploadProfileResume(file);
      setForm((f) => ({
        ...f,
        full_name:     prefilled.full_name     || f.full_name,
        email:         prefilled.email         || f.email,
        phone:         prefilled.phone         || f.phone,
        linkedin:      prefilled.linkedin      || f.linkedin,
        location:      prefilled.location      || f.location,
        target_roles:  prefilled.target_roles?.length ? prefilled.target_roles
                       : (prefilled as { target_role?: string }).target_role
                         ? [(prefilled as { target_role?: string }).target_role!]
                         : f.target_roles,
        primary_skill: (prefilled as { primary_skill?: string }).primary_skill || f.primary_skill,
        key_skills:    prefilled.key_skills?.length ? prefilled.key_skills : f.key_skills,
        summary:       prefilled.summary       || f.summary,
      }));
      setHasResume(true);
      toast.success("Resume parsed — review the fields below and save.");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const status = (err as { response?: { status?: number } })?.response?.status;
      console.error("Profile resume upload failed:", status, detail, err);
      if (status === 401) {
        toast.error("Not signed in — please refresh the page.");
      } else {
        toast.error(detail ?? "Upload failed. Check the browser console for details.");
      }
    } finally {
      setUploadingResume(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    disabled: uploadingResume,
  });

  async function handleLibraryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLibraryUploading(true);
    try {
      const saved = await uploadSavedResume(file, file.name.replace(/\.[^.]+$/, ""));
      setLibrary((prev) => [saved, ...prev]);
      toast.success("Resume added to library.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Upload failed.");
    } finally {
      setLibraryUploading(false);
      e.target.value = "";
    }
  }

  async function handleLibraryDelete(id: string) {
    try {
      await deleteSavedResume(id);
      setLibrary((prev) => prev.filter((r) => r.id !== id));
      toast.success("Removed.");
    } catch { toast.error("Could not delete."); }
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return;
    try {
      const updated = await renameSavedResume(id, editingName.trim());
      setLibrary((prev) => prev.map((r) => r.id === id ? updated : r));
      setEditingId(null);
    } catch { toast.error("Could not rename."); }
  }

  async function handleLinkedInImport() {
    const url = form.linkedin.trim();
    if (!url) { toast.error("Enter your LinkedIn profile URL first."); return; }
    setLinkedinImporting(true);
    try {
      const profile = await parseLinkedInProfile(url);
      setForm((f) => ({
        ...f,
        full_name:    profile.full_name    || f.full_name,
        email:        profile.email        || f.email,
        location:     profile.location     || f.location,
        summary:      profile.summary      || f.summary,
        key_skills:   profile.skills.length ? profile.skills : f.key_skills,
      }));
      toast.success(`Profile imported — ${profile.full_name || "details"} loaded. Review and save.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "LinkedIn import is temporarily unavailable. Please try again later.");
    } finally {
      setLinkedinImporting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await saveAccountProfile(form);
      toast.success("Profile saved!");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <FiLoader className="w-6 h-6 animate-spin mr-2" /> Loading profile…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
        <p className="text-slate-500 text-sm mt-1">
          Your career profile powers job search pre-fill and one-click resume tailoring.
        </p>
      </div>

      {/* Resume upload — compact horizontal strip */}
      <div
        {...getRootProps()}
        className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition cursor-pointer ${
          isDragActive
            ? "border-brand-400 bg-brand-50"
            : "border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50"
        } ${uploadingResume ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <input {...getInputProps()} />
        {uploadingResume ? (
          <FiLoader className="w-5 h-5 text-brand-600 animate-spin shrink-0" />
        ) : hasResume ? (
          <FiCheck className="w-5 h-5 text-teal-500 shrink-0" />
        ) : (
          <FiUpload className="w-5 h-5 text-slate-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {uploadingResume ? (
            <p className="text-sm font-medium text-brand-700">Parsing resume…</p>
          ) : hasResume ? (
            <>
              <p className="text-sm font-medium text-slate-800">Resume on file</p>
              <p className="text-xs text-slate-400">Drop a new file to replace it</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-800">Upload your resume</p>
              <p className="text-xs text-slate-400">PDF or DOCX · max 5 MB · AI pre-fills the form below</p>
            </>
          )}
        </div>
        {!uploadingResume && (
          <span className="text-xs text-brand-600 font-medium shrink-0">
            {hasResume ? "Replace" : "Browse"}
          </span>
        )}
      </div>

      {/* ── Resume Library ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <FiFileText className="w-4 h-4" /> Resume Library
              {canUseLibrary && (
                <span className="text-xs font-normal text-slate-400">
                  {libraryLimit === null
                    ? `${library.length} saved`
                    : `${library.length} / ${libraryLimit} used`}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Save multiple resumes — upload directly or save tailored ones from the builder.
            </p>
          </div>
          {canUseLibrary && (
            <label className={`btn-secondary text-xs px-3 py-1.5 gap-1.5 cursor-pointer ${
              libraryUploading || (libraryLimit !== null && library.length >= libraryLimit)
                ? "opacity-50 pointer-events-none" : ""
            }`}>
              {libraryUploading
                ? <><FiLoader className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                : <><FiPlus className="w-3.5 h-3.5" /> Add Resume</>
              }
              <input
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={handleLibraryUpload}
                disabled={libraryUploading || (libraryLimit !== null && library.length >= libraryLimit)}
              />
            </label>
          )}
        </div>

        {!canUseLibrary && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <FiLock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">Resume Library is a Plus feature</p>
            <p className="text-xs text-slate-400 mt-1">Upgrade to save multiple resumes and apply with one click.</p>
          </div>
        )}

        {canUseLibrary && libraryLoading && (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <FiLoader className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        )}

        {canUseLibrary && !libraryLoading && library.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-slate-400 text-sm">
            No resumes saved yet. Upload one above or save a tailored resume from the builder.
          </div>
        )}

        {canUseLibrary && !libraryLoading && library.length > 0 && (
          <div className="flex flex-col gap-2">
            {library.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                  <FiFileText className="w-4 h-4 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === r.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(r.id); if (e.key === "Escape") setEditingId(null); }}
                        className="input text-sm py-1 px-2 h-7"
                      />
                      <button onClick={() => handleRename(r.id)} className="text-xs text-brand-600 font-medium hover:underline">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-slate-900 truncate">{r.name}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <span className={`rounded-full px-1.5 py-0.5 font-medium ${
                      r.type === "tailored" ? "bg-teal-50 text-teal-700" : "bg-slate-200 text-slate-600"
                    }`}>
                      {r.type === "tailored" ? "Tailored" : "Uploaded"}
                    </span>
                    {r.tailored_for_employer && <span>{r.tailored_for_employer}</span>}
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => { setEditingId(r.id); setEditingName(r.name); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
                    title="Rename"
                  >
                    <FiEdit2 className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={savedResumeDownloadUrl(r.id)}
                    download
                    className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition"
                    title="Download"
                  >
                    <FiDownload className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => handleLibraryDelete(r.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                    title="Delete"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {/* Personal info */}
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FiUser className="w-4 h-4" /> Personal Info
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full name</label>
              <div className="relative">
                <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={form.full_name}
                  onChange={(e) => patch("full_name", e.target.value)}
                  className="input pl-9" placeholder="Jane Smith" />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="email" value={form.email}
                  onChange={(e) => patch("email", e.target.value)}
                  className="input pl-9" placeholder="jane@example.com" />
              </div>
            </div>
            <div>
              <label className="label">Phone</label>
              <div className="relative">
                <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={form.phone}
                  onChange={(e) => patch("phone", e.target.value)}
                  className="input pl-9" placeholder="+1 555 000 0000" />
              </div>
            </div>
            <div>
              <label className="label">Location</label>
              <div className="relative">
                <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={form.location}
                  onChange={(e) => patch("location", e.target.value)}
                  className="input pl-9" placeholder="London, UK" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label flex items-center justify-between">
                LinkedIn URL
                <span className="text-xs font-normal text-slate-400">Paste URL then click Import to auto-fill</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.linkedin}
                  onChange={(e) => patch("linkedin", e.target.value)}
                  className="input flex-1"
                  placeholder="https://linkedin.com/in/username"
                />
                <button
                  type="button"
                  onClick={handleLinkedInImport}
                  disabled={!form.linkedin.trim() || linkedinImporting}
                  className="btn-secondary text-sm px-3 gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {linkedinImporting
                    ? <><FiLoader className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                    : <><FiArrowDownCircle className="w-3.5 h-3.5" /> Import Profile</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Career */}
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FiBriefcase className="w-4 h-4" /> Career
          </h2>
          <div className="flex flex-col gap-4">

            <div>
              <label className="label">Target roles</label>
              <TagInput
                value={form.target_roles}
                onChange={(roles) => patch("target_roles", roles)}
                fetchSuggestions={searchCatalogRoles}
                placeholder="e.g. Software Engineer, Product Manager…"
              />
              <p className="text-xs text-slate-400 mt-1">
                Used to pre-fill job searches. Add one or more roles.
              </p>
            </div>

            <div>
              <label className="label">Primary skill</label>
              <TagInput
                value={form.primary_skill ? [form.primary_skill] : []}
                onChange={(tags) => patch("primary_skill", tags[0] ?? "")}
                fetchSuggestions={searchCatalogSkills}
                placeholder="e.g. Java, Python, Financial Modelling…"
                single
              />
              <p className="text-xs text-slate-400 mt-1">
                Your core technical or professional skill — combined with your role when searching for jobs.
              </p>
            </div>

            <div>
              <label className="label flex items-center gap-1">
                <FiTag className="w-3.5 h-3.5" /> Key skills
              </label>
              <TagInput
                value={form.key_skills}
                onChange={(skills) => patch("key_skills", skills)}
                fetchSuggestions={searchCatalogSkills}
                placeholder="e.g. Python, React, Leadership…"
              />
            </div>

            <div>
              <label className="label">Professional summary</label>
              <textarea
                value={form.summary}
                onChange={(e) => patch("summary", e.target.value)}
                className="input h-28 resize-none"
                placeholder="2–3 sentences about your background and what you're looking for."
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={savingProfile} className="btn-primary">
            {savingProfile ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </form>

    </div>
  );
}
