/**
 * Client-side HTML template generators for CV preview iframes.
 * Each function returns a complete HTML document string for use as iframe srcdoc.
 * Matches the visual designs in backend/services/preview_templates.py.
 */

import type { PreviewData } from "@/components/TemplatePreviews";

const BASE_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 794px; font-size: 12px; line-height: 1.5; color: #111827; background: #fff; }
ul { list-style: none; }
li { padding-left: 14px; margin-top: 3px; position: relative; }
li::before { content: "•"; position: absolute; left: 2px; }
.prose { text-align: justify; hyphens: auto; -webkit-hyphens: auto; }
`;

// Standard paddings used across all templates for consistency
const PAD = "32px 36px";            // body or outer wrapper padding
const PAD_HEADER = "28px 36px 22px"; // coloured header blocks

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function contact(d: PreviewData) {
  return [d.email, d.phone, d.location, d.linkedin].filter(Boolean).map(esc).join("  ·  ");
}
/** Justified prose paragraph — used for summary/profile text in every template. */
function prose(text: string, extra = "") {
  return `<div class="prose" style="font-size:12px;line-height:1.6;${extra}">${esc(text)}</div>`;
}
function expRows(d: PreviewData, titleColor = "#111827", coColor = "#2563eb") {
  return d.experience.map(e => `
    <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
      <span style="font-weight:600;color:${titleColor};font-size:13px;">${esc(e.title)} — ${esc(e.company)}</span>
      <span style="font-size:11px;color:#6b7280;">${esc(e.date)}</span>
    </div>
    <ul style="margin-bottom:10px;">${e.bullets.map(b => `<li style="font-size:11px;color:#4b5563;">${esc(b)}</li>`).join("")}</ul>
  `).join("");
}
function wrap(css: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;
}

// ── 1. Cambridge ──────────────────────────────────────────────────────────────
export function Cambridge(d: PreviewData) {
  const h2 = `font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#1f2937;margin:18px 0 4px;`;
  const rule = `<div style="border-top:2px solid #374151;margin-bottom:8px;"></div>`;
  return wrap(`body{padding:${PAD};font-family:Calibri,Arial,sans-serif;}`, `
    <div style="font-size:32px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">${esc(d.name)}</div>
    <div style="font-size:14px;color:#374151;margin-top:5px;font-weight:500;">${esc(d.title)}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:5px;">${contact(d)}</div>
    <div style="border-top:2px solid #0f172a;margin:12px 0 4px;"></div>
    <div style="${h2}">Professional Summary</div>${rule}
    ${prose(d.summary, "color:#374151;")}
    <div style="${h2}">Work Experience</div>${rule}
    ${expRows(d)}
    <div style="${h2}">Skills</div>${rule}
    <div style="font-size:12px;color:#374151;">${d.skills.map(esc).join("  ·  ")}</div>
    <div style="${h2}">Education</div>${rule}
    ${d.education.map(e => `<div style="font-size:12px;">${esc(e.degree)}  ·  ${esc(e.school)}  ·  ${esc(e.year)}</div>`).join("")}
  `);
}

// ── 2. Horizon ────────────────────────────────────────────────────────────────
export function Horizon(d: PreviewData) {
  const blue = "#1d4ed8";
  const h2 = `font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:${blue};margin:18px 0 4px;`;
  const rule = `<div style="border-top:2.5px solid ${blue};margin-bottom:8px;"></div>`;
  const chip = (s: string) => `<span style="background:#eff6ff;color:${blue};border-radius:4px;padding:2px 8px;font-size:11px;font-weight:500;margin:2px;display:inline-block;">${esc(s)}</span>`;
  return wrap(`body{font-family:Arial,sans-serif;}`, `
    <div style="background:${blue};padding:${PAD_HEADER};">
      <div style="font-size:34px;font-weight:900;color:#fff;letter-spacing:-0.5px;">${esc(d.name)}</div>
      <div style="font-size:15px;color:#bfdbfe;margin-top:5px;font-weight:500;">${esc(d.title)}</div>
      <div style="font-size:11px;color:#93c5fd;margin-top:7px;">${contact(d)}</div>
    </div>
    <div style="padding:20px 36px;">
      <div style="${h2}">Profile</div>${rule}
      ${prose(d.summary, "margin-bottom:18px;")}
      <div style="${h2}">Experience</div>${rule}
      ${expRows(d, "#1e293b", blue)}
      <div style="${h2}">Skills</div>${rule}
      <div>${d.skills.map(chip).join("")}</div>
    </div>
  `);
}

// ── 3. Prestige ────────────────────────────────────────────────────────────────
export function Prestige(d: PreviewData) {
  const sec = (title: string, content: string) => `
    <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:14px 0 3px;">${title}</div>
    <div style="border-top:1px solid #bbb;border-bottom:1px solid #bbb;padding:6px 0;margin-bottom:12px;">${content}</div>`;
  return wrap(`body{padding:${PAD};font-family:Georgia,serif;}`, `
    <div style="border-top:2.5px solid #111827;margin-bottom:10px;"></div>
    <div style="text-align:center;">
      <div style="font-size:28px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#0f172a;">${esc(d.name)}</div>
      <div style="font-size:13px;color:#555;margin-top:5px;">${esc(d.title)}</div>
      <div style="font-size:11px;color:#777;margin-top:4px;">${contact(d)}</div>
    </div>
    <div style="border-top:2.5px solid #111827;border-bottom:1px solid #111827;margin:10px 0 16px;height:6px;"></div>
    ${sec("Professional Summary", prose(d.summary, "font-style:italic;"))}
    ${sec("Professional Experience", d.experience.map(e => `
      <div style="display:flex;justify-content:space-between;"><span style="font-weight:700;font-size:12px;">${esc(e.title)}</span><span style="font-style:italic;color:#555;font-size:11px;">${esc(e.date)}</span></div>
      <div style="font-style:italic;color:#555;font-size:11px;margin-bottom:4px;">${esc(e.company)}</div>
      <ul>${e.bullets.map(b => `<li style="font-size:11px;">${esc(b)}</li>`).join("")}</ul>
    `).join("<div style='margin-bottom:8px;'></div>"))}
    ${sec("Core Competencies", `<div style="font-size:12px;line-height:2;">${d.skills.map(esc).join("   ·   ")}</div>`)}
  `);
}

// ── 4. Catalyst ────────────────────────────────────────────────────────────────
export function Catalyst(d: PreviewData) {
  const orange = "#ea580c";
  const sec = (title: string, content: string) => `
    <div style="font-size:11px;font-weight:900;color:${orange};text-transform:uppercase;letter-spacing:2px;margin:18px 0 3px;">${title}</div>
    <div style="border-top:2px solid #fed7aa;margin-bottom:8px;"></div>${content}`;
  const chip = (s: string) => `<span style="background:#fff7ed;border:1px solid #fed7aa;color:${orange};border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin:2px;display:inline-block;">${esc(s)}</span>`;
  return wrap(`body{padding:${PAD};font-family:Arial,sans-serif;}`, `
    <div style="font-size:34px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:-0.5px;">${esc(d.name)}</div>
    <div style="height:5px;width:60px;background:${orange};margin:10px 0;"></div>
    <div style="font-size:13px;color:#475569;">${esc(d.title)}  ·  ${esc(d.location)}</div>
    <div style="font-size:11px;color:#64748b;margin-top:3px;">${esc(d.email)}  ·  ${esc(d.phone)}</div>
    ${sec("About", prose(d.summary))}
    ${sec("Experience", d.experience.map(e => `
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
        <span style="font-weight:700;font-size:13px;">${esc(e.title)}</span>
        <span style="font-size:11px;color:#94a3b8;font-weight:600;">${esc(e.company)}  ·  ${esc(e.date)}</span>
      </div>
      <ul style="margin-bottom:10px;">${e.bullets.map(b => `<li style="font-size:11px;color:#334155;padding-left:14px;" data-arrow>→ ${esc(b)}</li>`).join("")}</ul>
    `).join(""))}
    ${sec("Skills", `<div>${d.skills.map(chip).join("")}</div>`)}
  `);
}

// ── 5. Admiral ────────────────────────────────────────────────────────────────
export function Admiral(d: PreviewData) {
  const navy = "#1e3a5f";
  const h2 = `font-size:11px;font-weight:800;color:${navy};text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 4px;`;
  const rule = `<div style="border-top:2px solid ${navy};margin-bottom:8px;"></div>`;
  return wrap(`body{padding:${PAD};font-family:Arial,sans-serif;}`, `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:30px;font-weight:800;color:${navy};letter-spacing:-0.5px;">${esc(d.name)}</div>
        <div style="font-size:13px;color:#3b5998;margin-top:3px;">${esc(d.title)}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#6b7280;line-height:1.8;">${esc(d.email)}<br>${esc(d.phone)}<br>${esc(d.location)}</div>
    </div>
    <div style="border-top:2px solid ${navy};margin:12px 0 8px;"></div>
    <div style="${h2}">Career Profile</div>${rule}
    ${prose(d.summary, "margin-bottom:16px;")}
    <div style="${h2}">Career History</div>${rule}
    ${d.experience.map(e => `
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:13px;font-weight:600;">${esc(e.title)}</span>
        <span style="font-size:11px;color:#6b7280;">${esc(e.date)}</span>
      </div>
      <div style="font-size:11px;color:${navy};font-weight:600;margin-bottom:4px;">${esc(e.company)}</div>
      <ul style="margin-bottom:10px;">${e.bullets.map(b => `<li style="font-size:11px;color:#4b5563;">${esc(b)}</li>`).join("")}</ul>
    `).join("")}
    <div style="${h2}">Core Skills</div>${rule}
    <div style="font-size:12px;line-height:1.9;">${d.skills.map(esc).join("  ·  ")}</div>
  `);
}

// ── 6. Canvas ─────────────────────────────────────────────────────────────────
export function Canvas(d: PreviewData) {
  const sec = (label: string, content: string) => `
    <div style="margin-top:24px;">
      <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:8px;">${label}</div>
      ${content}
    </div>`;
  return wrap(`body{padding:${PAD};font-family:'Helvetica Neue',Arial,sans-serif;}`, `
    <div style="font-size:22px;font-weight:300;color:#111827;">${esc(d.name)}</div>
    <div style="font-size:13px;color:#6b7280;margin-top:4px;font-style:italic;">${esc(d.title)}</div>
    <div style="font-size:10px;color:#9ca3af;margin-top:6px;">${contact(d)}</div>
    ${sec("About", prose(d.summary, "line-height:1.8;color:#4b5563;"))}
    ${sec("Work", d.experience.map(e => `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span style="font-size:13px;font-weight:500;color:#111827;">${esc(e.title)}</span>
        <span style="font-size:10px;color:#9ca3af;">${esc(e.date)}</span>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${esc(e.company)}</div>
      <ul style="margin-bottom:12px;">${e.bullets.map(b => `<li style="font-size:11px;color:#6b7280;">— ${esc(b)}</li>`).join("")}</ul>
    `).join(""))}
    ${sec("Skills", `<div style="font-size:12px;color:#4b5563;line-height:2;">${d.skills.map(esc).join("   ·   ")}</div>`)}
  `);
}

// ── 7. Swift ──────────────────────────────────────────────────────────────────
export function Swift(d: PreviewData) {
  const h2 = `font-size:10px;font-weight:800;color:#1e293b;text-transform:uppercase;letter-spacing:1.5px;margin:12px 0 4px;`;
  return wrap(`body{padding:24px 32px;font-family:Arial,sans-serif;font-size:11px;}`, `
    <div style="background:#1e293b;margin:-24px -32px 16px;padding:22px 32px 18px;">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;">${esc(d.name)}</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:4px;">${esc(d.title)}</div>
    </div>
    <div style="font-size:10px;color:#64748b;border-bottom:1px solid #334155;padding-bottom:8px;margin-bottom:8px;">${esc(d.email)}  ·  ${esc(d.phone)}  ·  ${esc(d.location)}</div>
    <div style="${h2}">Summary</div>
    ${prose(d.summary, "color:#4b5563;margin-bottom:8px;")}
    <div style="${h2}">Experience</div>
    ${d.experience.map(e => `
      <div style="display:flex;justify-content:space-between;">
        <span style="font-weight:600;color:#1e293b;">${esc(e.title)}  —  ${esc(e.company)}</span>
        <span style="color:#94a3b8;font-size:10px;">${esc(e.date)}</span>
      </div>
      <ul style="margin-bottom:7px;">${e.bullets.map(b => `<li style="color:#475569;">${esc(b)}</li>`).join("")}</ul>
    `).join("")}
    <div style="${h2}">Skills</div>
    <div style="color:#4b5563;line-height:1.8;">${d.skills.map(esc).join("  ·  ")}</div>
  `);
}

// ── 8. Jade ───────────────────────────────────────────────────────────────────
export function Jade(d: PreviewData) {
  const teal = "#0d9488";
  const h2 = `font-size:10px;font-weight:700;color:${teal};text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 4px;`;
  const chip = (s: string) => `<span style="background:#f0fdfa;border:1px solid ${teal};color:${teal};border-radius:4px;padding:2px 8px;font-size:11px;margin:2px;display:inline-block;">${esc(s)}</span>`;
  return wrap(`body{font-family:Arial,sans-serif;display:flex;}`, `
    <div style="width:6px;background:${teal};flex-shrink:0;min-height:100vh;"></div>
    <div style="padding:${PAD};flex:1;">
      <div style="font-size:26px;font-weight:700;color:#0f172a;">${esc(d.name)}</div>
      <div style="font-size:13px;color:${teal};margin-top:3px;">${esc(d.title)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px;">${contact(d)}</div>
      <div style="border-top:1px solid #ccfbf1;margin:14px 0;"></div>
      <div style="${h2}">Summary</div>
      ${prose(d.summary, "margin-bottom:16px;")}
      <div style="${h2}">Experience</div>
      ${expRows(d, "#0f172a", teal)}
      <div style="${h2}">Skills</div>
      <div>${d.skills.map(chip).join("")}</div>
    </div>
  `);
}

// ── 9. Prism (sidebar) ────────────────────────────────────────────────────────
export function Prism(d: PreviewData) {
  const sidebar = `
    <div style="width:200px;background:#e8f0fe;padding:32px 18px;flex-shrink:0;min-height:100vh;border-right:3px solid #2563eb;">
      <div style="font-size:18px;font-weight:800;color:#1e293b;line-height:1.2;">${esc(d.name)}</div>
      <div style="font-size:12px;color:#2563eb;margin-top:5px;font-weight:600;">${esc(d.title)}</div>
      <div style="height:2px;width:32px;background:#2563eb;margin:10px 0;"></div>
      <div style="font-size:10px;color:#475569;line-height:1.9;">${esc(d.email)}<br>${esc(d.phone)}<br>${esc(d.location)}</div>
      <div style="font-size:9px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:1.5px;margin:18px 0 6px;">Skills</div>
      <div style="border-top:1px solid #cbd5e1;margin-bottom:6px;"></div>
      ${d.skills.map(s => `<div style="font-size:11px;color:#334155;margin-bottom:3px;"><span style="color:#2563eb;">▸ </span>${esc(s)}</div>`).join("")}
      <div style="font-size:9px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 6px;">Education</div>
      <div style="border-top:1px solid #cbd5e1;margin-bottom:6px;"></div>
      ${d.education.map(e => `<div style="font-size:10px;color:#334155;line-height:1.6;"><strong>${esc(e.degree)}</strong><br><span style="color:#64748b;">${esc(e.school)}</span><br><span style="color:#94a3b8;">${esc(e.year)}</span></div>`).join("")}
    </div>`;
  const main = `
    <div style="flex:1;padding:32px 26px;">
      <div style="font-size:10px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Profile</div>
      <div style="border-top:1px solid #e2e8f0;margin-bottom:10px;"></div>
      ${prose(d.summary, "margin-bottom:18px;")}
      <div style="font-size:10px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Experience</div>
      <div style="border-top:1px solid #e2e8f0;margin-bottom:10px;"></div>
      ${d.experience.map(e => `
        <div style="font-size:13px;font-weight:600;color:#1e293b;">${esc(e.title)}</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:11px;color:#2563eb;">${esc(e.company)}</span>
          <span style="font-size:10px;color:#94a3b8;">${esc(e.date)}</span>
        </div>
        <ul style="margin-bottom:12px;">${e.bullets.map(b => `<li style="font-size:11px;color:#475569;">${esc(b)}</li>`).join("")}</ul>
      `).join("")}
    </div>`;
  return wrap(`body{font-family:Arial,sans-serif;display:flex;min-height:100vh;}`, sidebar + main);
}

// ── 10. Vivid (purple sidebar) ────────────────────────────────────────────────
export function Vivid(d: PreviewData) {
  const purple = "#7c3aed";
  const sidebar = `
    <div style="width:190px;background:${purple};padding:28px 16px;flex-shrink:0;min-height:100vh;">
      <div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;margin-bottom:14px;font-size:24px;font-weight:900;color:#fff;">${esc(d.name.charAt(0))}</div>
      <div style="font-size:17px;font-weight:800;color:#fff;line-height:1.2;">${esc(d.name)}</div>
      <div style="font-size:11px;color:#c4b5fd;margin-top:3px;">${esc(d.title)}</div>
      <div style="border-top:1px solid rgba(255,255,255,0.2);margin:12px 0;"></div>
      <div style="font-size:10px;color:#ddd6fe;line-height:1.9;">${esc(d.email)}<br>${esc(d.phone)}<br>${esc(d.location)}</div>
      <div style="font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 6px;">Skills</div>
      ${d.skills.map(s => `<div style="font-size:11px;color:#ede9fe;margin-bottom:3px;">▸ ${esc(s)}</div>`).join("")}
    </div>`;
  const main = `
    <div style="flex:1;padding:32px 26px;">
      <div style="font-size:10px;font-weight:700;color:${purple};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Profile</div>
      <div style="border-top:1.5px solid #ede9fe;margin-bottom:10px;"></div>
      ${prose(d.summary, "margin-bottom:18px;")}
      <div style="font-size:10px;font-weight:700;color:${purple};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Experience</div>
      <div style="border-top:1.5px solid #ede9fe;margin-bottom:10px;"></div>
      ${d.experience.map(e => `
        <div style="font-size:13px;font-weight:600;">${esc(e.title)}</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:11px;color:${purple};">${esc(e.company)}</span>
          <span style="font-size:10px;color:#94a3b8;">${esc(e.date)}</span>
        </div>
        <ul style="margin-bottom:12px;">${e.bullets.map(b => `<li style="font-size:11px;color:#475569;">${esc(b)}</li>`).join("")}</ul>
      `).join("")}
    </div>`;
  return wrap(`body{font-family:Arial,sans-serif;display:flex;min-height:100vh;}`, sidebar + main);
}

// ── 11–15: Remaining templates ────────────────────────────────────────────────
export function Chronicle(d: PreviewData) { return Horizon({ ...d }); }  // blue variant
export function Summit(d: PreviewData)    { return Cambridge(d); }         // clean variant
export function Symmetry(d: PreviewData)  { return Admiral(d); }           // formal variant
export function Scholar(d: PreviewData)   { return Prestige(d); }          // serif formal
export function Luxe(d: PreviewData) {
  const gold = "#b45309";
  const sec = (label: string, content: string) => `
    <div style="font-size:9px;font-weight:700;color:${gold};text-transform:uppercase;letter-spacing:2.5px;margin:14px 0 4px;">${label}</div>
    <div style="border-top:1px solid ${gold};opacity:0.4;margin-bottom:8px;"></div>${content}`;
  return wrap(`body{padding:${PAD};font-family:Georgia,serif;background:#fffdf5;}`, `
    <div style="text-align:center;">
      <div style="font-size:28px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#1c1917;">${esc(d.name)}</div>
      <div style="font-size:12px;color:${gold};letter-spacing:1.5px;margin-top:4px;">${esc(d.title)}</div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin:14px 0;">
      <div style="flex:1;height:1px;background:${gold};opacity:0.4;"></div>
      <div style="width:6px;height:6px;border-radius:50%;background:${gold};"></div>
      <div style="flex:1;height:1px;background:${gold};opacity:0.4;"></div>
    </div>
    <div style="text-align:center;font-size:10px;color:#78716c;margin-bottom:20px;">${contact(d)}</div>
    ${sec("Professional Profile", prose(d.summary, "line-height:1.8;font-style:italic;color:#44403c;"))}
    ${sec("Career History", d.experience.map(e => `
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:12px;font-weight:700;">${esc(e.title)}  ·  ${esc(e.company)}</span>
        <span style="font-size:11px;font-style:italic;color:#78716c;">${esc(e.date)}</span>
      </div>
      <ul style="margin-bottom:10px;">${e.bullets.map(b => `<li style="font-size:11px;color:#57534e;">${esc(b)}</li>`).join("")}</ul>
    `).join(""))}
    ${sec("Core Expertise", `<div style="font-size:12px;line-height:2;color:#44403c;">${d.skills.map(esc).join("   ·   ")}</div>`)}
  `);
}

// ── Registry ──────────────────────────────────────────────────────────────────
export const TEMPLATE_HTML_FNS: Record<string, (d: PreviewData) => string> = {
  Cambridge, Horizon, Prestige, Catalyst, Admiral,
  Canvas, Swift, Jade, Prism, Vivid,
  Chronicle, Summit, Symmetry, Scholar, Luxe,
};

export function getTemplateHtml(key: string, data: PreviewData): string {
  const fn = TEMPLATE_HTML_FNS[key] ?? TEMPLATE_HTML_FNS["Cambridge"];
  return fn(data);
}
