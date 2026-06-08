# TailorMyCv — User Guide

> **AI-powered resume builder** that tailors your CV to every job posting using multiple AI models and LinkedIn integration.

---

## Table of Contents

1. [Plans & Pricing](#1-plans--pricing)
2. [Getting Started](#2-getting-started)
3. [The 6-Step Resume Builder](#3-the-6-step-resume-builder)
3a. [Cover Letter Generator](#3a-cover-letter-generator)
3b. [Interview Prep](#3b-interview-prep)
4. [Find Jobs](#4-find-jobs)
5. [Resume Library](#5-resume-library) *(Plus & Pro)*
6. [Job Alerts](#6-job-alerts) *(Plus & Pro)*
7. [Profile & Account](#7-profile--account)
8. [Settings — Plan & Usage](#8-settings--plan--usage)
9. [Admin Dashboard](#9-admin-dashboard-superadmins-only) *(Superadmins only)*
10. [Tips & Best Practices](#10-tips--best-practices)

---

## 1. Plans & Pricing

| Feature | Free | Plus | Pro |
|---|:---:|:---:|:---:|
| 6-step AI resume builder | ✅ | ✅ | ✅ |
| Cover Letter generator | ✅ | ✅ | ✅ |
| Interview Prep generator | ✅ | ✅ | ✅ |
| DOCX export | ✅ | ✅ | ✅ |
| PDF export | ❌ | ✅ | ✅ |
| Resume templates | 5 free designs | 20+ | 20+ |
| AI quality evaluators | 1 | 2 | 3 |
| Key skills extracted from JD | 3 | 5 | 10 |
| Resume sessions per period | 5 | 20 | Unlimited |
| LinkedIn profile import | ✅ | ✅ | ✅ |
| Job search — browse listings | ✅ | ✅ | ✅ |
| Save jobs | ❌ | Up to 25 | Unlimited |
| One-click Tailor from job listings | ❌ | ✅ | ✅ |
| Apply with saved resume | ❌ | ✅ | ✅ |
| Resume Library | ❌ | 5 resumes | Unlimited |
| Daily job alerts | ❌ | 5 searches | Unlimited |
| Section-level regeneration | ❌ | ❌ | ✅ |
| Locked Facts panel | ❌ | ❌ | ✅ |
| Sample CV formatting reference | ❌ | ❌ | ✅ |

> Pricing is shown automatically in your local currency based on your timezone/location. Visit the pricing section on the site for current prices.

---

## 2. Getting Started

### Sign up

1. Go to **[tailormycv-frontend-production.up.railway.app](https://tailormycv-frontend-production.up.railway.app)**
2. Click **Get started** on the plan you want
3. Register with your email and password, or sign in with **Google**

### First time setup

After registering, complete your **Profile** (`/profile`) using one of two methods:

**Option 1 — Upload your resume**
- Drop your existing CV (PDF or DOCX) onto the upload area
- AI automatically extracts: name, email, phone, LinkedIn URL, location, target roles, primary skill, key skills, and a professional summary
- Review and save

**Option 2 — Import from LinkedIn**
- Enter your LinkedIn profile URL (e.g. `https://www.linkedin.com/in/username/`)
- Click **Import Profile**
- AI extracts: name, location, professional summary, and key skills directly from your public profile
- No file needed

Then fill in your target roles and primary skill. This profile is reused across all your builder sessions — you only set it up once.

---

## 3. The 6-Step Resume Builder

The builder creates a tailored resume for a specific job. Each session takes 3–5 minutes.

---

### Step 1 — Upload or Import

Choose your starting point:

**Upload a resume** — drag and drop or click to upload your current resume as a **PDF or DOCX** (max 5 MB).

**Import from LinkedIn** — paste your LinkedIn profile URL and click **Import**:
```
https://www.linkedin.com/in/your-username/
```
The AI extracts your profile automatically — no file upload needed.

**Resume Library (Plus/Pro)** — if you have saved resumes, they appear at the top. Click **"Use this resume"** or **"Tailor with this"** to skip re-uploading.

**Tailoring from Find Jobs?** The job title and employer appear as a banner across all 6 steps. Click it to re-open the original listing.

---

### Step 2 — Profile

Review and confirm your personal details:

- **Name & contact** — shown on your final resume
- **Target role** — used to match profession-specific AI prompts
- **Preferred tone** — Professional, Conversational, or Executive
- **Key skills** — your core competencies (pre-filled from resume or LinkedIn import)
- **Additional notes** — any instructions for the AI (e.g. *"emphasise leadership experience"*)

> **Tip:** Correct anything that looks wrong here — these details appear verbatim on the output.

---

### Step 3 — Job

Paste the full job description of the role you're applying for.

The AI reads this to:
- Extract the **top keywords** employers care about (3 / 5 / 10 depending on your tier)
- Match your experience to the role requirements
- Prioritise the right skills in your resume

> **Tip:** Paste the complete JD including responsibilities and requirements — more context = better tailoring.

---

### Step 4 — Template

Choose how your resume is presented:

**Template** — pick from 20+ professional designs (5 available on Free; all on Plus/Pro). The live preview shows your CV content in the selected style.

**Output format:**
- Free: DOCX only
- Plus/Pro: choose DOCX, PDF, or both

**Additional instructions** *(optional)* — last-minute direction, e.g. *"use UK English"* or *"keep to one page"*.

**Formatting Reference** *(Pro only)* — upload a sample CV whose layout you want to mirror. The AI copies the structure and section order, never the content.

---

### Step 5 — Preview

The AI generates your tailored resume. This takes **30–90 seconds**.

**What happens during generation:**
1. Job Analyser extracts key skills from the JD
2. Generator writes your tailored resume draft
3. AI Evaluators score it (1 on Free, 2 on Plus, 3 on Pro)
4. If it doesn't pass quality thresholds, the generator refines it
5. The best-scoring version is selected

**After generation you can:**

- **Edit any field inline** — click any text to update it directly
- **"Bold key skills" checkbox** — when checked (default), matched skills are highlighted bold in the exported file
- **Regenerate the whole resume** — with optional guidance notes
- **Regenerate a single section** *(Pro only)* — each section has its own Regenerate button with a feedback field

**Quality badge:**
- 🟢 **Excellent / Strong** — resume passed all evaluators comfortably
- 🟡 **Good** — passed minimum threshold
- ⚪ **Reviewed** — generation completed but evaluators flagged areas for improvement

**Locked Facts** *(Pro only)* — pin specific facts (e.g. *"Company: Google"*, *"Degree: BSc Computer Science"*) that the AI must never change when regenerating.

---

### Step 6 — Download

Click **Generate Files** to produce your resume.

**DOCX** — fully editable Word document (all tiers)
**PDF** — print-ready, ATS-friendly (Plus & Pro only)

Files expire after **24 hours** — download them promptly.

**Save to Resume Library** *(Plus/Pro)* — click to save the tailored resume for reuse in future sessions.

---

## 3a. Cover Letter Generator

Go to **Cover Letter** in the navbar (or the bottom tab bar on mobile) to write a tailored cover letter in seconds.

### How to use it

1. **Paste your resume** into the first box (at least 100 characters).
2. **Paste the job description** into the second box (at least 100 characters).
3. Click **Generate Cover Letter**.

The AI writes a focused, professional letter using **only the facts in your resume** — it never invents employers, metrics, or qualifications. It pulls the company name from the job description, opens with your single strongest match to the role, proves two value points against the job's requirements, and closes with company-specific interest. Letters are kept tight (under ~280 words).

### After generating

- **Copy** — copies the subject line and full letter to your clipboard, ready to paste into an email or application form.
- **Regenerate** — produces a fresh version if you want a different angle.

> **Tip:** Inside the 6-step builder, a Cover Letter card also appears on the Preview step — it reuses the resume and job description from that session, so you don't need to paste anything.

---

## 3b. Interview Prep

Go to **Interview Prep** in the navbar to see the questions you're most likely to be asked for a specific role.

### How to use it

1. **Paste your resume** (≥ 100 characters).
2. **Paste the job description** (≥ 100 characters).
3. Click **Generate Questions**.

You get a fixed **15 targeted questions** (10 Technical, 2 Behavioral, 2 Situational, 1 Culture Fit), each tied to something real in the job description or your resume — not generic filler. Questions are grouped into four colour-coded categories:

- **Technical** — about specific tools and skills the role names
- **Behavioral** — about experiences (or gaps) visible in your resume
- **Situational** — "what would you do if…" scenarios for the role
- **Culture Fit** — values and working-style alignment

**Tap any question** to expand it and see *why it's likely to be asked* plus **key points to cover** in your answer. A **Prep tip** at the bottom gives you one concrete action to take before the interview.

> **Tip:** Interview Prep also appears as a card on the builder Preview step, pre-loaded with that session's resume and job description.

---

## 4. Find Jobs

Go to **Find Jobs** in the navbar to search job listings from Indeed, LinkedIn, Glassdoor, and more.

**All plans can search and browse listings.** Saving, tailoring, and alerts require Plus or Pro.

| Action | Free | Plus | Pro |
|---|:---:|:---:|:---:|
| Search and browse listings | ✅ | ✅ | ✅ |
| View job details & apply link | ✅ | ✅ | ✅ |
| Save jobs | ❌ | ✅ (25) | ✅ (unlimited) |
| Tailor resume from listing | ❌ | ✅ | ✅ |
| Apply with saved resume | ❌ | ✅ | ✅ |
| Daily job alerts | ❌ | ✅ (5) | ✅ (unlimited) |

### Searching

- **Job / Role** field — type a role name and press Enter (e.g. `Python Developer`, `Product Manager`)
- **Location** field — type a location and press Enter (e.g. `London`, `Remote`)
- Multiple tags in each field are combined in the search
- Your profile's target roles and primary skill pre-fill the search automatically on Plus/Pro

### Saving jobs *(Plus & Pro)*

Click the **bookmark icon** on any listing to save it. Saved jobs stay available in the **Saved** tab.

### One-click Tailor *(Plus & Pro)*

Click **Tailor Resume** on any listing to start a builder session pre-loaded with that job's description. The job title and employer appear as a banner across all 6 builder steps.

### Applying

Click **Apply →** on a listing to open the original job posting in a new tab. Use **Apply with Saved** *(Plus/Pro)* to attach an existing tailored resume from your library.

---

## 5. Resume Library

*Available on Plus (5 resumes) and Pro (unlimited).*

Your Resume Library stores resumes you've uploaded or saved from builder sessions.

### Accessing

Go to **My Profile** (`/profile`) and scroll to the **Resume Library** section.

### Actions

| Action | Description |
|---|---|
| **Upload** | Add any existing CV/resume (PDF or DOCX) |
| **Download** | Download the stored file |
| **Rename** | Give the resume a descriptive name |
| **Delete** | Permanently remove from library |
| **Use in builder** | Start a new session using this resume (Step 1) |
| **Tailor for a job** | Start a new session with this resume pre-loaded |

---

## 6. Job Alerts

*Available on Plus (5 alerts) and Pro (unlimited).*

Set up saved searches and receive a **daily email digest** with new matching jobs.

### Creating an alert

1. Go to **Find Jobs** → **My Alerts** tab
2. Click **New Alert**
3. Enter a name, job tags, and location tags
4. Click **Save Alert**

### How alerts work

Every day at 08:00 UTC, the system searches for new jobs matching your alert criteria and emails you a digest with:
- Job title, employer, location
- Salary range (where available)
- Skills matched
- Direct **Apply →** link

If no new jobs were found today, you receive a brief "no results" notification.

If the job search service experiences a temporary outage, your alert is silently skipped for that day and retried the following morning — you won't receive a false "no results" email.

### Managing alerts

- **Toggle** the switch to pause/resume an alert without deleting it
- **Edit** to update search terms or name
- **Delete** to remove permanently

> **Note:** Alerts are automatically deactivated if your account is downgraded from Plus/Pro to Free.

---

## 7. Profile & Account

Go to **your name** (top-right) → **My Profile** to manage:

### Personal details

- Full name, email, phone, LinkedIn URL, location
- **Upload your resume** to auto-fill all fields using AI extraction
- **Import from LinkedIn** — paste your LinkedIn URL and click "Import Profile" to auto-fill name, location, summary, and key skills
- **Target roles** — list of roles you're targeting (used to pre-fill job search)
- **Primary skill** — your core technical or professional skill (e.g. *Python*, *Product Management*)

### Changing your password

Available on the Profile page for email/password accounts. Google OAuth accounts manage passwords through Google.

### Resume Library

See [Section 5](#5-resume-library) above.

---

## 8. Settings — Plan & Usage

Go to **Settings** → **Plan & Usage** to see:

- Your current plan and subscription tier
- **Usage this period:**
  - Resume sessions created (vs. your limit)
  - Saved resumes (vs. your limit)
  - Saved jobs (vs. your limit)
  - Active job alerts (vs. your limit)
- **All plan comparison** — side-by-side view of Free / Plus / Pro features and pricing

### Upgrading your plan

Click **Upgrade to Plus** or **Upgrade to Pro** on the plan card. This will prompt you to contact support — billing is handled manually at this stage.

---

## 9. Admin Dashboard *(Superadmins only)*

Accessible at `/admin`. Tabs are organised into three feature groups, each with sub-sections.

### User Management

- **Users** — search by name/email, filter by tier or status, inline Tier / Admin / Active toggles (click **Save** to apply), and delete users (revoke superadmin first).
- **Audit Log** — a paginated record of privileged actions: user / tier / superadmin changes, user deletes, template and prompt edits, resume generate & export, and system-setting changes.

### Prompts & Templates

- **CV Builder Prompts** — override the resume-generation pipeline prompts (generator, job analyzer, evaluators). **Save** replaces the default; **Reset** reverts. Live immediately, no deploy.
- **CV Score Prompts** — override the CV-Score prompts (quality check, grammar & spelling, preview extractor, layout validator). Same Save/Reset behaviour.
- **Professions** — manage profession configs that shape AI tailoring strategy.
- **Resume Templates** — the live preview/export templates. Edit the design (HTML) + metadata + DOCX layout knobs, enable/disable, tick **"Show in CV Score"**, copy/download the standalone `.html`, or **generate a brand-new template with AI** (describe it, preview live, save). All changes go live with **no deploy**.

### Feature Controls

- **Tiers & Pricing** — feature gates (which tiers get each feature), numeric limits (for unlimited: leave blank, type `unlimited` / `-1`, or click the **∞** button), pricing per currency, and currency-detection rules. Changes take effect immediately.
- **System** — app-wide master switches. The **Daily Job Alerts** toggle pauses or resumes alert emails for **every** user at once (individual alerts are left untouched).

---

## 10. Tips & Best Practices

### Get the best results from the AI

- **Paste the full job description** in Step 3 — not just the title. The more the AI can read, the better it tailors.
- **Write specific additional instructions** — *"emphasise Python and FastAPI"* is better than *"make it technical"*.
- **Review the output before downloading** — edit inline on the Preview page to fix anything.
- **Use the quality badge as a guide** — if it says "Reviewed", try regenerating with feedback notes.

### Work efficiently

- **Set up your profile once** — either upload your resume or import from LinkedIn; the profile is reused for every builder session.
- **Save your best base resume** to the library (Plus/Pro) so you skip Step 1 for future applications.
- **Use One-click Tailor** from the job search page — it pre-loads the JD so you go straight to Step 2.
- **Set up job alerts** to receive matching roles daily without searching manually.

### File tips

- Upload your most comprehensive existing resume — the AI uses it as a base.
- DOCX output is fully editable in Microsoft Word or Google Docs.
- PDF output is ideal for submitting to ATS (Applicant Tracking Systems).

### Account security

- Use a strong unique password or sign in with Google.
- Sessions expire after 24 hours — if you're redirected to login, your session ended normally.
- Generated files expire after 24 hours — download before then.

---

*For support, contact **tailormycv.alerts@gmail.com***
