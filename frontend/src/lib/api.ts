import axios from "axios";
import { getSession } from "next-auth/react";
import type { CvTemplate, DocxConfig } from "@/lib/cvTemplates";

export const SESSION_KEYS = [
  "tailormycv_session_id",
  "tailormycv_generated",
  "tailormycv_eval_summary",
  "tailormycv_template_id",
  "tailormycv_output_format",
  "tailormycv_instructions",
  "tailormycv_locked_facts",
  "tailormycv_custom_sections",
];

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000",
});

// Dev-bypass: seed a dev token at module load so the very first request (e.g. a
// hard load of /admin) is authenticated BEFORE DevProvider's effect runs — React
// fires child effects before parent effects, so without this the admin page's
// initial fetch would go out tokenless and 401. DevProvider.setApiToken() then
// overrides this whenever the tier switcher changes.
if (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true") {
  api.defaults.headers.common["Authorization"] = "Bearer dev-pro";
}

/** Called by AuthProvider whenever the NextAuth session changes. */
export function setApiToken(token: string | null) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}

// Fallback auth: if a request fires before AuthProvider's TokenSync has attached
// the Bearer token (e.g. the admin page's first fetch on a hard page load /
// refresh), pull the token straight from the NextAuth session so the call isn't
// sent unauthenticated — which on production 401'd and left admin tabs empty.
// Once attached, it's also written to the instance default so later calls skip
// the getSession() round-trip. Skipped entirely in dev-bypass mode.
api.interceptors.request.use(async (config) => {
  if (
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH !== "true" &&
    typeof window !== "undefined" &&
    !config.headers?.Authorization
  ) {
    try {
      const session = await getSession();
      const token = (session as { accessToken?: string } | null)?.accessToken;
      if (token) {
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        config.headers.set("Authorization", `Bearer ${token}`);
      }
    } catch { /* ignore — request proceeds unauthenticated */ }
  }
  return config;
});

export default api;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status: number | undefined = err?.response?.status;
    const detail: string = err?.response?.data?.detail ?? "";

    // ── Session gone (404 on session document) ────────────────────────────────
    const isSessionGone = status === 404 && detail.toLowerCase().includes("session");
    if (isSessionGone && typeof window !== "undefined") {
      SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
      window.dispatchEvent(new CustomEvent("session-expired"));
    }

    // ── 401 Unauthorised — token expired / invalid ────────────────────────────
    if (status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth-error"));
      // Don't double-toast — let the component handle it via the event
      return Promise.reject(err);
    }

    // ── 5xx Server errors — show a generic toast (import lazily to avoid SSR) ─
    if (status !== undefined && status >= 500) {
      import("react-hot-toast").then(({ default: toast }) => {
        const msg = detail || "Server error — please try again in a moment.";
        toast.error(msg, { id: `server-${status}`, duration: 6000 });
      });
    }

    // ── Network / timeout errors (no response at all) ─────────────────────────
    if (!err.response && err.code !== "ERR_CANCELED") {
      import("react-hot-toast").then(({ default: toast }) => {
        toast.error("Network error — check your connection and try again.", {
          id: "network-error", duration: 6000,
        });
      });
    }

    return Promise.reject(err);
  }
);

export async function uploadResume(file: File | null, linkedinText?: string) {
  const form = new FormData();
  if (file) form.append("file", file);
  if (linkedinText) form.append("linkedin_text", linkedinText);
  const { data } = await api.post("/api/resume/upload", form);
  return data as { session_id: string; parsed: { raw_text: string; filename: string } };
}

// ── Tier config ────────────────────────────────────────────────────────────────

export interface CurrencyPricing {
  symbol: string;
  plus: number;
  pro: number;
}

export interface CurrencyZone {
  currency: string;
  timezones: string[];
  timezone_prefix: string;
  locale_codes: string[];
}

export interface TierConfigPayload {
  features: Record<string, string[]>;
  limits: Record<string, Record<string, number | null>>;
  feature_labels?: Record<string, string>;
  limit_labels?: Record<string, string>;
  pricing?: Record<string, CurrencyPricing>;
  currency_zones?: CurrencyZone[];
}

export async function fetchTierConfig(): Promise<TierConfigPayload> {
  const { data } = await api.get("/api/config/tiers");
  return data as TierConfigPayload;
}

export async function adminUpdateTierConfig(payload: {
  features: Record<string, string[]>;
  limits: Record<string, Record<string, number | null>>;
  pricing?: Record<string, CurrencyPricing>;
  currency_zones?: CurrencyZone[];
}): Promise<TierConfigPayload> {
  const { data } = await api.put("/api/admin/config/tiers", payload);
  return data as TierConfigPayload;
}

// ── Resume Checker ──────────────────────────────────────────────────────────────

export interface CheckItem {
  label: string;
  passed: boolean;
}

export interface CheckCategory {
  key: string;
  name: string;
  score: number;
  status: "excellent" | "good" | "needs_work" | "missing";
  checks: CheckItem[];
  improvements: string[];
}

export interface ExtractedProfile {
  name: string;
  title: string;
  email: string;
  phone: string;
  location?: string;
  linkedin: string;
  summary?: string;
  skills?: string[];
  experience?: { role: string; company: string; dates: string; bullets: string[] }[];
  education?: { degree: string; institution: string; dates: string }[];
  extra_sections?: { title: string; items: string[] }[];
}

export interface ResumeCheckResult {
  overall_score: number;
  summary: string;
  categories: CheckCategory[];
  result_id?: string;  // UUID returned by the backend for permalink
  extracted_profile?: ExtractedProfile;
}

export async function checkResume(file: File): Promise<ResumeCheckResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/api/resume/check", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data as ResumeCheckResult;
}

export async function getCheckResult(resultId: string): Promise<ResumeCheckResult> {
  const { data } = await api.get(`/api/resume/check/${resultId}`);
  return data as ResumeCheckResult;
}

export async function getSessionProfile(sessionId: string): Promise<{
  full_name: string; email: string; phone: string; linkedin: string;
  location: string; target_role: string; key_skills: string[];
}> {
  const { data } = await api.get(`/api/profile/session?session_id=${sessionId}`);
  return data;
}

// ── LinkedIn ────────────────────────────────────────────────────────────────────

export interface LinkedInProfile {
  full_name: string;
  headline: string;
  location: string;
  email: string;
  linkedin_url: string;
  summary: string;
  skills: string[];
  raw_text: string;
}

export async function parseLinkedInProfile(url: string): Promise<LinkedInProfile> {
  const { data } = await api.post("/api/linkedin/parse", { url });
  return data as LinkedInProfile;
}

export async function prefillProfile(sessionId: string): Promise<Partial<{
  full_name: string; email: string; phone: string; linkedin: string;
  location: string; target_role: string; key_skills: string;
}>> {
  const { data } = await api.get(`/api/profile/prefill?session_id=${sessionId}`);
  return data;
}

export async function saveProfile(sessionId: string, profile: Record<string, unknown>) {
  const { data } = await api.post(`/api/profile?session_id=${sessionId}`, profile);
  return data;
}

export async function saveJobDescription(sessionId: string, jobDescription: string) {
  const { data } = await api.post(`/api/job-description?session_id=${sessionId}`, {
    job_description: jobDescription,
  });
  return data;
}

/** Full pipeline generation returns PipelineResult; section regeneration returns GeneratedResume. */
export async function generateResume(
  sessionId: string,
  section?: string,
  additionalInstructions?: string
): Promise<PipelineResult | GeneratedResume> {
  const { data } = await api.post(
    `/api/generate?session_id=${sessionId}`,
    { section: section ?? null, additional_instructions: additionalInstructions ?? null },
    { timeout: 270_000 },  // 4.5 min — backend enforces 4 min, this covers the gap
  );
  return data as PipelineResult | GeneratedResume;
}

export async function exportResume(sessionId: string, includePdf = false, boldKeywords = true) {
  let resumeData: unknown = null;
  try {
    const stored = localStorage.getItem("tailormycv_generated");
    if (stored) resumeData = JSON.parse(stored);
  } catch { /* ignore */ }
  const { data } = await api.post(
    `/api/export?session_id=${sessionId}`,
    { include_pdf: includePdf, resume_data: resumeData, bold_keywords: boldKeywords },
    { timeout: 60_000 },  // 60s — DOCX is fast; PDF can be slower
  );
  return data as { docx_file_id?: string; pdf_file_id?: string; pdf_error?: string };
}

// ── Fact-locking ──────────────────────────────────────────────────────────────

export async function uploadSampleCv(sessionId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post(`/api/resume/sample-format?session_id=${sessionId}`, form);
  return data as { filename: string; characters: number };
}

export async function setSessionTemplate(sessionId: string, templateId: string): Promise<void> {
  await api.patch(`/api/sessions/${sessionId}/template`, { template_id: templateId });
}

export async function syncResumeToSession(sessionId: string, resume: GeneratedResume): Promise<void> {
  await api.put(`/api/sessions/${sessionId}/resume`, resume);
}

export async function setLockedFacts(sessionId: string, lockedFacts: string[]): Promise<string[]> {
  const { data } = await api.put(`/api/sessions/${sessionId}/locked-facts`, { locked_facts: lockedFacts });
  return data.locked_facts;
}

export function downloadUrl(fileId: string) {
  return `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000"}/api/download/${fileId}`;
}

export interface ContactInfo {
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  github?: string;
  website?: string;
}

export interface ExperienceItem {
  company: string;
  role: string;
  dates: string;
  bullets: string[];
}

export interface EducationItem {
  institution: string;
  degree: string;
  dates: string;
}

export interface DynamicSection {
  title: string;
  items: string[];
}

export interface GeneratedResume {
  name: string;
  contact: ContactInfo;
  summary: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  // New dynamic format — sections determined by template / reference CV
  sections?: DynamicSection[];
  // Legacy flat format — backward compat with sessions generated before dynamic sections
  skills?: string[];
  certifications?: string[];
}

export interface EvaluatorResult {
  model: string;
  score: number;
  suggestions: string[];
}

export interface EvalSummary {
  cycles: number;
  all_passed: boolean;
  min_score: number;
  /** Threshold that was used — read from PASS_THRESHOLD env var. */
  pass_threshold: number;
  evaluator_results: EvaluatorResult[];
  /** Profession display name resolved for this session. */
  profession: string;
}

export interface PipelineResult {
  resume: GeneratedResume;
  eval_summary: EvalSummary;
}

export function isPipelineResult(data: PipelineResult | GeneratedResume): data is PipelineResult {
  return "resume" in data && "eval_summary" in data;
}

// ── Professions ───────────────────────────────────────────────────────────────

export interface Profession {
  slug: string;
  display_name: string;
  keywords: string[];
  generator_context: string;
  evaluator_context: string;
  scoring_criteria: string;
  aggregator_context: string;
  /** Names of evaluators to run for this profession. Empty = use all configured. */
  evaluator_names: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function listProfessions(): Promise<Profession[]> {
  const { data } = await api.get("/api/professions");
  return data;
}

export async function getProfession(slug: string): Promise<Profession> {
  const { data } = await api.get(`/api/professions/${slug}`);
  return data;
}

export async function createProfession(
  payload: Omit<Profession, "is_active" | "created_at" | "updated_at">
): Promise<Profession> {
  const { data } = await api.post("/api/professions", payload);
  return data;
}

export async function updateProfession(
  slug: string,
  payload: Partial<Profession>
): Promise<Profession> {
  const { data } = await api.put(`/api/professions/${slug}`, payload);
  return data;
}

export async function deleteProfession(slug: string): Promise<void> {
  await api.delete(`/api/professions/${slug}`);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tier: "free" | "plus" | "pro";
  has_password: boolean;
}

export async function registerUser(
  email: string,
  name: string,
  password: string
): Promise<{ access_token: string; user: AuthUser }> {
  const { data } = await api.post("/api/auth/register", { email, name, password });
  return data;
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get("/api/auth/me");
  return data;
}

export async function createSessionFromProfile(jobDescription: string): Promise<{ session_id: string }> {
  const { data } = await api.post("/api/sessions/from-profile", { job_description: jobDescription });
  return data;
}

// ── Job search ────────────────────────────────────────────────────────────────

// All fields reflect the JSearch (jsearch.p.rapidapi.com) response schema.
// Nullable fields are typed as optional.
export interface Job {
  // Identity
  job_id: string;
  job_title: string;
  job_publisher?: string;            // source platform: "LinkedIn", "Indeed", etc.

  // Employer
  employer_name: string;
  employer_logo?: string;            // URL — may be null
  employer_website?: string;

  // Classification
  job_employment_type?: string;      // "FULLTIME" | "PARTTIME" | "CONTRACTOR" | "INTERN"
  job_is_remote?: boolean;
  job_function?: string;             // broad category, e.g. "Engineering"

  // Location
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_latitude?: number;
  job_longitude?: number;

  // Compensation
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_currency?: string;
  job_salary_period?: string;        // "YEAR" | "HOUR" | "MONTH"

  // Dates
  job_posted_at_datetime_utc?: string;
  job_posted_at_timestamp?: number;

  // Content
  job_description?: string;
  job_apply_link?: string;
  job_required_skills?: string[];    // may be null in many listings
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
    Benefits?: string[];
  };
}

export interface SearchResult {
  jobs: Job[];
  page: number;
  from_cache: boolean;
  quota_pct: number;
  quota_remaining: number;
  quota_warning: string | null;
}

export async function searchJobs(query: string, location: string, page = 1, pageSize = 10): Promise<SearchResult> {
  const params = new URLSearchParams({ query, location, page: String(page), page_size: String(pageSize) });
  const { data } = await api.get(`/api/jobs/search?${params}`);
  return data;
}

export async function getJobDetails(jobId: string): Promise<{ job: Job; quota_pct: number; quota_warning: string | null }> {
  const { data } = await api.get(`/api/jobs/details/${encodeURIComponent(jobId)}`);
  return data;
}

export interface QuotaStatus {
  provider: string;
  month: string;
  calls: number;
  limit: number;
  pct: number;
  remaining: number;
  warning: string | null;
}

export async function getJobsQuota(): Promise<QuotaStatus> {
  const { data } = await api.get("/api/jobs/quota");
  return data;
}

export async function saveJob(jobId: string, jobData: Job): Promise<void> {
  await api.post("/api/jobs/save", { job_id: jobId, job_data: jobData });
}

export async function getSavedJobs(): Promise<Job[]> {
  const { data } = await api.get("/api/jobs/saved");
  return data;
}

export async function unsaveJob(jobId: string): Promise<void> {
  await api.delete(`/api/jobs/saved/${jobId}`);
}

// ── Account profile ───────────────────────────────────────────────────────────

export interface AccountProfile {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  target_roles: string[];
  primary_skill: string;
  key_skills: string[];
  summary: string;
  resume_text?: string;
}

export async function searchCatalogRoles(q: string): Promise<string[]> {
  const { data } = await api.get(`/api/catalog/roles?q=${encodeURIComponent(q)}`);
  return data;
}

export async function searchCatalogSkills(q: string): Promise<string[]> {
  const { data } = await api.get(`/api/catalog/skills?q=${encodeURIComponent(q)}`);
  return data;
}

export async function getAccountProfile(): Promise<AccountProfile | null> {
  const { data } = await api.get("/api/account/profile");
  return data;
}

export async function saveAccountProfile(profile: Omit<AccountProfile, "id" | "resume_text" | "target_role">): Promise<AccountProfile> {
  const { data } = await api.put("/api/account/profile", profile);
  return data;
}

export async function uploadProfileResume(file: File): Promise<{ prefilled: Partial<AccountProfile>; resume_text: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/api/account/profile/resume", form);
  return data;
}

export async function createSessionFromProfileWithJob(jobDescription: string): Promise<{ session_id: string }> {
  const { data } = await api.post("/api/sessions/from-profile", { job_description: jobDescription });
  return data;
}

// ── Resume Library ────────────────────────────────────────────────────────────

export interface SavedResume {
  id: string;
  user_id: string;
  name: string;
  type: "uploaded" | "tailored";
  file_name?: string;
  content_type?: string;
  tailored_for_job?: string;
  tailored_for_employer?: string;
  created_at: string;
  updated_at: string;
}

export async function listSavedResumes(): Promise<SavedResume[]> {
  const { data } = await api.get("/api/account/resumes");
  return data;
}

export async function uploadSavedResume(file: File, name?: string): Promise<SavedResume> {
  const form = new FormData();
  form.append("file", file);
  if (name) form.append("name", name);
  const { data } = await api.post("/api/account/resumes/upload", form);
  return data;
}

export async function saveResumeFromSession(
  sessionId: string,
  name: string,
  jobTitle?: string,
  employerName?: string,
): Promise<SavedResume> {
  const { data } = await api.post("/api/account/resumes/from-session", {
    session_id: sessionId,
    name,
    job_title: jobTitle,
    employer_name: employerName,
  });
  return data;
}

export async function renameSavedResume(resumeId: string, name: string): Promise<SavedResume> {
  const { data } = await api.patch(`/api/account/resumes/${resumeId}`, { name });
  return data;
}

export async function deleteSavedResume(resumeId: string): Promise<void> {
  await api.delete(`/api/account/resumes/${resumeId}`);
}

export async function createSessionFromLibraryResume(
  resumeId: string,
  jobDescription = "",
): Promise<{ session_id: string }> {
  const { data } = await api.post(`/api/account/resumes/${resumeId}/create-session`, {
    job_description: jobDescription,
  });
  return data;
}

export function savedResumeDownloadUrl(resumeId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000";
  return `${base}/api/account/resumes/${resumeId}/download`;
}

// ── Job alerts ────────────────────────────────────────────────────────────────

export interface JobAlert {
  id: string;
  user_id: string;
  name: string;
  query_tags: string[];
  location_tags: string[];
  company: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
}

export async function listJobAlerts(): Promise<JobAlert[]> {
  const { data } = await api.get("/api/jobs/alerts");
  return data;
}

export async function createJobAlert(payload: {
  name: string;
  query_tags: string[];
  location_tags: string[];
  company?: string;
}): Promise<JobAlert> {
  const { data } = await api.post("/api/jobs/alerts", payload);
  return data;
}

export async function updateJobAlert(
  alertId: string,
  payload: {
    name?: string;
    query_tags?: string[];
    location_tags?: string[];
    company?: string;
  }
): Promise<JobAlert> {
  const { data } = await api.patch(`/api/jobs/alerts/${alertId}`, payload);
  return data;
}

export async function deleteJobAlert(alertId: string): Promise<void> {
  await api.delete(`/api/jobs/alerts/${alertId}`);
}

export async function toggleJobAlert(alertId: string): Promise<{ is_active: boolean }> {
  const { data } = await api.patch(`/api/jobs/alerts/${alertId}/toggle`);
  return data;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  tier: string;
  is_active: boolean;
  is_superadmin: boolean;
  created_at: string | null;
}

export interface UserStats {
  user_id: string;
  session_count: number;
  resume_count: number;
  alert_count: number;
  saved_job_count: number;
}

export interface AuditEntry {
  id: string;
  user_id: string;
  user_email: string;
  user_tier?: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

export interface AuditPage {
  total: number;
  page: number;
  page_size: number;
  items: AuditEntry[];
}

export interface PromptOverride {
  key: string;
  label: string;
  body: string;
  is_override: boolean;
  default_body: string;
  category?: string;   // "builder" | "cv_score" — drives the admin sub-tabs
}

export async function adminListUsers(): Promise<AdminUser[]> {
  const { data } = await api.get("/api/admin/users");
  return data;
}

export async function adminGetUserStats(userId: string): Promise<UserStats> {
  const { data } = await api.get(`/api/admin/users/${userId}/stats`);
  return data;
}

export async function adminUpdateUser(
  userId: string,
  body: { is_active?: boolean; is_superadmin?: boolean; tier?: string },
): Promise<{ id: string; email: string; is_active: boolean; is_superadmin: boolean; tier: string }> {
  const { data } = await api.patch(`/api/admin/users/${userId}`, body);
  return data;
}

export interface ResumeSession {
  id: string;
  created_at: string;
  target_role: string;
  quality_label: "Excellent" | "Strong" | "Good" | "Reviewed";
  min_score: number;
}

export interface AccountStats {
  session_count: number;
  generated_count: number;
  resume_count: number;
  alert_count: number;
  active_alert_count: number;
  saved_job_count: number;
  tier: string;
  recent_sessions: ResumeSession[];
}

export async function getUserStats(): Promise<AccountStats> {
  const { data } = await api.get("/api/account/stats");
  return data;
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await api.delete(`/api/admin/users/${userId}`);
}

export async function adminListAudit(page = 1, pageSize = 50): Promise<AuditPage> {
  const { data } = await api.get(`/api/admin/audit?page=${page}&page_size=${pageSize}`);
  return data;
}

export interface AgentMemory {
  agent: string;
  description: string;
  stats: {
    runs: number;
    avg_first_score?: number;
    avg_cycles?: number;
    avg_cost_usd?: number;
    pass_rate_pct?: number;
    avg_score?: number;
  };
  weaknesses: [string, number][];
  lessons: { kind: string; text: string }[];
  updated_at: string | null;
}

export async function adminGetAgentMemory(): Promise<AgentMemory[]> {
  const { data } = await api.get("/api/admin/agent-memory");
  return data.agents ?? [];
}

export async function adminListPrompts(): Promise<PromptOverride[]> {
  const { data } = await api.get("/api/admin/prompts");
  return data;
}

export async function adminUpdatePrompt(key: string, body: string): Promise<void> {
  await api.put(`/api/admin/prompts/${key}`, { body });
}

export async function adminResetPrompt(key: string): Promise<{ default_body: string }> {
  const { data } = await api.delete(`/api/admin/prompts/${key}`);
  return data;
}

export interface AdminProfession {
  slug: string;
  display_name: string;
  keywords: string[];
  generator_context: string;
  evaluator_context: string;
  scoring_criteria: string;
  aggregator_context: string;
  evaluator_names: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function adminListProfessions(): Promise<AdminProfession[]> {
  const { data } = await api.get("/api/admin/professions");
  return data;
}

export async function adminCreateProfession(body: Omit<AdminProfession, "is_active" | "created_at" | "updated_at">): Promise<AdminProfession> {
  const { data } = await api.post("/api/admin/professions", body);
  return data;
}

export async function adminUpdateProfession(slug: string, body: Partial<AdminProfession>): Promise<AdminProfession> {
  const { data } = await api.patch(`/api/admin/professions/${slug}`, body);
  return data;
}

export async function adminDeleteProfession(slug: string): Promise<void> {
  await api.delete(`/api/admin/professions/${slug}`);
}

// ── CV templates (resume preview/export templates — `cv_templates` collection) ──
// `CvTemplate` / `DocxConfig` types are imported at the top of this file
// (type-only — no runtime cycle).

/** Public — active templates for the gallery / preview store. */
export async function fetchCvTemplates(): Promise<CvTemplate[]> {
  const { data } = await api.get("/api/cv-templates");
  return data as CvTemplate[];
}

/** Admin — all templates including inactive. */
export async function adminListCvTemplates(): Promise<CvTemplate[]> {
  const { data } = await api.get("/api/admin/cv-templates");
  return data as CvTemplate[];
}

export async function adminCreateCvTemplate(
  body: Partial<CvTemplate> & { name: string; html: string },
): Promise<CvTemplate> {
  const { data } = await api.post("/api/admin/cv-templates", body);
  return data as CvTemplate;
}

export async function adminUpdateCvTemplate(
  key: string,
  body: Partial<CvTemplate>,
): Promise<CvTemplate> {
  const { data } = await api.patch(`/api/admin/cv-templates/${key}`, body);
  return data as CvTemplate;
}

export async function adminDeleteCvTemplate(key: string): Promise<void> {
  await api.delete(`/api/admin/cv-templates/${key}`);
}

export interface TemplateScoreResult {
  key: string;
  name?: string;
  quality_score?: number;
  tier?: string;
  error?: string;
}

/** Admin — score every template (gold résumé → CV-Score) and store quality_score + tier. */
export async function adminRecomputeTemplateScores(): Promise<{ results: TemplateScoreResult[]; scored: number; total: number }> {
  const { data } = await api.post("/api/admin/cv-templates/recompute-scores");
  return data;
}

export interface GeneratedTemplate {
  html: string;
  docx_config: DocxConfig;
  suggested_metadata: {
    name?: string;
    category?: CvTemplate["category"];
    traits?: string[];
    bestFor?: string;
    description?: string;
    pages?: 1 | 2;
    accentColor?: string;
  };
}

/** Admin — one dedicated LLM call: author a single template from a prompt. */
export async function adminGenerateCvTemplate(
  prompt: string,
  base_key?: string,
): Promise<GeneratedTemplate> {
  const { data } = await api.post("/api/admin/cv-templates/generate", { prompt, base_key });
  return data as GeneratedTemplate;
}

// ── Fit Score ─────────────────────────────────────────────────────────────────

export interface FitScoreResult {
  overall: number;
  verdict: "Strong Fit" | "Good Fit" | "Moderate Fit" | "Weak Fit";
  skills_match: number;
  experience_match: number;
  career_alignment: number;
  matched_skills: string[];
  missing_required: string[];
  summary: string;
}

export async function checkFit(sessionId: string): Promise<FitScoreResult> {
  const res = await api.post(`/api/sessions/${sessionId}/fit-score`);
  return res.data as FitScoreResult;
}

// ── Cover Letter ───────────────────────────────────────────────────────────────

export interface CoverLetterResult {
  company_name: string;
  subject_line: string;
  recipient: string;
  opening: string;
  body_paragraphs: string[];
  closing: string;
  sign_off: string;
  candidate_name: string;
  full_text: string;
}

export async function generateCoverLetter(sessionId: string): Promise<CoverLetterResult> {
  const res = await api.post(`/api/sessions/${sessionId}/cover-letter`);
  return res.data as CoverLetterResult;
}

export async function getCoverLetter(sessionId: string): Promise<CoverLetterResult | null> {
  const res = await api.get(`/api/sessions/${sessionId}/cover-letter`);
  return res.data as CoverLetterResult | null;
}

// ── System config (global admin master switches) ────────────────────────────────

export interface SystemConfig {
  alerts_enabled: boolean;
}

export async function fetchSystemConfig(): Promise<SystemConfig> {
  const { data } = await api.get("/api/admin/system-config");
  return data as SystemConfig;
}

export async function updateSystemConfig(patch: Partial<SystemConfig>): Promise<SystemConfig> {
  const { data } = await api.put("/api/admin/system-config", patch);
  return data as SystemConfig;
}
