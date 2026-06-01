"""Jinja2 HTML templates for CV template preview generation (WeasyPrint)."""

# Base CSS reset injected into every template
_BASE = """
* { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: A4 portrait; margin: 0; }
body { font-size: 10pt; line-height: 1.45; color: #1f2937; }
.page { width: 210mm; min-height: 297mm; background: #fff; overflow: hidden; }
ul { list-style: none; }
"""

# ── Jinja2 template strings ───────────────────────────────────────────────────
# Available context: d.name, d.title, d.email, d.phone, d.location, d.linkedin,
#   d.summary, d.skills (list), d.experience (list of {title,company,date,bullets}),
#   d.education (list of {degree,school,year})

TEMPLATES: dict[str, str] = {}

# ── 1. Cambridge ──────────────────────────────────────────────────────────────
TEMPLATES["Cambridge"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { padding: 22mm 24mm; font-family: "Liberation Sans", Arial, sans-serif; }
h1 { font-size: 20pt; font-weight: 700; color: #111827; }
.sub { font-size: 11pt; color: #4b5563; margin-top: 3pt; }
.contact { font-size: 9pt; color: #6b7280; margin-top: 4pt; }
.divider { border-top: 1.5pt solid #d1d5db; margin: 10pt 0; }
.thin { border-top: 0.75pt solid #e5e7eb; margin: 3pt 0 6pt; }
h2 { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5pt; color: #374151; margin: 12pt 0 3pt; }
.row { display: flex; justify-content: space-between; align-items: baseline; }
.job-title { font-size: 10.5pt; font-weight: 600; color: #111827; }
.date { font-size: 9pt; color: #6b7280; }
.company { font-size: 9.5pt; color: #2563eb; margin: 1pt 0 3pt; }
li { font-size: 9.5pt; color: #4b5563; padding-left: 10pt; margin-top: 2pt; }
li::before { content: "•  "; }
.skills-text { font-size: 9.5pt; color: #374151; }
.edu-line { font-size: 9.5pt; color: #374151; }
</style></head><body><div class="page">
<h1>{{ d.name }}</h1>
<div class="sub">{{ d.title }}</div>
<div class="contact">{{ d.email }}  ·  {{ d.phone }}  ·  {{ d.location }}{% if d.linkedin %}  ·  {{ d.linkedin }}{% endif %}</div>
<div class="divider"></div>
<h2>Professional Summary</h2><div class="thin"></div>
<div style="font-size:9.5pt;color:#374151;">{{ d.summary }}</div>
<h2>Work Experience</h2><div class="thin"></div>
{% for e in d.experience %}
<div class="row"><span class="job-title">{{ e.title }} — {{ e.company }}</span><span class="date">{{ e.date }}</span></div>
<ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
{% if not loop.last %}<div style="margin-bottom:8pt;"></div>{% endif %}
{% endfor %}
<h2>Skills</h2><div class="thin"></div>
<div class="skills-text">{{ d.skills | join("  ·  ") }}</div>
<h2>Education</h2><div class="thin"></div>
{% for e in d.education %}<div class="edu-line">{{ e.degree }}  ·  {{ e.school }}  ·  {{ e.year }}</div>{% endfor %}
</div></body></html>"""

# ── 2. Horizon ────────────────────────────────────────────────────────────────
TEMPLATES["Horizon"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { font-family: "Liberation Sans", Arial, sans-serif; }
.header { background: #1d4ed8; padding: 18mm 22mm 14mm; }
.header h1 { font-size: 22pt; font-weight: 800; color: #fff; }
.header .sub { font-size: 11pt; color: #bfdbfe; margin-top: 4pt; }
.header .contact { font-size: 9pt; color: #93c5fd; margin-top: 6pt; }
.body { padding: 14mm 22mm; }
h2 { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5pt; color: #1d4ed8; margin: 10pt 0 3pt; }
.rule { border-top: 1.5pt solid #1d4ed8; margin-bottom: 7pt; }
.row { display: flex; justify-content: space-between; align-items: baseline; }
.job-title { font-size: 10.5pt; font-weight: 600; }
.date { font-size: 9pt; color: #6b7280; font-style: italic; }
li { font-size: 9.5pt; color: #4b5563; padding-left: 10pt; margin-top: 2pt; }
li::before { content: "•  "; }
.chip { display: inline-block; background: #eff6ff; color: #1d4ed8; border-radius: 3pt; padding: 1.5pt 6pt; font-size: 8.5pt; font-weight: 500; margin: 1.5pt; }
</style></head><body><div class="page">
<div class="header">
  <h1>{{ d.name }}</h1>
  <div class="sub">{{ d.title }}</div>
  <div class="contact">{{ d.email }}  ·  {{ d.phone }}  ·  {{ d.location }}{% if d.linkedin %}  ·  {{ d.linkedin }}{% endif %}</div>
</div>
<div class="body">
<h2>Profile</h2><div class="rule"></div>
<div style="font-size:9.5pt;color:#374151;margin-bottom:10pt;">{{ d.summary }}</div>
<h2>Experience</h2><div class="rule"></div>
{% for e in d.experience %}
<div class="row"><span class="job-title">{{ e.title }} · {{ e.company }}</span><span class="date">{{ e.date }}</span></div>
<ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
{% if not loop.last %}<div style="margin-bottom:8pt;"></div>{% endif %}
{% endfor %}
<h2>Skills</h2><div class="rule"></div>
{% for s in d.skills %}<span class="chip">{{ s }}</span>{% endfor %}
</div></div></body></html>"""

# ── 3. Prestige ────────────────────────────────────────────────────────────────
TEMPLATES["Prestige"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { padding: 22mm 26mm; font-family: "Liberation Serif", Georgia, serif; }
.top-rule { border-top: 2pt solid #111827; margin-bottom: 8pt; }
.bottom-rule { border-bottom: 2pt solid #111827; margin-bottom: 14pt; }
.center { text-align: center; }
h1 { font-size: 20pt; font-weight: 700; letter-spacing: 2pt; text-transform: uppercase; }
.sub { font-size: 10.5pt; color: #555; margin-top: 3pt; }
.contact { font-size: 9pt; color: #777; margin-top: 4pt; }
h2 { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 2pt; margin: 12pt 0 3pt; }
.sec-border { border-top: 0.75pt solid #bbb; border-bottom: 0.75pt solid #bbb; padding: 4pt 0; margin-bottom: 10pt; }
.row { display: flex; justify-content: space-between; }
.job-title { font-size: 10.5pt; font-weight: 700; }
.date { font-size: 9pt; font-style: italic; color: #666; }
.company { font-size: 9.5pt; font-style: italic; color: #555; margin: 1pt 0 3pt; }
li { font-size: 9.5pt; padding-left: 12pt; margin-top: 2pt; }
li::before { content: "•  "; }
</style></head><body><div class="page">
<div class="top-rule"></div>
<div class="center bottom-rule">
  <h1>{{ d.name }}</h1>
  <div class="sub">{{ d.title }}</div>
  <div class="contact">{{ d.email }}  —  {{ d.phone }}  —  {{ d.location }}</div>
</div>
<h2>Professional Summary</h2>
<div class="sec-border"><div style="font-size:9.5pt;font-style:italic;">{{ d.summary }}</div></div>
<h2>Professional Experience</h2>
<div class="sec-border">
{% for e in d.experience %}
<div class="row"><span class="job-title">{{ e.title }}</span><span class="date">{{ e.date }}</span></div>
<div class="company">{{ e.company }}</div>
<ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
{% if not loop.last %}<div style="margin-bottom:7pt;"></div>{% endif %}
{% endfor %}
</div>
<h2>Core Competencies</h2>
<div class="sec-border"><div style="font-size:9.5pt;line-height:2;">{{ d.skills | join("   ·   ") }}</div></div>
<h2>Education</h2>
<div class="sec-border">{% for e in d.education %}<div style="font-size:9.5pt;">{{ e.degree }}  ·  {{ e.school }}  ·  {{ e.year }}</div>{% endfor %}</div>
</div></body></html>"""

# ── 4. Catalyst ────────────────────────────────────────────────────────────────
TEMPLATES["Catalyst"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { padding: 20mm 24mm; font-family: "Liberation Sans", Arial, sans-serif; }
h1 { font-size: 24pt; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.5pt; }
.accent { width: 40pt; height: 3pt; background: #ea580c; margin: 7pt 0; }
.sub { font-size: 11pt; color: #475569; }
.contact { font-size: 9pt; color: #64748b; margin-top: 3pt; }
h2 { font-size: 8pt; font-weight: 800; color: #ea580c; text-transform: uppercase; letter-spacing: 2pt; margin: 12pt 0 3pt; }
.h-rule { border-top: 0.75pt solid #fed7aa; margin-bottom: 6pt; }
.row { display: flex; justify-content: space-between; align-items: baseline; }
.job-title { font-size: 10.5pt; font-weight: 700; }
.date { font-size: 9pt; color: #94a3b8; font-weight: 600; }
li { font-size: 9.5pt; color: #334155; padding-left: 10pt; margin-top: 2pt; }
li::before { content: "→  "; color: #ea580c; }
.chip { display: inline-block; background: #fff7ed; border: 0.75pt solid #fed7aa; color: #ea580c; border-radius: 3pt; padding: 1.5pt 6pt; font-size: 8.5pt; font-weight: 600; margin: 1.5pt; }
</style></head><body><div class="page">
<h1>{{ d.name }}</h1>
<div class="accent"></div>
<div class="sub">{{ d.title }}  ·  {{ d.location }}</div>
<div class="contact">{{ d.email }}  ·  {{ d.phone }}</div>
<h2>About</h2><div class="h-rule"></div>
<div style="font-size:9.5pt;line-height:1.6;color:#334155;">{{ d.summary }}</div>
<h2>Experience</h2><div class="h-rule"></div>
{% for e in d.experience %}
<div class="row"><span class="job-title">{{ e.title }}</span><span class="date">{{ e.company }}  ·  {{ e.date }}</span></div>
<ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
{% if not loop.last %}<div style="margin-bottom:8pt;"></div>{% endif %}
{% endfor %}
<h2>Skills</h2><div class="h-rule"></div>
{% for s in d.skills %}<span class="chip">{{ s }}</span>{% endfor %}
</div></body></html>"""

# ── 5. Admiral ────────────────────────────────────────────────────────────────
TEMPLATES["Admiral"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { padding: 20mm 24mm; font-family: "Liberation Sans", Arial, sans-serif; }
.top { display: flex; justify-content: space-between; align-items: flex-start; }
h1 { font-size: 20pt; font-weight: 700; color: #1e3a5f; }
.sub { font-size: 10.5pt; color: #3b5998; margin-top: 3pt; }
.contact-block { text-align: right; font-size: 9pt; color: #6b7280; line-height: 1.8; }
.heavy-rule { border-top: 1.5pt solid #1e3a5f; margin: 8pt 0 5pt; }
.thin-rule { border-top: 0.75pt solid #1e3a5f; margin-bottom: 7pt; }
h2 { font-size: 8pt; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1.5pt; margin: 10pt 0 3pt; }
.row { display: flex; justify-content: space-between; }
.job-title { font-size: 10.5pt; font-weight: 600; color: #111827; }
.co { font-size: 9.5pt; color: #1e3a5f; font-weight: 600; margin: 1pt 0 3pt; }
.date { font-size: 9pt; color: #6b7280; }
li { font-size: 9.5pt; color: #4b5563; padding-left: 10pt; margin-top: 2pt; }
li::before { content: "•  "; }
</style></head><body><div class="page">
<div class="top">
  <div><h1>{{ d.name }}</h1><div class="sub">{{ d.title }}</div></div>
  <div class="contact-block">{{ d.email }}<br>{{ d.phone }}<br>{{ d.location }}</div>
</div>
<div class="heavy-rule"></div>
<h2>Career Profile</h2><div class="thin-rule"></div>
<div style="font-size:9.5pt;line-height:1.6;color:#374151;margin-bottom:10pt;">{{ d.summary }}</div>
<h2>Career History</h2><div class="thin-rule"></div>
{% for e in d.experience %}
<div class="row"><span class="job-title">{{ e.title }}</span><span class="date">{{ e.date }}</span></div>
<div class="co">{{ e.company }}</div>
<ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
{% if not loop.last %}<div style="margin-bottom:8pt;"></div>{% endif %}
{% endfor %}
<h2>Core Skills</h2><div class="thin-rule"></div>
<div style="font-size:9.5pt;line-height:1.9;">{{ d.skills | join("  ·  ") }}</div>
</div></body></html>"""

# ── 6. Catalyst (free slot 6 → use Canvas) ────────────────────────────────────
TEMPLATES["Canvas"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { padding: 28mm 30mm; font-family: "Liberation Sans", Arial, sans-serif; }
h1 { font-size: 18pt; font-weight: 300; color: #111827; letter-spacing: -0.3pt; }
.sub { font-size: 11pt; color: #6b7280; margin-top: 3pt; font-style: italic; }
.contact { font-size: 8.5pt; color: #9ca3af; margin-top: 5pt; letter-spacing: 0.3pt; }
.section { margin-top: 18pt; }
.label { font-size: 7.5pt; color: #9ca3af; text-transform: uppercase; letter-spacing: 2pt; margin-bottom: 6pt; }
.row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2pt; }
.job-title { font-size: 10.5pt; font-weight: 500; color: #111827; }
.co { font-size: 9.5pt; color: #6b7280; margin-bottom: 3pt; }
.date { font-size: 8.5pt; color: #9ca3af; }
li { font-size: 9pt; color: #6b7280; padding-left: 10pt; margin-top: 1.5pt; }
li::before { content: "—  "; }
</style></head><body><div class="page">
<h1>{{ d.name }}</h1>
<div class="sub">{{ d.title }}</div>
<div class="contact">{{ d.email }}  ·  {{ d.location }}{% if d.linkedin %}  ·  {{ d.linkedin }}{% endif %}</div>
<div class="section"><div class="label">About</div>
<div style="font-size:9.5pt;line-height:1.8;color:#4b5563;">{{ d.summary }}</div></div>
<div class="section"><div class="label">Work</div>
{% for e in d.experience %}
<div class="row"><span class="job-title">{{ e.title }}</span><span class="date">{{ e.date }}</span></div>
<div class="co">{{ e.company }}</div>
<ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
{% if not loop.last %}<div style="margin-bottom:8pt;"></div>{% endif %}
{% endfor %}</div>
<div class="section"><div class="label">Skills</div>
<div style="font-size:9.5pt;color:#4b5563;line-height:2;">{{ d.skills | join("   ·   ") }}</div></div>
</div></body></html>"""

# ── 7. Swift ──────────────────────────────────────────────────────────────────
TEMPLATES["Swift"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { padding: 14mm 20mm; font-family: "Liberation Sans", Arial, sans-serif; font-size: 9pt; }
.top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5pt solid #374151; padding-bottom: 5pt; margin-bottom: 6pt; }
h1 { font-size: 17pt; font-weight: 700; color: #0f172a; }
.contact { font-size: 8.5pt; color: #64748b; text-align: right; }
h2 { font-size: 7.5pt; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 1.5pt; margin: 7pt 0 3pt; }
.row { display: flex; justify-content: space-between; }
.job-title { font-weight: 600; color: #1e293b; }
.date { color: #94a3b8; font-size: 8.5pt; }
li { color: #475569; padding-left: 8pt; margin-top: 1pt; }
li::before { content: "•  "; }
</style></head><body><div class="page">
<div class="top"><h1>{{ d.name }}</h1><div class="contact">{{ d.email }}  ·  {{ d.phone }}<br>{{ d.location }}</div></div>
<h2>Summary</h2>
<div style="color:#4b5563;line-height:1.5;">{{ d.summary }}</div>
<h2>Experience</h2>
{% for e in d.experience %}
<div class="row"><span class="job-title">{{ e.title }}  —  {{ e.company }}</span><span class="date">{{ e.date }}</span></div>
<ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
{% if not loop.last %}<div style="margin-bottom:5pt;"></div>{% endif %}
{% endfor %}
<h2>Skills</h2>
<div style="color:#4b5563;line-height:1.8;">{{ d.skills | join("  ·  ") }}</div>
<h2>Education</h2>
{% for e in d.education %}<div style="color:#4b5563;">{{ e.degree }}  ·  {{ e.school }}  ·  {{ e.year }}</div>{% endfor %}
</div></body></html>"""

# ── 8. Jade ────────────────────────────────────────────────────────────────────
TEMPLATES["Jade"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { font-family: "Liberation Sans", Arial, sans-serif; display: flex; }
.accent-bar { width: 5pt; background: #0d9488; flex-shrink: 0; }
.body { padding: 20mm 22mm; flex: 1; }
h1 { font-size: 20pt; font-weight: 700; color: #0f172a; }
.sub { font-size: 10.5pt; color: #0d9488; margin-top: 3pt; }
.contact { font-size: 9pt; color: #64748b; margin-top: 4pt; }
.sep { border-top: 0.75pt solid #ccfbf1; margin: 10pt 0 6pt; }
h2 { font-size: 8pt; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: 1.5pt; margin: 10pt 0 4pt; }
.row { display: flex; justify-content: space-between; }
.job-title { font-size: 10.5pt; font-weight: 600; }
.date { font-size: 9pt; color: #64748b; }
li { font-size: 9.5pt; color: #475569; padding-left: 10pt; margin-top: 2pt; }
li::before { content: "•  "; }
.chip { display: inline-block; background: #f0fdfa; border: 0.75pt solid #0d9488; color: #0d9488; border-radius: 3pt; padding: 1.5pt 6pt; font-size: 8.5pt; margin: 1.5pt; }
</style></head><body><div class="page">
<div class="accent-bar"></div>
<div class="body">
<h1>{{ d.name }}</h1>
<div class="sub">{{ d.title }}</div>
<div class="contact">{{ d.email }}  ·  {{ d.phone }}  ·  {{ d.location }}</div>
<div class="sep"></div>
<h2>Summary</h2>
<div style="font-size:9.5pt;line-height:1.6;margin-bottom:10pt;">{{ d.summary }}</div>
<h2>Experience</h2>
{% for e in d.experience %}
<div class="row"><span class="job-title">{{ e.title }} — {{ e.company }}</span><span class="date">{{ e.date }}</span></div>
<ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
{% if not loop.last %}<div style="margin-bottom:7pt;"></div>{% endif %}
{% endfor %}
<h2>Skills</h2>
{% for s in d.skills %}<span class="chip">{{ s }}</span>{% endfor %}
</div></div></body></html>"""

# ── 9. Prism (sidebar) ────────────────────────────────────────────────────────
TEMPLATES["Prism"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { font-family: "Liberation Sans", Arial, sans-serif; }
.sidebar { float: left; width: 62mm; background: #f1f5f9; padding: 18mm 12mm; min-height: 297mm; }
.main { margin-left: 62mm; padding: 18mm 16mm; }
.sidebar h1 { font-size: 14pt; font-weight: 700; color: #1e293b; line-height: 1.2; }
.sidebar .sub { font-size: 9.5pt; color: #2563eb; margin-top: 3pt; }
.accent { width: 24pt; height: 2pt; background: #2563eb; margin: 7pt 0; }
.contact { font-size: 8.5pt; color: #475569; line-height: 1.9; }
.s-head { font-size: 7.5pt; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 1.5pt; margin: 12pt 0 4pt; }
.s-rule { border-top: 0.75pt solid #cbd5e1; margin-bottom: 5pt; }
.s-item { font-size: 9pt; color: #334155; margin-bottom: 3pt; }
.s-item::before { content: "▸  "; color: #2563eb; }
h2 { font-size: 8pt; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 1.5pt; margin: 10pt 0 3pt; }
.m-rule { border-top: 0.75pt solid #e2e8f0; margin-bottom: 6pt; }
.row { display: flex; justify-content: space-between; align-items: baseline; }
.job-title { font-size: 10.5pt; font-weight: 600; color: #1e293b; }
.co { font-size: 9pt; color: #2563eb; margin: 1pt 0 3pt; }
.date { font-size: 8.5pt; color: #94a3b8; }
li { font-size: 9pt; color: #475569; padding-left: 8pt; margin-top: 1.5pt; }
li::before { content: "•  "; }
</style></head><body><div class="page">
<div class="sidebar">
  <h1>{{ d.name }}</h1><div class="sub">{{ d.title }}</div>
  <div class="accent"></div>
  <div class="contact">{{ d.email }}<br>{{ d.phone }}<br>{{ d.location }}{% if d.linkedin %}<br>{{ d.linkedin }}{% endif %}</div>
  <div class="s-head">Skills</div><div class="s-rule"></div>
  {% for s in d.skills %}<div class="s-item">{{ s }}</div>{% endfor %}
  <div class="s-head">Education</div><div class="s-rule"></div>
  {% for e in d.education %}<div style="font-size:9pt;color:#334155;line-height:1.6;"><strong>{{ e.degree }}</strong><br><span style="color:#64748b;">{{ e.school }}</span><br><span style="color:#94a3b8;">{{ e.year }}</span></div>{% endfor %}
</div>
<div class="main">
  <h2>Profile</h2><div class="m-rule"></div>
  <div style="font-size:9.5pt;line-height:1.6;color:#374151;margin-bottom:12pt;">{{ d.summary }}</div>
  <h2>Experience</h2><div class="m-rule"></div>
  {% for e in d.experience %}
  <div class="row"><span class="job-title">{{ e.title }}</span><span class="date">{{ e.date }}</span></div>
  <div class="co">{{ e.company }}</div>
  <ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
  {% if not loop.last %}<div style="margin-bottom:8pt;"></div>{% endif %}
  {% endfor %}
</div>
</div></body></html>"""

# ── 10. Vivid (purple sidebar) ────────────────────────────────────────────────
TEMPLATES["Vivid"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { font-family: "Liberation Sans", Arial, sans-serif; }
.sidebar { float: left; width: 58mm; background: #7c3aed; padding: 18mm 11mm; min-height: 297mm; }
.main { margin-left: 58mm; padding: 18mm 16mm; }
.avatar { width: 38pt; height: 38pt; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; margin-bottom: 10pt; }
.avatar-text { font-size: 16pt; font-weight: 700; color: #fff; text-align: center; padding-top: 5pt; }
.sidebar h1 { font-size: 13pt; font-weight: 700; color: #fff; line-height: 1.3; }
.sidebar .sub { font-size: 9pt; color: #c4b5fd; margin-top: 3pt; }
.sep { border-top: 0.75pt solid rgba(255,255,255,0.2); margin: 10pt 0; }
.contact { font-size: 8.5pt; color: #ddd6fe; line-height: 1.9; }
.s-head { font-size: 7.5pt; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 1.5pt; margin: 10pt 0 4pt; }
.s-item { font-size: 9pt; color: #ede9fe; margin-bottom: 3pt; }
.s-item::before { content: "▸  "; }
h2 { font-size: 8pt; font-weight: 700; color: #7c3aed; text-transform: uppercase; letter-spacing: 1.5pt; margin: 10pt 0 3pt; }
.m-rule { border-top: 1pt solid #ede9fe; margin-bottom: 6pt; }
.row { display: flex; justify-content: space-between; }
.job-title { font-size: 10.5pt; font-weight: 600; }
.co { font-size: 9pt; color: #7c3aed; margin: 1pt 0 3pt; }
.date { font-size: 8.5pt; color: #94a3b8; }
li { font-size: 9pt; color: #475569; padding-left: 8pt; margin-top: 1.5pt; }
li::before { content: "•  "; }
</style></head><body><div class="page">
<div class="sidebar">
  <div class="avatar"><div class="avatar-text">{{ d.name[0] }}</div></div>
  <h1>{{ d.name }}</h1><div class="sub">{{ d.title }}</div>
  <div class="sep"></div>
  <div class="contact">{{ d.email }}<br>{{ d.phone }}<br>{{ d.location }}</div>
  <div class="s-head">Skills</div>
  {% for s in d.skills %}<div class="s-item">{{ s }}</div>{% endfor %}
  <div class="s-head">Education</div>
  {% for e in d.education %}<div style="font-size:8.5pt;color:#ddd6fe;line-height:1.6;"><strong style="color:#fff;">{{ e.degree }}</strong><br>{{ e.school }} · {{ e.year }}</div>{% endfor %}
</div>
<div class="main">
  <h2>Profile</h2><div class="m-rule"></div>
  <div style="font-size:9.5pt;line-height:1.6;color:#374151;margin-bottom:12pt;">{{ d.summary }}</div>
  <h2>Experience</h2><div class="m-rule"></div>
  {% for e in d.experience %}
  <div class="row"><span class="job-title">{{ e.title }}</span><span class="date">{{ e.date }}</span></div>
  <div class="co">{{ e.company }}</div>
  <ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
  {% if not loop.last %}<div style="margin-bottom:8pt;"></div>{% endif %}
  {% endfor %}
</div>
</div></body></html>"""

# ── Remaining templates (Chronicle, Summit, Symmetry, Scholar, Luxe) use simpler variants ──

TEMPLATES["Chronicle"] = TEMPLATES["Horizon"].replace("#1d4ed8", "#2563eb").replace("Profile", "About")
TEMPLATES["Summit"] = TEMPLATES["Cambridge"].replace("Liberation Serif", "Liberation Sans").replace("#1f2937", "#1e293b")
TEMPLATES["Symmetry"] = TEMPLATES["Admiral"].replace("#1e3a5f", "#0f172a").replace("#3b5998", "#374151")
TEMPLATES["Scholar"] = TEMPLATES["Prestige"]  # same serif formal style
TEMPLATES["Luxe"] = """<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
""" + _BASE + """
.page { padding: 24mm 26mm; font-family: "Liberation Serif", Georgia, serif; background: #fffdf5; }
h1 { font-size: 20pt; font-weight: 700; letter-spacing: 1.5pt; text-align: center; text-transform: uppercase; color: #1c1917; }
.sub { font-size: 10.5pt; color: #b45309; letter-spacing: 1pt; text-align: center; margin-top: 4pt; }
.deco { text-align: center; color: #b45309; font-size: 12pt; margin: 8pt 0; }
.contact { font-size: 9pt; color: #78716c; text-align: center; margin-bottom: 16pt; }
h2 { font-size: 7.5pt; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 2.5pt; margin: 10pt 0 3pt; }
.gold-rule { border-top: 0.75pt solid #b45309; opacity: 0.4; margin-bottom: 7pt; }
.row { display: flex; justify-content: space-between; }
.job-title { font-size: 10.5pt; font-weight: 700; color: #1c1917; }
.co { font-size: 9.5pt; font-style: italic; color: #78716c; margin: 1pt 0 3pt; }
.date { font-size: 9pt; font-style: italic; color: #78716c; }
li { font-size: 9.5pt; color: #57534e; padding-left: 12pt; margin-top: 2pt; }
li::before { content: "•  "; }
</style></head><body><div class="page">
<h1>{{ d.name }}</h1>
<div class="sub">{{ d.title }}</div>
<div class="deco">— ✦ —</div>
<div class="contact">{{ d.email }}  ·  {{ d.phone }}  ·  {{ d.location }}</div>
<h2>Professional Profile</h2><div class="gold-rule"></div>
<div style="font-size:9.5pt;line-height:1.8;font-style:italic;color:#44403c;margin-bottom:10pt;">{{ d.summary }}</div>
<h2>Career History</h2><div class="gold-rule"></div>
{% for e in d.experience %}
<div class="row"><span class="job-title">{{ e.title }}  ·  {{ e.company }}</span><span class="date">{{ e.date }}</span></div>
<ul>{% for b in e.bullets %}<li>{{ b }}</li>{% endfor %}</ul>
{% if not loop.last %}<div style="margin-bottom:8pt;"></div>{% endif %}
{% endfor %}
<h2>Core Expertise</h2><div class="gold-rule"></div>
<div style="font-size:9.5pt;line-height:2;color:#44403c;">{{ d.skills | join("   ·   ") }}</div>
</div></body></html>"""


def get_template(key: str) -> str:
    """Return the Jinja2 HTML template string for the given key."""
    return TEMPLATES.get(key, TEMPLATES["Cambridge"])
