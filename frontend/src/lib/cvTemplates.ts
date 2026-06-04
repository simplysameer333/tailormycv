/**
 * CV template runtime store + the shared Mustache-style renderer.
 *
 * Templates live in MongoDB as complete, standalone HTML documents using a
 * logic-less placeholder contract (see RENDER CONTEXT below). All real logic
 * (HTML escaping, smart extra-section routing) lives HERE in `renderCtx`, so the
 * stored templates stay pure layout and can be authored/AI-generated/edited from
 * the admin screen with no code change.
 *
 * This module is intentionally a LEAF (only imports from `@/lib/api`) so that
 * `templateHtml.ts` and `components/TemplatePreviews.tsx` can depend on it
 * without an import cycle. `PreviewData` is defined here and re-exported by
 * `TemplatePreviews` for backwards compatibility.
 */
import { fetchCvTemplates } from "@/lib/api";

// ── Preview data (the candidate's structured resume) ───────────────────────────

export interface PreviewData {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  summary: string;
  skills: string[];
  experience: { title: string; company: string; date: string; bullets: string[] }[];
  education: { degree: string; school: string; year: string }[];
  extra_sections?: { title: string; items: string[] }[];
}

// ── Template document (mirrors the `cv_templates` MongoDB collection) ───────────

export type PageCount = 1 | 2;

export interface DocxConfig {
  accent: string;         // hex, no '#'
  header: string;         // centered | banner | serif-centered | left
  font: string;           // Calibri | Times New Roman | Georgia | Courier New
  heading: string;        // rule | colored | left-border | double-rule | gold-rule | circle-marker
  compact: boolean;
  layout: string;         // single | sidebar | two-equal | left-bar
  sidebar_color: string;
  sidebar_ratio: number;
  banner_bg?: string;
}

export interface CvTemplate {
  key: string;
  name: string;
  category: "Classic" | "Modern" | "Creative" | "Executive" | "ATS";
  traits: string[];
  bestFor: string;
  description: string;
  pages: PageCount;
  tier: "free" | "plus";
  accentColor: string;
  html: string;
  docx_config: DocxConfig;
  source: "builtin" | "ai" | "custom";
  is_active: boolean;
  show_in_cv_score: boolean;
  sort_order?: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// MUSTACHE-STYLE RENDERER (logic-less, ~60 lines, no dependency)
//
// Supports:  {{var}} (HTML-escaped)   {{{var}}} / {{&var}} (raw)
//            {{#section}}…{{/section}} (array iteration + truthy/object)
//            {{^section}}…{{/section}} (inverted — falsy/empty)
//            {{.}} (current item, used inside string-array sections)
//            {{! comment }}
// ══════════════════════════════════════════════════════════════════════════════

type Node =
  | string
  | { t: "var"; key: string; raw: boolean }
  | { t: "sec"; key: string; inv: boolean; children: Node[] };

const TAG_RE = /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([#/^&!])?\s*([\w.]*)\s*\}\}/g;

function parse(tpl: string): Node[] {
  const root: Node[] = [];
  const stack: { key: string; inv: boolean; children: Node[] }[] = [];
  const top = () => (stack.length ? stack[stack.length - 1].children : root);
  let last = 0;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(tpl))) {
    if (m.index > last) top().push(tpl.slice(last, m.index));
    last = TAG_RE.lastIndex;
    if (m[1] !== undefined) {
      top().push({ t: "var", key: m[1], raw: true });       // {{{ raw }}}
      continue;
    }
    const sigil = m[2];
    const key = m[3];
    if (sigil === "#" || sigil === "^") {
      const node = { key, inv: sigil === "^", children: [] as Node[] };
      top().push({ t: "sec", ...node });
      stack.push(node);
    } else if (sigil === "/") {
      stack.pop();
    } else if (sigil === "!") {
      /* comment — skip */
    } else if (sigil === "&") {
      top().push({ t: "var", key, raw: true });
    } else {
      top().push({ t: "var", key, raw: false });
    }
  }
  if (last < tpl.length) top().push(tpl.slice(last));
  return root;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lookup(stack: unknown[], key: string): unknown {
  if (key === ".") return stack[stack.length - 1];
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i];
    if (frame && typeof frame === "object" && !Array.isArray(frame) && key in (frame as object)) {
      return (frame as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

function falsy(v: unknown): boolean {
  return v == null || v === false || v === "" || (Array.isArray(v) && v.length === 0);
}

function renderNodes(nodes: Node[], stack: unknown[]): string {
  let out = "";
  for (const n of nodes) {
    if (typeof n === "string") { out += n; continue; }
    if (n.t === "var") {
      const v = lookup(stack, n.key);
      const s = v == null ? "" : String(v);
      out += n.raw ? s : escapeHtml(s);
      continue;
    }
    const v = lookup(stack, n.key);
    if (n.inv) {
      if (falsy(v)) out += renderNodes(n.children, stack);
    } else if (Array.isArray(v)) {
      for (const item of v) out += renderNodes(n.children, [...stack, item]);
    } else if (!falsy(v)) {
      out += renderNodes(n.children, v && typeof v === "object" ? [...stack, v] : stack);
    }
  }
  return out;
}

// Small parse cache — templates are reused across many thumbnails.
const _astCache = new Map<string, Node[]>();

export function render(template: string, ctx: Record<string, unknown>): string {
  let ast = _astCache.get(template);
  if (!ast) { ast = parse(template); _astCache.set(template, ast); }
  return renderNodes(ast, [ctx]);
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER CONTEXT — turns PreviewData into the flat shape templates consume.
// This is the single home of the smart extra-section routing (moved out of
// templateHtml.ts so preview, live render, and copy/download all share it).
// ══════════════════════════════════════════════════════════════════════════════

type Section = { title: string; items: string[] };
const HIGHLIGHT_RE = /accomplish|achievement|highlight|key win|career win/i;
const isCompactSection = (s: Section) =>
  s.items.length <= 8 && s.items.every(i => i.length <= 40);

function splitExtra(d: PreviewData) {
  const extra = (d.extra_sections || []) as Section[];
  return {
    highlights: extra.filter(s => HIGHLIGHT_RE.test(s.title)),
    compact: extra.filter(s => !HIGHLIGHT_RE.test(s.title) && isCompactSection(s)),
    longform: extra.filter(s => !HIGHLIGHT_RE.test(s.title) && !isCompactSection(s)),
  };
}

const contactStr = (d: PreviewData) =>
  [d.email, d.phone, d.location, d.linkedin].filter(Boolean).join("  ·  ");

/** Build the Mustache render context from a candidate's PreviewData. */
export function renderCtx(d: PreviewData, accentColor = ""): Record<string, unknown> {
  const sec = (s: Section) => ({
    title: s.title,
    items: s.items,
    itemsJoined: s.items.join("  ·  "),
  });
  const { highlights, compact, longform } = splitExtra(d);
  return {
    name: d.name,
    title: d.title,
    email: d.email,
    phone: d.phone,
    location: d.location,
    linkedin: d.linkedin,
    contact: contactStr(d),
    summary: d.summary,
    accentColor,
    nameInitial: (d.name || " ").charAt(0),
    skills: d.skills,
    skillsJoined: d.skills.join("  ·  "),
    hasSkills: d.skills.length > 0,
    experience: d.experience.map(e => ({ ...e })),
    hasExperience: d.experience.length > 0,
    education: d.education,
    hasEducation: d.education.length > 0,
    highlights: highlights.map(sec),
    compactSections: compact.map(sec),
    longformSections: longform.map(sec),
    extraSections: (d.extra_sections || []).map(sec),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// RUNTIME STORE — fetched once at startup (mirrors lib/tierConfig.ts).
// ══════════════════════════════════════════════════════════════════════════════

let _store: CvTemplate[] = [];
let _loaded = false;
let _loading: Promise<CvTemplate[]> | null = null;

type Listener = () => void;
const _listeners = new Set<Listener>();

/** Subscribe to store changes (used by React hooks to re-render on load). */
export function subscribeCvTemplates(cb: Listener): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function _notify() {
  _listeners.forEach(l => l());
}

/** Load (or reload) the active CV templates from the API into the module store.
 *  De-duplicates concurrent callers so the gallery + builder share one fetch. */
export async function loadCvTemplates(force = false): Promise<CvTemplate[]> {
  if (_loading && !force) return _loading;
  _loading = (async () => {
    try {
      _store = await fetchCvTemplates();
      _loaded = true;
      _notify();
    } catch {
      /* leave previous store / empty — callers fall back to built-ins */
    } finally {
      _loading = null;
    }
    return _store;
  })();
  return _loading;
}

export function cvTemplatesLoaded(): boolean {
  return _loaded;
}

export function getCvTemplates(): CvTemplate[] {
  return _store;
}

export function getCvTemplate(key: string): CvTemplate | undefined {
  return _store.find(t => t.key === key);
}

/** Templates flagged to appear in the CV-score preview gallery. */
export function getCvScoreTemplates(): CvTemplate[] {
  return _store.filter(t => t.show_in_cv_score);
}
