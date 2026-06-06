"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import toast from "react-hot-toast";
import {
  adminListUsers, adminGetUserStats, adminUpdateUser, adminDeleteUser,
  adminListAudit, adminListPrompts,
  adminUpdatePrompt, adminResetPrompt,
  adminListProfessions, adminCreateProfession, adminUpdateProfession, adminDeleteProfession,
  adminGetAgentMemory,
  AdminUser, UserStats, AuditPage, PromptOverride, AdminProfession, AgentMemory,
} from "@/lib/api";
import {
  FiUsers, FiActivity, FiCpu, FiRefreshCw, FiSave, FiRotateCcw,
  FiChevronLeft, FiChevronRight, FiBriefcase, FiPlus, FiTrash2,
  FiChevronDown, FiChevronUp, FiToggleLeft, FiToggleRight, FiClock,
  FiDownload, FiEdit2, FiX, FiSliders, FiAlertCircle,
  FiGrid, FiCopy, FiZap, FiEye, FiBell,
} from "react-icons/fi";
import { adminUpdateTierConfig, fetchTierConfig, type TierConfigPayload } from "@/lib/api";
import {
  adminListCvTemplates, adminCreateCvTemplate, adminUpdateCvTemplate,
  adminDeleteCvTemplate, adminGenerateCvTemplate,
  fetchSystemConfig, updateSystemConfig, type SystemConfig,
} from "@/lib/api";
import { render as renderTpl, renderCtx, type CvTemplate, type DocxConfig, type PreviewData } from "@/lib/cvTemplates";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = "users" | "audit" | "agent_memory" | "prompts" | "cv_score_prompts" | "professions" | "manage_templates" | "tier_config" | "system";

interface CacheEntry<T> {
  data: T;
  fetchedAt: Date;
}

interface PageCache {
  users?: CacheEntry<AdminUser[]>;
  audit?: CacheEntry<AuditPage>;
  agent_memory?: CacheEntry<AgentMemory[]>;
  prompts?: CacheEntry<PromptOverride[]>;
  professions?: CacheEntry<AdminProfession[]>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  plus: "bg-teal-100 text-teal-700",
  pro:  "bg-brand-100 text-brand-700",
};

const ACTION_LABELS: Record<string, string> = {
  "user.update":            "Updated user",
  "user.delete":            "Deleted user",
  "profile.save":           "Saved profile",
  "resume.generate":        "Generated resume",
  "resume.generate.complete": "Generated resume (AI)",
  "resume.export":          "Exported resume",
  "resume_library.upload":  "Uploaded to library",
  "job_alert.create":       "Created alert",
  "job_alert.delete":       "Deleted alert",
  "cv_template.create":     "Created template",
  "cv_template.update":     "Updated template",
  "cv_template.delete":     "Deleted template",
  "cv_template.generate":   "AI-generated template",
  "system_config.update":   "Changed system settings",
};

// ── Reusable per-column table filters ──────────────────────────────────────────
// Rendered in a second header row so each column filters itself, instead of a
// separate filter bar above the table. Shared across admin tables (Users, Audit).
const COL_FILTER_INPUT =
  "w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-normal normal-case " +
  "text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-300";

function ColFilterText({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "Filter…"}
        className={`${COL_FILTER_INPUT} pr-6`}
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
          <FiX className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function ColFilterSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={COL_FILTER_INPUT}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Small coloured chip for the account type shown next to a user in the audit log.
const ACCOUNT_BADGE: Record<string, { label: string; cls: string }> = {
  free:      { label: "Free",      cls: "bg-slate-100 text-slate-600" },
  plus:      { label: "Plus",      cls: "bg-blue-100 text-blue-700" },
  pro:       { label: "Pro",       cls: "bg-amber-100 text-amber-700" },
  anonymous: { label: "Anonymous", cls: "bg-slate-100 text-slate-400 italic" },
};

function AccountTypeBadge({ tier }: { tier?: string }) {
  const t = (tier || "free").toLowerCase();
  const b = ACCOUNT_BADGE[t] ?? ACCOUNT_BADGE.free;
  return <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap ${b.cls}`}>{b.label}</span>;
}

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
  const [nameFilter, setNameFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [tierFilter, setTierFilter] = useState<"" | "free" | "plus" | "pro">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const anyFilter = !!(nameFilter || emailFilter || tierFilter || statusFilter);

  const filtered = users.filter(u => {
    const matchName = !nameFilter || u.name.toLowerCase().includes(nameFilter.trim().toLowerCase());
    const matchEmail = !emailFilter || u.email.toLowerCase().includes(emailFilter.trim().toLowerCase());
    const matchTier = !tierFilter || u.tier === tierFilter;
    const matchStatus = !statusFilter || (statusFilter === "active" ? u.is_active : !u.is_active);
    return matchName && matchEmail && matchTier && matchStatus;
  });

  const clearAll = () => { setNameFilter(""); setEmailFilter(""); setTierFilter(""); setStatusFilter(""); };

  return (
    <div className="space-y-3">
      <TabHeader count={filtered.length === users.length ? users.length : undefined} label={
        filtered.length === users.length ? "total users" : `${filtered.length} of ${users.length} users`
      } fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />

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
                  <th key={label} className={`px-4 pt-3 pb-1.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${cls}`}>{label}</th>
                ))}
              </tr>
              {/* Per-column filter row */}
              <tr className="border-t border-slate-100">
                <th className="px-3 pb-2 align-top">
                  <ColFilterText value={nameFilter} onChange={setNameFilter} placeholder="Filter name…" />
                </th>
                <th className="px-3 pb-2 align-top hidden sm:table-cell">
                  <ColFilterText value={emailFilter} onChange={setEmailFilter} placeholder="Filter email…" />
                </th>
                <th className="px-3 pb-2 align-top">
                  <ColFilterSelect value={tierFilter} onChange={v => setTierFilter(v as typeof tierFilter)} options={[
                    { value: "", label: "All tiers" },
                    { value: "free", label: "Free" },
                    { value: "plus", label: "Plus" },
                    { value: "pro", label: "Pro" },
                  ]} />
                </th>
                <th className="px-3 pb-2 align-top hidden md:table-cell" />
                <th className="px-3 pb-2 align-top hidden sm:table-cell">
                  <ColFilterSelect value={statusFilter} onChange={v => setStatusFilter(v as typeof statusFilter)} options={[
                    { value: "", label: "All statuses" },
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]} />
                </th>
                <th className="px-3 pb-2 align-top text-right">
                  {anyFilter && (
                    <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-2 whitespace-nowrap">Clear</button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(u => (
                <UserRow key={u.id} user={u} statsCache={statsCache} fetchStats={fetchStats} onRefresh={onRefresh} />
              ))}
              {!filtered.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {anyFilter ? "No users match the current filters." : "No users found."}
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

  // Per-column filters (applied to the current page — the log is server-paginated).
  const [userF, setUserF] = useState("");
  const [actionF, setActionF] = useState("");
  const items = data?.items ?? [];
  const actionOptions = [
    { value: "", label: "All actions" },
    ...Array.from(new Set(items.map(i => i.action))).map(a => ({ value: a, label: ACTION_LABELS[a] ?? a })),
  ];
  const shown = items.filter(e =>
    (!userF || e.user_email.toLowerCase().includes(userF.trim().toLowerCase())) &&
    (!actionF || e.action === actionF)
  );
  const num = (v: unknown) =>
    typeof v === "number" ? v.toLocaleString()
      : (v != null && !isNaN(Number(v)) ? Number(v).toLocaleString() : "—");
  const cost = (v: unknown) => typeof v === "number" ? `$${v.toFixed(4)}` : "—";

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
                    { label: "Time",      cls: "" },
                    { label: "User",      cls: "hidden sm:table-cell" },
                    { label: "Action",    cls: "" },
                    { label: "Cycles",    cls: "text-right whitespace-nowrap" },
                    { label: "LLM Calls", cls: "text-right" },
                    { label: "Tokens",    cls: "text-right hidden sm:table-cell" },
                    { label: "Est. Cost", cls: "text-right" },
                    { label: "Details",   cls: "hidden lg:table-cell" },
                  ].map(({ label, cls }) => (
                    <th key={label} className={`px-4 pt-3 pb-1.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${cls}`}>{label}</th>
                  ))}
                </tr>
                {/* Per-column filter row */}
                <tr className="border-t border-slate-100">
                  <th className="px-3 pb-2 align-top" />
                  <th className="px-3 pb-2 align-top hidden sm:table-cell">
                    <ColFilterText value={userF} onChange={setUserF} placeholder="Filter user…" />
                  </th>
                  <th className="px-3 pb-2 align-top">
                    <ColFilterSelect value={actionF} onChange={setActionF} options={actionOptions} />
                  </th>
                  <th className="px-3 pb-2 align-top" />
                  <th className="px-3 pb-2 align-top" />
                  <th className="px-3 pb-2 align-top hidden sm:table-cell" />
                  <th className="px-3 pb-2 align-top" />
                  <th className="px-3 pb-2 align-top hidden lg:table-cell" />
                </tr>
              </thead>
              <tbody className={`divide-y divide-slate-100 ${busy ? "opacity-50" : ""}`}>
                {shown.map(e => {
                  const md = e.metadata as Record<string, unknown>;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{formatDateTime(e.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-700">{e.user_email || "—"}</span>
                          <AccountTypeBadge tier={e.user_tier} />
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-medium bg-slate-100 text-slate-700 rounded px-2 py-0.5">
                          {ACTION_LABELS[e.action] ?? e.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {typeof md.cycles === "number" ? `${md.cycles} / ${num(md.max_cycles)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 tabular-nums">{num(md.llm_calls)}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 tabular-nums hidden sm:table-cell">{num(md.tokens)}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 tabular-nums">{cost(md.est_cost_usd)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate hidden lg:table-cell">
                        {Object.entries(e.metadata)
                          .filter(([k]) => !["cycles", "max_cycles", "llm_calls", "tokens", "est_cost_usd", "cache_read_tokens"].includes(k))
                          .map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    {items.length ? "No entries match the current filters." : "No audit entries yet."}
                  </td></tr>
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

// ── Agent Memory tab (read-only) ────────────────────────────────────────────────

const LESSON_STYLE: Record<string, { label: string; cls: string }> = {
  worked:  { label: "What worked",   cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  didnt:   { label: "What fell short", cls: "border-rose-200 bg-rose-50 text-rose-800" },
  improve: { label: "Improve next time", cls: "border-amber-200 bg-amber-50 text-amber-800" },
};

function AgentMemoryTab({
  data, loading, fetchedAt, onRefresh,
}: {
  data: AgentMemory[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  const fmtCost = (v?: number) => (typeof v === "number" ? `$${v.toFixed(3)}` : "—");
  const fmt = (v?: number) => (typeof v === "number" ? v.toLocaleString() : "—");

  return (
    <div className="space-y-3">
      <TabHeader count={data.length} label="agents" fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />
      <p className="text-sm text-slate-500">
        Read-only. Each agent learns from its own past runs — what worked, what fell short, and how to do better next
        time for both quality and cost. The generator folds its <span className="font-medium">Improve next time</span> hints
        back into its prompt so first drafts pre-empt known weaknesses and need fewer (cheaper) refine cycles.
      </p>

      {loading && !data.length ? <Spinner text="Loading agent memory…" /> : (
        <div className="space-y-4">
          {data.map(a => (
            <div key={a.agent} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <FiCpu className="w-4 h-4 text-brand-500" />
                    <h3 className="font-semibold text-slate-900 capitalize">{a.agent}</h3>
                    <span className="text-xs text-slate-400">{a.stats.runs} run{a.stats.runs === 1 ? "" : "s"}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{a.description}</p>
                </div>
                {/* Stat chips */}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {a.stats.avg_first_score !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">First draft {a.stats.avg_first_score}</span>
                  )}
                  {a.stats.avg_cycles !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">{a.stats.avg_cycles} cycles avg</span>
                  )}
                  {a.stats.pass_rate_pct !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">{a.stats.pass_rate_pct}% pass</span>
                  )}
                  {a.stats.avg_cost_usd !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">{fmtCost(a.stats.avg_cost_usd)}/run</span>
                  )}
                  {a.stats.avg_score !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">avg score {a.stats.avg_score}</span>
                  )}
                </div>
              </div>

              {a.stats.runs === 0 ? (
                <p className="text-xs text-slate-400 mt-3 italic">No runs recorded yet — lessons appear once this agent has done some work.</p>
              ) : (
                <>
                  {a.weaknesses.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-500">Recurring weaknesses:</span>
                      {a.weaknesses.slice(0, 5).map(([w, n]) => (
                        <span key={w} className="text-xs rounded bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5">{w} · {fmt(n)}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    {a.lessons.map((l, i) => {
                      const s = LESSON_STYLE[l.kind] ?? LESSON_STYLE.worked;
                      return (
                        <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${s.cls}`}>
                          <span className="font-semibold">{s.label}: </span>{l.text}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
          {!data.length && (
            <div className="rounded-xl border border-slate-200 px-4 py-10 text-center text-slate-400">No agent memory yet.</div>
          )}
        </div>
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
  prompts, loading, fetchedAt, onRefresh, headerLabel = "Edit prompts below",
}: {
  prompts: PromptOverride[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
  headerLabel?: string;
}) {
  return (
    <div>
      <TabHeader label={headerLabel} fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />
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

// ── (DOCX Templates tab removed — resume templates now live in the
//     "Resume Templates" tab, backed by the cv_templates collection.) ──────────


// ── Page ───────────────────────────────────────────────────────────────────────

// ── Resume Templates tab (HTML preview templates — `cv_templates`) ─────────────

// Sample CV used to render template previews in the admin screen.
const SAMPLE_PREVIEW: PreviewData = {
  name: "Alex Morgan", title: "Senior Product Manager",
  email: "alex.morgan@email.com", phone: "+1 (555) 012-3456",
  location: "San Francisco, CA", linkedin: "linkedin.com/in/alexmorgan",
  summary: "Product leader with 8+ years shipping data-driven B2B SaaS. Led cross-functional teams to grow ARR 3× and cut churn by 40% through disciplined discovery and outcome-focused roadmaps.",
  skills: ["Product Strategy", "Roadmapping", "SQL", "A/B Testing", "User Research", "Stakeholder Management", "Figma", "Analytics"],
  experience: [
    { title: "Senior Product Manager", company: "NovaCloud", date: "2021 — Present",
      bullets: ["Drove a platform redesign that lifted activation 28% and added $4.2M ARR.", "Built the experimentation program (A/B) now used by 6 squads.", "Defined the north-star metric framework adopted company-wide."] },
    { title: "Product Manager", company: "BrightData", date: "2018 — 2021",
      bullets: ["Launched self-serve onboarding, cutting time-to-value from 14 to 3 days.", "Partnered with sales to close 3 enterprise logos worth $1.8M."] },
    { title: "Associate PM", company: "Loop", date: "2016 — 2018",
      bullets: ["Shipped mobile notifications increasing DAU retention by 12%."] },
  ],
  education: [
    { degree: "B.S. Computer Science", school: "UC Berkeley", year: "2016" },
  ],
  extra_sections: [
    { title: "Certifications", items: ["Pragmatic Institute PMC-III", "AWS Cloud Practitioner"] },
    { title: "Key Achievements", items: ["Grew ARR 3× in 2 years", "Reduced churn 40%"] },
  ],
};

const CV_CATEGORIES = ["Classic", "Modern", "Creative", "Executive", "ATS"] as const;
const CV_TIERS = ["free", "plus"] as const;
const DOCX_LAYOUTS = ["single", "sidebar", "two-equal", "left-bar"];
const DOCX_HEADERS = ["centered", "banner", "serif-centered", "left"];
const DOCX_HEADINGS = ["rule", "colored", "left-border", "double-rule", "gold-rule", "circle-marker"];
const DOCX_FONTS = ["Calibri", "Times New Roman", "Georgia", "Courier New"];

function renderPreviewDoc(html: string, accentColor: string): string {
  try { return renderTpl(html, renderCtx(SAMPLE_PREVIEW, accentColor)); }
  catch { return "<html><body style='font-family:sans-serif;padding:20px;color:#b91c1c'>Preview error — check the template HTML.</body></html>"; }
}

// Scaled iframe preview (matches the A4 thumbnail approach used elsewhere).
function CvPreviewFrame({ html, accentColor, scale = 0.34, heightFactor = 0.72, title }: {
  html: string; accentColor: string; scale?: number; heightFactor?: number; title?: string;
}) {
  const A4_W = 794;
  const srcDoc = useMemo(() => renderPreviewDoc(html, accentColor), [html, accentColor]);
  const frameH = Math.round(A4_W * 1.414 * scale * heightFactor);
  return (
    <div style={{ height: frameH, width: Math.round(A4_W * scale), overflow: "hidden", position: "relative", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", flexShrink: 0 }}>
      <iframe srcDoc={srcDoc} sandbox="allow-same-origin allow-scripts" scrolling="no" title={title || "preview"}
        style={{ position: "absolute", top: 0, left: 0, width: A4_W, height: Math.round(A4_W * 1.414),
          border: "none", transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />
    </div>
  );
}

function copyHtml(tmpl: { html: string; accentColor: string }, flash: (s: string) => void) {
  const doc = renderPreviewDoc(tmpl.html, tmpl.accentColor);
  navigator.clipboard.writeText(doc).then(() => flash("Copied HTML"), () => flash("Copy failed"));
}

function downloadHtml(tmpl: { html: string; accentColor: string; key: string }) {
  const doc = renderPreviewDoc(tmpl.html, tmpl.accentColor);
  const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${tmpl.key}.html`; a.click();
  URL.revokeObjectURL(url);
}

// Shared editor body for metadata + DOCX knobs + HTML (used by edit & generate-save).
function TemplateFields({ draft, setDraft }: {
  draft: Partial<CvTemplate>; setDraft: (fn: (d: Partial<CvTemplate>) => Partial<CvTemplate>) => void;
}) {
  const cfg: DocxConfig = (draft.docx_config ?? {} as DocxConfig);
  const setCfg = (k: keyof DocxConfig, v: string | number | boolean) =>
    setDraft(d => ({ ...d, docx_config: { ...(d.docx_config ?? {} as DocxConfig), [k]: v } }));
  const inputCls = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300";
  const lblCls = "block text-[11px] font-semibold text-slate-500 mb-1";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lblCls}>Name</label>
          <input className={inputCls} value={draft.name ?? ""} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></div>
        <div><label className={lblCls}>Accent colour</label>
          <input type="color" className="w-full h-9 rounded-lg border border-slate-200" value={draft.accentColor ?? "#1d4ed8"} onChange={e => setDraft(d => ({ ...d, accentColor: e.target.value }))} /></div>
        <div><label className={lblCls}>Category</label>
          <select className={inputCls} value={draft.category ?? "Modern"} onChange={e => setDraft(d => ({ ...d, category: e.target.value as CvTemplate["category"] }))}>
            {CV_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label className={lblCls}>Tier</label>
          <select className={inputCls} value={draft.tier ?? "plus"} onChange={e => setDraft(d => ({ ...d, tier: e.target.value as CvTemplate["tier"] }))}>
            {CV_TIERS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><label className={lblCls}>Pages</label>
          <select className={inputCls} value={draft.pages ?? 2} onChange={e => setDraft(d => ({ ...d, pages: Number(e.target.value) as 1 | 2 }))}>
            <option value={1}>1</option><option value={2}>2</option></select></div>
        <div><label className={lblCls}>Best for</label>
          <input className={inputCls} value={draft.bestFor ?? ""} onChange={e => setDraft(d => ({ ...d, bestFor: e.target.value }))} /></div>
      </div>
      <div><label className={lblCls}>Description</label>
        <input className={inputCls} value={draft.description ?? ""} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} /></div>
      <div><label className={lblCls}>Traits (comma-separated)</label>
        <input className={inputCls} value={(draft.traits ?? []).join(", ")} onChange={e => setDraft(d => ({ ...d, traits: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} /></div>

      <div className="pt-2 border-t border-slate-100">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">DOCX download layout</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div><label className={lblCls}>Layout</label>
            <select className={inputCls} value={cfg.layout ?? "single"} onChange={e => setCfg("layout", e.target.value)}>
              {DOCX_LAYOUTS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className={lblCls}>Header</label>
            <select className={inputCls} value={cfg.header ?? "centered"} onChange={e => setCfg("header", e.target.value)}>
              {DOCX_HEADERS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className={lblCls}>Heading</label>
            <select className={inputCls} value={cfg.heading ?? "rule"} onChange={e => setCfg("heading", e.target.value)}>
              {DOCX_HEADINGS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className={lblCls}>Font</label>
            <select className={inputCls} value={cfg.font ?? "Calibri"} onChange={e => setCfg("font", e.target.value)}>
              {DOCX_FONTS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className={lblCls}>Accent (hex)</label>
            <input className={inputCls} value={cfg.accent ?? ""} onChange={e => setCfg("accent", e.target.value)} placeholder="1d4ed8" /></div>
          <div><label className={lblCls}>Sidebar colour</label>
            <input className={inputCls} value={cfg.sidebar_color ?? ""} onChange={e => setCfg("sidebar_color", e.target.value)} placeholder="(hex)" /></div>
          <div><label className={lblCls}>Sidebar ratio</label>
            <input className={inputCls} type="number" step="0.05" min="0" max="0.6" value={cfg.sidebar_ratio ?? 0} onChange={e => setCfg("sidebar_ratio", Number(e.target.value))} /></div>
          <label className="flex items-center gap-2 mt-5 text-sm text-slate-600">
            <input type="checkbox" checked={!!cfg.compact} onChange={e => setCfg("compact", e.target.checked)} className="accent-brand-600" /> Compact</label>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100">
        <label className={lblCls}>Template HTML (standalone, Mustache placeholders) — live preview on the right</label>
        <div className="flex gap-3">
          <textarea rows={14} value={draft.html ?? ""} onChange={e => setDraft(d => ({ ...d, html: e.target.value }))}
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
          <CvPreviewFrame html={draft.html ?? ""} accentColor={draft.accentColor ?? "#1d4ed8"} scale={0.4} heightFactor={1.0} />
        </div>
      </div>
    </div>
  );
}

function CvTemplateCard({ tmpl, onChanged }: { tmpl: CvTemplate; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<CvTemplate>>(tmpl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setDraft(tmpl); }, [tmpl]);
  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 2500); }

  async function patch(body: Partial<CvTemplate>, ok = "Saved") {
    setBusy(true);
    try { await adminUpdateCvTemplate(tmpl.key, body); flash(ok); onChanged(); }
    catch (e: unknown) { flash((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  }
  async function saveEdit() {
    setBusy(true);
    try {
      await adminUpdateCvTemplate(tmpl.key, {
        name: draft.name, category: draft.category, tier: draft.tier, pages: draft.pages,
        bestFor: draft.bestFor, description: draft.description, traits: draft.traits,
        accentColor: draft.accentColor, html: draft.html, docx_config: draft.docx_config,
      });
      flash("Saved"); setEditing(false); onChanged();
    } catch (e: unknown) { flash((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  }
  async function del() {
    if (!confirm(`Delete template "${tmpl.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try { await adminDeleteCvTemplate(tmpl.key); onChanged(); }
    catch (e: unknown) { flash((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Delete failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className={`card ${!tmpl.is_active ? "opacity-60" : ""}`}>
      <div className="flex gap-4">
        <CvPreviewFrame html={tmpl.html} accentColor={tmpl.accentColor} title={tmpl.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-slate-800">{tmpl.name}</span>
            <span className="text-[10px] font-mono text-slate-400">{tmpl.key}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{tmpl.category}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{tmpl.pages}-page</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700">{tmpl.tier}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{tmpl.source}</span>
            {!tmpl.is_active && <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">Inactive</span>}
          </div>
          <p className="text-xs text-slate-500 line-clamp-2 mb-2">{tmpl.description}</p>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={tmpl.show_in_cv_score} disabled={busy}
                onChange={e => patch({ show_in_cv_score: e.target.checked }, e.target.checked ? "Shown in CV Score" : "Hidden from CV Score")}
                className="accent-brand-600" />
              Show in CV Score
            </label>
            <button onClick={() => patch({ is_active: !tmpl.is_active }, tmpl.is_active ? "Deactivated" : "Activated")} disabled={busy}
              title={tmpl.is_active ? "Deactivate (hide from users)" : "Activate"} className="text-slate-400 hover:text-slate-600 disabled:opacity-40">
              {tmpl.is_active ? <FiToggleRight className="w-5 h-5 text-teal-600" /> : <FiToggleLeft className="w-5 h-5" />}
            </button>
            <button onClick={() => setEditing(v => !v)} title="Edit" className="text-slate-400 hover:text-brand-600"><FiEdit2 className="w-4 h-4" /></button>
            <button onClick={() => copyHtml(tmpl, flash)} title="Copy rendered HTML" className="text-slate-400 hover:text-brand-600"><FiCopy className="w-4 h-4" /></button>
            <button onClick={() => downloadHtml(tmpl)} title="Download .html" className="text-slate-400 hover:text-teal-600"><FiDownload className="w-4 h-4" /></button>
            {tmpl.source !== "builtin" && (
              <button onClick={del} disabled={busy} title="Delete" className="text-slate-400 hover:text-red-500 disabled:opacity-40"><FiTrash2 className="w-4 h-4" /></button>
            )}
            {msg && <span className={`text-xs font-medium ${msg.includes("fail") || msg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <TemplateFields draft={draft} setDraft={setDraft} />
          <div className="flex gap-2 mt-3">
            <button onClick={saveEdit} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              <FiSave className="w-3.5 h-3.5" /> {busy ? "Saving…" : "Save changes"}</button>
            <button onClick={() => { setEditing(false); setDraft(tmpl); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GenerateTemplatePanel({ templates, onCreated }: { templates: CvTemplate[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [baseKey, setBaseKey] = useState("");
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Partial<CvTemplate> | null>(null);
  const [saving, setSaving] = useState(false);

  async function generate() {
    if (!prompt.trim()) { setErr("Describe the template you want."); return; }
    setGenerating(true); setErr("");
    try {
      const res = await adminGenerateCvTemplate(prompt, baseKey || undefined);
      const m = res.suggested_metadata || {};
      setDraft({
        name: m.name || "New Template", category: m.category || "Modern", tier: "plus",
        pages: (m.pages as 1 | 2) || 2, bestFor: m.bestFor || "", description: m.description || "",
        traits: m.traits || [], accentColor: m.accentColor || "#1d4ed8",
        html: res.html, docx_config: res.docx_config, show_in_cv_score: false,
      });
    } catch (e: unknown) { setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Generation failed"); }
    finally { setGenerating(false); }
  }
  async function save() {
    if (!draft) return;
    setSaving(true); setErr("");
    try {
      await adminCreateCvTemplate({ ...draft, name: draft.name || "New Template", html: draft.html || "" });
      setOpen(false); setPrompt(""); setBaseKey(""); setDraft(null); onCreated();
    } catch (e: unknown) { setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition">
        <FiZap className="w-4 h-4" /> Generate new template with AI
      </button>
    );
  }

  return (
    <div className="card border-brand-200 bg-brand-50/30">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FiZap className="w-4 h-4 text-brand-600" /> Generate new template</h3>
        <button onClick={() => { setOpen(false); setDraft(null); setErr(""); }} className="text-slate-400 hover:text-slate-600"><FiX className="w-4 h-4" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Describe the design</label>
          <textarea rows={3} value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. A modern two-column template with a dark charcoal sidebar, amber accent headings, and a monospace name."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
        </div>
        <div className="flex items-end gap-2">
          <div className="w-56">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Start from (optional)</label>
            <select value={baseKey} onChange={e => setBaseKey(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
              <option value="">— blank —</option>
              {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
            <FiZap className="w-3.5 h-3.5" /> {generating ? "Generating…" : "Generate"}
          </button>
        </div>
        {err && <p className="text-sm text-red-600 flex items-center gap-1.5"><FiAlertCircle className="w-4 h-4" /> {err}</p>}

        {draft && (
          <div className="pt-3 border-t border-brand-100">
            <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5"><FiEye className="w-3.5 h-3.5" /> Preview &amp; adjust, then save.</p>
            <TemplateFields draft={draft} setDraft={(fn) => setDraft(d => fn(d ?? {}))} />
            <div className="flex gap-2 mt-3">
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                <FiSave className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save template"}</button>
              <button onClick={generate} disabled={generating} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                <FiRefreshCw className="w-3.5 h-3.5" /> Regenerate</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ManageTemplatesTab() {
  const [templates, setTemplates] = useState<CvTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await adminListCvTemplates()); setFetchedAt(new Date()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeInScore = templates.filter(t => t.show_in_cv_score && t.is_active).length;

  return (
    <div className="space-y-4">
      <TabHeader count={templates.length} label="resume templates" fetchedAt={fetchedAt} loading={loading} onRefresh={load} />
      <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3.5 text-sm text-slate-700">
        <p className="font-semibold text-slate-900 mb-2">
          These templates power the live preview gallery in CV Score and the resume builder.
        </p>
        <ul className="space-y-1.5 text-[13px] leading-relaxed">
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold">•</span>
            <span>Tick <span className="font-semibold text-slate-900">Show in CV Score</span> to choose which templates appear in the CV-score gallery&nbsp;— <span className="font-semibold text-brand-700">{activeInScore} active</span>.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold">•</span>
            <span>Edit a template&apos;s HTML, or <span className="font-semibold text-slate-900">generate a brand-new one with AI</span>&nbsp;— changes go live instantly, with no deploy.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold">•</span>
            <span>Built-in templates can be deactivated to hide them, but not deleted.</span>
          </li>
        </ul>
      </div>
      <GenerateTemplatePanel templates={templates} onCreated={load} />
      {loading && !templates.length ? <Spinner text="Loading templates…" /> : (
        <div className="space-y-3">
          {templates.map(t => <CvTemplateCard key={t.key} tmpl={t} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}

// ── System tab (global master switches) ────────────────────────────────────────

function SystemTab() {
  const [cfg, setCfg] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchSystemConfig().then(setCfg).catch(() => {}).finally(() => setLoading(false));
  }, []);
  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 2500); }

  async function toggleAlerts() {
    if (!cfg) return;
    const next = !cfg.alerts_enabled;
    setSaving(true);
    try {
      setCfg(await updateSystemConfig({ alerts_enabled: next }));
      flash(next ? "Alerts resumed" : "Alerts paused");
    } catch { flash("Failed"); }
    finally { setSaving(false); }
  }

  if (loading) return <Spinner text="Loading system settings…" />;
  if (!cfg) return <div className="py-16 text-center text-slate-400">Could not load system settings.</div>;

  const on = cfg.alerts_enabled;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">App-wide master switches — these apply to every user.</p>
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center ${on ? "bg-teal-50 text-teal-600" : "bg-slate-100 text-slate-400"}`}>
              <FiBell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Daily Job Alerts</h3>
              <p className="text-sm text-slate-500 mt-0.5 max-w-xl">
                Master switch for the daily alert scheduler. When off, the daily run is skipped and
                <span className="font-medium text-slate-600"> no alert emails are sent to any user</span>.
                Individual users&apos; alerts are left untouched and resume when you switch this back on.
              </p>
              <p className="text-xs text-slate-400 mt-1.5">
                Status: <span className={on ? "text-teal-600 font-semibold" : "text-amber-600 font-semibold"}>{on ? "Active" : "Paused"}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {msg && <span className={`text-xs font-medium ${msg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
            <button onClick={toggleAlerts} disabled={saving} title={on ? "Pause all alerts" : "Resume alerts"} className="disabled:opacity-50">
              {on ? <FiToggleRight className="w-9 h-9 text-teal-600" /> : <FiToggleLeft className="w-9 h-9 text-slate-300" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Per-tab display metadata (label + icon), keyed by Tab id.
const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
  users:            { label: "Users",         icon: <FiUsers className="w-4 h-4" /> },
  audit:            { label: "Audit Log",     icon: <FiActivity className="w-4 h-4" /> },
  agent_memory:     { label: "Agent Memory",  icon: <FiCpu className="w-4 h-4" /> },
  prompts:          { label: "CV Builder Prompts", icon: <FiCpu className="w-4 h-4" /> },
  cv_score_prompts: { label: "CV Score Prompts",   icon: <FiActivity className="w-4 h-4" /> },
  professions:      { label: "Professions",   icon: <FiBriefcase className="w-4 h-4" /> },
  manage_templates: { label: "Resume Templates", icon: <FiGrid className="w-4 h-4" /> },
  tier_config:      { label: "Tiers & Pricing", icon: <FiSliders className="w-4 h-4" /> },
  system:           { label: "System",        icon: <FiBell className="w-4 h-4" /> },
};

// Top-level groups arranged by feature; each renders its tabs as sub-sections.
const GROUPS: { id: string; label: string; icon: React.ReactNode; tabs: Tab[] }[] = [
  { id: "people",  label: "User Management",     icon: <FiUsers className="w-4 h-4" />,   tabs: ["users", "audit", "agent_memory"] },
  { id: "content", label: "Prompts & Templates", icon: <FiCpu className="w-4 h-4" />,     tabs: ["prompts", "cv_score_prompts", "professions", "manage_templates"] },
  { id: "config",  label: "Feature Controls",    icon: <FiSliders className="w-4 h-4" />, tabs: ["tier_config", "system"] },
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

  // null = unlimited. Accept easy-to-type values for unlimited so admins never
  // need the ∞ character: blank, "unlimited"/"unlim"/"inf"/"infinity"/"u", "-1", "*".
  const _UNLIMITED_WORDS = new Set(["", "∞", "unlimited", "unlim", "inf", "infinity", "u", "-1", "*"]);
  function setLimit(limitKey: string, tier: string, value: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const v = value.trim().toLowerCase();
      const parsed = _UNLIMITED_WORDS.has(v) ? null : parseInt(value, 10);
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
        <p className="text-xs text-slate-400 mb-3">For unlimited: leave the box blank, type <span className="font-mono">unlimited</span> or <span className="font-mono">-1</span>, or click the <span className="font-semibold">∞</span> button. Type a number otherwise. Limits must be non-decreasing across tiers.</p>
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
                    const isUnlimited = val === null;
                    return (
                      <td key={tier} className="px-4 py-2.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={val === null || val === undefined ? "" : String(val)}
                            onChange={e => setLimit(limitKey, tier, e.target.value)}
                            className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                            placeholder="∞"
                            title="Type a number, or leave blank / type 'unlimited' for unlimited"
                          />
                          <button
                            type="button"
                            onClick={() => setLimit(limitKey, tier, "∞")}
                            title={isUnlimited ? "Unlimited" : "Set unlimited"}
                            className={`text-base leading-none px-1 rounded transition ${
                              isUnlimited ? "text-brand-600 font-bold" : "text-slate-300 hover:text-brand-500"
                            }`}
                          >
                            ∞
                          </button>
                        </div>
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
  const [agentMemory, setAgentMemory] = useState<AgentMemory[]>([]);
  const [prompts, setPrompts] = useState<PromptOverride[]>([]);
  const [professions, setProfessions] = useState<AdminProfession[]>([]);
  const [loading, setLoading] = useState<Record<Tab, boolean>>({ users: false, audit: false, agent_memory: false, prompts: false, cv_score_prompts: false, professions: false, manage_templates: false, tier_config: false, system: false });
  const [fetchedAt, setFetchedAt] = useState<Record<Tab, Date | null>>({ users: null, audit: null, agent_memory: null, prompts: null, cv_score_prompts: null, professions: null, manage_templates: null, tier_config: null, system: null });

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

  const fetchAgentMemory = useCallback(async (force = false) => {
    if (!force && cache.current.agent_memory) {
      setAgentMemory(cache.current.agent_memory.data);
      setFetchedAt(prev => ({ ...prev, agent_memory: cache.current.agent_memory!.fetchedAt }));
      return;
    }
    setLoad("agent_memory", true);
    try {
      const data = await adminGetAgentMemory();
      const entry = { data, fetchedAt: new Date() };
      cache.current.agent_memory = entry;
      setAgentMemory(data);
      setFetched("agent_memory", entry.fetchedAt);
    } finally { setLoad("agent_memory", false); }
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
    if (t === "agent_memory") { cache.current.agent_memory = undefined; fetchAgentMemory(true); }
    if (t === "prompts" || t === "cv_score_prompts") { cache.current.prompts = undefined; fetchPrompts(true); }
    if (t === "professions") { cache.current.professions = undefined; fetchProfessions(true); }
  }

  function handleTabSelect(t: Tab) {
    setTab(t);
    if (t === "users")       fetchUsers();
    if (t === "audit")       fetchAudit();
    if (t === "agent_memory") fetchAgentMemory();
    if (t === "prompts" || t === "cv_score_prompts") fetchPrompts();
    if (t === "professions") fetchProfessions();
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

        {/* Top-level group bar (by feature) */}
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 mb-3 w-fit">
          {GROUPS.map(g => {
            const isActive = g.tabs.includes(tab);
            return (
              <button
                key={g.id}
                onClick={() => handleTabSelect(g.tabs[0])}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  isActive ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {g.icon}
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Sub-section bar (tabs within the active group) */}
        {(() => {
          const activeGroup = GROUPS.find(g => g.tabs.includes(tab)) ?? GROUPS[0];
          if (activeGroup.tabs.length < 2) return <div className="mb-6" />;
          return (
            <div className="flex gap-1 mb-6 flex-wrap">
              {activeGroup.tabs.map(tid => (
                <button
                  key={tid}
                  onClick={() => handleTabSelect(tid)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    tab === tid
                      ? "bg-brand-50 text-brand-700 border-brand-200"
                      : "text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700"
                  }`}
                >
                  {TAB_META[tid].icon}
                  {TAB_META[tid].label}
                  {fetchedAt[tid] && tab !== tid && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" title="Cached" />
                  )}
                </button>
              ))}
            </div>
          );
        })()}

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
          {tab === "agent_memory" && (
            <AgentMemoryTab
              data={agentMemory}
              loading={loading.agent_memory}
              fetchedAt={fetchedAt.agent_memory}
              onRefresh={() => refreshTab("agent_memory")}
            />
          )}
          {tab === "prompts" && (
            <PromptsTab
              prompts={prompts.filter(p => p.category !== "cv_score")}
              loading={loading.prompts}
              fetchedAt={fetchedAt.prompts}
              onRefresh={() => refreshTab("prompts")}
              headerLabel="Edit CV builder prompts below"
            />
          )}
          {tab === "cv_score_prompts" && (
            <PromptsTab
              prompts={prompts.filter(p => p.category === "cv_score")}
              loading={loading.prompts}
              fetchedAt={fetchedAt.prompts}
              onRefresh={() => refreshTab("prompts")}
              headerLabel="Edit CV score prompts below"
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
          {tab === "manage_templates" && <ManageTemplatesTab />}
          {tab === "tier_config" && <TierConfigTab />}
          {tab === "system" && <SystemTab />}
        </div>
      </div>
    </main>
  );
}
