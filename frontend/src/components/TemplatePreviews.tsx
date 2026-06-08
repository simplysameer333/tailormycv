"use client";
import React, { useMemo, useState, useEffect, useReducer, useRef } from "react";
import Link from "next/link";
import { FiCheckCircle, FiArrowRight, FiLock } from "react-icons/fi";
import clsx from "clsx";
import { getTemplateHtml } from "@/lib/templateHtml";
import {
  getCvTemplates, getCvScoreTemplates, cvTemplatesLoaded, loadCvTemplates,
  subscribeCvTemplates, type CvTemplate, type PreviewData as _PreviewData,
} from "@/lib/cvTemplates";

// PreviewData now lives in `@/lib/cvTemplates` (single source of truth, no import
// cycle). Re-exported here so existing `@/components/TemplatePreviews` imports work.
export type PreviewData = _PreviewData;

// ══════════════════════════════════════════════════════════════════════════════
// PREVIEW RULES — how the CV-score preview curates the uploaded CV for display.
//
// IMPORTANT: this is a SEPARATE ruleset from the resume GENERATOR rules used by
// the builder (backend: services/pipeline/prompts/anthropic.py → _page_rules()).
// The preview and the actual resume creation are decoupled BY DESIGN — even for
// the same template, the preview may show different counts than the generated
// resume. Tune these values independently; do not couple them to the generator.
// (Exact guidelines to be finalised later.)
// ══════════════════════════════════════════════════════════════════════════════
// Page-count-aware: a 1-page template MUST show less than a 2-page one, or the
// preview overflows onto a second page. These caps are what keep a "1-page"
// template actually rendering as one page. Enforced on EVERY section (not just
// skills/bullets) — number of roles, summary length, education and extra sections
// are all capped, since those are the usual overflow culprits.
const PREVIEW_RULES: Record<1 | 2, {
  skillsCap: number; bulletsByRole: number[]; bulletsDefault: number;
  maxRoles: number; maxEducation: number; maxExtraSections: number; summaryCap: number;
}> = {
  1: { skillsCap: 8,  bulletsByRole: [3, 2, 2],    bulletsDefault: 1, maxRoles: 4, maxEducation: 2, maxExtraSections: 1, summaryCap: 300 },
  2: { skillsCap: 12, bulletsByRole: [5, 4, 3, 3], bulletsDefault: 2, maxRoles: 6, maxEducation: 3, maxExtraSections: 3, summaryCap: 600 },
};

// Curate an extracted CV down to what fits a template of `pages` pages.
function curatePreview(d: PreviewData, pages: number): PreviewData {
  const r = PREVIEW_RULES[pages === 1 ? 1 : 2];
  const summary = d.summary && d.summary.length > r.summaryCap
    ? d.summary.slice(0, r.summaryCap).replace(/\s+\S*$/, "") + "…"
    : d.summary;
  return {
    ...d,
    summary,
    skills: (d.skills || []).slice(0, r.skillsCap),
    experience: (d.experience || []).slice(0, r.maxRoles).map((e, i) => ({
      ...e,
      bullets: (e.bullets || []).slice(0, r.bulletsByRole[i] ?? r.bulletsDefault),
    })),
    education: (d.education || []).slice(0, r.maxEducation),
    extra_sections: (d.extra_sections || []).slice(0, r.maxExtraSections),
  };
}

// ── Preview data ──────────────────────────────────────────────────────────────
// (PreviewData interface moved to `@/lib/cvTemplates` and re-exported above.)

// SAMPLE / SAMPLE_THUMB removed — previews always use real data.
// Kept as empty exports so any import that references them compiles without error.
export const SAMPLE_THUMB: PreviewData = {
  name: "", title: "", email: "", phone: "", location: "", linkedin: "",
  summary: "", skills: [], experience: [], education: [],
};
export const SAMPLE = SAMPLE_THUMB;

const W = 600; // base template width in px (used by React components)

// A4 iframe dimensions — used by all iframe-based previews
const A4_W     = 794;
const A4_RATIO = 1.414;
const a4H = (scale: number) => Math.round(A4_W * A4_RATIO * scale);
const a4W = (scale: number) => Math.round(A4_W * scale);

// ── Scaling wrapper ───────────────────────────────────────────────────────────

function Scaled({ children, scale }: { children: React.ReactNode; scale: number }) {
  const w = Math.round(W * scale);
  const h = Math.round(W * 1.414 * scale); // A4 ratio
  return (
    <div style={{ width: w, height: h, overflow: "hidden", position: "relative", flexShrink: 0 }}>
      <div style={{ width: W, position: "absolute", top: 0, left: 0,
        transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

// ── Shared section heading styles ─────────────────────────────────────────────

const contact = (d: PreviewData) =>
  [d.email, d.phone, d.location, d.linkedin].filter(Boolean).join("  ·  ");

// ══════════════════════════════════════════════════════════════════════════════
// 15 TEMPLATE COMPONENTS
// Each renders at W=600px width, no height constraint (scales with content)
// ══════════════════════════════════════════════════════════════════════════════

// 1. CAMBRIDGE — Classic single-column, clean dividers
export function Cambridge({ data }: { data: PreviewData }) {
  const h2 = { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1.5, color: "#374151", margin: "18px 0 4px" };
  return (
    <div style={{ width: W, background: "#fff", padding: "48px 52px", fontFamily: "'Calibri',system-ui,sans-serif", color: "#1f2937", lineHeight: 1.5 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{data.name}</div>
      <div style={{ fontSize: 13, color: "#4b5563", marginTop: 4 }}>{data.title}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{contact(data)}</div>
      <div style={{ borderTop: "1.5px solid #d1d5db", margin: "14px 0" }} />
      <div style={h2}>Professional Summary</div>
      <div style={{ borderTop: "1px solid #d1d5db", marginBottom: 6 }} />
      <div style={{ fontSize: 12, color: "#374151" }}>{data.summary}</div>
      <div style={h2}>Work Experience</div>
      <div style={{ borderTop: "1px solid #d1d5db", marginBottom: 8 }} />
      {data.experience.map((e, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{e.title} — {e.company}</span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{e.date}</span>
          </div>
          {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, color: "#4b5563", paddingLeft: 14, marginTop: 3 }}>• {b}</div>)}
        </div>
      ))}
      <div style={h2}>Skills</div>
      <div style={{ borderTop: "1px solid #d1d5db", marginBottom: 6 }} />
      <div style={{ fontSize: 12, color: "#374151" }}>{data.skills.join("  ·  ")}</div>
      <div style={h2}>Education</div>
      <div style={{ borderTop: "1px solid #d1d5db", marginBottom: 6 }} />
      {data.education.map((e, i) => (
        <div key={i} style={{ fontSize: 12, color: "#374151" }}>{e.degree}  ·  {e.school}  ·  {e.year}</div>
      ))}
    </div>
  );
}

// 2. HORIZON — Blue header, bold section headings
export function Horizon({ data }: { data: PreviewData }) {
  const blue = "#1d4ed8";
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif", color: "#1f2937" }}>
      <div style={{ background: blue, padding: "36px 48px 28px" }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{data.name}</div>
        <div style={{ fontSize: 14, color: "#bfdbfe", marginTop: 4 }}>{data.title}</div>
        <div style={{ fontSize: 11, color: "#93c5fd", marginTop: 6 }}>{contact(data)}</div>
      </div>
      <div style={{ padding: "24px 48px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: blue, textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 4 }}>Profile</div>
        <div style={{ borderTop: `2px solid ${blue}`, marginBottom: 8 }} />
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>{data.summary}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: blue, textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "18px 0 4px" }}>Experience</div>
        <div style={{ borderTop: `2px solid ${blue}`, marginBottom: 8 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{e.title} · {e.company}</span>
              <span style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, color: "#4b5563", paddingLeft: 12, marginTop: 2 }}>• {b}</div>)}
          </div>
        ))}
        <div style={{ fontSize: 11, fontWeight: 700, color: blue, textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "18px 0 4px" }}>Skills</div>
        <div style={{ borderTop: `2px solid ${blue}`, marginBottom: 8 }} />
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
          {data.skills.map(s => <span key={s} style={{ background: "#eff6ff", color: blue, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}

// 3. PRESTIGE — Formal serif, centered header, double rules
export function Prestige({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", padding: "48px 52px", fontFamily: "Georgia,serif", color: "#1c1c1c" }}>
      <div style={{ borderTop: "2.5px solid #1c1c1c", marginBottom: 10 }} />
      <div style={{ textAlign: "center" as const }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" as const }}>{data.name}</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{data.title}</div>
        <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>{contact(data)}</div>
      </div>
      <div style={{ borderTop: "2.5px solid #1c1c1c", marginTop: 10, marginBottom: 2 }} />
      <div style={{ borderTop: "1px solid #1c1c1c", marginBottom: 16 }} />
      {[
        { label: "Professional Summary", content: <div style={{ fontSize: 12, lineHeight: 1.7, fontStyle: "italic" }}>{data.summary}</div> },
      ].map(({ label, content }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase" as const, color: "#111" }}>{label}</div>
          <div style={{ borderTop: "1px solid #bbb", borderBottom: "1px solid #bbb", padding: "6px 0", margin: "4px 0" }}>{content}</div>
        </div>
      ))}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase" as const }}>Professional Experience</div>
      <div style={{ borderTop: "1px solid #bbb", borderBottom: "1px solid #bbb", padding: "8px 0", margin: "4px 0 16px" }}>
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{e.title}</span>
              <span style={{ fontSize: 11, fontStyle: "italic", color: "#666" }}>{e.date}</span>
            </div>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 3 }}>{e.company}</div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 14, color: "#444" }}>• {b}</div>)}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase" as const }}>Core Competencies</div>
      <div style={{ borderTop: "1px solid #bbb", borderBottom: "1px solid #bbb", padding: "6px 0", margin: "4px 0", fontSize: 11, lineHeight: 2 }}>
        {data.skills.join("   ·   ")}
      </div>
    </div>
  );
}

// 4. CATALYST — Bold orange accent, strong typography
export function Catalyst({ data }: { data: PreviewData }) {
  const orange = "#ea580c";
  return (
    <div style={{ width: W, background: "#fff", padding: "44px 52px", fontFamily: "system-ui,sans-serif", color: "#111" }}>
      <div style={{ fontSize: 32, fontWeight: 900, color: "#0f172a", lineHeight: 1, letterSpacing: -1 }}>{data.name.toUpperCase()}</div>
      <div style={{ height: 4, width: 56, background: orange, margin: "10px 0" }} />
      <div style={{ fontSize: 13, color: "#475569" }}>{data.title}  ·  {data.location}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{data.email}  ·  {data.phone}</div>
      {[
        { title: "About", content: <div style={{ fontSize: 12, lineHeight: 1.6 }}>{data.summary}</div> },
      ].map(({ title, content }) => (
        <div key={title} style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: orange, textTransform: "uppercase" as const, letterSpacing: 2 }}>{title}</div>
          <div style={{ height: 1, background: "#fed7aa", margin: "4px 0 8px" }} />
          {content}
        </div>
      ))}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: orange, textTransform: "uppercase" as const, letterSpacing: 2 }}>Experience</div>
        <div style={{ height: 1, background: "#fed7aa", margin: "4px 0 8px" }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{e.title}</span>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{e.company}  ·  {e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, marginTop: 2, color: "#334155" }}>→ {b}</div>)}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: orange, textTransform: "uppercase" as const, letterSpacing: 2 }}>Skills</div>
        <div style={{ height: 1, background: "#fed7aa", margin: "4px 0 8px" }} />
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
          {data.skills.map(s => <span key={s} style={{ background: "#fff7ed", border: "1px solid #fed7aa", color: orange, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}

// 5. CANVAS — Ultra-minimal, whitespace-first
export function Canvas({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", padding: "56px 60px", fontFamily: "'Helvetica Neue',system-ui,sans-serif", color: "#374151" }}>
      <div style={{ fontSize: 24, fontWeight: 300, color: "#111827", letterSpacing: -0.5 }}>{data.name}</div>
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, fontStyle: "italic" }}>{data.title}</div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, letterSpacing: 0.5 }}>{contact(data)}</div>
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: 2.5, marginBottom: 8 }}>About</div>
        <div style={{ fontSize: 12, lineHeight: 1.8, color: "#4b5563" }}>{data.summary}</div>
      </div>
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: 2.5, marginBottom: 8 }}>Work</div>
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{e.title}</span>
              <span style={{ fontSize: 10, color: "#9ca3af" }}>{e.date}</span>
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{e.company}</div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, color: "#6b7280", paddingLeft: 12, marginTop: 2 }}>— {b}</div>)}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: 2.5, marginBottom: 8 }}>Skills</div>
        <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 2 }}>{data.skills.join("   ·   ")}</div>
      </div>
    </div>
  );
}

// 6. ADMIRAL — Navy blue, formal two-tone
export function Admiral({ data }: { data: PreviewData }) {
  const navy = "#1e3a5f";
  return (
    <div style={{ width: W, background: "#fff", padding: "44px 52px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: navy }}>{data.name}</div>
          <div style={{ fontSize: 13, color: "#3b5998", marginTop: 3 }}>{data.title}</div>
        </div>
        <div style={{ textAlign: "right" as const, fontSize: 11, color: "#6b7280", lineHeight: 1.7 }}>
          <div>{data.email}</div><div>{data.phone}</div><div>{data.location}</div>
        </div>
      </div>
      <div style={{ borderTop: `2px solid ${navy}`, margin: "14px 0 8px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: navy, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 6 }}>Career Profile</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 18 }}>{data.summary}</div>
      <div style={{ borderTop: `1px solid ${navy}`, margin: "0 0 6px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: navy, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 10 }}>Career History</div>
      {data.experience.map((e, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{e.title}</span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{e.date}</span>
          </div>
          <div style={{ fontSize: 11, color: navy, fontWeight: 600, marginBottom: 3 }}>{e.company}</div>
          {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 14, color: "#4b5563", marginTop: 2 }}>• {b}</div>)}
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${navy}`, margin: "12px 0 6px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: navy, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 6 }}>Core Skills</div>
      <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.9 }}>{data.skills.join("  ·  ")}</div>
    </div>
  );
}

// 7. JADE — Teal left accent bar + teal headings
export function Jade({ data }: { data: PreviewData }) {
  const teal = "#0d9488";
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif", display: "flex" }}>
      <div style={{ width: 6, background: teal, flexShrink: 0 }} />
      <div style={{ padding: "44px 48px", flex: 1 }}>
        <div style={{ fontSize: 27, fontWeight: 700, color: "#0f172a" }}>{data.name}</div>
        <div style={{ fontSize: 13, color: teal, marginTop: 3 }}>{data.title}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{contact(data)}</div>
        <div style={{ height: 1, background: "#ccfbf1", margin: "16px 0" }} />
        <SectionTeal label="Summary" teal={teal}>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{data.summary}</div>
        </SectionTeal>
        <SectionTeal label="Experience" teal={teal}>
          {data.experience.map((e, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{e.title} — {e.company}</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{e.date}</span>
              </div>
              {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, marginTop: 2, color: "#475569" }}>• {b}</div>)}
            </div>
          ))}
        </SectionTeal>
        <SectionTeal label="Skills" teal={teal}>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
            {data.skills.map(s => <span key={s} style={{ background: "#f0fdfa", border: `1px solid ${teal}`, color: teal, borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>{s}</span>)}
          </div>
        </SectionTeal>
      </div>
    </div>
  );
}
function SectionTeal({ label, teal, children }: { label: string; teal: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: teal, textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

// 8. PRISM — Two-column: gray sidebar | main
export function Prism({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif", display: "flex", minHeight: 848 }}>
      <div style={{ width: 200, background: "#f1f5f9", padding: "40px 22px", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", lineHeight: 1.2 }}>{data.name}</div>
        <div style={{ fontSize: 11, color: "#2563eb", marginTop: 4 }}>{data.title}</div>
        <div style={{ height: 2, width: 32, background: "#2563eb", margin: "10px 0" }} />
        <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.9 }}>
          <div>{data.email}</div><div>{data.phone}</div><div>{data.location}</div><div>{data.linkedin}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#1e293b", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "20px 0 8px" }}>Skills</div>
        <div style={{ height: 1, background: "#cbd5e1", marginBottom: 8 }} />
        {data.skills.map(s => (
          <div key={s} style={{ fontSize: 11, color: "#334155", marginBottom: 4 }}>
            <span style={{ color: "#2563eb", marginRight: 6 }}>▸</span>{s}
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 700, color: "#1e293b", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "20px 0 8px" }}>Education</div>
        <div style={{ height: 1, background: "#cbd5e1", marginBottom: 8 }} />
        {data.education.map((e, i) => (
          <div key={i} style={{ fontSize: 11, color: "#334155", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600 }}>{e.degree}</div>
            <div style={{ color: "#64748b" }}>{e.school}</div>
            <div style={{ color: "#94a3b8" }}>{e.year}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: "40px 32px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Profile</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 20 }}>{data.summary}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Experience</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{e.title}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#2563eb" }}>{e.company}</span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, color: "#475569", marginTop: 2 }}>• {b}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

// 9. VIVID — Purple sidebar, creative
export function Vivid({ data }: { data: PreviewData }) {
  const purple = "#7c3aed";
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif", display: "flex", minHeight: 848 }}>
      <div style={{ width: 190, background: purple, padding: "40px 20px", flexShrink: 0 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{data.name.charAt(0)}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{data.name}</div>
        <div style={{ fontSize: 11, color: "#c4b5fd", marginTop: 4 }}>{data.title}</div>
        <div style={{ height: 1, background: "rgba(255,255,255,0.2)", margin: "14px 0" }} />
        <div style={{ fontSize: 10, color: "#ddd6fe", lineHeight: 2 }}>
          <div>{data.email}</div><div>{data.phone}</div><div>{data.location}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "18px 0 8px" }}>Skills</div>
        {data.skills.map(s => <div key={s} style={{ fontSize: 11, color: "#ede9fe", marginBottom: 4 }}>▸ {s}</div>)}
        <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "18px 0 8px" }}>Education</div>
        {data.education.map((e, i) => (
          <div key={i} style={{ fontSize: 10, color: "#ddd6fe", lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: "#fff" }}>{e.degree}</div>
            <div>{e.school} · {e.year}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: "40px 30px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: purple, textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Profile</div>
        <div style={{ height: 1.5, background: "#ede9fe", marginBottom: 10 }} />
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 20 }}>{data.summary}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: purple, textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Experience</div>
        <div style={{ height: 1.5, background: "#ede9fe", marginBottom: 10 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: purple }}>{e.company}</span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, color: "#475569", marginTop: 2 }}>• {b}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

// 10. CHRONICLE — Timeline with left border dots
export function Chronicle({ data }: { data: PreviewData }) {
  const brand = "#2563eb";
  return (
    <div style={{ width: W, background: "#fff", padding: "44px 52px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ fontSize: 27, fontWeight: 700, color: "#0f172a" }}>{data.name}</div>
      <div style={{ fontSize: 13, color: brand, marginTop: 3 }}>{data.title}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{contact(data)}</div>
      <div style={{ height: 1, background: "#e2e8f0", margin: "14px 0" }} />
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 18 }}>{data.summary}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 12 }}>Experience</div>
      {data.experience.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", width: 12, flexShrink: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: brand, border: "2px solid #fff", boxShadow: `0 0 0 2px ${brand}`, flexShrink: 0 }} />
            {i < data.experience.length - 1 && <div style={{ flex: 1, width: 1.5, background: "#cbd5e1", marginTop: 4 }} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{e.title}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{e.date}</span>
            </div>
            <div style={{ fontSize: 11, color: brand, marginBottom: 4 }}>{e.company}</div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 10, color: "#475569", marginTop: 2 }}>• {b}</div>)}
          </div>
        </div>
      ))}
      <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0 10px" }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 8 }}>Skills</div>
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
        {data.skills.map(s => <span key={s} style={{ background: "#eff6ff", color: brand, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 500 }}>{s}</span>)}
      </div>
    </div>
  );
}

// 11. SUMMIT — Dark charcoal header block
export function Summit({ data }: { data: PreviewData }) {
  const dark = "#1e293b";
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: dark, padding: "36px 48px 28px" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{data.name}</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{data.title}</div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" as const }}>
          {[data.email, data.phone, data.location].map(v => (
            <span key={v} style={{ fontSize: 10, color: "#64748b", background: "rgba(255,255,255,0.07)", padding: "2px 8px", borderRadius: 3 }}>{v}</span>
          ))}
        </div>
      </div>
      <div style={{ padding: "24px 48px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: dark, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 6 }}>Summary</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 20 }}>{data.summary}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: dark, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 6 }}>Experience</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{e.title} — {e.company}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, color: "#475569", marginTop: 2 }}>• {b}</div>)}
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 700, color: dark, textTransform: "uppercase" as const, letterSpacing: 2, margin: "16px 0 8px" }}>Skills</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
          {data.skills.map(s => <span key={s} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: dark, borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}

// 12. SYMMETRY — Equal two columns
export function Symmetry({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ padding: "36px 48px 16px", borderBottom: "2px solid #0f172a" }}>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#0f172a" }}>{data.name}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{data.title}  ·  {contact(data)}</div>
        </div>
      </div>
      <div style={{ display: "flex", padding: "20px 32px", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Experience</div>
          {data.experience.map((e, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{e.title}</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#2563eb" }}>{e.company}</span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>{e.date}</span>
              </div>
              {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 10, marginTop: 2, color: "#475569" }}>• {b}</div>)}
            </div>
          ))}
          <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151" }}>{data.summary}</div>
        </div>
        <div style={{ width: 1, background: "#e2e8f0" }} />
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Skills</div>
          {data.skills.map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb" }} />
              <span style={{ fontSize: 11, color: "#374151" }}>{s}</span>
            </div>
          ))}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "16px 0 6px" }}>Education</div>
          {data.education.map((e, i) => (
            <div key={i} style={{ fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>{e.degree}</div>
              <div style={{ color: "#6b7280" }}>{e.school}</div>
              <div style={{ color: "#9ca3af" }}>{e.year}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 13. SCHOLAR — Academic, formal structure
export function Scholar({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", padding: "48px 56px", fontFamily: "Georgia,serif", color: "#1c1c1c", lineHeight: 1.6 }}>
      <div style={{ textAlign: "center" as const, marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{data.name}</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>{data.title}</div>
        <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{contact(data)}</div>
      </div>
      <div style={{ borderTop: "2px solid #333", borderBottom: "1px solid #333", padding: "8px 0", marginBottom: 16, textAlign: "center" as const }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase" as const, color: "#333" }}>Research & Professional Summary</div>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 20, textAlign: "justify" as const }}>{data.summary}</div>
      <div style={{ borderTop: "1px solid #999", paddingTop: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Professional Experience</div>
      </div>
      {data.experience.map((e, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{e.title}</span>
            <span style={{ fontSize: 11, fontStyle: "italic", color: "#555" }}>{e.date}</span>
          </div>
          <div style={{ fontSize: 11, fontStyle: "italic", color: "#555", marginBottom: 4 }}>{e.company}</div>
          {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 18, color: "#333" }}>• {b}</div>)}
        </div>
      ))}
      <div style={{ borderTop: "1px solid #999", paddingTop: 8, margin: "16px 0 10px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Education</div>
      </div>
      {data.education.map((e, i) => (
        <div key={i} style={{ fontSize: 12, color: "#1c1c1c" }}>{e.degree}  ·  {e.school}  ·  {e.year}</div>
      ))}
      <div style={{ borderTop: "1px solid #999", paddingTop: 8, margin: "16px 0 10px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Technical Competencies</div>
      </div>
      <div style={{ fontSize: 12, lineHeight: 2 }}>{data.skills.join("   ·   ")}</div>
    </div>
  );
}

// 14. SWIFT — Ultra-compact, maximises content on one page
export function Swift({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", padding: "32px 44px", fontFamily: "system-ui,sans-serif", fontSize: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1.5px solid #374151", paddingBottom: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{data.name}</div>
        <div style={{ color: "#64748b", fontSize: 10 }}>{data.email}  ·  {data.phone}  ·  {data.location}</div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 4 }}>Summary</div>
      <div style={{ color: "#4b5563", marginBottom: 10, lineHeight: 1.5 }}>{data.summary}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 4 }}>Experience</div>
      {data.experience.map((e, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, color: "#1e293b" }}>{e.title}  —  {e.company}</span>
            <span style={{ color: "#94a3b8", fontSize: 10 }}>{e.date}</span>
          </div>
          {e.bullets.map((b, j) => <div key={j} style={{ paddingLeft: 12, color: "#475569", marginTop: 1 }}>• {b}</div>)}
        </div>
      ))}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "8px 0 4px" }}>Skills</div>
      <div style={{ color: "#4b5563", lineHeight: 1.8 }}>{data.skills.join("  ·  ")}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "8px 0 4px" }}>Education</div>
      {data.education.map((e, i) => <div key={i} style={{ color: "#4b5563" }}>{e.degree}  ·  {e.school}  ·  {e.year}</div>)}
    </div>
  );
}

// 15. LUXE — Warm gold accents, cream background
export function Luxe({ data }: { data: PreviewData }) {
  const gold = "#b45309";
  return (
    <div style={{ width: W, background: "#fffdf5", padding: "52px 56px", fontFamily: "Georgia,serif", color: "#292524" }}>
      <div style={{ textAlign: "center" as const, marginBottom: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: "#1c1917" }}>{data.name.toUpperCase()}</div>
        <div style={{ fontSize: 12, color: gold, letterSpacing: 1.5, marginTop: 4 }}>{data.title}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}>
        <div style={{ flex: 1, height: 1, background: gold, opacity: 0.4 }} />
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: gold }} />
        <div style={{ flex: 1, height: 1, background: gold, opacity: 0.4 }} />
      </div>
      <div style={{ textAlign: "center" as const, fontSize: 10, color: "#78716c", marginBottom: 24 }}>{contact(data)}</div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: gold, textTransform: "uppercase" as const, letterSpacing: 3, marginBottom: 6 }}>Professional Profile</div>
        <div style={{ height: 1, background: gold, opacity: 0.3, marginBottom: 10 }} />
        <div style={{ fontSize: 12, lineHeight: 1.8, color: "#44403c", fontStyle: "italic" }}>{data.summary}</div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: gold, textTransform: "uppercase" as const, letterSpacing: 3, marginBottom: 6 }}>Career History</div>
        <div style={{ height: 1, background: gold, opacity: 0.3, marginBottom: 10 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1c1917" }}>{e.title}  ·  {e.company}</span>
              <span style={{ fontSize: 11, fontStyle: "italic", color: "#78716c" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 14, color: "#57534e", marginTop: 3 }}>• {b}</div>)}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: gold, textTransform: "uppercase" as const, letterSpacing: 3, marginBottom: 6 }}>Core Expertise</div>
      <div style={{ height: 1, background: gold, opacity: 0.3, marginBottom: 10 }} />
      <div style={{ fontSize: 12, color: "#44403c", lineHeight: 2 }}>{data.skills.join("   ·   ")}</div>
    </div>
  );
}

// 16-20. New templates — previews rendered via getTemplateHtml (iframes)
// These stubs exist only to satisfy the TemplateInfo type; the component
// field is unused at runtime (all previews use getTemplateHtml).
export function TechModern({ data }: { data: PreviewData }) { return Cambridge({ data }); }
export function Pulse({ data }: { data: PreviewData })      { return Jade({ data }); }
export function HexagonPro({ data }: { data: PreviewData }) { return Horizon({ data }); }
export function SalesImpact({ data }: { data: PreviewData }) { return Horizon({ data }); }
export function Healthcare({ data }: { data: PreviewData }) { return Jade({ data }); }

// ══════════════════════════════════════════════════════════════════════════════
// TEMPLATE REGISTRY
// ══════════════════════════════════════════════════════════════════════════════

export type PageCount = 1 | 2;

export interface TemplateInfo {
  key: string;
  name: string;
  component: React.FC<{ data: PreviewData }>;
  category: "Classic" | "Modern" | "Creative" | "Executive" | "ATS";
  traits: string[];
  bestFor: string;
  description: string;
  pages: PageCount;
  tier: "free" | "plus" | "pro";
  accentColor: string;
  quality_score?: number;
}

export const ALL_TEMPLATES: TemplateInfo[] = [
  // ── Free (first 5) ──────────────────────────────────────────────────────────
  { key: "Cambridge",  name: "Cambridge",    component: Cambridge,  category: "Classic",   traits: ["ATS-safe","Monochrome","Timeless"],     bestFor: "All industries",        description: "Clean single-column layout trusted by recruiters at any firm.",              pages: 1, tier: "free", accentColor: "#1f2937" },
  { key: "Horizon",    name: "Horizon",      component: Horizon,    category: "Modern",    traits: ["Blue header","Bold","Tech-ready"],      bestFor: "Tech, product, design", description: "Bold blue header with strong visual hierarchy and skill chips.",             pages: 2, tier: "free", accentColor: "#1d4ed8" },
  { key: "Prestige",   name: "Prestige",     component: Prestige,   category: "Executive", traits: ["Serif","Centred","Formal"],             bestFor: "Finance, law, C-suite", description: "Authoritative serif typeface with formal centred header and double rules.",  pages: 2, tier: "free", accentColor: "#374151" },
  { key: "Admiral",    name: "Admiral",      component: Admiral,    category: "Classic",   traits: ["Navy","Professional","Two-tone"],       bestFor: "Banking, consulting",   description: "Navy blue accents with name and contact in a refined two-tone layout.",      pages: 2, tier: "free", accentColor: "#1e3a5f" },
  { key: "Swift",      name: "Swift",        component: Swift,      category: "ATS",       traits: ["Compact","1-page","Content-rich"],      bestFor: "Senior / 1-page CVs",   description: "Ultra-dense layout fitting maximum experience on a single page.",            pages: 1, tier: "free", accentColor: "#1e293b" },
  // ── Plus / Pro ──────────────────────────────────────────────────────────────
  { key: "Catalyst",   name: "Catalyst",     component: Catalyst,   category: "Modern",    traits: ["Orange accent","Bold","Standout"],      bestFor: "Sales, startups",       description: "High-contrast orange accents that demand attention on a recruiter's desk.",  pages: 1, tier: "plus", accentColor: "#ea580c" },
  { key: "Canvas",     name: "Canvas",       component: Canvas,     category: "Classic",   traits: ["Minimal","Whitespace","Refined"],       bestFor: "UX, design, research",  description: "Abundant whitespace and restrained typography — lets content breathe.",      pages: 1, tier: "plus", accentColor: "#6b7280" },
  { key: "Jade",       name: "Jade",         component: Jade,       category: "Modern",    traits: ["Teal","Left accent","Fresh"],           bestFor: "Healthcare, education", description: "Teal left accent bar and section headers with skill chip badges.",           pages: 2, tier: "plus", accentColor: "#0d9488" },
  { key: "Prism",      name: "Prism",        component: Prism,      category: "Modern",    traits: ["Two-column","Sidebar","Structured"],    bestFor: "Tech, data science",    description: "Blue sidebar organises contact and skills; wide main column for experience.", pages: 2, tier: "plus", accentColor: "#2563eb" },
  { key: "Vivid",      name: "Vivid",        component: Vivid,      category: "Creative",  traits: ["Purple","Sidebar","Distinctive"],       bestFor: "Design, marketing",     description: "Rich purple sidebar with monogram initial — makes an instant impression.",   pages: 2, tier: "plus", accentColor: "#7c3aed" },
  { key: "Chronicle",  name: "Chronicle",    component: Chronicle,  category: "Modern",    traits: ["Timeline","Dots","Narrative"],          bestFor: "Product, operations",   description: "Timeline dots make your career progression immediately legible.",            pages: 2, tier: "plus", accentColor: "#1d4ed8" },
  { key: "Summit",     name: "Summit",       component: Summit,     category: "Executive", traits: ["Dark header","Contrast","Impact"],      bestFor: "Engineering, fintech",  description: "Full-width charcoal header block creates a commanding first impression.",   pages: 2, tier: "plus", accentColor: "#0f172a" },
  { key: "Symmetry",   name: "Symmetry",     component: Symmetry,   category: "Modern",    traits: ["Two-column","Balanced","Structured"],   bestFor: "PM, strategy, ops",     description: "Balanced equal columns — experience left, skills and education right.",      pages: 2, tier: "plus", accentColor: "#1e3a5f" },
  { key: "Scholar",    name: "Scholar",      component: Scholar,    category: "Classic",   traits: ["Serif","Academic","Formal"],            bestFor: "Academia, research",    description: "Traditional academic formatting for scholarly and research CVs.",            pages: 2, tier: "plus", accentColor: "#374151" },
  { key: "Luxe",       name: "Luxe",         component: Luxe,       category: "Executive", traits: ["Gold","Warm","Distinctive"],            bestFor: "Legal, luxury, arts",   description: "Warm gold decorative accents on cream — memorable and refined.",            pages: 2, tier: "plus", accentColor: "#b45309" },
  // ── New templates (inspired by catalog concepts, original designs) ────────────
  { key: "TechModern",  name: "Tech Modern",  component: TechModern,  category: "Modern",    traits: ["Dark header","Monospace","Green"],      bestFor: "Engineering, dev roles",  description: "Dark header with monospace typography and green accent — built for tech.",   pages: 2, tier: "plus", accentColor: "#10b981" },
  { key: "Pulse",       name: "Pulse",        component: Pulse,       category: "Modern",    traits: ["Red bar","Bold","Energetic"],           bestFor: "Sales, startups, ops",    description: "Bold rose left bar with high-contrast typography — made to stand out.",      pages: 2, tier: "plus", accentColor: "#e11d48" },
  { key: "HexagonPro",  name: "Hexagon Pro",  component: HexagonPro,  category: "Modern",    traits: ["Circle markers","Sky blue","Clean"],    bestFor: "Product, consulting",     description: "Circle-dot section markers with a sky-blue accent line — modern and crisp.", pages: 2, tier: "plus", accentColor: "#0ea5e9" },
  { key: "SalesImpact", name: "Sales Impact", component: SalesImpact, category: "Creative",  traits: ["Red banner","Bold","Results-focused"],  bestFor: "Sales, business dev",     description: "Commanding red header — built to highlight metrics and achievements.",       pages: 2, tier: "plus", accentColor: "#dc2626" },
  { key: "Healthcare",  name: "Healthcare",   component: Healthcare,  category: "Classic",   traits: ["Teal","Structured","Clinical"],         bestFor: "Healthcare, nursing",     description: "Teal-accented section blocks with a clean clinical structure.",              pages: 2, tier: "plus", accentColor: "#0891b2" },
];

// ── Reactive store access ──────────────────────────────────────────────────────
// ALL_TEMPLATES above is now the built-in FALLBACK; the live list comes from the
// MongoDB-backed runtime store. Map a DB CvTemplate → the TemplateInfo shape the
// UI expects. The `component` (React) field is legacy/unused at runtime (previews
// render via getTemplateHtml/iframes); mapped from a registry, default Cambridge.
const COMPONENT_REGISTRY: Record<string, React.FC<{ data: PreviewData }>> = {
  Cambridge, Horizon, Prestige, Catalyst, Admiral, Canvas, Swift, Jade, Prism, Vivid,
  Chronicle, Summit, Symmetry, Scholar, Luxe, TechModern, Pulse, HexagonPro, SalesImpact, Healthcare,
};

function toTemplateInfo(t: CvTemplate): TemplateInfo {
  return {
    key: t.key, name: t.name, component: COMPONENT_REGISTRY[t.key] ?? Cambridge,
    category: t.category, traits: t.traits, bestFor: t.bestFor,
    description: t.description, pages: t.pages, tier: t.tier, accentColor: t.accentColor,
    quality_score: t.quality_score,
  };
}

/** Re-render the calling component when the template store loads/changes. */
function useStoreTick() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const unsub = subscribeCvTemplates(force);
    if (!cvTemplatesLoaded()) loadCvTemplates();
    return unsub;
  }, []);
}

/** All active templates as TemplateInfo[] (falls back to built-in ALL_TEMPLATES). */
export function useCvTemplateInfos(): TemplateInfo[] {
  useStoreTick();
  const list = getCvTemplates();
  return list.length ? list.map(toTemplateInfo) : ALL_TEMPLATES;
}

/** Round a template count down to the nearest 5 for marketing copy: 22 → "20+". */
export function templateCountLabel(n: number): string {
  return `${Math.max(5, Math.floor(n / 5) * 5)}+`;
}

/** CV-score gallery templates (show_in_cv_score) — falls back to the classic 4. */
export function useCvScoreInfos(): TemplateInfo[] {
  useStoreTick();
  const list = getCvScoreTemplates();
  if (list.length) return list.map(toTemplateInfo);
  return ["Horizon", "Vivid", "Catalyst", "Swift"]
    .map(k => ALL_TEMPLATES.find(t => t.key === k))
    .filter(Boolean) as TemplateInfo[];
}

export const CATEGORY_COLORS: Record<string, string> = {
  Classic:   "bg-slate-100 text-slate-700",
  Modern:    "bg-blue-50 text-blue-700",
  Creative:  "bg-purple-50 text-purple-700",
  Executive: "bg-amber-50 text-amber-700",
  ATS:       "bg-green-50 text-green-700",
};

// Richer modal header colours — one per category
export const CATEGORY_HEADER: Record<string, { bg: string; text: string; badge: string }> = {
  Classic:   { bg: "bg-slate-700",   text: "text-white",       badge: "bg-slate-500 text-white"   },
  Modern:    { bg: "bg-blue-700",    text: "text-white",       badge: "bg-blue-500 text-white"    },
  Creative:  { bg: "bg-purple-700",  text: "text-white",       badge: "bg-purple-500 text-white"  },
  Executive: { bg: "bg-amber-700",   text: "text-white",       badge: "bg-amber-500 text-white"   },
  ATS:       { bg: "bg-emerald-700", text: "text-white",       badge: "bg-emerald-500 text-white" },
};

// ══════════════════════════════════════════════════════════════════════════════
// REUSABLE UI COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

// ── Iframe-based preview (crisp, pixel-perfect rendering) ─────────────────────

// Thumbnail: top 68% of A4 at scale that fits card width (~196px)
const THUMB_SCALE = 0.247;
const THUMB_H     = Math.round(a4H(THUMB_SCALE) * 0.68);

export function TemplateThumbnail({
  info, isSelected, onClick, locked = false, data,
}: {
  info: TemplateInfo; isSelected: boolean; onClick: () => void;
  locked?: boolean; data?: PreviewData;
}) {
  const html = useMemo(
    () => data ? getTemplateHtml(info.key, data) : "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [info.key, data?.name, data?.title]
  );

  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={clsx(
        "relative flex flex-col text-left transition rounded-2xl overflow-hidden border bg-white",
        locked ? "opacity-60 cursor-not-allowed" : "hover:shadow-xl hover:-translate-y-0.5",
        isSelected ? "ring-2 ring-brand-500 border-brand-400 shadow-lg" : "border-slate-200 hover:border-brand-300",
      )}
    >
      {isSelected && !locked && (
        <div className="absolute top-2 right-2 z-10 bg-brand-500 rounded-full p-0.5 shadow">
          <FiCheckCircle className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      {locked && (
        <div className="absolute top-2 right-2 z-10 bg-slate-800/70 rounded-full p-1">
          <FiLock className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Iframe preview — renders at full 794px then CSS-scaled down */}
      <div style={{ height: THUMB_H, overflow: "hidden", position: "relative", background: "#fff", flexShrink: 0 }}>
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          scrolling="no"
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: A4_W,
            height: a4H(1),
            border: "none",
            transform: `scale(${THUMB_SCALE})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-100 flex-1">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="font-semibold text-sm text-slate-900">{info.name}</p>
          <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap", CATEGORY_COLORS[info.category])}>
            {info.category}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            info.pages === 1 ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
          )}>
            {info.pages}-page
          </span>
          {info.traits.slice(0, 2).map(t => (
            <span key={t} className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{t}</span>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{info.description}</p>
        {locked && (
          <Link href="/settings/plan" onClick={e => e.stopPropagation()}
            className="mt-2 text-[10px] font-semibold text-brand-600 hover:underline flex items-center gap-1">
            <FiLock className="w-2.5 h-2.5" /> Plus / Pro
          </Link>
        )}
      </div>
    </button>
  );
}

// Large live preview — shown above gallery, updates instantly on template switch
const LARGE_SCALE = 0.48;
const LARGE_H     = a4H(LARGE_SCALE);
const LARGE_W     = a4W(LARGE_SCALE);

export function LargeTemplatePreview({ info, data }: { info: TemplateInfo; data?: PreviewData }) {
  // Large preview uses full data so it looks like a real complete document
  const html = useMemo(
    () => data ? getTemplateHtml(info.key, data) : "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [info.key, data?.name, data?.title]
  );
  const isPersonalised = !!(data?.name);

  return (
    <div className="flex flex-col sm:flex-row gap-5 items-start card border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 shadow-sm">
      {/* Iframe large preview */}
      <div className="shrink-0 mx-auto sm:mx-0 rounded-xl shadow-lg overflow-hidden border border-slate-200"
           style={{ width: LARGE_W, height: LARGE_H, position: "relative" }}>
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          scrolling="no"
          title={`${info.name} preview`}
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: A4_W,
            height: a4H(1),
            border: "none",
            transform: `scale(${LARGE_SCALE})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Info panel */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h3 className="font-bold text-slate-900 text-xl">{info.name}</h3>
          <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full", CATEGORY_COLORS[info.category])}>
            {info.category}
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-brand-600 bg-brand-100 rounded-full px-2 py-0.5">
            <FiCheckCircle className="w-3 h-3" /> Selected
          </span>
          <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full",
            info.pages === 1 ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
          )}>
            {info.pages}-page
          </span>
        </div>
        <p className="text-sm text-slate-600 mb-2 leading-relaxed">{info.description}</p>
        <p className="text-xs text-slate-500 mb-3">
          <span className="font-semibold text-slate-600">Best for:</span> {info.bestFor}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {info.traits.map(t => (
            <span key={t} className="text-xs bg-white border border-slate-200 text-slate-600 rounded-full px-2.5 py-0.5 shadow-sm">{t}</span>
          ))}
        </div>
        {isPersonalised ? (
          <p className="text-xs text-brand-600 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />
            Live preview — showing your CV details
          </p>
        ) : (
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />
            Sample preview — your CV will replace this content
          </p>
        )}
      </div>
    </div>
  );
}

// Responsive A4 thumbnail — content always fills the card width (scale = width/794)
// so width and height stay A4-proportional at ANY container width (no fixed scale
// that breaks when the page width changes). `heightFraction` controls how much of
// the page is shown (1 = full page; <1 crops the bottom).
function IframeThumb({ html, active, heightFraction = 0.82 }: {
  html: string; active: boolean; heightFraction?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.24);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => { const w = el.clientWidth; if (w) setScale(w / A4_W); };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = Math.round(A4_W * A4_RATIO * scale * heightFraction);
  return (
    <div ref={ref} style={{ width: "100%", height: h, overflow: "hidden", position: "relative",
      background: "#fff", border: active ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0", borderRadius: 6 }}>
      <iframe
        srcDoc={html}
        sandbox="allow-same-origin"
        scrolling="no"
        style={{
          position: "absolute", top: 0, left: 0,
          width: A4_W, height: a4H(1), border: "none",
          transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none",
        }}
      />
    </div>
  );
}

// CV Score — 4 template suggestions with large preview + clickable thumbnails
export function TemplateSuggestions({ extractedProfile }: {
  extractedProfile?: import("@/lib/api").ExtractedProfile;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Templates shown in the CV-score gallery are admin-controlled via the
  // "Show in CV Score" flag (falls back to the classic 4 before the store loads).
  const shown = useCvScoreInfos();
  // Total available templates, rounded for marketing copy (e.g. "20+").
  const totalLabel = templateCountLabel(useCvTemplateInfos().length);

  // Build PreviewData directly from structured extracted fields — no demo fallback.
  const hasRealProfile = !!(extractedProfile?.name && extractedProfile.name.trim());

  // Raw mapped profile — curation happens per-template in `allHtmls` below, since
  // a 1-page template must be curated more aggressively than a 2-page one.
  const previewData: PreviewData | null = useMemo(() => {
    if (!hasRealProfile) return null;
    return {
      name:     extractedProfile!.name     || "",
      title:    extractedProfile!.title    || "",
      email:    extractedProfile!.email    || "",
      phone:    extractedProfile!.phone    || "",
      location: extractedProfile!.location || "",
      linkedin: extractedProfile!.linkedin || "",
      summary:  extractedProfile!.summary  || "",
      skills:   extractedProfile!.skills || [],
      experience: (extractedProfile!.experience || []).map(e => ({
        title:   e.role,
        company: e.company,
        date:    e.dates,
        bullets: e.bullets || [],
      })),
      education: (extractedProfile!.education || []).map(e => ({
        degree: e.degree,
        school: e.institution,
        year:   e.dates,
      })),
      extra_sections: extractedProfile!.extra_sections || [],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRealProfile, extractedProfile?.name]);

  const safeIdx = selectedIdx < shown.length ? selectedIdx : 0;
  const selected = shown[safeIdx];

  // Pre-generate ALL template HTMLs when profile loads — instant switching
  const LARGE_SCALE = 0.62;
  const LARGE_W = a4W(LARGE_SCALE);
  const A4_PAGE_PX = Math.round(A4_W * A4_RATIO);   // one A4 page height at 794px width

  // Curate per template — each template's content is trimmed to its own page count
  // so a 1-page template renders as one page and a 2-page template can show more.
  const allHtmls = useMemo(
    () => previewData
      ? Object.fromEntries(shown.map(t => [t.key, getTemplateHtml(t.key, curatePreview(previewData, t.pages))]))
      : {} as Record<string, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewData, shown]
  );

  const largeHtml = allHtmls[selected.key] ?? "";

  // Realistic A4-page-sized preview that SCROLLS to reveal the full resume
  // (competitor-style) — not a long stretched view. The visible frame stays one
  // A4 page tall; the inner scroll area is the full content height so the user
  // scrolls through page 2, 3, etc. We measure body.scrollHeight to set it.
  const [naturalHeights, setNaturalHeights] = useState<Record<string, number>>({});
  const measuredH   = naturalHeights[selected.key];
  const iframeH     = measuredH ?? A4_PAGE_PX * 3;          // render tall until measured
  const scrollAreaH = Math.round((measuredH ?? A4_PAGE_PX) * LARGE_SCALE);  // full content height
  const pagesNeeded = measuredH ? measuredH / A4_PAGE_PX : null;
  const overflowsTemplate = pagesNeeded ? pagesNeeded > selected.pages + 0.08 : false;
  const pagesLabel = pagesNeeded ? (Math.round(pagesNeeded * 10) / 10) : null;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-bold text-slate-900 text-lg">
          {hasRealProfile ? "Your CV in Professional Templates" : "See how your CV could look"}
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          {hasRealProfile
            ? "Your uploaded CV reformatted in different professional styles."
            : `Choose from ${totalLabel} templates. Our AI builder applies your chosen template when tailoring for a job.`}
        </p>
      </div>

      {/* Large preview — only shown when we have a real name from the uploaded CV */}
      <div className="card p-0 overflow-hidden border-slate-200">
        {hasRealProfile ? (
          <>
            <div className="flex justify-center bg-slate-50 py-6 border-b border-slate-100">
              {/* Full-height inline preview — the PAGE scrolls through the whole
                  resume. No inner scroll window, so the wheel is never trapped over
                  the preview (it scrolls the page like everything else). */}
              <div className="rounded-lg shadow-lg overflow-hidden border border-slate-200"
                   style={{ width: LARGE_W, height: scrollAreaH, position: "relative", background: "#fff" }}>
                {/* Scroll area = full scaled content height */}
                <div style={{ width: LARGE_W, height: scrollAreaH, position: "relative" }}>
                  <iframe
                    srcDoc={largeHtml}
                    // allow-scripts enables the in-iframe pagination script (content is
                    // our own, with all CV data HTML-escaped — no untrusted code runs).
                    sandbox="allow-same-origin allow-scripts"
                    scrolling="no"
                    title={`${selected.name} preview`}
                    onLoad={(e) => {
                      const h = e.currentTarget.contentDocument?.body?.scrollHeight;
                      if (h && h > 50) {
                        setNaturalHeights(prev =>
                          prev[selected.key] === h ? prev : { ...prev, [selected.key]: h });
                      }
                    }}
                    style={{
                      position: "absolute", top: 0, left: 0,
                      width: A4_W,
                      height: iframeH,
                      border: "none",
                      transform: `scale(${LARGE_SCALE})`,
                      transformOrigin: "top left",
                      pointerEvents: "none",
                    }}
                  />
                  {/* Page-break guides — content is paginated inside the iframe so
                      sections never straddle these lines; they start cleanly on the next page. */}
                  {pagesNeeded && pagesNeeded > 1 && Array.from({ length: Math.floor(pagesNeeded) }).map((_, i) => (
                    <div key={i} aria-hidden
                      style={{ position: "absolute", left: 0, right: 0,
                        top: Math.round(A4_PAGE_PX * (i + 1) * LARGE_SCALE),
                        borderTop: "1px dashed #cbd5e1" }} />
                  ))}
                </div>
              </div>
            </div>
            {pagesLabel && (
              <div className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[11px] text-slate-400">
                  {overflowsTemplate
                    ? `Scroll to view all ${pagesLabel} pages · best suited to a 2-page template`
                    : "Scroll to view the full resume"}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">{selected.name}</span>
                <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", CATEGORY_COLORS[selected.category])}>
                  {selected.category}
                </span>
                <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                  selected.pages === 1 ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500")}>
                  {selected.pages}-page
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">{selected.bestFor}</p>
            </div>
          </>
        ) : (
          <div className="bg-slate-50 py-8 px-6 text-center border-b border-slate-100">
            <p className="text-sm font-medium text-slate-600">
              Upload your CV for a personalised template preview
            </p>
            <p className="text-xs text-slate-400 mt-1">
              We&apos;ll show how your actual CV looks in each style
            </p>
          </div>
        )}

        {/* Thumbnail selector row */}
        <div className="grid gap-0 divide-x divide-slate-100"
             style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
          {shown.map((info, i) => {
            const thumbHtml = allHtmls[info.key] ?? "";
            const isActive = i === safeIdx;
            return (
              <button
                key={info.key}
                onClick={() => setSelectedIdx(i)}
                className={clsx(
                  "flex flex-col items-center gap-2 p-3 transition text-left",
                  isActive
                    ? "bg-brand-50 border-t-2 border-t-brand-500"
                    : "hover:bg-slate-50 border-t-2 border-t-transparent"
                )}
              >
                <IframeThumb html={thumbHtml} active={isActive} />
                <p className={clsx("text-[10px] font-semibold text-center leading-tight",
                  isActive ? "text-brand-700" : "text-slate-600")}>
                  {info.name}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-2xl px-5 py-4">
        <div>
          <p className="font-semibold text-slate-800 text-sm">Tailor your CV and choose from {totalLabel} professional templates</p>
          <p className="text-xs text-slate-500 mt-0.5">Upload your CV, add a job description, pick a style — done in minutes.</p>
        </div>
        <Link href="/builder/upload" className="btn-primary text-sm px-4 py-2 shrink-0 ml-4 flex items-center gap-1.5">
          Try it free <FiArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
