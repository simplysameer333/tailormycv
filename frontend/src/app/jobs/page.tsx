"use client";
import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  FiSearch, FiMapPin, FiBookmark, FiZap, FiExternalLink,
  FiClock, FiDollarSign, FiBriefcase, FiWifi, FiUser,
  FiAlertTriangle, FiX, FiFileText, FiBell, FiEdit2,
  FiTrash2, FiPlusCircle, FiToggleLeft, FiToggleRight, FiLock,
} from "react-icons/fi";
import {
  searchJobs, saveJob, unsaveJob, getSavedJobs,
  getAccountProfile, createSessionFromProfileWithJob,
  getJobsQuota, searchCatalogRoles,
  listJobAlerts, deleteJobAlert, toggleJobAlert,
  type Job, type QuotaStatus, type JobAlert,
} from "@/lib/api";
import { setSessionId } from "@/lib/session";
import { useAuth } from "@/lib/useAuth";
import ResumePickerModal from "@/components/ResumePickerModal";
import CreateAlertModal from "@/components/CreateAlertModal";
import TagInput from "@/components/TagInput";
import { JSEARCH_PAGE_SIZES, JSEARCH_DEFAULT_PAGE_SIZE, type JsearchPageSize } from "@/lib/config";

const DEV = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

// ── Mock data — shown on localhost before first search ────────────────────────
const MOCK_JOBS: Job[] = [
  {
    job_id: "mock-1", job_title: "Senior Frontend Engineer", employer_name: "Stripe",
    employer_logo: "https://logo.clearbit.com/stripe.com", job_employment_type: "FULLTIME",
    job_is_remote: true, job_city: "San Francisco", job_state: "CA", job_country: "US",
    job_min_salary: 160000, job_max_salary: 210000, job_salary_currency: "$", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 2 * 86400000).toISOString(), job_apply_link: "#",
    job_publisher: "LinkedIn", job_required_skills: ["React", "TypeScript", "Next.js", "CSS"],
    job_description: "We're looking for a Senior Frontend Engineer to join the product team. Strong React and TypeScript skills required.",
  },
  {
    job_id: "mock-2", job_title: "Product Manager — Growth", employer_name: "Notion",
    employer_logo: "https://logo.clearbit.com/notion.so", job_employment_type: "FULLTIME",
    job_is_remote: false, job_city: "New York", job_state: "NY", job_country: "US",
    job_min_salary: 140000, job_max_salary: 175000, job_salary_currency: "$", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 1 * 86400000).toISOString(), job_apply_link: "#",
    job_publisher: "Indeed", job_required_skills: ["Product Strategy", "A/B Testing", "SQL"],
    job_description: "Own the self-serve acquisition and activation funnel working cross-functionally with engineering, design, and data.",
  },
  {
    job_id: "mock-3", job_title: "Executive Chef", employer_name: "The Ritz-Carlton",
    employer_logo: "https://logo.clearbit.com/ritzcarlton.com", job_employment_type: "FULLTIME",
    job_is_remote: false, job_city: "London", job_state: "", job_country: "UK",
    job_min_salary: 70000, job_max_salary: 90000, job_salary_currency: "£", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 4 * 86400000).toISOString(), job_apply_link: "#",
    job_publisher: "Hospitality Jobs", job_required_skills: ["Menu Development", "Kitchen Management", "HACCP"],
    job_description: "Lead culinary operations at one of London's most prestigious hotels. Oversee a team of 40 kitchen staff.",
  },
  {
    job_id: "mock-4", job_title: "3D Character Animator", employer_name: "Framestore",
    employer_logo: "https://logo.clearbit.com/framestore.com", job_employment_type: "FULLTIME",
    job_is_remote: false, job_city: "London", job_state: "", job_country: "UK",
    job_min_salary: 45000, job_max_salary: 65000, job_salary_currency: "£", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 6 * 86400000).toISOString(), job_apply_link: "#",
    job_publisher: "LinkedIn", job_required_skills: ["Maya", "Character Animation", "Rigging"],
    job_description: "Join the award-winning animation team on major film and TV productions.",
  },
  {
    job_id: "mock-5", job_title: "HR Business Partner", employer_name: "Shopify",
    employer_logo: "https://logo.clearbit.com/shopify.com", job_employment_type: "FULLTIME",
    job_is_remote: true, job_city: "Ottawa", job_state: "ON", job_country: "Canada",
    job_min_salary: 95000, job_max_salary: 120000, job_salary_currency: "$", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 3 * 86400000).toISOString(), job_apply_link: "#",
    job_publisher: "Indeed", job_required_skills: ["HRBP", "Performance Management", "Talent Development"],
    job_description: "Partner with engineering and product leadership to deliver people programs that scale.",
  },
  {
    job_id: "mock-6", job_title: "Secondary Maths Teacher", employer_name: "Ark Schools",
    employer_logo: "", job_employment_type: "FULLTIME",
    job_is_remote: false, job_city: "Birmingham", job_state: "", job_country: "UK",
    job_posted_at_datetime_utc: new Date(Date.now() - 8 * 86400000).toISOString(), job_apply_link: "#",
    job_publisher: "TES", job_required_skills: ["Mathematics", "Curriculum Design", "QTS"],
    job_description: "Teach Key Stage 3–5 Mathematics at a high-performing academy. NQTs welcome.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso?: string) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatSalary(job: Job) {
  if (!job.job_min_salary && !job.job_max_salary) return null;
  const cur = job.job_salary_currency ?? "$";
  const period = job.job_salary_period === "YEAR" ? "/yr" : job.job_salary_period === "HOUR" ? "/hr" : "";
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
  if (job.job_min_salary && job.job_max_salary)
    return `${cur}${fmt(job.job_min_salary)}–${fmt(job.job_max_salary)}${period}`;
  return `${cur}${fmt((job.job_min_salary ?? job.job_max_salary)!)}${period}`;
}

function employerInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ── Pagination ────────────────────────────────────────────────────────────────

const MAX_PAGES = 10;

function getPaginationPages(current: number, max: number): (number | "...")[] {
  if (max <= 7) return Array.from({ length: max }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", max];
  if (current >= max - 3) return [1, "...", max - 4, max - 3, max - 2, max - 1, max];
  return [1, "...", current - 1, current, current + 1, "...", max];
}

// ── Free-tier upsell strip ────────────────────────────────────────────────────

function FreeSearchBanner() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <FiLock className="w-4 h-4 text-amber-500 shrink-0" />
      <p className="text-amber-800 text-xs">
        <span className="font-semibold">Free plan — search only.</span>{" "}
        Upgrade to Plus or Pro to save jobs, set up alerts, and tailor your resume in one click.{" "}
        <a href="/settings/plan" className="font-semibold underline underline-offset-2 hover:text-amber-900">
          View plans →
        </a>
      </p>
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULLTIME: "Full-time",
  PARTTIME: "Part-time",
  CONTRACTOR: "Contract",
  INTERN: "Internship",
};

function JobCard({
  job,
  saved,
  isFree,
  onSave,
  onTailor,
  onUseSaved,
}: {
  job: Job;
  saved: boolean;
  isFree: boolean;
  onSave: (job: Job) => void;
  onTailor: (job: Job) => void;
  onUseSaved: (job: Job) => void;
}) {
  const salary = formatSalary(job);
  const posted = timeAgo(job.job_posted_at_datetime_utc);
  const location = [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", ");
  const empType = job.job_employment_type ? EMPLOYMENT_LABEL[job.job_employment_type] ?? job.job_employment_type : null;
  const skills = (job.job_required_skills ?? []).slice(0, 4);

  return (
    <div className="card flex items-start gap-4 hover:border-brand-400 transition-colors">

      {/* Logo */}
      <div className="shrink-0 mt-0.5">
        {job.employer_logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.employer_logo}
            alt={job.employer_name}
            className="w-12 h-12 rounded-xl object-contain border border-slate-100 bg-white p-1"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
            {employerInitials(job.employer_name)}
          </div>
        )}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">

        {/* Row 1 — title (left) + location/type/remote (right) */}
        <div className="flex items-start justify-between gap-3">
          {job.job_apply_link && job.job_apply_link !== "#" ? (
            <a
              href={job.job_apply_link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-900 text-base leading-snug hover:text-brand-600 hover:underline underline-offset-2 transition-colors"
            >
              {job.job_title}
            </a>
          ) : (
            <h3 className="font-semibold text-slate-900 text-base leading-snug">{job.job_title}</h3>
          )}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {location && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <FiMapPin className="w-3 h-3" /> {location}
              </span>
            )}
            {job.job_is_remote && (
              <span className="text-xs font-semibold text-teal-600 bg-teal-50 rounded-full px-2 py-0.5">Remote</span>
            )}
            {empType && (
              <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{empType}</span>
            )}
          </div>
        </div>

        {/* Row 2 — employer (left) + salary/posted (right) */}
        <div className="flex items-center justify-between gap-3 mt-0.5">
          <p className="text-sm text-slate-500 truncate">
            {job.employer_name}
            {job.job_publisher && (
              <span className="ml-2 text-xs text-slate-400">via {job.job_publisher}</span>
            )}
          </p>
          <div className="flex items-center gap-2 shrink-0 text-xs text-slate-400">
            {salary && <span className="font-medium text-slate-600">{salary}</span>}
            {posted && <span className="flex items-center gap-1"><FiClock className="w-3 h-3" />{posted}</span>}
          </div>
        </div>

        {/* Row 3 — action buttons */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {isFree ? (
            /* Free tier — show locked upsell buttons for gated actions */
            <a
              href="/settings/plan"
              className="flex items-center gap-1.5 btn-primary text-xs px-3 py-1.5 opacity-70"
              title="Upgrade to Plus or Pro to tailor your resume"
            >
              <FiLock className="w-3 h-3" /> Tailor Resume
            </a>
          ) : (
            <button
              onClick={() => onTailor(job)}
              className="btn-primary text-xs px-3 py-1.5 gap-1.5"
              title="AI-tailor your resume for this job"
            >
              <FiZap className="w-3.5 h-3.5" /> Tailor Resume
            </button>
          )}

          {!isFree && (
            <button
              onClick={() => onUseSaved(job)}
              className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
              title="Apply using a resume from your library"
            >
              <FiFileText className="w-3.5 h-3.5" /> Apply with Saved
            </button>
          )}

          {isFree ? (
            <a
              href="/settings/plan"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-300 cursor-pointer"
              title="Upgrade to save jobs"
            >
              <FiLock className="w-4 h-4" />
            </a>
          ) : (
            <button
              onClick={() => onSave(job)}
              title={saved ? "Remove from saved" : "Save job"}
              className={`rounded-lg border px-2.5 py-1.5 transition ${
                saved
                  ? "border-brand-300 bg-brand-50 text-brand-600 hover:bg-brand-100"
                  : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <FiBookmark className={`w-4 h-4 ${saved ? "fill-brand-500" : ""}`} />
            </button>
          )}

          {job.job_apply_link && job.job_apply_link !== "#" && (
            <a
              href={job.job_apply_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
            >
              Apply <FiExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onToggle,
  onEdit,
  onDelete,
}: {
  alert: JobAlert;
  onToggle: (id: string) => void;
  onEdit: (alert: JobAlert) => void;
  onDelete: (id: string) => void;
}) {
  const allTags = [
    ...alert.query_tags,
    ...(alert.company ? [alert.company] : []),
    ...alert.location_tags,
  ];
  const lastSent = alert.last_sent_at ? timeAgo(alert.last_sent_at) : null;

  return (
    <div className={`card flex items-start gap-4 transition-colors ${
      alert.is_active ? "hover:border-brand-400" : "opacity-60"
    }`}>
      <div className="shrink-0 mt-0.5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          alert.is_active ? "bg-brand-100" : "bg-slate-100"
        }`}>
          <FiBell className={`w-5 h-5 ${alert.is_active ? "text-brand-600" : "text-slate-400"}`} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 text-sm">{alert.name}</p>
            {lastSent ? (
              <p className="text-xs text-slate-400 mt-0.5">Last emailed {lastSent}</p>
            ) : (
              <p className="text-xs text-slate-400 mt-0.5">No email sent yet</p>
            )}
          </div>
          {/* Toggle */}
          <button
            onClick={() => onToggle(alert.id)}
            title={alert.is_active ? "Pause alert" : "Resume alert"}
            className="text-slate-400 hover:text-brand-600 transition shrink-0 mt-0.5"
          >
            {alert.is_active
              ? <FiToggleRight className="w-5 h-5 text-brand-500" />
              : <FiToggleLeft className="w-5 h-5" />
            }
          </button>
        </div>

        {/* Tag chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {alert.query_tags.map((t) => (
              <span key={t} className="text-xs bg-brand-50 text-brand-700 rounded-full px-2.5 py-0.5 border border-brand-100">
                {t}
              </span>
            ))}
            {alert.company && (
              <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5">
                {alert.company}
              </span>
            )}
            {alert.location_tags.map((t) => (
              <span key={t} className="text-xs bg-teal-50 text-teal-700 rounded-full px-2.5 py-0.5 border border-teal-100 flex items-center gap-1">
                <FiMapPin className="w-2.5 h-2.5" />{t}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2.5">
          <button
            onClick={() => onEdit(alert)}
            className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
          >
            <FiEdit2 className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => onDelete(alert.id)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500
                       hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition gap-1.5 flex items-center"
          >
            <FiTrash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PLUS_ALERT_LIMIT = 5;

export default function JobsPage() {
  const { data: session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tier = session?.user?.tier ?? "free";
  const isFree = tier === "free";

  // ── Search state ────────────────────────────────────────────────────────────
  const [queryTags, setQueryTags] = useState<string[]>([]);
  const [locationTags, setLocationTags] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState<JsearchPageSize>(JSEARCH_DEFAULT_PAGE_SIZE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hasProfileResume, setHasProfileResume] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [quotaWarningDismissed, setQuotaWarningDismissed] = useState<string | null>(null);
  const [pickerJob, setPickerJob] = useState<Job | null>(null);

  // ── Alerts state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"results" | "alerts">(
    searchParams.get("tab") === "alerts" ? "alerts" : "results"
  );
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<JobAlert | undefined>();

  // ── Search ──────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string, loc: string, p: number, ps: number) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const result = await searchJobs(q, loc, p, ps);
      setJobs(result.jobs);
      setHasMore(result.jobs.length >= ps);
      setSearched(true);
      if (result.quota_pct !== undefined) {
        setQuota((prev) => prev
          ? { ...prev, pct: result.quota_pct, remaining: result.quota_remaining, warning: result.quota_warning }
          : null
        );
      }
      try {
        const saved = await getSavedJobs();
        setSavedIds(new Set(saved.map((j) => j.job_id)));
      } catch { /* non-fatal */ }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (status === 503) {
        toast.error("Job search API key not configured. Add RAPIDAPI_KEY to backend .env.");
      } else if (status === 429) {
        toast.error(msg ?? "Quota exhausted for this month.");
      } else {
        toast.error(msg ?? "Search failed. Check your query and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Pre-fill search from profile on mount
  useEffect(() => {
    // search available to all tiers
    getAccountProfile()
      .then((profile) => {
        const tags: string[] = [];
        if (profile?.target_roles?.length) tags.push(...profile.target_roles);
        if (profile?.primary_skill) tags.push(profile.primary_skill);
        const locTags = profile?.location ? [profile.location] : [];
        if (tags.length) setQueryTags(tags);
        if (locTags.length) setLocationTags(locTags);
        setHasProfileResume(!!profile?.resume_text);
        setProfileLoaded(true);
        if (tags.length) runSearch(tags.join(" "), locTags.join(" OR "), 1, JSEARCH_DEFAULT_PAGE_SIZE);
      })
      .catch(() => setProfileLoaded(true));
    getJobsQuota().then(setQuota).catch(() => {});
  }, [isFree, runSearch]);

  // Load alerts when tab becomes active
  useEffect(() => {
    if (activeTab !== "alerts" || alertsLoaded || false) return;
    listJobAlerts()
      .then((data) => { setAlerts(data); setAlertsLoaded(true); })
      .catch(() => setAlertsLoaded(true));
  }, [activeTab, alertsLoaded, isFree]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!queryTags.length) return;
    setPage(1);
    setHasMore(false);
    await runSearch(queryTags.join(" "), locationTags.join(" OR "), 1, pageSize);
  }

  async function handleSave(job: Job) {
    if (savedIds.has(job.job_id)) {
      try {
        await unsaveJob(job.job_id);
        setSavedIds((prev) => { const s = new Set(prev); s.delete(job.job_id); return s; });
        toast.success("Removed from saved jobs.");
      } catch { toast.error("Failed to unsave."); }
    } else {
      try {
        await saveJob(job.job_id, job);
        setSavedIds((prev) => new Set(prev).add(job.job_id));
        toast.success("Job saved!");
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.error(msg ?? "Failed to save job.");
      }
    }
  }

  function handleTailor(job: Job) {
    const jd = [
      `${job.job_title} at ${job.employer_name}`,
      job.job_description ?? "",
    ].filter(Boolean).join("\n\n");
    localStorage.setItem("tailormycv_prefill_jd", jd);
    // Persist tailor context for the JobContextBanner shown on every builder step.
    localStorage.setItem("tailormycv_tailor_context", JSON.stringify({
      title:      job.job_title,
      employer:   job.employer_name,
      apply_link: job.job_apply_link || "",
    }));
    // Also pass via URL params so the upload page badge is correct even if
    // localStorage hasn't flushed yet.
    const params = new URLSearchParams({
      tailor_title:    job.job_title,
      tailor_employer: job.employer_name,
    });
    router.push(`/builder/upload?${params.toString()}`);
  }

  // ── Alert handlers ──────────────────────────────────────────────────────────

  function openCreateAlert() {
    setEditingAlert(undefined);
    setAlertModalOpen(true);
  }

  function openEditAlert(alert: JobAlert) {
    setEditingAlert(alert);
    setAlertModalOpen(true);
  }

  function handleAlertSaved(saved: JobAlert) {
    setAlerts((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  }

  async function handleToggleAlert(id: string) {
    try {
      const { is_active } = await toggleJobAlert(id);
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, is_active } : a));
    } catch { toast.error("Failed to update alert."); }
  }

  async function handleDeleteAlert(id: string) {
    try {
      await deleteJobAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alert deleted.");
    } catch { toast.error("Failed to delete alert."); }
  }

  const alertCount = alerts.length;
  const atPlusLimit = tier === "plus" && alertCount >= PLUS_ALERT_LIMIT;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Find Jobs</h1>
        <p className="text-slate-500 text-sm mt-1">
          Search roles from Indeed, LinkedIn, Glassdoor and more — then tailor your resume in one click.
        </p>
      </div>

      {/* Free-tier banner — search allowed but actions locked */}
      {isFree && <FreeSearchBanner />}

      <>
          {/* Profile nudge */}
          {profileLoaded && !hasProfileResume && (
            <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
              <FiUser className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium text-brand-800">Set up your profile</span>
                <span className="text-brand-700"> to pre-fill job searches and skip resume re-upload when tailoring. </span>
                <a href="/profile" className="font-semibold text-brand-600 underline underline-offset-2">Go to Profile →</a>
              </div>
            </div>
          )}

          {/* Profile-sourced indicator */}
          {profileLoaded && hasProfileResume && queryTags.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <FiUser className="w-3.5 h-3.5 text-teal-500" />
              Pre-filled from your profile · <a href="/profile" className="text-brand-600 hover:underline">Edit profile</a>
            </div>
          )}

          {/* Quota warning banner */}
          {quota?.warning && quota.warning !== quotaWarningDismissed && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <FiAlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <span className="font-medium text-amber-800">Quota notice — </span>
                <span className="text-amber-700">{quota.warning}</span>
                <span className="text-amber-600 ml-2 text-xs">
                  ({quota.calls}/{quota.limit} calls used this month)
                </span>
              </div>
              <button
                onClick={() => setQuotaWarningDismissed(quota.warning)}
                className="text-amber-400 hover:text-amber-600 transition shrink-0"
                aria-label="Dismiss"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Search bar */}
          <form onSubmit={handleSearch} className="card flex flex-col sm:flex-row sm:items-stretch gap-3 !p-3">
            <div className="flex-1 min-w-0">
              <TagInput
                value={queryTags}
                onChange={setQueryTags}
                fetchSuggestions={searchCatalogRoles}
                placeholder="Job title, keywords, or company…"
                className="h-full"
              />
            </div>
            <div className="flex-1 min-w-0">
              <TagInput
                value={locationTags}
                onChange={setLocationTags}
                fetchSuggestions={async () => []}
                placeholder="City, country, or Remote…"
                className="h-full"
              />
            </div>
            <div className="flex gap-2 shrink-0 self-end">
              <button type="submit" disabled={loading || !queryTags.length} className="btn-primary">
                {loading ? "Searching…" : "Search"}
              </button>
              {/* Save as alert — brand-coloured, visible when query exists */}
              {queryTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setEditingAlert(undefined); setAlertModalOpen(true); }}
                  title="Save this search as a daily job alert"
                  className="btn-accent !px-3 !py-2 shrink-0 gap-1.5"
                >
                  <FiBell className="w-4 h-4" />
                  <span className="hidden sm:inline">Save Alert</span>
                </button>
              )}
            </div>
          </form>

          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-slate-200 -mb-3">
            <button
              onClick={() => setActiveTab("results")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "results"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Results
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "alerts"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <FiBell className="w-3.5 h-3.5" />
              My Alerts
              {alertsLoaded && alertCount > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none ${
                  activeTab === "alerts"
                    ? "bg-brand-100 text-brand-600"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {alertCount}
                </span>
              )}
            </button>
          </div>

          {/* ── Results tab ──────────────────────────────────────────────────── */}
          {activeTab === "results" && (
            <>
              {loading && (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="card flex items-start gap-4 animate-pulse">
                      <div className="w-12 h-12 rounded-xl bg-slate-200 shrink-0" />
                      <div className="flex-1 flex flex-col gap-2.5">
                        <div className="h-4 bg-slate-200 rounded-md w-1/2" />
                        <div className="h-3 bg-slate-100 rounded-md w-1/3" />
                        <div className="h-3 bg-slate-100 rounded-md w-2/3" />
                        <div className="flex gap-2 mt-0.5">
                          <div className="h-7 w-24 bg-slate-200 rounded-lg" />
                          <div className="h-7 w-28 bg-slate-100 rounded-lg" />
                          <div className="h-7 w-16 bg-slate-100 rounded-lg" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && searched && jobs.length === 0 && (
                <div className="card text-center py-12 text-slate-500">
                  No jobs found for <strong>{queryTags.join(", ")}</strong>
                  {locationTags.length > 0 ? ` in ${locationTags.join(", ")}` : ""}. Try broader keywords.
                </div>
              )}

              {!loading && !searched && (
                DEV ? (
                  <>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="flex-1 border-t border-slate-200" />
                      Sample listings (dev mode) — search above for live results
                      <span className="flex-1 border-t border-slate-200" />
                    </div>
                    <div className="flex flex-col gap-3">
                      {MOCK_JOBS.map((job) => (
                        <JobCard key={job.job_id} job={job} saved={savedIds.has(job.job_id)}
                          isFree={isFree} onSave={handleSave} onTailor={handleTailor} onUseSaved={(j) => setPickerJob(j)} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="card text-center py-14 flex flex-col items-center gap-3 text-slate-400">
                    <FiSearch className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">Enter a job title above to search live listings</p>
                    <p className="text-xs">Results are pulled in real time from major job boards</p>
                  </div>
                )
              )}

              {!loading && jobs.length > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{jobs.length} result{jobs.length !== 1 ? "s" : ""} · page {page}</span>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => { setEditingAlert(undefined); setAlertModalOpen(true); }}
                        className="flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 transition"
                      >
                        <FiBell className="w-3.5 h-3.5" /> Get daily alerts
                      </button>
                      <div className="flex items-center gap-2">
                        <span>Show</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            const ps = Number(e.target.value) as JsearchPageSize;
                            setPageSize(ps);
                            setPage(1);
                            if (searched) runSearch(queryTags.join(" "), locationTags.join(" OR "), 1, ps);
                          }}
                          className="border border-slate-200 rounded-lg text-xs py-1 px-2 bg-white cursor-pointer hover:border-brand-400 transition focus:outline-none focus:ring-2 focus:ring-brand-100"
                        >
                          {JSEARCH_PAGE_SIZES.map((n) => (
                            <option key={n} value={n}>{n} per page</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {jobs.map((job) => (
                      <JobCard
                        key={job.job_id}
                        job={job}
                        saved={savedIds.has(job.job_id)}
                        isFree={isFree}
                        onSave={handleSave}
                        onTailor={handleTailor}
                        onUseSaved={(j) => setPickerJob(j)}
                      />
                    ))}
                  </div>

                  {/* Google-style pagination */}
                  <div className="flex items-center justify-center gap-1 pt-2 flex-wrap">
                    <button
                      disabled={page === 1}
                      onClick={() => { const p = page - 1; setPage(p); runSearch(queryTags.join(" "), locationTags.join(" OR "), p, pageSize); }}
                      className="flex items-center gap-1 px-3 h-9 rounded-full text-sm text-slate-600 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    {getPaginationPages(page, hasMore ? MAX_PAGES : page).map((n, i) =>
                      n === "..." ? (
                        <span key={`ellipsis-${i}`} className="w-9 h-9 flex items-center justify-center text-slate-400 text-sm select-none">
                          …
                        </span>
                      ) : (
                        <button
                          key={n}
                          onClick={() => { if (n !== page) { setPage(n); runSearch(queryTags.join(" "), locationTags.join(" OR "), n, pageSize); } }}
                          className={`w-9 h-9 rounded-full text-sm font-medium transition ${
                            n === page
                              ? "bg-brand-600 text-white shadow-sm"
                              : "text-slate-600 hover:bg-brand-50 hover:text-brand-600 border border-slate-200"
                          }`}
                        >
                          {n}
                        </button>
                      )
                    )}
                    <button
                      disabled={!hasMore}
                      onClick={() => { const p = page + 1; setPage(p); runSearch(queryTags.join(" "), locationTags.join(" OR "), p, pageSize); }}
                      className="flex items-center gap-1 px-3 h-9 rounded-full text-sm text-slate-600 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── My Alerts tab ─────────────────────────────────────────────────── */}
          {activeTab === "alerts" && (
            <div className="flex flex-col gap-4">
              {isFree ? (
                /* Free users — upsell card */
                <div className="card text-center py-14 flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center">
                    <FiBell className="w-7 h-7 text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Daily Job Alerts</h2>
                    <p className="text-slate-500 mt-1 max-w-sm mx-auto text-sm">
                      Save your searches and receive a daily email digest with new matching jobs — available on Plus and Pro.
                    </p>
                  </div>
                  <a href="/settings/plan" className="btn-primary text-sm px-6 py-2">
                    Upgrade to Plus →
                  </a>
                </div>
              ) : (
              <>
                {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-700">
                        {tier === "plus"
                          ? `${alertCount} / ${PLUS_ALERT_LIMIT} alerts used`
                          : `${alertCount} alert${alertCount !== 1 ? "s" : ""}`}
                      </p>
                      {atPlusLimit && (
                        <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">
                          Limit reached
                        </span>
                      )}
                    </div>
                    <button
                      onClick={openCreateAlert}
                      disabled={atPlusLimit}
                      className="btn-primary text-sm gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={atPlusLimit ? "Upgrade to Pro for unlimited alerts" : "Create a new job alert"}
                    >
                      <FiPlusCircle className="w-4 h-4" /> New Alert
                    </button>
                  </div>

                  {/* Plus limit nudge */}
                  {atPlusLimit && (
                    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                      <FiAlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="text-amber-700">
                        You&apos;ve reached the Plus limit of {PLUS_ALERT_LIMIT} alerts.
                        Upgrade to Pro for unlimited job alerts.
                      </span>
                    </div>
                  )}

                  {/* Alert list */}
                  {!alertsLoaded && (
                    <div className="flex flex-col gap-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="card flex items-start gap-4 animate-pulse">
                          <div className="w-10 h-10 rounded-xl bg-slate-200 shrink-0" />
                          <div className="flex-1 flex flex-col gap-2">
                            <div className="h-4 bg-slate-200 rounded w-1/3" />
                            <div className="h-3 bg-slate-100 rounded w-1/4" />
                            <div className="flex gap-1.5 mt-1">
                              <div className="h-5 w-16 bg-slate-100 rounded-full" />
                              <div className="h-5 w-20 bg-slate-100 rounded-full" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {alertsLoaded && alerts.length === 0 && (
                    <div className="card text-center py-14 flex flex-col items-center gap-3 text-slate-400">
                      <FiBell className="w-8 h-8 text-slate-300" />
                      <p className="text-sm font-medium text-slate-500">No alerts yet</p>
                      <p className="text-xs">
                        Search for jobs above, then click the{" "}
                        <FiBell className="inline w-3 h-3 text-slate-400" /> button to save a search as a daily alert.
                      </p>
                    </div>
                  )}

                  {alertsLoaded && alerts.length > 0 && (
                    <div className="flex flex-col gap-3">
                      {alerts.map((alert) => (
                        <AlertCard
                          key={alert.id}
                          alert={alert}
                          onToggle={handleToggleAlert}
                          onEdit={openEditAlert}
                          onDelete={handleDeleteAlert}
                        />
                      ))}
                    </div>
                  )}
              </>
              )}
            </div>
          )}
      </>

      <ResumePickerModal
        open={!!pickerJob}
        onClose={() => setPickerJob(null)}
        onTailorNew={() => pickerJob && handleTailor(pickerJob)}
        jobTitle={pickerJob?.job_title}
        employerName={pickerJob?.employer_name}
      />

      <CreateAlertModal
        open={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        onSaved={handleAlertSaved}
        initialQueryTags={queryTags}
        initialLocationTags={locationTags}
        editAlert={editingAlert}
      />
    </div>
  );
}
