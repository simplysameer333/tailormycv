"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import toast from "react-hot-toast";
import {
  adminListUsers, adminGetUserStats, adminUpdateUser, adminDeleteUser,
  adminListAudit, adminListPrompts,
  adminUpdatePrompt, adminResetPrompt,
  adminListProfessions, adminCreateProfession, adminUpdateProfession, adminDeleteProfession,
  adminListTemplates, adminUploadTemplate, adminUpdateTemplate, adminDeleteTemplate,
  AdminUser, UserStats, AuditPage, PromptOverride, AdminProfession, AdminTemplate,
} from "@/lib/api";
import api from "@/lib/api";
import {
  FiUsers, FiActivity, FiCpu, FiRefreshCw, FiSave, FiRotateCcw,
  FiChevronLeft, FiChevronRight, FiBriefcase, FiPlus, FiTrash2,
  FiChevronDown, FiChevronUp, FiToggleLeft, FiToggleRight, FiClock,
  FiLayout, FiDownload, FiUploadCloud, FiEdit2, FiX, FiSliders, FiAlertCircle, FiSearch,
} from "react-icons/fi";
import { adminUpdateTierConfig, fetchTierConfig, type TierConfigPayload } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = "users" | "audit" | "prompts" | "professions" | "templates" | "tier_config";

interface CacheEntry<T> {
  data: T;
  fetchedAt: Date;
}

interface PageCache {
  users?: CacheEntry<AdminUser[]>;
  audit?: CacheEntry<AuditPage>;
  prompts?: CacheEntry<PromptOverride[]>;
  professions?: CacheEntry<AdminProfession[]>;
  templates?: CacheEntry<AdminTemplate[]>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  plus: "bg-teal-100 text-teal-700",
  pro:  "bg-brand-100 text-brand-700",
};

const ACTION_LABELS: Record<string, string> = {
  "job_alert.create":       "Created alert",
  "job_alert.delete":       "Deleted alert",
  "profile.save":           "Saved profile",
  "resume_library.upload":  "Uploaded resume",
  "resume.upload":          "Uploaded resume",
  "resume.generate":        "Generated resume",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(date: Date | null): string {
  if (!date) return "";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Tab header bar (shared) ────────────────────────────────────────────────────

function TabHeader({
  count, label, fetchedAt, loading, onRefresh,
}: {
  count?: number | string;
  label: string;
  fetchedAt: Date | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm text-slate-500">
        {count !== undefined ? `${count} ${label}` : label}
      </p>
      <div className="flex items-center gap-3">
        {fetchedAt && !loading && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <FiClock className="w-3 h-3" /> {timeAgo(fetchedAt)}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}

function Spinner({ text }: { text: string }) {
  return <div className="py-16 text-center text-slate-400">{text}</div>;
}

// ── Users tab ──────────────────────────────────────────────────────────────────

function UserRow({
  user,
  statsCache,
  fetchStats,
  onRefresh,
}: {
  user: AdminUser;
  statsCache: Map<string, UserStats>;
  fetchStats: (id: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [msg, setMsg] = useState("");
  const stats = statsCache.get(user.id);

  // Draft state — edits stay local until Save is clicked
  const [draftTier, setDraftTier] = useState(user.tier);
  const [draftActive, setDraftActive] = useState(user.is_active);
  const [draftAdmin, setDraftAdmin] = useState(user.is_superadmin);

  // Keep draft in sync if the underlying user changes (e.g. after refresh)
  useEffect(() => {
    setDraftTier(user.tier);
    setDraftActive(user.is_active);
    setDraftAdmin(user.is_superadmin);
  }, [user.tier, user.is_active, user.is_superadmin]);

  const dirty =
    draftTier !== user.tier ||
    draftActive !== user.is_active ||
    draftAdmin !== user.is_superadmin;

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  async function handleExpand() {
    const next = !open;
    setOpen(next);
    if (next && !stats) {
      setLoadingStats(true);
      await fetchStats(user.id);
      setLoadingStats(false);
    }
  }

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    // Confirm superadmin grant/revoke since it is a privilege change
    if (draftAdmin !== user.is_superadmin) {
      const ok = draftAdmin
        ? confirm(`Grant superadmin to ${user.email}? They will have full admin access.`)
        : confirm(`Remove superadmin from ${user.email}?`);
      if (!ok) return;
    }
    const payload: { tier?: string; is_active?: boolean; is_superadmin?: boolean } = {};
    if (draftTier !== user.tier) payload.tier = draftTier;
    if (draftActive !== user.is_active) payload.is_active = draftActive;
    if (draftAdmin !== user.is_superadmin) payload.is_superadmin = draftAdmin;

    setActioning(true);
    try {
      await adminUpdateUser(user.id, payload);
      flash("Saved");
      onRefresh();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      flash(detail || "Save failed");
    }
    finally { setActioning(false); }
  }

  function handleReset(e: React.MouseEvent) {
    e.stopPropagation();
    setDraftTier(user.tier);
    setDraftActive(user.is_active);
    setDraftAdmin(user.is_superadmin);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (user.is_superadmin) { flash("Revoke superadmin first"); return; }
    if (!confirm(`Permanently delete ${user.email} and all their data? This cannot be undone.`)) return;
    setActioning(true);
    try {
      await adminDeleteUser(user.id);
      onRefresh();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      flash(detail || "Delete failed");
    }
    finally { setActioning(false); }
  }

  return (
    <>
      <tr className={`hover:bg-slate-50 transition cursor-pointer ${dirty ? "bg-amber-50/40" : ""}`} onClick={handleExpand}>
        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            {open ? <FiChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <FiChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            {user.name}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-600 whitespace-nowrap hidden sm:table-cell">{user.email}</td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <select
            value={draftTier}
            disabled={actioning}
            onChange={e => setDraftTier(e.target.value)}
            className={`text-xs font-semibold rounded-lg px-2 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-40 capitalize ${TIER_COLORS[draftTier] ?? "bg-slate-100 text-slate-600"}`}
          >
            <option value="free">free</option>
            <option value="plus">plus</option>
            <option value="pro">pro</option>
          </select>
        </td>
        <td className="px-4 py-3 text-slate-500 whitespace-nowrap hidden md:table-cell">{formatDate(user.created_at)}</td>
        <td className="px-4 py-3 hidden sm:table-cell">
          <span className={`text-xs font-semibold rounded px-2 py-0.5 ${draftActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {draftActive ? "Active" : "Disabled"}
          </span>
        </td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-3">
            {msg && (
              <span className={`text-xs font-medium whitespace-nowrap ${msg.includes("Revoke") || msg.includes("failed") || msg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
                {msg}
              </span>
            )}

            {/* Superadmin checkbox — edits draft only */}
            <label
              className="flex items-center gap-1.5 cursor-pointer"
              onClick={e => e.stopPropagation()}
              title="Grant or revoke superadmin (applies on Save)"
            >
              <input
                type="checkbox"
                checked={draftAdmin}
                disabled={actioning}
                onChange={e => setDraftAdmin(e.target.checked)}
                className="w-3.5 h-3.5 accent-brand-600 cursor-pointer disabled:opacity-40"
              />
              <span className="text-xs text-slate-500 select-none">Admin</span>
            </label>

            {/* Enable/Disable toggle — edits draft only; superadmins can't be disabled */}
            <button
              onClick={e => { e.stopPropagation(); if (draftAdmin) { flash("Revoke superadmin first"); return; } setDraftActive(v => !v); }}
              disabled={actioning}
              title={draftAdmin ? "Revoke superadmin first" : draftActive ? "Disable account" : "Enable account"}
              className="text-slate-400 hover:text-slate-700 disabled:opacity-40"
            >
              {draftActive
                ? <FiToggleRight className={`w-5 h-5 ${draftAdmin ? "opacity-30" : "text-teal-600"}`} />
                : <FiToggleLeft className="w-5 h-5" />}
            </button>

            <div className="w-px h-4 bg-slate-200" />

            {/* Save — always visible, disabled until something changes */}
            <button
              onClick={handleSave}
              disabled={!dirty || actioning}
              title={dirty ? "Save changes" : "No changes to save"}
              className="flex items-center gap-1 text-xs font-semibold bg-brand-600 text-white rounded-lg px-2.5 py-1 hover:bg-brand-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <FiSave className="w-3 h-3" /> Save
            </button>

            {/* Reset — only shown when dirty */}
            {dirty && (
              <button
                onClick={handleReset}
                disabled={actioning}
                title="Discard changes"
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
              >
                <FiRotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Delete — always available (guarded against superadmin) */}
            <button
              onClick={handleDelete}
              disabled={actioning}
              title={user.is_superadmin ? "Revoke superadmin first" : "Delete user and all data"}
              className="text-slate-400 hover:text-red-500 disabled:opacity-40"
            >
              <FiTrash2 className={`w-4 h-4 ${user.is_superadmin ? "opacity-30" : ""}`} />
            </button>
          </div>
        </td>
      </tr>

      {open && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={6} className="px-6 py-3">
            <div className="flex items-start gap-8 flex-wrap">
              {/* Activity stats */}
              {loadingStats ? (
                <span className="text-xs text-slate-400">Loading activity…</span>
              ) : stats ? (
                <div className="flex gap-6 text-sm">
                  {[
                    ["Sessions",   stats.session_count],
                    ["Resumes",    stats.resume_count],
                    ["Alerts",     stats.alert_count],
                    ["Saved Jobs", stats.saved_job_count],
                  ].map(([label, val]) => (
                    <div key={String(label)}>
                      <span className="text-slate-500 text-xs">{label}</span>
                      <p className="font-semibold text-slate-800">{val}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-slate-400">No stats available.</span>
              )}

            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UsersTab({
  users, loading, fetchedAt, onRefresh, statsCache, fetchStats,
}: {
  users: AdminUser[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
  statsCache: Map<string, UserStats>;
  fetchStats: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"" | "free" | "plus" | "pro">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");

  const filtered = users.filter(u => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q);
    const matchTier = !tierFilter || u.tier === tierFilter;
    const matchStatus = !statusFilter || (statusFilter === "active" ? u.is_active : !u.is_active);
    return matchSearch && matchTier && matchStatus;
  });

  return (
    <div className="space-y-3">
      <TabHeader count={filtered.length === users.length ? users.length : undefined} label={
        filtered.length === users.length ? "total users" : `${filtered.length} of ${users.length} users`
      } fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-8 text-sm h-9 w-full"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <FiX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value as typeof tierFilter)}
          className="input text-sm h-9 w-auto pr-8"
        >
          <option value="">All tiers</option>
          <option value="free">Free</option>
          <option value="plus">Plus</option>
          <option value="pro">Pro</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="input text-sm h-9 w-auto pr-8"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {(search || tierFilter || statusFilter) && (
          <button
            onClick={() => { setSearch(""); setTierFilter(""); setStatusFilter(""); }}
            className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading && !users.length ? <Spinner text="Loading users…" /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  { label: "Name",    cls: "" },
                  { label: "Email",   cls: "hidden sm:table-cell" },
                  { label: "Tier",    cls: "" },
                  { label: "Joined",  cls: "hidden md:table-cell" },
                  { label: "Status",  cls: "hidden sm:table-cell" },
                  { label: "Actions", cls: "text-right" },
                ].map(({ label, cls }) => (
                  <th key={label} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${cls}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(u => (
                <UserRow key={u.id} user={u} statsCache={statsCache} fetchStats={fetchStats} onRefresh={onRefresh} />
              ))}
              {!filtered.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {search || tierFilter || statusFilter ? "No users match the current filters." : "No users found."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">Change Tier, Admin or Active on any row, then click <span className="font-semibold">Save</span> to apply. To delete a superadmin, uncheck Admin, Save, then delete.</p>
    </div>
  );
}

// ── Audit tab ──────────────────────────────────────────────────────────────────

function AuditTab({
  initialData, loading, fetchedAt, onRefresh,
}: {
  initialData: AuditPage | null;
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<AuditPage | null>(initialData);
  const [pageLoading, setPageLoading] = useState(false);

  // Sync when parent refreshes page 1
  useEffect(() => {
    setPage(1);
    setPageData(initialData);
  }, [initialData]);

  async function goToPage(p: number) {
    setPageLoading(true);
    try {
      setPageData(await adminListAudit(p, PAGE_SIZE));
      setPage(p);
    } finally {
      setPageLoading(false);
    }
  }

  const data = pageData;
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const busy = loading || pageLoading;

  return (
    <div>
      <TabHeader
        count={data?.total}
        label="total entries"
        fetchedAt={fetchedAt}
        loading={loading}
        onRefresh={onRefresh}
      />

      {busy && !data ? <Spinner text="Loading audit log…" /> : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    { label: "Time",    cls: "" },
                    { label: "User",    cls: "hidden sm:table-cell" },
                    { label: "Action",  cls: "" },
                    { label: "Details", cls: "hidden md:table-cell" },
                  ].map(({ label, cls }) => (
                    <th key={label} className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${cls}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y divide-slate-100 ${busy ? "opacity-50" : ""}`}>
                {(data?.items ?? []).map(e => (
                  <tr key={e.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{formatDateTime(e.created_at)}</td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap hidden sm:table-cell">{e.user_email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-medium bg-slate-100 text-slate-700 rounded px-2 py-0.5">
                        {ACTION_LABELS[e.action] ?? e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate hidden md:table-cell">
                      {Object.entries(e.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
                {!(data?.items?.length) && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No audit entries yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 1 || busy}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                <FiChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages || busy}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Next <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Prompts tab ────────────────────────────────────────────────────────────────

function PromptCard({ prompt, onSaved }: { prompt: PromptOverride; onSaved: () => void }) {
  const [body, setBody] = useState(prompt.body);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState("");

  // Sync body when parent refreshes
  useEffect(() => { setBody(prompt.body); }, [prompt.body]);

  const isDirty = body !== prompt.body;
  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  async function handleSave() {
    setSaving(true);
    try { await adminUpdatePrompt(prompt.key, body); flash("Saved"); onSaved(); }
    catch { flash("Save failed"); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await adminResetPrompt(prompt.key);
      setBody(res.default_body);
      flash("Reset to default");
      onSaved();
    } catch { flash("Reset failed"); }
    finally { setResetting(false); }
  }

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-800">{prompt.label}</h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{prompt.key}</p>
        </div>
        <div className="flex items-center gap-2">
          {prompt.is_override && <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5 font-semibold">Override active</span>}
          {msg && <span className={`text-xs font-medium ${msg.includes("fail") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
        </div>
      </div>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={12}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y"
      />
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition"
        >
          <FiSave className="w-3.5 h-3.5" />
          {saving ? "Saving…" : "Save override"}
        </button>
        {prompt.is_override && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <FiRotateCcw className="w-3.5 h-3.5" />
            {resetting ? "Resetting…" : "Reset to default"}
          </button>
        )}
      </div>
    </div>
  );
}

function PromptsTab({
  prompts, loading, fetchedAt, onRefresh,
}: {
  prompts: PromptOverride[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  return (
    <div>
      <TabHeader label="Edit prompts below" fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />
      {loading && !prompts.length ? <Spinner text="Loading prompts…" /> : (
        <>
          <p className="text-sm text-slate-500 mb-5">
            Save an override to replace the hardcoded default. The pipeline uses it immediately. Reset reverts to the original.
          </p>
          {prompts.map(p => <PromptCard key={p.key} prompt={p} onSaved={onRefresh} />)}
        </>
      )}
    </div>
  );
}

// ── Professions tab ────────────────────────────────────────────────────────────

type ProfessionPromptKey = "generator_context" | "evaluator_context" | "scoring_criteria" | "aggregator_context";

const PROMPT_FIELDS: { key: ProfessionPromptKey; label: string; rows: number }[] = [
  { key: "generator_context",  label: "Generator context (appended to generator system prompt)", rows: 6 },
  { key: "evaluator_context",  label: "Evaluator context (appended to all evaluator prompts)", rows: 5 },
  { key: "scoring_criteria",   label: "Scoring criteria (replaces default evaluator scoring guide)", rows: 7 },
  { key: "aggregator_context", label: "Aggregator context (shapes feedback aggregation)", rows: 4 },
];

const EMPTY_PROFESSION: Omit<AdminProfession, "is_active" | "created_at" | "updated_at"> = {
  slug: "", display_name: "", keywords: [],
  generator_context: "", evaluator_context: "",
  scoring_criteria: "", aggregator_context: "", evaluator_names: [],
};

function ProfessionCard({
  profession, onSaved, onDeleted,
}: {
  profession: AdminProfession;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AdminProfession>({ ...profession });
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { setDraft({ ...profession }); }, [profession]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(profession);
  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  async function handleSave() {
    setSaving(true);
    try {
      await adminUpdateProfession(profession.slug, {
        display_name: draft.display_name, keywords: draft.keywords,
        generator_context: draft.generator_context, evaluator_context: draft.evaluator_context,
        scoring_criteria: draft.scoring_criteria, aggregator_context: draft.aggregator_context,
        evaluator_names: draft.evaluator_names,
      });
      flash("Saved");
      onSaved();
    } catch { flash("Save failed"); }
    finally { setSaving(false); }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      await adminUpdateProfession(profession.slug, { is_active: !profession.is_active });
      flash(profession.is_active ? "Deactivated" : "Activated");
      onSaved();
    } catch { flash("Failed"); }
    finally { setToggling(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${profession.display_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await adminDeleteProfession(profession.slug); onDeleted(); }
    catch { flash("Delete failed"); }
    finally { setDeleting(false); }
  }

  return (
    <div className={`card mb-3 ${!profession.is_active ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 text-left">
          {open ? <FiChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <FiChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
          <div>
            <span className="font-semibold text-slate-800">{profession.display_name}</span>
            <span className="ml-2 text-xs font-mono text-slate-400">{profession.slug}</span>
            {!profession.is_active && <span className="ml-2 text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">Inactive</span>}
          </div>
        </button>
        <div className="flex items-center gap-2 ml-3">
          {msg && <span className={`text-xs font-medium ${msg.includes("fail") || msg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
          <button onClick={handleToggle} disabled={toggling} title={profession.is_active ? "Deactivate" : "Activate"} className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
            {profession.is_active ? <FiToggleRight className="w-5 h-5 text-teal-600" /> : <FiToggleLeft className="w-5 h-5" />}
          </button>
          {profession.slug !== "generic" && (
            <button onClick={handleDelete} disabled={deleting} title="Delete" className="text-slate-400 hover:text-red-500 disabled:opacity-50">
              <FiTrash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Display name</label>
            <input value={draft.display_name} onChange={e => setDraft(d => ({ ...d, display_name: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Keywords (comma-separated — matched against target role)</label>
            <input
              value={draft.keywords.join(", ")}
              onChange={e => setDraft(d => ({ ...d, keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          {PROMPT_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{f.label}</label>
              <textarea rows={f.rows} value={String(draft[f.key] ?? "")}
                onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
            </div>
          ))}
          <button onClick={handleSave} disabled={saving || !isDirty}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition">
            <FiSave className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

function NewProfessionForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_PROFESSION });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleCreate() {
    if (!draft.slug.trim() || !draft.display_name.trim()) { setErr("Slug and display name are required."); return; }
    setSaving(true); setErr("");
    try {
      await adminCreateProfession({ ...draft, slug: draft.slug.trim().toLowerCase().replace(/\s+/g, "_") });
      setDraft({ ...EMPTY_PROFESSION }); setOpen(false); onCreated();
    } catch { setErr("Create failed — slug may already exist."); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 text-sm hover:border-brand-400 hover:text-brand-600 transition w-full justify-center mt-2">
        <FiPlus className="w-4 h-4" /> New profession
      </button>
    );
  }

  return (
    <div className="card mt-3 border-brand-200 bg-brand-50/30">
      <h3 className="font-semibold text-slate-800 mb-4">New profession</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Slug (unique, lowercase)</label>
            <input value={draft.slug} onChange={e => setDraft(d => ({ ...d, slug: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="e.g. data_scientist" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Display name</label>
            <input value={draft.display_name} onChange={e => setDraft(d => ({ ...d, display_name: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="e.g. Data Scientist" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Keywords (comma-separated)</label>
          <input value={draft.keywords.join(", ")}
            onChange={e => setDraft(d => ({ ...d, keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="data scientist, data analyst, ml engineer" />
        </div>
        {PROMPT_FIELDS.map(f => (
          <div key={f.key}>
            <label className="block text-xs font-semibold text-slate-500 mb-1">{f.label}</label>
            <textarea rows={3} value={String(draft[f.key] ?? "")} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
          </div>
        ))}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button onClick={handleCreate} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition">
            <FiPlus className="w-3.5 h-3.5" /> {saving ? "Creating…" : "Create profession"}
          </button>
          <button onClick={() => { setOpen(false); setErr(""); setDraft({ ...EMPTY_PROFESSION }); }}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfessionsTab({
  professions, loading, fetchedAt, onRefresh,
}: {
  professions: AdminProfession[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  const active = professions.filter(p => p.is_active);
  const inactive = professions.filter(p => !p.is_active);

  return (
    <div>
      <TabHeader count={professions.length} label="professions" fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />
      {loading && !professions.length ? <Spinner text="Loading professions…" /> : (
        <>
          <p className="text-sm text-slate-500 mb-5">
            Click a profession to expand and edit its prompts and keywords. Changes take effect on the next resume generation.
          </p>
          {active.map(p => <ProfessionCard key={p.slug} profession={p} onSaved={onRefresh} onDeleted={onRefresh} />)}
          {inactive.length > 0 && (
            <p className="text-xs text-slate-400 mt-4 mb-2 font-semibold uppercase tracking-wide">Inactive</p>
          )}
          {inactive.map(p => <ProfessionCard key={p.slug} profession={p} onSaved={onRefresh} onDeleted={onRefresh} />)}
          <NewProfessionForm onCreated={onRefresh} />
        </>
      )}
    </div>
  );
}

// ── Templates tab ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  prebuilt: "bg-brand-100 text-brand-700",
  custom:   "bg-teal-100 text-teal-700",
};

async function downloadTemplateFile(id: string, name: string) {
  try {
    const res = await api.get(`/api/admin/templates/${id}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert("Download failed — template file may not exist on disk.");
  }
}

function TemplateCard({ template, onSaved, onDeleted }: {
  template: AdminTemplate;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(template.name);
  const [draftDesc, setDraftDesc] = useState(template.description);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  async function handleSave() {
    setSaving(true);
    try {
      await adminUpdateTemplate(template.id, { name: draftName.trim(), description: draftDesc.trim() });
      flash("Saved"); setEditing(false); onSaved();
    } catch { flash("Save failed"); }
    finally { setSaving(false); }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      await adminUpdateTemplate(template.id, { is_active: !template.is_active });
      flash(template.is_active ? "Deactivated" : "Activated"); onSaved();
    } catch { flash("Failed"); }
    finally { setToggling(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete template "${template.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await adminDeleteTemplate(template.id); onDeleted(); }
    catch (e: unknown) {
      const err = e instanceof Error ? e.message : "";
      flash(err.includes("400") ? "Prebuilt templates cannot be deleted." : "Delete failed");
    }
    finally { setDeleting(false); }
  }

  return (
    <div className={`card mb-3 ${!template.is_active ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        {/* Left: name + meta */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2 mb-3">
              <input
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <textarea
                rows={2}
                value={draftDesc}
                onChange={e => setDraftDesc(e.target.value)}
                placeholder="Description…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-slate-800">{template.name}</span>
                <span className={`text-xs font-semibold rounded px-2 py-0.5 ${TYPE_COLORS[template.type] ?? "bg-slate-100 text-slate-600"}`}>
                  {template.type}
                </span>
                {!template.is_active && (
                  <span className="text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">Inactive</span>
                )}
              </div>
              {template.description && (
                <p className="text-sm text-slate-500 mb-2">{template.description}</p>
              )}
            </>
          )}

          {/* Placeholder chips */}
          {template.placeholders.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {template.placeholders.map(p => (
                <span key={p} className="text-xs bg-slate-100 text-slate-600 font-mono rounded px-1.5 py-0.5">{p}</span>
              ))}
            </div>
          )}
          {template.placeholders.length === 0 && !editing && (
            <p className="text-xs text-amber-600 mt-1">No placeholders detected — template may not work correctly.</p>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {msg && <span className={`text-xs font-medium ${msg.includes("fail") || msg.includes("cannot") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}

          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition">
                <FiSave className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setEditing(false); setDraftName(template.name); setDraftDesc(template.description); }}
                className="p-1.5 text-slate-400 hover:text-slate-600">
                <FiX className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} title="Edit name & description"
                className="p-1.5 text-slate-400 hover:text-brand-600 transition">
                <FiEdit2 className="w-4 h-4" />
              </button>
              <button onClick={() => downloadTemplateFile(template.id, template.name)} title="Download DOCX"
                className="p-1.5 text-slate-400 hover:text-teal-600 transition">
                <FiDownload className="w-4 h-4" />
              </button>
              <button onClick={handleToggle} disabled={toggling}
                title={template.is_active ? "Deactivate (hide from users)" : "Activate"}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
                {template.is_active
                  ? <FiToggleRight className="w-5 h-5 text-teal-600" />
                  : <FiToggleLeft className="w-5 h-5" />}
              </button>
              {template.type !== "prebuilt" && (
                <button onClick={handleDelete} disabled={deleting} title="Delete"
                  className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-50 transition">
                  <FiTrash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadTemplateForm({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function handleUpload() {
    if (!file) { setErr("Select a .docx file."); return; }
    if (!name.trim()) { setErr("Template name is required."); return; }
    setUploading(true); setErr("");
    try {
      await adminUploadTemplate(file, name.trim(), description.trim());
      setFile(null); setName(""); setDescription(""); setOpen(false); onUploaded();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(detail || msg || "Upload failed.");
    }
    finally { setUploading(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 text-sm hover:border-brand-400 hover:text-brand-600 transition w-full justify-center mt-2">
        <FiUploadCloud className="w-4 h-4" /> Upload new template
      </button>
    );
  }

  return (
    <div className="card mt-3 border-brand-200 bg-brand-50/30">
      <h3 className="font-semibold text-slate-800 mb-4">Upload new template</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">DOCX file</label>
          <input type="file" accept=".docx"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
          <p className="text-xs text-slate-400 mt-1">
            Must contain at minimum: <span className="font-mono">{`{{NAME}} {{SUMMARY}} {{EXPERIENCE}} {{EDUCATION}}`}</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Template name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Minimal Sidebar"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Description (optional)</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Two-column layout, blue accent"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button onClick={handleUpload} disabled={uploading || !file}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition">
            <FiUploadCloud className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : "Upload"}
          </button>
          <button onClick={() => { setOpen(false); setErr(""); setFile(null); setName(""); setDescription(""); }}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplatesTab({ templates, loading, fetchedAt, onRefresh }: {
  templates: AdminTemplate[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  const active   = templates.filter(t => t.is_active);
  const inactive = templates.filter(t => !t.is_active);

  return (
    <div>
      <TabHeader count={templates.length} label="templates" fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />
      {loading && !templates.length ? <Spinner text="Loading templates…" /> : (
        <>
          <p className="text-sm text-slate-500 mb-5">
            Prebuilt templates cannot be deleted — deactivate them to hide from users.
            Each template must contain at minimum <span className="font-mono text-xs">{`{{NAME}} {{SUMMARY}} {{EXPERIENCE}} {{EDUCATION}}`}</span>.
            Download any template to inspect or edit its DOCX layout.
          </p>
          {active.map(t => <TemplateCard key={t.id} template={t} onSaved={onRefresh} onDeleted={onRefresh} />)}
          {inactive.length > 0 && (
            <p className="text-xs text-slate-400 mt-4 mb-2 font-semibold uppercase tracking-wide">Inactive</p>
          )}
          {inactive.map(t => <TemplateCard key={t.id} template={t} onSaved={onRefresh} onDeleted={onRefresh} />)}
          <UploadTemplateForm onUploaded={onRefresh} />
        </>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "users",       label: "Users",       icon: <FiUsers className="w-4 h-4" /> },
  { id: "audit",       label: "Audit Log",   icon: <FiActivity className="w-4 h-4" /> },
  { id: "prompts",     label: "Prompts",     icon: <FiCpu className="w-4 h-4" /> },
  { id: "professions", label: "Professions", icon: <FiBriefcase className="w-4 h-4" /> },
  { id: "templates",   label: "Templates",   icon: <FiLayout className="w-4 h-4" /> },
  { id: "tier_config", label: "Tier Config", icon: <FiSliders className="w-4 h-4" /> },
];

// ── TierConfigTab ──────────────────────────────────────────────────────────────

const ALL_TIERS = ["free", "plus", "pro"] as const;

function TierConfigTab() {
  const [cfg, setCfg] = useState<TierConfigPayload | null>(null);
  const [draft, setDraft] = useState<TierConfigPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetchTierConfig().then(data => { setCfg(data); setDraft(data); }).catch(() => {});
  }, []);

  if (!draft) return <div className="text-sm text-slate-400 py-8 text-center">Loading tier config…</div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg);

  function toggleFeatureTier(feature: string, tier: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const current = prev.features[feature] ?? [];
      const updated = current.includes(tier)
        ? current.filter(t => t !== tier)
        : [...current, tier];
      return { ...prev, features: { ...prev.features, [feature]: updated } };
    });
  }

  function setLimit(limitKey: string, tier: string, value: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const parsed = value === "" || value === "∞" ? null : parseInt(value, 10);
      return {
        ...prev,
        limits: {
          ...prev.limits,
          [limitKey]: { ...(prev.limits[limitKey] ?? {}), [tier]: isNaN(parsed as number) ? null : parsed },
        },
      };
    });
  }

  // ── Pricing helpers ─────────────────────────────────────────────────────────

  function setPricingField(code: string, field: "symbol" | "plus" | "pro", value: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const pricing = { ...(prev.pricing ?? {}) };
      pricing[code] = {
        ...(pricing[code] ?? { symbol: "", plus: 0, pro: 0 }),
        [field]: field === "symbol" ? value : (parseInt(value, 10) || 0),
      };
      return { ...prev, pricing };
    });
  }

  function addCurrency() {
    setDraft(prev => {
      if (!prev) return prev;
      const pricing = { ...(prev.pricing ?? {}) };
      const code = `CUR${Object.keys(pricing).length + 1}`;
      pricing[code] = { symbol: "", plus: 0, pro: 0 };
      return { ...prev, pricing };
    });
  }

  function renameCurrency(oldCode: string, newCode: string) {
    setDraft(prev => {
      if (!prev || !newCode.trim() || oldCode === newCode.trim()) return prev;
      const pricing = { ...(prev.pricing ?? {}) };
      const entry = pricing[oldCode];
      delete pricing[oldCode];
      pricing[newCode.trim().toUpperCase()] = entry;
      // Update any currency_zones referencing old code
      const zones = (prev.currency_zones ?? []).map(z =>
        z.currency === oldCode ? { ...z, currency: newCode.trim().toUpperCase() } : z
      );
      return { ...prev, pricing, currency_zones: zones };
    });
  }

  function removeCurrency(code: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const pricing = { ...(prev.pricing ?? {}) };
      delete pricing[code];
      return { ...prev, pricing };
    });
  }

  // ── Currency zone helpers ────────────────────────────────────────────────────

  function setZoneField(idx: number, field: keyof import("@/lib/api").CurrencyZone, value: string | string[]) {
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      zones[idx] = { ...zones[idx], [field]: value };
      return { ...prev, currency_zones: zones };
    });
  }

  function addZone() {
    setDraft(prev => {
      if (!prev) return prev;
      const firstCurrency = Object.keys(prev.pricing ?? {})[0] ?? "USD";
      return {
        ...prev,
        currency_zones: [...(prev.currency_zones ?? []), {
          currency: firstCurrency, timezones: [], timezone_prefix: "", locale_codes: [],
        }],
      };
    });
  }

  function removeZone(idx: number) {
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      zones.splice(idx, 1);
      return { ...prev, currency_zones: zones };
    });
  }

  function moveZone(idx: number, dir: -1 | 1) {
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      const target = idx + dir;
      if (target < 0 || target >= zones.length) return prev;
      [zones[idx], zones[target]] = [zones[target], zones[idx]];
      return { ...prev, currency_zones: zones };
    });
  }

  function addTagToZone(idx: number, field: "timezones" | "locale_codes", val: string) {
    if (!val.trim()) return;
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      const existing = zones[idx][field] ?? [];
      if (existing.includes(val.trim())) return prev;
      zones[idx] = { ...zones[idx], [field]: [...existing, val.trim()] };
      return { ...prev, currency_zones: zones };
    });
  }

  function removeTagFromZone(idx: number, field: "timezones" | "locale_codes", val: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      zones[idx] = { ...zones[idx], [field]: (zones[idx][field] ?? []).filter((t: string) => t !== val) };
      return { ...prev, currency_zones: zones };
    });
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setErrors([]);
    try {
      const result = await adminUpdateTierConfig({
        features: draft.features,
        limits: draft.limits,
        pricing: draft.pricing,
        currency_zones: draft.currency_zones,
      });
      setCfg(result);
      setDraft(result);
      toast.success("Tier config saved and reloaded.");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { errors?: string[] } | string } } })?.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.errors) {
        setErrors(detail.errors);
      } else {
        toast.error("Save failed — check the console for details.");
      }
    } finally { setSaving(false); }
  }

  const featureLabels = draft.feature_labels ?? {};
  const limitLabels   = draft.limit_labels   ?? {};
  const pricingEntries = Object.entries(draft.pricing ?? {});
  const currencyZones  = draft.currency_zones ?? [];
  const currencyCodes  = Object.keys(draft.pricing ?? {});

  return (
    <div className="space-y-8">
      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <FiAlertCircle className="w-4 h-4" /> Config has contradictions — fix before saving:
          </p>
          {errors.map((e, i) => <p key={i} className="text-xs text-red-600 pl-6">{e}</p>)}
        </div>
      )}

      {/* ── Feature gates ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Feature Gates</h3>
            <p className="text-xs text-slate-400 mt-0.5">Check which tiers can use each feature. Higher tiers must always include features available on lower ones.</p>
          </div>
          {dirty && (
            <button onClick={handleSave} disabled={saving}
              className="btn-primary text-sm gap-1.5 flex items-center disabled:opacity-40">
              <FiSave className="w-3.5 h-3.5" />
              {saving ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5 w-full">Feature</th>
                {ALL_TIERS.map(t => (
                  <th key={t} className="text-center text-xs font-semibold text-slate-500 px-4 py-2.5 capitalize min-w-[70px]">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.keys(draft.features).map(feat => (
                <tr key={feat} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-2.5 text-slate-700 text-xs font-medium">
                    {featureLabels[feat] ?? feat}
                    <span className="ml-2 text-slate-300 font-normal">{feat}</span>
                  </td>
                  {ALL_TIERS.map(tier => (
                    <td key={tier} className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={(draft.features[feat] ?? []).includes(tier)}
                        onChange={() => toggleFeatureTier(feat, tier)}
                        className="w-4 h-4 accent-brand-600 cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Limits ──────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Numeric Limits</h3>
        <p className="text-xs text-slate-400 mb-3">Leave blank or enter ∞ for unlimited. Limits must be non-decreasing across tiers.</p>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5 w-full">Limit</th>
                {ALL_TIERS.map(t => (
                  <th key={t} className="text-center text-xs font-semibold text-slate-500 px-4 py-2.5 capitalize min-w-[90px]">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.keys(draft.limits).map(limitKey => (
                <tr key={limitKey} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-2.5 text-slate-700 text-xs font-medium">
                    {limitLabels[limitKey] ?? limitKey}
                    <span className="ml-2 text-slate-300 font-normal">{limitKey}</span>
                  </td>
                  {ALL_TIERS.map(tier => {
                    const val = draft.limits[limitKey]?.[tier];
                    return (
                      <td key={tier} className="px-4 py-2.5 text-center">
                        <input
                          type="text"
                          value={val === null ? "∞" : (val ?? "")}
                          onChange={e => setLimit(limitKey, tier, e.target.value)}
                          className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                          placeholder="0"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Pricing</h3>
            <p className="text-xs text-slate-400 mt-0.5">Set Plus and Pro prices per currency. Free is always shown as free. Currency is auto-detected from the user&apos;s timezone/locale.</p>
          </div>
          <button onClick={addCurrency} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 hover:border-brand-400 rounded-lg px-2.5 py-1.5 transition">
            <FiPlus className="w-3 h-3" /> Add currency
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5">Code</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5">Symbol</th>
                <th className="text-center text-xs font-semibold text-slate-500 px-4 py-2.5">Plus / mo</th>
                <th className="text-center text-xs font-semibold text-slate-500 px-4 py-2.5">Pro / mo</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pricingEntries.map(([code, entry], idx) => (
                <tr key={code} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      defaultValue={code}
                      onBlur={e => renameCurrency(code, e.target.value)}
                      className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-300"
                      maxLength={5}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={entry.symbol}
                      onChange={e => setPricingField(code, "symbol", e.target.value)}
                      className="w-12 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                      maxLength={3}
                      placeholder="$"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      value={entry.plus}
                      onChange={e => setPricingField(code, "plus", e.target.value)}
                      className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                      min={0}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      value={entry.pro}
                      onChange={e => setPricingField(code, "pro", e.target.value)}
                      className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                      min={0}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    {idx > 0 && (
                      <button onClick={() => removeCurrency(code)} className="text-slate-300 hover:text-red-400 transition p-1">
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">First row is the default currency (fallback when no zone rule matches). Cannot be deleted.</p>
      </div>

      {/* ── Currency detection rules ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Currency Detection Rules</h3>
            <p className="text-xs text-slate-400 mt-0.5">Ordered — first matching rule wins. Users with no match get the default (first) currency.</p>
          </div>
          <button onClick={addZone} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 hover:border-brand-400 rounded-lg px-2.5 py-1.5 transition">
            <FiPlus className="w-3 h-3" /> Add rule
          </button>
        </div>
        <div className="space-y-3">
          {currencyZones.length === 0 && (
            <p className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">No rules — all users will see the default currency.</p>
          )}
          {currencyZones.map((zone, idx) => (
            <ZoneCard
              key={idx}
              zone={zone}
              idx={idx}
              total={currencyZones.length}
              currencyCodes={currencyCodes}
              onCurrencyChange={c => setZoneField(idx, "currency", c)}
              onPrefixChange={p => setZoneField(idx, "timezone_prefix", p)}
              onAddTimezone={v => addTagToZone(idx, "timezones", v)}
              onRemoveTimezone={v => removeTagFromZone(idx, "timezones", v)}
              onAddLocale={v => addTagToZone(idx, "locale_codes", v)}
              onRemoveLocale={v => removeTagFromZone(idx, "locale_codes", v)}
              onMoveUp={() => moveZone(idx, -1)}
              onMoveDown={() => moveZone(idx, 1)}
              onRemove={() => removeZone(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ZoneCard ──────────────────────────────────────────────────────────────────

function ZoneCard({
  zone, idx, total, currencyCodes,
  onCurrencyChange, onPrefixChange,
  onAddTimezone, onRemoveTimezone,
  onAddLocale, onRemoveLocale,
  onMoveUp, onMoveDown, onRemove,
}: {
  zone: import("@/lib/api").CurrencyZone;
  idx: number; total: number; currencyCodes: string[];
  onCurrencyChange: (v: string) => void;
  onPrefixChange: (v: string) => void;
  onAddTimezone: (v: string) => void;
  onRemoveTimezone: (v: string) => void;
  onAddLocale: (v: string) => void;
  onRemoveLocale: (v: string) => void;
  onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void;
}) {
  const [tzInput, setTzInput] = useState("");
  const [locInput, setLocInput] = useState("");

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-400 w-5 shrink-0 text-center">#{idx + 1}</span>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-slate-500 shrink-0">Currency:</span>
          <select
            value={zone.currency}
            onChange={e => onCurrencyChange(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {currencyCodes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={onMoveUp} disabled={idx === 0} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30">
            <FiChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={idx === total - 1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30">
            <FiChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-400 transition">
            <FiX className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Timezone prefix */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 w-32 shrink-0">Timezone prefix:</span>
        <input
          type="text"
          value={zone.timezone_prefix}
          onChange={e => onPrefixChange(e.target.value)}
          placeholder="e.g. Europe/"
          className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <span className="text-xs text-slate-400">matches any timezone starting with this</span>
      </div>

      {/* Exact timezones */}
      <div className="space-y-1.5">
        <span className="text-xs text-slate-500">Exact timezones:</span>
        <div className="flex flex-wrap gap-1.5">
          {zone.timezones.map(tz => (
            <span key={tz} className="flex items-center gap-1 bg-white border border-slate-200 text-xs rounded-full px-2 py-0.5 text-slate-700">
              {tz}
              <button onClick={() => onRemoveTimezone(tz)} className="text-slate-300 hover:text-red-400 ml-0.5">
                <FiX className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={tzInput}
              onChange={e => setTzInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { onAddTimezone(tzInput); setTzInput(""); } }}
              placeholder="Europe/London"
              className="border border-slate-200 rounded-full px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-300 w-36"
            />
            <button onClick={() => { onAddTimezone(tzInput); setTzInput(""); }} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Add</button>
          </div>
        </div>
      </div>

      {/* Locale codes */}
      <div className="space-y-1.5">
        <span className="text-xs text-slate-500">Locale / country codes:</span>
        <div className="flex flex-wrap gap-1.5">
          {zone.locale_codes.map(lc => (
            <span key={lc} className="flex items-center gap-1 bg-white border border-slate-200 text-xs rounded-full px-2 py-0.5 text-slate-700">
              {lc}
              <button onClick={() => onRemoveLocale(lc)} className="text-slate-300 hover:text-red-400 ml-0.5">
                <FiX className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={locInput}
              onChange={e => setLocInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { onAddLocale(locInput); setLocInput(""); } }}
              placeholder="en-GB"
              className="border border-slate-200 rounded-full px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-300 w-24"
            />
            <button onClick={() => { onAddLocale(locInput); setLocInput(""); }} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { data: session, status } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("users");

  // ── Cache (useRef — writes don't trigger re-renders) ───────────────────────
  const cache = useRef<PageCache>({});
  const userStatsCache = useRef<Map<string, UserStats>>(new Map());

  // ── Displayed state (drives the UI) ───────────────────────────────────────
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditData, setAuditData] = useState<AuditPage | null>(null);
  const [prompts, setPrompts] = useState<PromptOverride[]>([]);
  const [professions, setProfessions] = useState<AdminProfession[]>([]);
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState<Record<Tab, boolean>>({ users: false, audit: false, prompts: false, professions: false, templates: false, tier_config: false });
  const [fetchedAt, setFetchedAt] = useState<Record<Tab, Date | null>>({ users: null, audit: null, prompts: null, professions: null, templates: null, tier_config: null });

  function setLoad(t: Tab, v: boolean) { setLoading(prev => ({ ...prev, [t]: v })); }
  function setFetched(t: Tab, d: Date) { setFetchedAt(prev => ({ ...prev, [t]: d })); }

  // ── Fetchers ───────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async (force = false) => {
    if (!force && cache.current.users) {
      setUsers(cache.current.users.data);
      setFetchedAt(prev => ({ ...prev, users: cache.current.users!.fetchedAt }));
      return;
    }
    setLoad("users", true);
    try {
      const data = await adminListUsers();
      const entry = { data, fetchedAt: new Date() };
      cache.current.users = entry;
      setUsers(data);
      setFetched("users", entry.fetchedAt);
    } finally { setLoad("users", false); }
  }, []);

  const fetchAudit = useCallback(async (force = false) => {
    if (!force && cache.current.audit) {
      setAuditData(cache.current.audit.data);
      setFetchedAt(prev => ({ ...prev, audit: cache.current.audit!.fetchedAt }));
      return;
    }
    setLoad("audit", true);
    try {
      const data = await adminListAudit(1, 50);
      const entry = { data, fetchedAt: new Date() };
      cache.current.audit = entry;
      setAuditData(data);
      setFetched("audit", entry.fetchedAt);
    } finally { setLoad("audit", false); }
  }, []);

  const fetchPrompts = useCallback(async (force = false) => {
    if (!force && cache.current.prompts) {
      setPrompts(cache.current.prompts.data);
      setFetchedAt(prev => ({ ...prev, prompts: cache.current.prompts!.fetchedAt }));
      return;
    }
    setLoad("prompts", true);
    try {
      const data = await adminListPrompts();
      const entry = { data, fetchedAt: new Date() };
      cache.current.prompts = entry;
      setPrompts(data);
      setFetched("prompts", entry.fetchedAt);
    } finally { setLoad("prompts", false); }
  }, []);

  const fetchProfessions = useCallback(async (force = false) => {
    if (!force && cache.current.professions) {
      setProfessions(cache.current.professions.data);
      setFetchedAt(prev => ({ ...prev, professions: cache.current.professions!.fetchedAt }));
      return;
    }
    setLoad("professions", true);
    try {
      const data = await adminListProfessions();
      const entry = { data, fetchedAt: new Date() };
      cache.current.professions = entry;
      setProfessions(data);
      setFetched("professions", entry.fetchedAt);
    } finally { setLoad("professions", false); }
  }, []);

  const fetchTemplates = useCallback(async (force = false) => {
    if (!force && cache.current.templates) {
      setTemplates(cache.current.templates.data);
      setFetchedAt(prev => ({ ...prev, templates: cache.current.templates!.fetchedAt }));
      return;
    }
    setLoad("templates", true);
    try {
      const data = await adminListTemplates();
      const entry = { data, fetchedAt: new Date() };
      cache.current.templates = entry;
      setTemplates(data);
      setFetched("templates", entry.fetchedAt);
    } finally { setLoad("templates", false); }
  }, []);

  // Per-user stats — fetched on expand, cached in a Map
  const fetchUserStats = useCallback(async (userId: string) => {
    if (userStatsCache.current.has(userId)) return;
    try {
      const stats = await adminGetUserStats(userId);
      userStatsCache.current.set(userId, stats);
      // Force a re-render so the expanded row shows the stats
      setUsers(prev => [...prev]);
    } catch { /* silently ignore */ }
  }, []);

  // Refresh handlers — clear cache entry then re-fetch
  function refreshTab(t: Tab) {
    if (t === "users")       { cache.current.users       = undefined; fetchUsers(true); }
    if (t === "audit")       { cache.current.audit       = undefined; fetchAudit(true); }
    if (t === "prompts")     { cache.current.prompts     = undefined; fetchPrompts(true); }
    if (t === "professions") { cache.current.professions = undefined; fetchProfessions(true); }
    if (t === "templates")   { cache.current.templates   = undefined; fetchTemplates(true); }
  }

  function handleTabSelect(t: Tab) {
    setTab(t);
    if (t === "users")       fetchUsers();
    if (t === "audit")       fetchAudit();
    if (t === "prompts")     fetchPrompts();
    if (t === "professions") fetchProfessions();
    if (t === "templates")   fetchTemplates();
  }

  // Fetch users only after auth is confirmed — prevents blank tab on first load
  // (the initial render fires before NextAuth sets the Bearer token on the axios instance)
  useEffect(() => {
    if (status === "authenticated" && session?.user?.is_superadmin) {
      fetchUsers();
    }
  }, [status, session?.user?.is_superadmin, fetchUsers]);

  // Auth guard
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
    if (status === "authenticated" && !session?.user?.is_superadmin) router.replace("/");
  }, [status, session, router]);

  if (status === "loading" || !session?.user?.is_superadmin) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Checking access…</div>;
  }

  return (
    <main className="bg-slate-50">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Superadmin only. Tabs load on first click and cache until you refresh.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 mb-6 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => handleTabSelect(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.id ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.icon}
              {t.label}
              {fetchedAt[t.id] && tab !== t.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" title="Cached" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {tab === "users" && (
            <UsersTab
              users={users}
              loading={loading.users}
              fetchedAt={fetchedAt.users}
              onRefresh={() => refreshTab("users")}
              statsCache={userStatsCache.current}
              fetchStats={fetchUserStats}
            />
          )}
          {tab === "audit" && (
            <AuditTab
              initialData={auditData}
              loading={loading.audit}
              fetchedAt={fetchedAt.audit}
              onRefresh={() => refreshTab("audit")}
            />
          )}
          {tab === "prompts" && (
            <PromptsTab
              prompts={prompts}
              loading={loading.prompts}
              fetchedAt={fetchedAt.prompts}
              onRefresh={() => refreshTab("prompts")}
            />
          )}
          {tab === "professions" && (
            <ProfessionsTab
              professions={professions}
              loading={loading.professions}
              fetchedAt={fetchedAt.professions}
              onRefresh={() => refreshTab("professions")}
            />
          )}
          {tab === "templates" && (
            <TemplatesTab
              templates={templates}
              loading={loading.templates}
              fetchedAt={fetchedAt.templates}
              onRefresh={() => refreshTab("templates")}
            />
          )}
          {tab === "tier_config" && <TierConfigTab />}
        </div>
      </div>
    </main>
  );
}
