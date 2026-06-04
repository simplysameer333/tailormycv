"""Seed data for the `cv_templates` MongoDB collection — all 20 built-in
templates as complete, standalone HTML documents using the Mustache placeholder
contract (see frontend `lib/cvTemplates.ts` → renderCtx).

Each template is a full `<html>` document an admin can copy into a .html file and
open in a browser. Placeholders (logic-less):

  {{name}} {{title}} {{contact}} {{summary}} {{skillsJoined}} {{nameInitial}}
  {{#experience}} {{title}} {{company}} {{date}} {{#bullets}}{{.}}{{/bullets}} {{/experience}}
  {{#skills}}{{.}}{{/skills}}
  {{#hasEducation}}{{#education}} {{degree}} {{school}} {{year}} {{/education}}{{/hasEducation}}
  {{#highlights}} / {{#compactSections}} / {{#longformSections}} / {{#extraSections}}
      each: {{title}} {{#items}}{{.}}{{/items}} {{itemsJoined}}

The bodies below mirror the original `templateHtml.ts` generators 1:1 so the
migrated render is visually identical to the pre-migration built-ins.
"""
from __future__ import annotations

# ── Shared head / tail (every template is a standalone document) ───────────────

_BASE_CSS = """
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 794px; font-size: 12px; line-height: 1.5; color: #111827; background: #fff; }
ul { list-style: none; }
li { padding-left: 14px; margin-top: 3px; position: relative; }
li::before { content: "•"; position: absolute; left: 2px; }
.prose { text-align: justify; hyphens: auto; -webkit-hyphens: auto; }
"""

# Paginates content onto A4 pages so no block straddles a page boundary.
_PAGINATE = """<script>
(function(){
  var PAGE = 1123; var TOP = 30;
  function topOf(el){ var t=0,e=el; while(e){ t+=e.offsetTop; e=e.offsetParent; } return t; }
  var nodes = document.querySelectorAll('li, .prose');
  for (var i=0;i<nodes.length;i++){
    var el = nodes[i]; var h = el.offsetHeight;
    if (h >= PAGE - TOP) continue;
    var top = topOf(el);
    var startPage = Math.floor(top / PAGE);
    var endPage = Math.floor((top + h - 1) / PAGE);
    if (endPage > startPage){
      var push = (startPage + 1) * PAGE - top + TOP;
      var cur = parseFloat(getComputedStyle(el).marginTop) || 0;
      el.style.marginTop = (cur + push) + 'px';
    }
  }
})();
</script>"""

_PAD = "32px 36px"
_PAD_HEADER = "28px 36px 22px"


def _doc(css: str, body: str) -> str:
    return (
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
        + _BASE_CSS + css +
        "</style></head><body>" + body + _PAGINATE + "</body></html>"
    )


def _heading(style: str, label: str) -> str:
    return f'<div style="{style}">{label}</div>'


def _rule(css: str) -> str:
    return f'<div style="{css}"></div>'


# Reusable Mustache fragments parameterised by style strings.
def _exp_rows(title_color: str = "#111827") -> str:
    return (
        "{{#experience}}"
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">'
        f'<span style="font-weight:600;color:{title_color};font-size:13px;">{{{{title}}}} — {{{{company}}}}</span>'
        '<span style="font-size:11px;color:#6b7280;">{{date}}</span></div>'
        '<ul style="margin-bottom:10px;">{{#bullets}}<li style="font-size:11px;color:#4b5563;">{{.}}</li>{{/bullets}}</ul>'
        "{{/experience}}"
    )


def _sections_bullets(section: str, heading_style: str, rule_html: str,
                      item_style: str = "font-size:11px;color:#475569;margin-bottom:3px;line-height:1.5;") -> str:
    return (
        "{{#" + section + "}}"
        + f'<div style="{heading_style}">{{{{title}}}}</div>' + rule_html
        + "{{#items}}" + f'<div style="{item_style}">▸ {{{{.}}}}</div>' + "{{/items}}"
        + "{{/" + section + "}}"
    )


def _sections_inline(section: str, heading_style: str, rule_html: str,
                     item_style: str = "font-size:12px;color:#374151;line-height:1.8;") -> str:
    return (
        "{{#" + section + "}}"
        + f'<div style="{heading_style}">{{{{title}}}}</div>' + rule_html
        + f'<div style="{item_style}">{{{{itemsJoined}}}}</div>'
        + "{{/" + section + "}}"
    )


# ══════════════════════════════════════════════════════════════════════════════
# 1. CAMBRIDGE
# ══════════════════════════════════════════════════════════════════════════════
_C_H2 = "font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#1f2937;margin:18px 0 4px;"
_C_RULE = _rule("border-top:2px solid #374151;margin-bottom:8px;")
_CAMBRIDGE = _doc(
    f"body{{padding:{_PAD};font-family:Calibri,Arial,sans-serif;}}",
    f'<div style="font-size:32px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">{{{{name}}}}</div>'
    f'<div style="font-size:14px;color:#374151;margin-top:5px;font-weight:500;">{{{{title}}}}</div>'
    f'<div style="font-size:11px;color:#6b7280;margin-top:5px;">{{{{contact}}}}</div>'
    '<div style="border-top:2px solid #0f172a;margin:12px 0 4px;"></div>'
    + _heading(_C_H2, "Professional Summary") + _C_RULE
    + '<div class="prose" style="font-size:12px;line-height:1.6;color:#374151;">{{summary}}</div>'
    + _heading(_C_H2, "Work Experience") + _C_RULE + _exp_rows()
    + _heading(_C_H2, "Skills") + _C_RULE
    + '<div style="font-size:12px;color:#374151;">{{skillsJoined}}</div>'
    + _heading(_C_H2, "Education") + _C_RULE
    + "{{#education}}" + '<div style="font-size:12px;">{{degree}}  ·  {{school}}  ·  {{year}}</div>' + "{{/education}}"
    + _sections_inline("extraSections", _C_H2, _C_RULE),
)

# ══════════════════════════════════════════════════════════════════════════════
# 2. HORIZON  (also used by Chronicle)
# ══════════════════════════════════════════════════════════════════════════════
_H_H2 = "font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#1d4ed8;margin:18px 0 4px;"
_H_RULE = _rule("border-top:2.5px solid #1d4ed8;margin-bottom:8px;")
_H_CHIP = '{{#skills}}<span style="background:#eff6ff;color:#1d4ed8;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:500;margin:2px;display:inline-block;">{{.}}</span>{{/skills}}'
_HORIZON = _doc(
    "body{font-family:Arial,sans-serif;}",
    f'<div style="background:#1d4ed8;padding:{_PAD_HEADER};">'
    '<div style="font-size:34px;font-weight:900;color:#fff;letter-spacing:-0.5px;">{{name}}</div>'
    '<div style="font-size:15px;color:#bfdbfe;margin-top:5px;font-weight:500;">{{title}}</div>'
    '<div style="font-size:11px;color:#93c5fd;margin-top:7px;">{{contact}}</div></div>'
    '<div style="padding:20px 36px;">'
    + _heading(_H_H2, "Profile") + _H_RULE
    + '<div class="prose" style="font-size:12px;line-height:1.6;margin-bottom:18px;">{{summary}}</div>'
    + _sections_bullets("highlights", _H_H2, _H_RULE)
    + _heading(_H_H2, "Experience") + _H_RULE + _exp_rows("#1e293b")
    + _heading(_H_H2, "Skills") + _H_RULE
    + f'<div style="margin-bottom:18px;">{_H_CHIP}</div>'
    + "{{#hasEducation}}" + _heading(_H_H2, "Education") + _H_RULE
    + "{{#education}}"
    + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">'
    + '<div><span style="font-size:12px;font-weight:700;color:#1e293b;">{{degree}}</span>  ·  '
    + '<span style="font-size:11px;color:#475569;">{{school}}</span></div>'
    + '<span style="font-size:11px;color:#64748b;">{{year}}</span></div>'
    + "{{/education}}{{/hasEducation}}"
    + _sections_inline("compactSections", _H_H2, _H_RULE)
    + _sections_bullets("longformSections", _H_H2, _H_RULE)
    + "</div>",
)

# ══════════════════════════════════════════════════════════════════════════════
# 3. PRESTIGE  (also used by Scholar)
# ══════════════════════════════════════════════════════════════════════════════
def _prestige_sec(title: str, content: str) -> str:
    return (
        f'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:14px 0 3px;">{title}</div>'
        '<div style="border-top:1px solid #bbb;border-bottom:1px solid #bbb;padding:6px 0;margin-bottom:12px;">'
        + content + "</div>"
    )

_PRESTIGE = _doc(
    f"body{{padding:{_PAD};font-family:Georgia,serif;}}",
    '<div style="border-top:2.5px solid #111827;margin-bottom:10px;"></div>'
    '<div style="text-align:center;">'
    '<div style="font-size:28px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#0f172a;">{{name}}</div>'
    '<div style="font-size:13px;color:#555;margin-top:5px;">{{title}}</div>'
    '<div style="font-size:11px;color:#777;margin-top:4px;">{{contact}}</div></div>'
    '<div style="border-top:2.5px solid #111827;border-bottom:1px solid #111827;margin:10px 0 16px;height:6px;"></div>'
    + _prestige_sec("Professional Summary", '<div class="prose" style="font-size:12px;line-height:1.6;font-style:italic;">{{summary}}</div>')
    + _prestige_sec("Professional Experience",
        "{{#experience}}"
        '<div style="display:flex;justify-content:space-between;"><span style="font-weight:700;font-size:12px;">{{title}}</span>'
        '<span style="font-style:italic;color:#555;font-size:11px;">{{date}}</span></div>'
        '<div style="font-style:italic;color:#555;font-size:11px;margin-bottom:4px;">{{company}}</div>'
        '<ul>{{#bullets}}<li style="font-size:11px;">{{.}}</li>{{/bullets}}</ul>'
        '<div style="margin-bottom:8px;"></div>'
        "{{/experience}}")
    + _prestige_sec("Core Competencies", '<div style="font-size:12px;line-height:2;">{{skillsJoined}}</div>'),
)

# ══════════════════════════════════════════════════════════════════════════════
# 4. CATALYST
# ══════════════════════════════════════════════════════════════════════════════
def _catalyst_sec(title: str, content: str) -> str:
    return (
        f'<div style="font-size:11px;font-weight:900;color:#ea580c;text-transform:uppercase;letter-spacing:2px;margin:18px 0 3px;">{title}</div>'
        '<div style="border-top:2px solid #fed7aa;margin-bottom:8px;"></div>' + content
    )

_CAT_CHIP = '{{#skills}}<span style="background:#fff7ed;border:1px solid #fed7aa;color:#ea580c;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin:2px;display:inline-block;">{{.}}</span>{{/skills}}'
_CATALYST = _doc(
    f"body{{padding:{_PAD};font-family:Arial,sans-serif;}}",
    '<div style="font-size:34px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:-0.5px;">{{name}}</div>'
    '<div style="height:5px;width:60px;background:#ea580c;margin:10px 0;"></div>'
    '<div style="font-size:13px;color:#475569;">{{title}}  ·  {{location}}</div>'
    '<div style="font-size:11px;color:#64748b;margin-top:3px;">{{email}}  ·  {{phone}}</div>'
    + _catalyst_sec("About", '<div class="prose" style="font-size:12px;line-height:1.6;">{{summary}}</div>')
    + "{{#highlights}}" + _catalyst_sec("{{title}}", '<ul style="margin-bottom:6px;">{{#items}}<li style="font-size:11px;color:#334155;">{{.}}</li>{{/items}}</ul>') + "{{/highlights}}"
    + _catalyst_sec("Experience",
        "{{#experience}}"
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">'
        '<span style="font-weight:700;font-size:13px;">{{title}}</span>'
        '<span style="font-size:11px;color:#94a3b8;font-weight:600;">{{company}}  ·  {{date}}</span></div>'
        '<ul style="margin-bottom:10px;">{{#bullets}}<li style="font-size:11px;color:#334155;padding-left:14px;" data-arrow>→ {{.}}</li>{{/bullets}}</ul>'
        "{{/experience}}")
    + _catalyst_sec("Skills", f"<div>{_CAT_CHIP}</div>")
    + "{{#hasEducation}}" + _catalyst_sec("Education",
        "{{#education}}"
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">'
        '<div><span style="font-size:12px;font-weight:700;">{{degree}}</span>  ·  '
        '<span style="font-size:11px;color:#64748b;">{{school}}</span></div>'
        '<span style="font-size:11px;color:#94a3b8;">{{year}}</span></div>'
        "{{/education}}") + "{{/hasEducation}}"
    + "{{#compactSections}}" + _catalyst_sec("{{title}}", '<div style="font-size:11px;color:#334155;line-height:1.8;">{{itemsJoined}}</div>') + "{{/compactSections}}"
    + "{{#longformSections}}" + _catalyst_sec("{{title}}", '<div style="font-size:11px;color:#334155;line-height:1.8;">{{itemsJoined}}</div>') + "{{/longformSections}}",
)

# ══════════════════════════════════════════════════════════════════════════════
# 5. ADMIRAL  (also used by Symmetry)
# ══════════════════════════════════════════════════════════════════════════════
_A_H2 = "font-size:11px;font-weight:800;color:#1e3a5f;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 4px;"
_A_RULE = _rule("border-top:2px solid #1e3a5f;margin-bottom:8px;")
_ADMIRAL = _doc(
    f"body{{padding:{_PAD};font-family:Arial,sans-serif;}}",
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
    '<div><div style="font-size:30px;font-weight:800;color:#1e3a5f;letter-spacing:-0.5px;">{{name}}</div>'
    '<div style="font-size:13px;color:#3b5998;margin-top:3px;">{{title}}</div></div>'
    '<div style="text-align:right;font-size:11px;color:#6b7280;line-height:1.8;">{{email}}<br>{{phone}}<br>{{location}}</div></div>'
    '<div style="border-top:2px solid #1e3a5f;margin:12px 0 8px;"></div>'
    + _heading(_A_H2, "Career Profile") + _A_RULE
    + '<div class="prose" style="font-size:12px;line-height:1.6;margin-bottom:16px;">{{summary}}</div>'
    + _heading(_A_H2, "Career History") + _A_RULE
    + "{{#experience}}"
    + '<div style="display:flex;justify-content:space-between;"><span style="font-size:13px;font-weight:600;">{{title}}</span>'
    + '<span style="font-size:11px;color:#6b7280;">{{date}}</span></div>'
    + '<div style="font-size:11px;color:#1e3a5f;font-weight:600;margin-bottom:4px;">{{company}}</div>'
    + '<ul style="margin-bottom:10px;">{{#bullets}}<li style="font-size:11px;color:#4b5563;">{{.}}</li>{{/bullets}}</ul>'
    + "{{/experience}}"
    + _heading(_A_H2, "Core Skills") + _A_RULE
    + '<div style="font-size:12px;line-height:1.9;margin-bottom:14px;">{{skillsJoined}}</div>'
    + "{{#hasEducation}}" + _heading(_A_H2, "Education") + _A_RULE
    + "{{#education}}"
    + '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">'
    + '<div><span style="font-size:12px;font-weight:600;">{{degree}}</span>  ·  '
    + '<span style="font-size:11px;color:#6b7280;">{{school}}</span></div>'
    + '<span style="font-size:11px;color:#6b7280;">{{year}}</span></div>'
    + "{{/education}}{{/hasEducation}}"
    + _sections_inline("extraSections", _A_H2, _A_RULE),
)

# ══════════════════════════════════════════════════════════════════════════════
# 6. CANVAS
# ══════════════════════════════════════════════════════════════════════════════
def _canvas_sec(label: str, content: str) -> str:
    return (
        '<div style="margin-top:24px;">'
        f'<div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:8px;">{label}</div>'
        + content + "</div>"
    )

_CANVAS = _doc(
    f"body{{padding:{_PAD};font-family:'Helvetica Neue',Arial,sans-serif;}}",
    '<div style="font-size:22px;font-weight:300;color:#111827;">{{name}}</div>'
    '<div style="font-size:13px;color:#6b7280;margin-top:4px;font-style:italic;">{{title}}</div>'
    '<div style="font-size:10px;color:#9ca3af;margin-top:6px;">{{contact}}</div>'
    + _canvas_sec("About", '<div class="prose" style="font-size:12px;line-height:1.8;color:#4b5563;">{{summary}}</div>')
    + _canvas_sec("Work",
        "{{#experience}}"
        '<div style="display:flex;justify-content:space-between;align-items:baseline;">'
        '<span style="font-size:13px;font-weight:500;color:#111827;">{{title}}</span>'
        '<span style="font-size:10px;color:#9ca3af;">{{date}}</span></div>'
        '<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">{{company}}</div>'
        '<ul style="margin-bottom:12px;">{{#bullets}}<li style="font-size:11px;color:#6b7280;">— {{.}}</li>{{/bullets}}</ul>'
        "{{/experience}}")
    + _canvas_sec("Skills", '<div style="font-size:12px;color:#4b5563;line-height:2;">{{skillsJoined}}</div>')
    + "{{#hasEducation}}" + _canvas_sec("Education",
        "{{#education}}"
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">'
        '<div><span style="font-size:12px;color:#374151;">{{degree}}</span>  ·  '
        '<span style="font-size:11px;color:#9ca3af;">{{school}}</span></div>'
        '<span style="font-size:10px;color:#9ca3af;">{{year}}</span></div>'
        "{{/education}}") + "{{/hasEducation}}"
    + "{{#extraSections}}" + _canvas_sec("{{title}}", '<div style="font-size:11px;color:#6b7280;line-height:1.8;">{{itemsJoined}}</div>') + "{{/extraSections}}",
)

# ══════════════════════════════════════════════════════════════════════════════
# 7. SWIFT
# ══════════════════════════════════════════════════════════════════════════════
_S_H2 = "font-size:10px;font-weight:800;color:#1e293b;text-transform:uppercase;letter-spacing:1.5px;margin:12px 0 4px;"
_SWIFT = _doc(
    "body{padding:24px 32px;font-family:Arial,sans-serif;font-size:11px;}",
    '<div style="background:#1e293b;margin:-24px -32px 16px;padding:22px 32px 18px;">'
    '<div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;">{{name}}</div>'
    '<div style="font-size:13px;color:#94a3b8;margin-top:4px;">{{title}}</div></div>'
    '<div style="font-size:10px;color:#64748b;border-bottom:1px solid #334155;padding-bottom:8px;margin-bottom:8px;">{{email}}  ·  {{phone}}  ·  {{location}}</div>'
    + _heading(_S_H2, "Summary")
    + '<div class="prose" style="font-size:12px;line-height:1.6;color:#4b5563;margin-bottom:8px;">{{summary}}</div>'
    + _sections_bullets("highlights", _S_H2, "", "color:#475569;margin-bottom:2px;line-height:1.45;")
    + _heading(_S_H2, "Experience")
    + "{{#experience}}"
    + '<div style="display:flex;justify-content:space-between;"><span style="font-weight:600;color:#1e293b;">{{title}}  —  {{company}}</span>'
    + '<span style="color:#94a3b8;font-size:10px;">{{date}}</span></div>'
    + '<ul style="margin-bottom:7px;">{{#bullets}}<li style="color:#475569;">{{.}}</li>{{/bullets}}</ul>'
    + "{{/experience}}"
    + _heading(_S_H2, "Skills")
    + '<div style="color:#4b5563;line-height:1.8;margin-bottom:8px;">{{skillsJoined}}</div>'
    + "{{#hasEducation}}" + _heading(_S_H2, "Education")
    + "{{#education}}" + '<div style="font-size:11px;color:#4b5563;">{{degree}}  ·  {{school}}  ·  {{year}}</div>' + "{{/education}}{{/hasEducation}}"
    + _sections_inline("compactSections", _S_H2, "", "font-size:11px;color:#4b5563;line-height:1.8;")
    + _sections_bullets("longformSections", _S_H2, "", "font-size:11px;color:#4b5563;margin-bottom:2px;line-height:1.45;"),
)

# ══════════════════════════════════════════════════════════════════════════════
# 8. JADE
# ══════════════════════════════════════════════════════════════════════════════
_J_H2 = "font-size:10px;font-weight:700;color:#0d9488;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 4px;"
_J_CHIP = '{{#skills}}<span style="background:#f0fdfa;border:1px solid #0d9488;color:#0d9488;border-radius:4px;padding:2px 8px;font-size:11px;margin:2px;display:inline-block;">{{.}}</span>{{/skills}}'
_JADE = _doc(
    "body{font-family:Arial,sans-serif;display:flex;}",
    '<div style="width:6px;background:#0d9488;flex-shrink:0;"></div>'
    f'<div style="padding:{_PAD};flex:1;">'
    '<div style="font-size:26px;font-weight:700;color:#0f172a;">{{name}}</div>'
    '<div style="font-size:13px;color:#0d9488;margin-top:3px;">{{title}}</div>'
    '<div style="font-size:11px;color:#64748b;margin-top:4px;">{{contact}}</div>'
    '<div style="border-top:1px solid #ccfbf1;margin:14px 0;"></div>'
    + _heading(_J_H2, "Summary")
    + '<div class="prose" style="font-size:12px;line-height:1.6;margin-bottom:16px;">{{summary}}</div>'
    + _heading(_J_H2, "Experience") + _exp_rows("#0f172a")
    + _heading(_J_H2, "Skills")
    + f'<div style="margin-bottom:12px;">{_J_CHIP}</div>'
    + "{{#hasEducation}}" + _heading(_J_H2, "Education")
    + "{{#education}}" + '<div style="font-size:11px;color:#475569;margin-bottom:3px;">{{degree}}  ·  {{school}}  ·  {{year}}</div>' + "{{/education}}{{/hasEducation}}"
    + _sections_bullets("extraSections", _J_H2, _rule("border-top:1px solid #ccfbf1;margin-bottom:6px;"), "font-size:11px;color:#475569;margin-bottom:2px;")
    + "</div>",
)

# ══════════════════════════════════════════════════════════════════════════════
# 9. PRISM  (gray sidebar)
# ══════════════════════════════════════════════════════════════════════════════
_PRISM_P_HEAD = "font-size:10px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 6px;"
_PRISM_P_RULE = _rule("border-top:1px solid #e2e8f0;margin-bottom:10px;")
_PRISM = _doc(
    "body{font-family:Arial,sans-serif;display:flex;}",
    # sidebar
    '<div style="width:200px;background:#e8f0fe;padding:32px 18px;flex-shrink:0;border-right:3px solid #2563eb;">'
    '<div style="font-size:18px;font-weight:800;color:#1e293b;line-height:1.2;">{{name}}</div>'
    '<div style="font-size:12px;color:#2563eb;margin-top:5px;font-weight:600;">{{title}}</div>'
    '<div style="height:2px;width:32px;background:#2563eb;margin:10px 0;"></div>'
    '<div style="font-size:10px;color:#475569;line-height:1.9;">{{email}}<br>{{phone}}<br>{{location}}</div>'
    '<div style="font-size:9px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:1.5px;margin:18px 0 6px;">Skills</div>'
    '<div style="border-top:1px solid #cbd5e1;margin-bottom:6px;"></div>'
    '{{#skills}}<div style="font-size:11px;color:#334155;margin-bottom:3px;"><span style="color:#2563eb;">▸ </span>{{.}}</div>{{/skills}}'
    '<div style="font-size:9px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 6px;">Education</div>'
    '<div style="border-top:1px solid #cbd5e1;margin-bottom:6px;"></div>'
    '{{#education}}<div style="font-size:10px;color:#334155;line-height:1.6;"><strong>{{degree}}</strong><br><span style="color:#64748b;">{{school}}</span><br><span style="color:#94a3b8;">{{year}}</span></div>{{/education}}'
    '{{#compactSections}}<div style="font-size:9px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 4px;">{{title}}</div>'
    '<div style="border-top:1px solid #cbd5e1;margin-bottom:4px;"></div>'
    '{{#items}}<div style="font-size:10px;color:#334155;margin-bottom:2px;">▸ {{.}}</div>{{/items}}{{/compactSections}}'
    "</div>"
    # main
    '<div style="flex:1;padding:32px 26px;">'
    + _heading(_PRISM_P_HEAD + "margin-top:0;", "Profile") + _PRISM_P_RULE
    + '<div class="prose" style="font-size:12px;line-height:1.6;margin-bottom:14px;">{{summary}}</div>'
    + _sections_bullets("highlights", _PRISM_P_HEAD, _PRISM_P_RULE)
    + _heading(_PRISM_P_HEAD, "Experience") + _PRISM_P_RULE
    + "{{#experience}}"
    + '<div style="font-size:13px;font-weight:600;color:#1e293b;">{{title}}</div>'
    + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
    + '<span style="font-size:11px;color:#2563eb;">{{company}}</span>'
    + '<span style="font-size:10px;color:#94a3b8;">{{date}}</span></div>'
    + '<ul style="margin-bottom:12px;">{{#bullets}}<li style="font-size:11px;color:#475569;">{{.}}</li>{{/bullets}}</ul>'
    + "{{/experience}}"
    + _sections_bullets("longformSections", _PRISM_P_HEAD, _PRISM_P_RULE)
    + "</div>",
)

# ══════════════════════════════════════════════════════════════════════════════
# 10. VIVID  (purple sidebar)
# ══════════════════════════════════════════════════════════════════════════════
_VIVID_HEAD = "font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 6px;"
_VIVID_RULE = _rule("border-top:1.5px solid #ede9fe;margin-bottom:8px;")
_VIVID = _doc(
    "body{font-family:Arial,sans-serif;display:flex;}",
    '<div style="width:190px;background:#7c3aed;padding:28px 16px;flex-shrink:0;">'
    '<div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;margin-bottom:14px;font-size:24px;font-weight:900;color:#fff;">{{nameInitial}}</div>'
    '<div style="font-size:17px;font-weight:800;color:#fff;line-height:1.2;">{{name}}</div>'
    '<div style="font-size:11px;color:#c4b5fd;margin-top:3px;">{{title}}</div>'
    '<div style="border-top:1px solid rgba(255,255,255,0.2);margin:12px 0;"></div>'
    '<div style="font-size:10px;color:#ddd6fe;line-height:1.9;">{{email}}<br>{{phone}}<br>{{location}}</div>'
    '<div style="font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 6px;">Skills</div>'
    '{{#skills}}<div style="font-size:11px;color:#ede9fe;margin-bottom:3px;">▸ {{.}}</div>{{/skills}}'
    '{{#hasEducation}}<div style="font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 6px;">Education</div>'
    '{{#education}}<div style="font-size:11px;color:#ede9fe;font-weight:600;margin-bottom:2px;">{{degree}}</div>'
    '<div style="font-size:10px;color:#c4b5fd;">{{school}}</div>'
    '<div style="font-size:10px;color:#a78bfa;margin-bottom:10px;">{{year}}</div>{{/education}}{{/hasEducation}}'
    '{{#compactSections}}<div style="font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 6px;">{{title}}</div>'
    '{{#items}}<div style="font-size:11px;color:#ede9fe;margin-bottom:3px;">▸ {{.}}</div>{{/items}}{{/compactSections}}'
    "</div>"
    '<div style="flex:1;padding:32px 26px;">'
    + _heading(_VIVID_HEAD + "margin-top:0;", "Profile") + _VIVID_RULE
    + '<div class="prose" style="font-size:12px;line-height:1.6;margin-bottom:14px;">{{summary}}</div>'
    + _sections_bullets("highlights", _VIVID_HEAD, _VIVID_RULE)
    + _heading(_VIVID_HEAD, "Experience") + _VIVID_RULE
    + "{{#experience}}"
    + '<div style="font-size:13px;font-weight:600;">{{title}}</div>'
    + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
    + '<span style="font-size:11px;color:#7c3aed;">{{company}}</span>'
    + '<span style="font-size:10px;color:#94a3b8;">{{date}}</span></div>'
    + '<ul style="margin-bottom:12px;">{{#bullets}}<li style="font-size:11px;color:#475569;">{{.}}</li>{{/bullets}}</ul>'
    + "{{/experience}}"
    + _sections_bullets("longformSections", _VIVID_HEAD, _VIVID_RULE)
    + "</div>",
)

# ══════════════════════════════════════════════════════════════════════════════
# 15. LUXE
# ══════════════════════════════════════════════════════════════════════════════
def _luxe_sec(label: str, content: str) -> str:
    return (
        f'<div style="font-size:9px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:2.5px;margin:14px 0 4px;">{label}</div>'
        '<div style="border-top:1px solid #b45309;opacity:0.4;margin-bottom:8px;"></div>' + content
    )

_LUXE = _doc(
    f"body{{padding:{_PAD};font-family:Georgia,serif;background:#fffdf5;}}",
    '<div style="text-align:center;">'
    '<div style="font-size:28px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#1c1917;">{{name}}</div>'
    '<div style="font-size:12px;color:#b45309;letter-spacing:1.5px;margin-top:4px;">{{title}}</div></div>'
    '<div style="display:flex;align-items:center;gap:10px;margin:14px 0;">'
    '<div style="flex:1;height:1px;background:#b45309;opacity:0.4;"></div>'
    '<div style="width:6px;height:6px;border-radius:50%;background:#b45309;"></div>'
    '<div style="flex:1;height:1px;background:#b45309;opacity:0.4;"></div></div>'
    '<div style="text-align:center;font-size:10px;color:#78716c;margin-bottom:20px;">{{contact}}</div>'
    + _luxe_sec("Professional Profile", '<div class="prose" style="font-size:12px;line-height:1.8;font-style:italic;color:#44403c;">{{summary}}</div>')
    + _luxe_sec("Career History",
        "{{#experience}}"
        '<div style="display:flex;justify-content:space-between;">'
        '<span style="font-size:12px;font-weight:700;">{{title}}  ·  {{company}}</span>'
        '<span style="font-size:11px;font-style:italic;color:#78716c;">{{date}}</span></div>'
        '<ul style="margin-bottom:10px;">{{#bullets}}<li style="font-size:11px;color:#57534e;">{{.}}</li>{{/bullets}}</ul>'
        "{{/experience}}")
    + _luxe_sec("Core Expertise", '<div style="font-size:12px;line-height:2;color:#44403c;">{{skillsJoined}}</div>'),
)

# ══════════════════════════════════════════════════════════════════════════════
# 16. TECHMODERN
# ══════════════════════════════════════════════════════════════════════════════
_TM_H2 = "font-size:11px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:2px;margin:16px 0 4px;font-family:'Courier New',monospace;"
_TM_RULE = _rule("border-top:1px solid #10b981;opacity:0.35;margin-bottom:8px;")
_TECHMODERN = _doc(
    "body{font-family:'Courier New',Courier,monospace;}",
    f'<div style="background:#0f172a;padding:{_PAD_HEADER};">'
    '<div style="font-size:30px;font-weight:900;color:#fff;letter-spacing:-0.5px;">{{name}}</div>'
    '<div style="font-size:13px;color:#10b981;margin-top:5px;font-weight:600;">{{title}}</div>'
    '<div style="font-size:11px;color:#64748b;margin-top:6px;">{{contact}}</div></div>'
    '<div style="padding:20px 36px;">'
    + _heading(_TM_H2, "// About") + _TM_RULE
    + '<div class="prose" style="font-size:12px;line-height:1.6;color:#374151;margin-bottom:16px;">{{summary}}</div>'
    + _heading(_TM_H2, "// Experience") + _TM_RULE
    + "{{#experience}}"
    + '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">'
    + '<span style="font-weight:700;color:#111827;font-size:13px;">{{title}} @ {{company}}</span>'
    + '<span style="font-size:11px;color:#6b7280;">{{date}}</span></div>'
    + '<ul style="margin-bottom:10px;">{{#bullets}}<li style="font-size:11px;color:#4b5563;list-style:none;padding-left:14px;">→ {{.}}</li>{{/bullets}}</ul>'
    + "{{/experience}}"
    + _heading(_TM_H2, "// Skills") + _TM_RULE
    + '<div style="font-size:12px;line-height:2;color:#374151;">{{skillsJoined}}</div>'
    + "</div>",
)

# ══════════════════════════════════════════════════════════════════════════════
# 17. PULSE
# ══════════════════════════════════════════════════════════════════════════════
_PULSE_H2 = "font-size:11px;font-weight:800;color:#e11d48;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 4px;"
_PULSE_RULE = _rule("border-top:2.5px solid #e11d48;margin-bottom:8px;")
_PULSE = _doc(
    "body{font-family:Arial,sans-serif;display:flex;}",
    '<div style="width:16px;background:#e11d48;flex-shrink:0;"></div>'
    f'<div style="padding:{_PAD};flex:1;">'
    '<div style="font-size:32px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">{{name}}</div>'
    '<div style="font-size:13px;color:#e11d48;margin-top:4px;font-weight:600;">{{title}}</div>'
    '<div style="font-size:11px;color:#6b7280;margin-top:4px;">{{contact}}</div>'
    + _heading(_PULSE_H2, "Profile") + _PULSE_RULE
    + '<div class="prose" style="font-size:12px;line-height:1.6;margin-bottom:16px;">{{summary}}</div>'
    + _heading(_PULSE_H2, "Experience") + _PULSE_RULE
    + "{{#experience}}"
    + '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">'
    + '<span style="font-weight:700;color:#111827;font-size:13px;">{{title}}</span>'
    + '<span style="font-size:11px;color:#6b7280;">{{date}}</span></div>'
    + '<div style="font-size:11px;color:#e11d48;font-weight:600;margin-bottom:4px;">{{company}}</div>'
    + '<ul style="margin-bottom:10px;">{{#bullets}}<li style="font-size:11px;color:#4b5563;">{{.}}</li>{{/bullets}}</ul>'
    + "{{/experience}}"
    + _heading(_PULSE_H2, "Skills") + _PULSE_RULE
    + '<div style="font-size:12px;line-height:2;color:#374151;">{{skillsJoined}}</div>'
    + "</div>",
)

# ══════════════════════════════════════════════════════════════════════════════
# 18. HEXAGONPRO
# ══════════════════════════════════════════════════════════════════════════════
def _hex_head(title: str) -> str:
    return (
        '<div style="display:flex;align-items:center;gap:8px;margin:18px 0 4px;">'
        '<div style="width:18px;height:18px;border-radius:50%;background:#0ea5e9;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
        '<div style="width:6px;height:6px;border-radius:50%;background:#fff;"></div></div>'
        f'<div style="font-size:11px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:1.5px;">{title}</div>'
        '<div style="flex:1;height:1.5px;background:#e2e8f0;"></div></div>'
    )

_HEX_CHIP = '{{#skills}}<span style="background:#e0f2fe;color:#0ea5e9;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:500;margin:2px;display:inline-block;">{{.}}</span>{{/skills}}'
_HEXAGONPRO = _doc(
    f"body{{padding:{_PAD};font-family:Arial,sans-serif;}}",
    '<div style="text-align:center;padding-bottom:12px;border-bottom:2px solid #e0f2fe;">'
    '<div style="font-size:30px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">{{name}}</div>'
    '<div style="font-size:13px;color:#0ea5e9;margin-top:4px;font-weight:500;">{{title}}</div>'
    '<div style="font-size:11px;color:#6b7280;margin-top:6px;">{{contact}}</div></div>'
    + _hex_head("Professional Summary")
    + '<div class="prose" style="font-size:12px;line-height:1.6;margin-bottom:16px;">{{summary}}</div>'
    + _hex_head("Experience")
    + "{{#experience}}"
    + '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">'
    + '<span style="font-weight:700;color:#111827;font-size:13px;">{{title}}</span>'
    + '<span style="font-size:11px;color:#6b7280;">{{date}}</span></div>'
    + '<div style="font-size:11px;color:#0ea5e9;font-weight:500;margin-bottom:4px;">{{company}}</div>'
    + '<ul style="margin-bottom:10px;">{{#bullets}}<li style="font-size:11px;color:#4b5563;">{{.}}</li>{{/bullets}}</ul>'
    + "{{/experience}}"
    + _hex_head("Skills")
    + f'<div style="margin-top:4px;">{_HEX_CHIP}</div>',
)

# ══════════════════════════════════════════════════════════════════════════════
# 19. SALESIMPACT
# ══════════════════════════════════════════════════════════════════════════════
_SI_H2 = "font-size:11px;font-weight:800;color:#dc2626;text-transform:uppercase;letter-spacing:1.5px;margin:18px 0 4px;"
_SI_RULE = _rule("border-top:2.5px solid #dc2626;margin-bottom:8px;")
_SALESIMPACT = _doc(
    "body{font-family:Arial,sans-serif;}",
    f'<div style="background:#dc2626;padding:{_PAD_HEADER};">'
    '<div style="font-size:34px;font-weight:900;color:#fff;letter-spacing:-0.5px;">{{name}}</div>'
    '<div style="font-size:14px;color:#fecaca;margin-top:4px;font-weight:600;">{{title}}</div>'
    '<div style="font-size:11px;color:#fca5a5;margin-top:6px;">{{contact}}</div></div>'
    '<div style="padding:20px 36px;">'
    + _heading(_SI_H2, "Value Proposition") + _SI_RULE
    + '<div class="prose" style="font-size:12px;line-height:1.6;margin-bottom:16px;">{{summary}}</div>'
    + _heading(_SI_H2, "Sales Experience") + _SI_RULE
    + "{{#experience}}"
    + '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">'
    + '<span style="font-weight:700;color:#111827;font-size:13px;">{{title}}</span>'
    + '<span style="font-size:11px;color:#6b7280;">{{date}}</span></div>'
    + '<div style="font-size:12px;color:#dc2626;font-weight:700;margin-bottom:4px;">{{company}}</div>'
    + '<ul style="margin-bottom:10px;">{{#bullets}}<li style="font-size:11px;color:#4b5563;">{{.}}</li>{{/bullets}}</ul>'
    + "{{/experience}}"
    + _heading(_SI_H2, "Core Competencies") + _SI_RULE
    + '<div style="font-size:12px;line-height:2;color:#374151;">{{skillsJoined}}</div>'
    + "</div>",
)

# ══════════════════════════════════════════════════════════════════════════════
# 20. HEALTHCARE
# ══════════════════════════════════════════════════════════════════════════════
def _hc_sec(title: str, content: str) -> str:
    return (
        '<div style="background:#f0f9ff;border-left:3px solid #0891b2;padding:5px 12px;margin:16px 0 8px;">'
        f'<div style="font-size:10px;font-weight:800;color:#0891b2;text-transform:uppercase;letter-spacing:1.5px;">{title}</div></div>'
        + content
    )

_HEALTHCARE = _doc(
    f"body{{padding:{_PAD};font-family:Arial,sans-serif;}}",
    '<div style="border-top:3px solid #0891b2;padding-top:12px;margin-bottom:16px;">'
    '<div style="font-size:28px;font-weight:800;color:#0f172a;">{{name}}</div>'
    '<div style="font-size:13px;color:#0891b2;margin-top:3px;font-weight:600;">{{title}}</div>'
    '<div style="font-size:11px;color:#6b7280;margin-top:4px;">{{contact}}</div></div>'
    + _hc_sec("Professional Summary", '<div class="prose" style="font-size:12px;line-height:1.6;margin-bottom:8px;">{{summary}}</div>')
    + _hc_sec("Experience",
        "{{#experience}}"
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">'
        '<span style="font-weight:700;color:#111827;font-size:13px;">{{title}}</span>'
        '<span style="font-size:11px;color:#6b7280;">{{date}}</span></div>'
        '<div style="font-size:11px;color:#0891b2;font-weight:600;margin-bottom:4px;">{{company}}</div>'
        '<ul style="margin-bottom:10px;">{{#bullets}}<li style="font-size:11px;color:#4b5563;">{{.}}</li>{{/bullets}}</ul>'
        "{{/experience}}")
    + _hc_sec("Skills & Competencies", '<div style="font-size:12px;color:#374151;line-height:2;">{{skillsJoined}}</div>'),
)


# ══════════════════════════════════════════════════════════════════════════════
# TEMPLATE RECORDS — metadata (from ALL_TEMPLATES) + docx_config (from _CONFIGS)
# + the standalone HTML above. Chronicle/Summit/Symmetry/Scholar reuse a sibling's
# HTML, exactly as the original front-end did.
# ══════════════════════════════════════════════════════════════════════════════

def _cfg(accent, header, font, heading, compact, layout, sidebar_color="", sidebar_ratio=0.0, banner_bg=""):
    return {
        "accent": accent, "header": header, "font": font, "heading": heading,
        "compact": compact, "layout": layout, "sidebar_color": sidebar_color,
        "sidebar_ratio": sidebar_ratio, "banner_bg": banner_bg,
    }


# key, name, category, traits, bestFor, description, pages, tier, accentColor, show_in_cv_score, html, docx_config
BUILTIN_TEMPLATES: list[dict] = [
    {"key": "Cambridge", "name": "Cambridge", "category": "Classic", "traits": ["ATS-safe", "Monochrome", "Timeless"], "bestFor": "All industries", "description": "Clean single-column layout trusted by recruiters at any firm.", "pages": 1, "tier": "free", "accentColor": "#1f2937", "show_in_cv_score": False, "html": _CAMBRIDGE, "docx_config": _cfg("1f2937", "centered", "Calibri", "rule", False, "single")},
    {"key": "Horizon", "name": "Horizon", "category": "Modern", "traits": ["Blue header", "Bold", "Tech-ready"], "bestFor": "Tech, product, design", "description": "Bold blue header with strong visual hierarchy and skill chips.", "pages": 2, "tier": "free", "accentColor": "#1d4ed8", "show_in_cv_score": True, "html": _HORIZON, "docx_config": _cfg("1d4ed8", "banner", "Calibri", "rule", False, "single")},
    {"key": "Prestige", "name": "Prestige", "category": "Executive", "traits": ["Serif", "Centred", "Formal"], "bestFor": "Finance, law, C-suite", "description": "Authoritative serif typeface with formal centred header and double rules.", "pages": 2, "tier": "free", "accentColor": "#374151", "show_in_cv_score": False, "html": _PRESTIGE, "docx_config": _cfg("374151", "serif-centered", "Times New Roman", "double-rule", False, "single")},
    {"key": "Admiral", "name": "Admiral", "category": "Classic", "traits": ["Navy", "Professional", "Two-tone"], "bestFor": "Banking, consulting", "description": "Navy blue accents with name and contact in a refined two-tone layout.", "pages": 2, "tier": "free", "accentColor": "#1e3a5f", "show_in_cv_score": False, "html": _ADMIRAL, "docx_config": _cfg("1e3a5f", "banner", "Calibri", "rule", False, "single")},
    {"key": "Swift", "name": "Swift", "category": "ATS", "traits": ["Compact", "1-page", "Content-rich"], "bestFor": "Senior / 1-page CVs", "description": "Ultra-dense layout fitting maximum experience on a single page.", "pages": 1, "tier": "free", "accentColor": "#1e293b", "show_in_cv_score": True, "html": _SWIFT, "docx_config": _cfg("1e293b", "left", "Calibri", "colored", True, "single")},
    {"key": "Catalyst", "name": "Catalyst", "category": "Modern", "traits": ["Orange accent", "Bold", "Standout"], "bestFor": "Sales, startups", "description": "High-contrast orange accents that demand attention on a recruiter's desk.", "pages": 1, "tier": "plus", "accentColor": "#ea580c", "show_in_cv_score": True, "html": _CATALYST, "docx_config": _cfg("ea580c", "left", "Calibri", "left-border", False, "single")},
    {"key": "Canvas", "name": "Canvas", "category": "Classic", "traits": ["Minimal", "Whitespace", "Refined"], "bestFor": "UX, design, research", "description": "Abundant whitespace and restrained typography — lets content breathe.", "pages": 1, "tier": "plus", "accentColor": "#6b7280", "show_in_cv_score": False, "html": _CANVAS, "docx_config": _cfg("9ca3af", "centered", "Calibri", "rule", False, "single")},
    {"key": "Jade", "name": "Jade", "category": "Modern", "traits": ["Teal", "Left accent", "Fresh"], "bestFor": "Healthcare, education", "description": "Teal left accent bar and section headers with skill chip badges.", "pages": 2, "tier": "plus", "accentColor": "#0d9488", "show_in_cv_score": False, "html": _JADE, "docx_config": _cfg("0d9488", "banner", "Calibri", "rule", False, "single")},
    {"key": "Prism", "name": "Prism", "category": "Modern", "traits": ["Two-column", "Sidebar", "Structured"], "bestFor": "Tech, data science", "description": "Blue sidebar organises contact and skills; wide main column for experience.", "pages": 2, "tier": "plus", "accentColor": "#2563eb", "show_in_cv_score": False, "html": _PRISM, "docx_config": _cfg("2563eb", "centered", "Calibri", "rule", False, "sidebar", "2563eb", 0.30)},
    {"key": "Vivid", "name": "Vivid", "category": "Creative", "traits": ["Purple", "Sidebar", "Distinctive"], "bestFor": "Design, marketing", "description": "Rich purple sidebar with monogram initial — makes an instant impression.", "pages": 2, "tier": "plus", "accentColor": "#7c3aed", "show_in_cv_score": True, "html": _VIVID, "docx_config": _cfg("7c3aed", "centered", "Calibri", "rule", False, "sidebar", "7c3aed", 0.30)},
    {"key": "Chronicle", "name": "Chronicle", "category": "Modern", "traits": ["Timeline", "Dots", "Narrative"], "bestFor": "Product, operations", "description": "Timeline dots make your career progression immediately legible.", "pages": 2, "tier": "plus", "accentColor": "#1d4ed8", "show_in_cv_score": False, "html": _HORIZON, "docx_config": _cfg("1d4ed8", "left", "Calibri", "rule", False, "single")},
    {"key": "Summit", "name": "Summit", "category": "Executive", "traits": ["Dark header", "Contrast", "Impact"], "bestFor": "Engineering, fintech", "description": "Full-width charcoal header block creates a commanding first impression.", "pages": 2, "tier": "plus", "accentColor": "#0f172a", "show_in_cv_score": False, "html": _CAMBRIDGE, "docx_config": _cfg("0f172a", "banner", "Calibri", "colored", False, "single")},
    {"key": "Symmetry", "name": "Symmetry", "category": "Modern", "traits": ["Two-column", "Balanced", "Structured"], "bestFor": "PM, strategy, ops", "description": "Balanced equal columns — experience left, skills and education right.", "pages": 2, "tier": "plus", "accentColor": "#1e3a5f", "show_in_cv_score": False, "html": _ADMIRAL, "docx_config": _cfg("1e3a5f", "centered", "Calibri", "rule", False, "two-equal", "f1f5f9", 0.50)},
    {"key": "Scholar", "name": "Scholar", "category": "Classic", "traits": ["Serif", "Academic", "Formal"], "bestFor": "Academia, research", "description": "Traditional academic formatting for scholarly and research CVs.", "pages": 2, "tier": "plus", "accentColor": "#374151", "show_in_cv_score": False, "html": _PRESTIGE, "docx_config": _cfg("374151", "left", "Times New Roman", "rule", False, "single")},
    {"key": "Luxe", "name": "Luxe", "category": "Executive", "traits": ["Gold", "Warm", "Distinctive"], "bestFor": "Legal, luxury, arts", "description": "Warm gold decorative accents on cream — memorable and refined.", "pages": 2, "tier": "plus", "accentColor": "#b45309", "show_in_cv_score": False, "html": _LUXE, "docx_config": _cfg("b45309", "serif-centered", "Georgia", "gold-rule", False, "single")},
    {"key": "TechModern", "name": "Tech Modern", "category": "Modern", "traits": ["Dark header", "Monospace", "Green"], "bestFor": "Engineering, dev roles", "description": "Dark header with monospace typography and green accent — built for tech.", "pages": 2, "tier": "plus", "accentColor": "#10b981", "show_in_cv_score": False, "html": _TECHMODERN, "docx_config": _cfg("10b981", "banner", "Courier New", "colored", False, "single", banner_bg="0f172a")},
    {"key": "Pulse", "name": "Pulse", "category": "Modern", "traits": ["Red bar", "Bold", "Energetic"], "bestFor": "Sales, startups, ops", "description": "Bold rose left bar with high-contrast typography — made to stand out.", "pages": 2, "tier": "plus", "accentColor": "#e11d48", "show_in_cv_score": False, "html": _PULSE, "docx_config": _cfg("e11d48", "left", "Calibri", "rule", False, "left-bar", "e11d48", 0.035)},
    {"key": "HexagonPro", "name": "Hexagon Pro", "category": "Modern", "traits": ["Circle markers", "Sky blue", "Clean"], "bestFor": "Product, consulting", "description": "Circle-dot section markers with a sky-blue accent line — modern and crisp.", "pages": 2, "tier": "plus", "accentColor": "#0ea5e9", "show_in_cv_score": False, "html": _HEXAGONPRO, "docx_config": _cfg("0ea5e9", "centered", "Calibri", "circle-marker", False, "single")},
    {"key": "SalesImpact", "name": "Sales Impact", "category": "Creative", "traits": ["Red banner", "Bold", "Results-focused"], "bestFor": "Sales, business dev", "description": "Commanding red header — built to highlight metrics and achievements.", "pages": 2, "tier": "plus", "accentColor": "#dc2626", "show_in_cv_score": False, "html": _SALESIMPACT, "docx_config": _cfg("dc2626", "banner", "Calibri", "rule", False, "single")},
    {"key": "Healthcare", "name": "Healthcare", "category": "Classic", "traits": ["Teal", "Structured", "Clinical"], "bestFor": "Healthcare, nursing", "description": "Teal-accented section blocks with a clean clinical structure.", "pages": 2, "tier": "plus", "accentColor": "#0891b2", "show_in_cv_score": False, "html": _HEALTHCARE, "docx_config": _cfg("0891b2", "centered", "Calibri", "left-border", False, "single")},
]
