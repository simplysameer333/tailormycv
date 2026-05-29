"use client";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  FiSearch, FiMapPin, FiBookmark, FiZap, FiExternalLink,
  FiClock, FiDollarSign, FiBriefcase, FiWifi, FiUser,
  FiAlertTriangle, FiX, FiFileText,
} from "react-icons/fi";
import {
  searchJobs, saveJob, unsaveJob, getSavedJobs,
  getAccountProfile, createSessionFromProfileWithJob,
  getJobsQuota,
  type Job, type QuotaStatus,
} from "@/lib/api";
import { setSessionId } from "@/lib/session";
import { useAuth } from "@/lib/useAuth";
import ResumePickerModal from "@/components/ResumePickerModal";

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

// ── Upgrade wall ──────────────────────────────────────────────────────────────

function UpgradeWall() {
  return (
    <div className="card text-center py-14 flex flex-col items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center">
        <FiBriefcase className="w-7 h-7 text-brand-600" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900">Job Search is a Plus feature</h2>
        <p className="text-slate-500 mt-2 max-w-sm mx-auto text-sm">
          Search jobs from Indeed, LinkedIn, and Glassdoor — then tailor your resume to any listing in one click.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mt-2">
        <span className="text-xs text-slate-400">Upgrade to Plus or Pro to unlock</span>
      </div>
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
  onSave,
  onTailor,
  onUseSaved,
}: {
  job: Job;
  saved: boolean;
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
        {/* Row 1 — title + employer */}
        <h3 className="font-semibold text-slate-900 text-base leading-snug">{job.job_title}</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          {job.employer_name}
          {job.job_publisher && (
            <span className="ml-2 text-xs text-slate-400">via {job.job_publisher}</span>
          )}
        </p>

        {/* Row 2 — actions (always fixed below title) */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={() => onTailor(job)}
            className="btn-primary text-xs px-3 py-1.5 gap-1.5"
            title="AI-tailor your resume for this job"
          >
            <FiZap className="w-3.5 h-3.5" /> Tailor Resume
          </button>
          <button
            onClick={() => onUseSaved(job)}
            className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
            title="Apply using a resume from your library"
          >
            <FiFileText className="w-3.5 h-3.5" /> Apply with Saved
          </button>
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

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
          {location && (
            <span className="flex items-center gap-1">
              <FiMapPin className="w-3 h-3" /> {location}
            </span>
          )}
          {job.job_is_remote && (
            <span className="flex items-center gap-1 text-teal-600 font-semibold">
              <FiWifi className="w-3 h-3" /> Remote
            </span>
          )}
          {empType && (
            <span className="flex items-center gap-1">
              <FiBriefcase className="w-3 h-3" /> {empType}
            </span>
          )}
          {salary && (
            <span className="flex items-center gap-1 font-medium text-slate-700">
              <FiDollarSign className="w-3 h-3" /> {salary}
            </span>
          )}
          {posted && (
            <span className="flex items-center gap-1 text-slate-400 ml-auto">
              <FiClock className="w-3 h-3" /> {posted}
            </span>
          )}
        </div>

        {/* Skills chips */}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {skills.map((s) => (
              <span key={s} className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 font-medium">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const { data: session } = useAuth();
  const router = useRouter();
  const tier = session?.user?.tier ?? "free";
  const canSearch = tier === "plus" || tier === "pro";

  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hasProfileResume, setHasProfileResume] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [quotaWarningDismissed, setQuotaWarningDismissed] = useState<string | null>(null);
  const [pickerJob, setPickerJob] = useState<Job | null>(null);

  const runSearch = useCallback(async (q: string, loc: string, p: number) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const result = await searchJobs(q, loc, p);
      setJobs(result.jobs);
      setSearched(true);
      // Update quota display from response
      if (result.quota_pct !== undefined) {
        setQuota((prev) => prev
          ? { ...prev, pct: result.quota_pct, remaining: result.quota_remaining, warning: result.quota_warning }
          : null
        );
      }
      // Fetch saved IDs to mark already-saved jobs
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

  // Pre-fill search from profile, auto-search if role is available
  useEffect(() => {
    if (!canSearch) return;
    getAccountProfile()
      .then((profile) => {
        const role = profile?.target_roles?.[0] ?? "";
        const loc  = profile?.location ?? "";
        if (role) setQuery(role);
        if (loc)  setLocation(loc);
        setHasProfileResume(!!profile?.resume_text);
        setProfileLoaded(true);
        if (role) runSearch(role, loc, 1);
      })
      .catch(() => setProfileLoaded(true));
    getJobsQuota().then(setQuota).catch(() => {});
  }, [canSearch, runSearch]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    await runSearch(query, location, 1);
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
    // Store job context — upload page reads these to show the banner + pre-fill Step 3
    localStorage.setItem("tailormycv_prefill_jd", jd);
    localStorage.setItem("tailormycv_tailor_job_title", job.job_title);
    localStorage.setItem("tailormycv_tailor_employer", job.employer_name);
    router.push("/builder/upload");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Find Jobs</h1>
        <p className="text-slate-500 text-sm mt-1">
          Search roles from Indeed, LinkedIn, Glassdoor and more — then tailor your resume in one click.
        </p>
      </div>

      {!canSearch ? (
        <UpgradeWall />
      ) : (
        <>
          {/* Profile nudge — shown until profile is set up */}
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
          {profileLoaded && hasProfileResume && query && (
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
          <form onSubmit={handleSearch} className="card flex flex-col sm:flex-row gap-3 !p-3">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Job title, keywords, or company"
                className="input pl-9"
                required
              />
            </div>
            <div className="relative flex-1">
              <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, country, or Remote"
                className="input pl-9"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary shrink-0">
              {loading ? "Searching…" : "Search"}
            </button>
          </form>

          {/* Results */}
          {loading && (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card animate-pulse h-40" />
              ))}
            </div>
          )}

          {!loading && searched && jobs.length === 0 && (
            <div className="card text-center py-12 text-slate-500">
              No jobs found for <strong>{query}</strong>
              {location ? ` in ${location}` : ""}. Try broader keywords.
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
                      onSave={handleSave} onTailor={handleTailor} onUseSaved={(j) => setPickerJob(j)} />
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
              <div className="flex flex-col gap-3">
                {jobs.map((job) => (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    saved={savedIds.has(job.job_id)}
                    onSave={handleSave}
                    onTailor={handleTailor}
                    onUseSaved={(j) => setPickerJob(j)}
                  />
                ))}
              </div>

              <div className="flex justify-center gap-3 pt-2">
                {page > 1 && (
                  <button
                    className="btn-secondary text-sm"
                    onClick={() => { const p = page - 1; setPage(p); runSearch(query, location, p); }}
                  >
                    ← Previous
                  </button>
                )}
                <button
                  className="btn-secondary text-sm"
                  onClick={() => { const p = page + 1; setPage(p); runSearch(query, location, p); }}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </>
      )}

      <ResumePickerModal
        open={!!pickerJob}
        onClose={() => setPickerJob(null)}
        onTailorNew={() => pickerJob && handleTailor(pickerJob)}
        jobTitle={pickerJob?.job_title}
        employerName={pickerJob?.employer_name}
      />
    </div>
  );
}
