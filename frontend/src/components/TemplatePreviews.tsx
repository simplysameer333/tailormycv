"use client";
import React from "react";
import Link from "next/link";
import { FiCheckCircle, FiArrowRight, FiLock } from "react-icons/fi";
import clsx from "clsx";

// ── Preview props ─────────────────────────────────────────────────────────────

export interface PreviewProps {
  name?: string;
  title?: string;
}

const DEFAULT_NAME  = "Alex Johnson";
const DEFAULT_TITLE = "Senior Software Engineer";

// ── 15 template preview components ───────────────────────────────────────────

export function CleanPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1.5 font-sans text-[5px] leading-tight select-none overflow-hidden">
      <div className="font-bold text-[8px] text-gray-900">{name}</div>
      <div className="text-gray-500 text-[4.5px]">alex@email.com · +44 7700 900000 · London</div>
      <div className="border-t border-gray-300 mt-0.5" />
      <div className="font-bold text-gray-800 uppercase tracking-wide text-[5px] mt-0.5">Professional Summary</div>
      <div className="border-t border-gray-300" />
      <div className="text-gray-600">{title} with 8+ years building scalable distributed systems. Led teams delivering $500K+ savings.</div>
      <div className="font-bold text-gray-800 uppercase tracking-wide text-[5px] mt-1">Experience</div>
      <div className="border-t border-gray-300" />
      <div className="flex justify-between"><span className="font-semibold text-gray-700">{title} — Google</span><span className="text-gray-400">2020–Present</span></div>
      <div className="text-gray-600 pl-1">• Led migration reducing latency by 40%</div>
      <div className="text-gray-600 pl-1">• Built systems serving 50M+ daily users</div>
      <div className="font-bold text-gray-800 uppercase tracking-wide text-[5px] mt-1">Skills</div>
      <div className="border-t border-gray-300" />
      <div className="text-gray-600">Python · TypeScript · AWS · PostgreSQL · Kubernetes</div>
    </div>
  );
}

export function ModernPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1 font-sans text-[5px] leading-tight select-none overflow-hidden">
      <div className="font-bold text-[10px] text-[#2B579A]">{name}</div>
      <div className="text-[#0D9488] text-[4.5px]">alex@email.com · +44 7700 900000 · London · linkedin.com/in/alex</div>
      <div className="border-t-2 border-[#2B579A] mt-1 mb-0.5" />
      <div className="font-bold text-[#2B579A] text-[5.5px]">Professional Summary</div>
      <div className="border-t border-[#2B579A] mb-0.5" />
      <div className="text-gray-700">{title} · 8+ years building scalable distributed systems.</div>
      <div className="font-bold text-[#2B579A] text-[5.5px] mt-1">Experience</div>
      <div className="border-t border-[#2B579A] mb-0.5" />
      <div className="flex justify-between text-[4.5px]"><span className="font-semibold text-gray-800">{title} · Google</span><span className="text-gray-400 italic">2020–Present</span></div>
      <div className="text-gray-700 pl-1">• Led migration reducing latency 40%</div>
      <div className="text-gray-700 pl-1">• Systems serving 50M+ daily users</div>
      <div className="font-bold text-[#2B579A] text-[5.5px] mt-1">Skills</div>
      <div className="border-t border-[#2B579A] mb-0.5" />
      <div className="text-gray-700">Python · TypeScript · AWS · PostgreSQL · Kubernetes</div>
    </div>
  );
}

export function ExecutivePreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1 font-serif text-[5px] leading-tight select-none overflow-hidden">
      <div className="border-t-2 border-gray-900 mb-0.5" />
      <div className="font-bold text-[8px] text-gray-900 text-center tracking-widest uppercase">{name}</div>
      <div className="text-gray-500 text-center text-[4.5px]">alex@email.com — +44 7700 900000 — London</div>
      <div className="border-t-2 border-gray-900 mt-1 mb-0.5" />
      <div className="font-bold text-gray-900 uppercase tracking-widest text-[4.5px]">Professional Summary</div>
      <div className="border-t border-b border-gray-600 py-0.5 mb-0.5" />
      <div className="text-gray-700">{title}. 8+ years in high-stakes enterprise environments. Led teams delivering $500K+ savings.</div>
      <div className="font-bold text-gray-900 uppercase tracking-widest text-[4.5px] mt-1">Professional Experience</div>
      <div className="border-t border-b border-gray-600 py-0.5 mb-0.5" />
      <div className="font-bold text-gray-800 text-[5px]">{title} — Google</div>
      <div className="text-gray-500 italic text-[4.5px]">2020 – Present</div>
      <div className="text-gray-700 pl-1">• Led 50TB database migration, zero downtime</div>
      <div className="text-gray-700 pl-1">• Reduced regional latency by 40%</div>
    </div>
  );
}

export function BoldPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1.5 font-sans text-[5px] leading-tight select-none overflow-hidden">
      <div className="font-black text-[10px] text-gray-950 tracking-tight uppercase">{name}</div>
      <div className="h-0.5 w-8 bg-orange-500 mb-0.5" />
      <div className="text-gray-500 text-[4.5px]">{title} · alex@email.com · London</div>
      <div className="font-bold text-orange-500 uppercase text-[5px] mt-1 tracking-widest">Summary</div>
      <div className="text-gray-700">High-impact {title.toLowerCase()} · 8+ years · Led 4 engineering teams.</div>
      <div className="font-bold text-orange-500 uppercase text-[5px] mt-1 tracking-widest">Experience</div>
      <div className="flex justify-between text-[4.5px] mt-0.5"><span className="font-bold text-gray-800">{title}</span><span className="text-gray-400">Google · 2020–Now</span></div>
      <div className="text-gray-600 pl-1">• Improved latency 40%, 50M users served</div>
      <div className="text-gray-600 pl-1">• Saved $500K in infrastructure costs</div>
      <div className="font-bold text-orange-500 uppercase text-[5px] mt-1 tracking-widest">Skills</div>
      <div className="flex flex-wrap gap-1">
        {["Python","AWS","TypeScript","Kubernetes"].map(s => (
          <span key={s} className="bg-orange-50 text-orange-700 border border-orange-200 rounded px-1 text-[4px]">{s}</span>
        ))}
      </div>
    </div>
  );
}

export function MinimalPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white px-2.5 pt-3 flex flex-col gap-2 font-sans text-[5px] leading-tight select-none overflow-hidden">
      <div className="font-semibold text-[7px] text-gray-800 tracking-tight">{name}</div>
      <div className="text-gray-400 text-[4.5px]">alex@email.com · London · linkedin.com/in/alex</div>
      <div className="mt-1">
        <div className="text-gray-300 uppercase text-[4px] tracking-widest mb-0.5">About</div>
        <div className="text-gray-600">{title}. 8+ years. Distributed systems, cloud architecture.</div>
      </div>
      <div>
        <div className="text-gray-300 uppercase text-[4px] tracking-widest mb-0.5">Work</div>
        <div className="flex justify-between text-[4.5px]"><span className="text-gray-700">Google · {title}</span><span className="text-gray-300">2020–</span></div>
        <div className="text-gray-500 text-[4.5px] pl-1">Latency −40% · 50M users · $500K saved</div>
      </div>
      <div>
        <div className="text-gray-300 uppercase text-[4px] tracking-widest mb-0.5">Skills</div>
        <div className="text-gray-600">Python · AWS · TypeScript · PostgreSQL</div>
      </div>
    </div>
  );
}

export function NavyPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1 font-sans text-[5px] leading-tight select-none overflow-hidden">
      <div className="font-bold text-[8px] text-[#1e3a5f]">{name}</div>
      <div className="text-[#1e3a5f] opacity-70 text-[4.5px]">{title} · alex@email.com · London</div>
      <div className="border-t-2 border-[#1e3a5f] mt-1 mb-0.5" />
      <div className="font-bold text-[#1e3a5f] uppercase text-[4.5px] tracking-wide">Profile</div>
      <div className="text-gray-700">Results-driven {title.toLowerCase()} with 8+ years of enterprise experience.</div>
      <div className="font-bold text-[#1e3a5f] uppercase text-[4.5px] tracking-wide mt-1">Career History</div>
      <div className="border-t border-[#1e3a5f] mb-0.5" />
      <div className="flex justify-between"><span className="font-semibold text-gray-800 text-[4.5px]">Google · {title}</span><span className="text-gray-400 text-[4px]">2020–date</span></div>
      <div className="text-gray-600 pl-1">• Built low-latency infra for 50M users</div>
      <div className="text-gray-600 pl-1">• Saved $500K in cloud costs</div>
      <div className="font-bold text-[#1e3a5f] uppercase text-[4.5px] tracking-wide mt-1">Core Skills</div>
      <div className="border-t border-[#1e3a5f] mb-0.5" />
      <div className="text-gray-600">Python · AWS · TypeScript · Docker · Kubernetes</div>
    </div>
  );
}

export function TealPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1 font-sans text-[5px] leading-tight select-none overflow-hidden">
      <div className="font-bold text-[9px] text-[#0d9488]">{name}</div>
      <div className="text-gray-500 text-[4.5px]">{title} · alex@email.com · London</div>
      <div className="h-0.5 bg-[#0d9488] mt-1 mb-1" />
      <div className="font-semibold text-[#0d9488] text-[5px]">SUMMARY</div>
      <div className="text-gray-700">Versatile {title.toLowerCase()} delivering scalable cloud solutions for 8+ years.</div>
      <div className="font-semibold text-[#0d9488] text-[5px] mt-1">EXPERIENCE</div>
      <div className="h-px bg-[#0d9488] opacity-30 mb-0.5" />
      <div className="flex justify-between text-[4.5px]"><span className="font-semibold text-gray-800">{title} — Google</span><span className="text-gray-400">2020–Present</span></div>
      <div className="text-gray-600 pl-1">• Latency reduced 40%, 50M users served daily</div>
      <div className="text-gray-600 pl-1">• $500K infrastructure cost savings</div>
      <div className="font-semibold text-[#0d9488] text-[5px] mt-1">SKILLS</div>
      <div className="h-px bg-[#0d9488] opacity-30 mb-0.5" />
      <div className="flex flex-wrap gap-1">
        {["Python","AWS","TypeScript","K8s","Postgres"].map(s => (
          <span key={s} className="bg-teal-50 text-teal-700 rounded px-1 text-[4px]">{s}</span>
        ))}
      </div>
    </div>
  );
}

export function SidebarPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white flex text-[5px] leading-tight select-none overflow-hidden font-sans">
      {/* Left sidebar */}
      <div className="w-[35%] bg-[#f8fafc] border-r border-gray-200 p-2 flex flex-col gap-1.5">
        <div className="font-bold text-[7px] text-gray-900 leading-tight">{name}</div>
        <div className="h-0.5 w-6 bg-brand-500" />
        <div className="text-gray-500 text-[4px]">alex@email.com</div>
        <div className="text-gray-500 text-[4px]">+44 7700 900000</div>
        <div className="text-gray-500 text-[4px]">London, UK</div>
        <div className="font-semibold text-gray-700 uppercase text-[4px] tracking-wide mt-1">Skills</div>
        <div className="border-t border-gray-300" />
        {["Python","TypeScript","AWS","Docker","Kubernetes","PostgreSQL"].map(s=>(
          <div key={s} className="text-gray-600 text-[4px]">• {s}</div>
        ))}
        <div className="font-semibold text-gray-700 uppercase text-[4px] tracking-wide mt-1">Education</div>
        <div className="border-t border-gray-300" />
        <div className="text-gray-600 text-[4px]">BSc Computer Science</div>
        <div className="text-gray-400 text-[4px]">UCL · 2015</div>
      </div>
      {/* Main content */}
      <div className="flex-1 p-2 flex flex-col gap-1.5">
        <div className="text-gray-500 text-[4.5px]">{title}</div>
        <div className="font-bold text-gray-700 uppercase text-[4.5px] tracking-wide">Profile</div>
        <div className="border-t border-gray-200" />
        <div className="text-gray-600">8+ years building scalable distributed systems for global enterprises.</div>
        <div className="font-bold text-gray-700 uppercase text-[4.5px] tracking-wide mt-0.5">Experience</div>
        <div className="border-t border-gray-200" />
        <div className="font-semibold text-gray-800">{title} — Google</div>
        <div className="text-gray-400 text-[4px]">Sep 2020 – Present</div>
        <div className="text-gray-600">• Latency −40% · 50M users daily</div>
        <div className="text-gray-600">• $500K infra savings</div>
      </div>
    </div>
  );
}

export function CreativePreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white flex text-[5px] leading-tight select-none overflow-hidden font-sans">
      {/* Purple sidebar */}
      <div className="w-[32%] bg-[#7c3aed] p-2 flex flex-col gap-1.5">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-[8px]">
          {name.charAt(0)}
        </div>
        <div className="font-bold text-[6px] text-white leading-tight">{name}</div>
        <div className="text-purple-200 text-[4px]">{title}</div>
        <div className="h-px bg-white/20 mt-0.5" />
        <div className="text-purple-200 text-[4px]">alex@email.com</div>
        <div className="text-purple-200 text-[4px]">London, UK</div>
        <div className="font-semibold text-white text-[4px] uppercase tracking-wide mt-1">Skills</div>
        <div className="h-px bg-white/20" />
        {["Python","TypeScript","AWS","Docker"].map(s=>(
          <div key={s} className="text-purple-100 text-[4px]">▸ {s}</div>
        ))}
      </div>
      {/* Main content */}
      <div className="flex-1 p-2 flex flex-col gap-1.5">
        <div className="font-bold text-[#7c3aed] text-[6px]">Profile</div>
        <div className="h-0.5 bg-[#7c3aed] opacity-30" />
        <div className="text-gray-700">Creative {title.toLowerCase()} delivering impact at scale. 8+ years.</div>
        <div className="font-bold text-[#7c3aed] text-[6px] mt-1">Experience</div>
        <div className="h-0.5 bg-[#7c3aed] opacity-30" />
        <div className="font-semibold text-gray-800">{title} — Google</div>
        <div className="text-gray-400 text-[4px]">2020–Present</div>
        <div className="text-gray-600">• Latency −40%, 50M users</div>
        <div className="text-gray-600">• $500K cost savings</div>
        <div className="font-bold text-[#7c3aed] text-[6px] mt-1">Education</div>
        <div className="h-0.5 bg-[#7c3aed] opacity-30" />
        <div className="text-gray-700">BSc Computer Science · UCL · 2015</div>
      </div>
    </div>
  );
}

export function TimelinePreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1.5 font-sans text-[5px] leading-tight select-none overflow-hidden">
      <div className="font-bold text-[8px] text-gray-900">{name}</div>
      <div className="text-gray-500 text-[4.5px]">{title} · alex@email.com · London</div>
      <div className="border-t border-gray-200 mt-0.5" />
      <div className="font-bold text-gray-700 uppercase text-[4.5px] tracking-wide">Experience</div>
      {/* Timeline items */}
      <div className="flex gap-1.5 mt-0.5">
        <div className="flex flex-col items-center">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
          <div className="w-px flex-1 bg-gray-200" />
        </div>
        <div className="flex-1 pb-1">
          <div className="font-semibold text-gray-800">{title} — Google</div>
          <div className="text-gray-400 text-[4px]">2020 – Present</div>
          <div className="text-gray-600">• Latency −40% · 50M users</div>
        </div>
      </div>
      <div className="flex gap-1.5">
        <div className="flex flex-col items-center">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-gray-800">Senior Dev — Stripe</div>
          <div className="text-gray-400 text-[4px]">2017 – 2020</div>
          <div className="text-gray-600">• Built payment infra · 99.99% uptime</div>
        </div>
      </div>
      <div className="border-t border-gray-200 mt-0.5" />
      <div className="font-bold text-gray-700 uppercase text-[4.5px] tracking-wide">Skills</div>
      <div className="text-gray-600">Python · AWS · TypeScript · PostgreSQL · Docker</div>
    </div>
  );
}

export function BlockHeaderPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white flex flex-col font-sans text-[5px] leading-tight select-none overflow-hidden">
      {/* Full-width header block */}
      <div className="bg-[#1e293b] px-2.5 py-2 flex flex-col gap-0.5">
        <div className="font-bold text-[8px] text-white">{name}</div>
        <div className="text-slate-300 text-[4.5px]">{title}</div>
        <div className="text-slate-400 text-[4px]">alex@email.com · +44 7700 900000 · London</div>
      </div>
      <div className="px-2.5 pt-1.5 flex flex-col gap-1">
        <div className="font-bold text-[#1e293b] uppercase text-[4.5px] tracking-wide">Summary</div>
        <div className="h-px bg-[#1e293b] opacity-20" />
        <div className="text-gray-700">{title} · 8+ years · Enterprise cloud & distributed systems.</div>
        <div className="font-bold text-[#1e293b] uppercase text-[4.5px] tracking-wide mt-0.5">Experience</div>
        <div className="h-px bg-[#1e293b] opacity-20" />
        <div className="flex justify-between text-[4.5px]"><span className="font-semibold text-gray-800">{title} — Google</span><span className="text-gray-400">2020–Now</span></div>
        <div className="text-gray-600 pl-1">• Latency −40% · 50M daily users</div>
        <div className="text-gray-600 pl-1">• $500K infrastructure savings</div>
        <div className="font-bold text-[#1e293b] uppercase text-[4.5px] tracking-wide mt-0.5">Skills</div>
        <div className="h-px bg-[#1e293b] opacity-20" />
        <div className="text-gray-600">Python · TypeScript · AWS · Docker · Kubernetes</div>
      </div>
    </div>
  );
}

export function SplitPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2 flex flex-col font-sans text-[5px] leading-tight select-none overflow-hidden">
      <div className="font-bold text-[9px] text-gray-900 text-center">{name}</div>
      <div className="text-center text-gray-500 text-[4.5px] mb-1">{title} · alex@email.com · London</div>
      <div className="border-t border-gray-300 mb-1" />
      <div className="flex gap-2 flex-1">
        {/* Left column */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="font-bold text-gray-700 uppercase text-[4.5px] tracking-wide">Experience</div>
          <div className="font-semibold text-gray-800">{title}</div>
          <div className="text-gray-400 text-[4px]">Google · 2020–Now</div>
          <div className="text-gray-600">• Latency −40%</div>
          <div className="text-gray-600">• 50M users daily</div>
          <div className="font-semibold text-gray-800 mt-0.5">Senior Dev</div>
          <div className="text-gray-400 text-[4px]">Stripe · 2017–2020</div>
          <div className="text-gray-600">• Payment infra</div>
        </div>
        {/* Divider */}
        <div className="w-px bg-gray-200" />
        {/* Right column */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="font-bold text-gray-700 uppercase text-[4.5px] tracking-wide">Skills</div>
          {["Python","TypeScript","AWS","Docker","K8s","PostgreSQL"].map(s=>(
            <div key={s} className="flex items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-brand-400" />
              <span className="text-gray-600">{s}</span>
            </div>
          ))}
          <div className="font-bold text-gray-700 uppercase text-[4.5px] tracking-wide mt-1">Education</div>
          <div className="text-gray-700">BSc CS · UCL</div>
          <div className="text-gray-400 text-[4px]">2015</div>
        </div>
      </div>
    </div>
  );
}

export function AcademicPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2.5 flex flex-col gap-1.5 font-serif text-[5px] leading-tight select-none overflow-hidden">
      <div className="text-center">
        <div className="font-bold text-[7px] text-gray-900 tracking-wide">{name}</div>
        <div className="text-gray-600 text-[4.5px]">{title}</div>
        <div className="text-gray-500 text-[4px]">alex@email.com · London · linkedin.com/in/alex</div>
      </div>
      <div className="border-t-2 border-b border-gray-900 py-0.5 mt-0.5">
        <div className="font-bold text-gray-900 uppercase tracking-wider text-[4.5px] text-center">Research & Professional Summary</div>
      </div>
      <div className="text-gray-700 text-justify">Accomplished {title.toLowerCase()} with 8+ years of industry research and engineering. Published 3 white papers.</div>
      <div className="border-t border-gray-400 mt-0.5">
        <div className="font-bold text-gray-900 uppercase tracking-wider text-[4.5px] mt-0.5">Professional Experience</div>
      </div>
      <div className="font-bold text-gray-800 text-[4.5px]">{title} · Google · 2020–Present</div>
      <div className="text-gray-700 pl-1">• Led distributed systems research reducing P99 latency 40%</div>
      <div className="border-t border-gray-400 mt-0.5">
        <div className="font-bold text-gray-900 uppercase tracking-wider text-[4.5px] mt-0.5">Education</div>
      </div>
      <div className="text-gray-800">MSc · Computer Science · Imperial College · 2015</div>
      <div className="text-gray-800">BSc · Computer Science · UCL · 2013</div>
    </div>
  );
}

export function CompactPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-white p-2 flex flex-col gap-0.5 font-sans text-[4.5px] leading-snug select-none overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-gray-400 pb-0.5 mb-0.5">
        <div className="font-bold text-[7px] text-gray-900">{name}</div>
        <div className="text-gray-500">alex@email.com · +44 7700 · London</div>
      </div>
      <div className="font-bold text-gray-800 uppercase text-[4px] tracking-widest">Summary</div>
      <div className="text-gray-700">{title} · 8yr · Cloud · Distributed systems · Led 4 teams · $500K savings</div>
      <div className="font-bold text-gray-800 uppercase text-[4px] tracking-widest mt-0.5">Experience</div>
      <div className="text-gray-700"><span className="font-semibold">Google</span> · {title} · 2020–date · Latency −40%, 50M users, $500K saved</div>
      <div className="text-gray-700"><span className="font-semibold">Stripe</span> · Sr Dev · 2017–2020 · Payment infra, 99.99% uptime, 200M tx/day</div>
      <div className="text-gray-700"><span className="font-semibold">Genpact</span> · Dev · 2015–2017 · Cloud migration, microservices, $1M saving</div>
      <div className="font-bold text-gray-800 uppercase text-[4px] tracking-widest mt-0.5">Skills</div>
      <div className="text-gray-700">Python · TypeScript · Java · AWS · GCP · Docker · K8s · PostgreSQL · MongoDB · Kafka</div>
      <div className="font-bold text-gray-800 uppercase text-[4px] tracking-widest mt-0.5">Education</div>
      <div className="text-gray-700">MSc CS · Imperial · 2015 · BSc CS · UCL · 2013</div>
    </div>
  );
}

export function ElegantPreview({ name = DEFAULT_NAME, title = DEFAULT_TITLE }: PreviewProps) {
  return (
    <div className="w-full h-full bg-[#fefcf3] p-2.5 flex flex-col gap-1.5 font-serif text-[5px] leading-tight select-none overflow-hidden">
      <div className="text-center">
        <div className="font-bold text-[9px] text-gray-800 tracking-widest">{name.toUpperCase()}</div>
        <div className="text-[#b45309] text-[4.5px] tracking-wide">{title}</div>
      </div>
      <div className="flex items-center gap-1 my-0.5">
        <div className="flex-1 h-px bg-[#b45309] opacity-40" />
        <div className="w-1 h-1 rounded-full bg-[#b45309] opacity-60" />
        <div className="flex-1 h-px bg-[#b45309] opacity-40" />
      </div>
      <div className="text-center text-gray-500 text-[4px]">alex@email.com · London · linkedin.com/in/alex</div>
      <div className="mt-0.5">
        <div className="font-bold text-[#b45309] text-[5px] uppercase tracking-widest mb-0.5">Professional Profile</div>
        <div className="text-gray-700 text-justify">Distinguished {title.toLowerCase()} with 8+ years of expertise in enterprise architecture.</div>
      </div>
      <div>
        <div className="font-bold text-[#b45309] text-[5px] uppercase tracking-widest mb-0.5">Career History</div>
        <div className="flex items-center gap-1"><div className="flex-1 h-px bg-[#b45309] opacity-20" /></div>
        <div className="font-semibold text-gray-800">{title} · Google · 2020–Present</div>
        <div className="text-gray-600 pl-1">• Architected systems serving 50M+ users</div>
        <div className="text-gray-600 pl-1">• Delivered $500K in annualised savings</div>
      </div>
    </div>
  );
}

// ── Template metadata ─────────────────────────────────────────────────────────

export type PageCount = 1 | 2;

export interface TemplateInfo {
  key: string;
  name: string;
  component: React.FC<PreviewProps>;
  traits: string[];
  bestFor: string;
  description: string;
  pages: PageCount;
  tier: "free" | "plus";   // "free" = visible to all, "plus" = Plus/Pro only
}

export const ALL_TEMPLATES: TemplateInfo[] = [
  // ── Free tier (first 5) ──
  { key: "Clean",        name: "Clean",         component: CleanPreview,       traits: ["ATS-safe","Monochrome","All industries"], bestFor: "All industries",         description: "Minimal single-column layout maximising ATS compatibility.",                    pages: 1, tier: "free" },
  { key: "Modern",       name: "Modern",        component: ModernPreview,      traits: ["Blue accents","Contemporary","Tech"],     bestFor: "Tech, product, design",  description: "Bold blue section headers with strong visual hierarchy.",                      pages: 2, tier: "free" },
  { key: "Executive",    name: "Executive",     component: ExecutivePreview,   traits: ["Serif","Centred","Senior roles"],         bestFor: "Finance, law, C-suite",  description: "Authoritative serif typeface with centred name block.",                        pages: 2, tier: "free" },
  { key: "Navy",         name: "Navy Pro",      component: NavyPreview,        traits: ["Navy blue","Formal","Professional"],      bestFor: "Banking, consulting",    description: "Navy blue accents with a polished, formal presentation.",                      pages: 2, tier: "free" },
  { key: "Compact",      name: "Compact",       component: CompactPreview,     traits: ["Dense","1-page","High experience"],       bestFor: "Senior / 1-page CVs",    description: "Ultra-dense layout fitting maximum experience on one page.",                   pages: 1, tier: "free" },
  // ── Plus/Pro tier ──
  { key: "Bold",         name: "Bold Impact",   component: BoldPreview,        traits: ["Orange accent","Strong","Standout"],      bestFor: "Sales, startups",        description: "High-contrast design with strong orange accents that commands attention.",    pages: 1, tier: "plus" },
  { key: "Minimal",      name: "Minimal",       component: MinimalPreview,     traits: ["Whitespace","Ultra-clean","Modern"],      bestFor: "UX, design, research",   description: "Sparse layout with abundant whitespace — lets content speak for itself.",     pages: 1, tier: "plus" },
  { key: "Teal",         name: "Teal Fresh",    component: TealPreview,        traits: ["Teal","Contemporary","Approachable"],     bestFor: "Healthcare, education",  description: "Fresh teal colour scheme that feels modern and approachable.",                pages: 2, tier: "plus" },
  { key: "Sidebar",      name: "Sidebar Pro",   component: SidebarPreview,     traits: ["Two-column","Sidebar","Skills-first"],    bestFor: "Tech, data science",     description: "Left sidebar for contact & skills with main experience panel.",              pages: 2, tier: "plus" },
  { key: "Creative",     name: "Creative",      component: CreativePreview,    traits: ["Purple","Sidebar","Distinctive"],         bestFor: "Design, marketing",      description: "Bold purple sidebar for a creative first impression.",                        pages: 2, tier: "plus" },
  { key: "Timeline",     name: "Timeline",      component: TimelinePreview,    traits: ["Dot timeline","Modern","Narrative"],      bestFor: "Product, operations",    description: "Left-side timeline dots make career progression immediately clear.",          pages: 2, tier: "plus" },
  { key: "BlockHeader",  name: "Block Header",  component: BlockHeaderPreview, traits: ["Dark header","Contrast","Impactful"],     bestFor: "Engineering, fintech",   description: "Full-width dark header block creates strong immediate contrast.",            pages: 2, tier: "plus" },
  { key: "Split",        name: "Two Column",    component: SplitPreview,       traits: ["Equal columns","Balanced","Structured"],  bestFor: "PM, strategy",           description: "Equal left/right columns balancing experience and skills.",                   pages: 2, tier: "plus" },
  { key: "Academic",     name: "Academic",      component: AcademicPreview,    traits: ["Serif","Formal","Research"],              bestFor: "Academia, research",     description: "Traditional academic formatting for research and scholarly roles.",           pages: 2, tier: "plus" },
  { key: "Elegant",      name: "Elegant",       component: ElegantPreview,     traits: ["Gold accent","Warm","Distinctive"],       bestFor: "Legal, luxury, arts",    description: "Warm gold decorative accents with cream background — memorable and refined.", pages: 2, tier: "plus" },
];

export const FREE_TEMPLATES  = ALL_TEMPLATES.filter(t => t.tier === "free");
export const PLUS_TEMPLATES  = ALL_TEMPLATES.filter(t => t.tier === "plus");

// ── Thumbnail card ────────────────────────────────────────────────────────────

export function TemplateThumbnail({
  info, isSelected, onClick, locked = false, previewName, previewTitle,
}: {
  info: TemplateInfo; isSelected: boolean; onClick: () => void;
  locked?: boolean; previewName?: string; previewTitle?: string;
}) {
  const Preview = info.component;
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={clsx(
        "relative card p-0 text-left transition overflow-hidden",
        locked ? "opacity-60 cursor-not-allowed" : "hover:shadow-lg",
        isSelected ? "ring-2 ring-brand-500 border-brand-400 shadow-md" : "border-slate-200 hover:border-brand-300",
      )}
    >
      {isSelected && !locked && (
        <div className="absolute top-2 right-2 z-10 bg-brand-500 rounded-full p-0.5">
          <FiCheckCircle className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      {locked && (
        <div className="absolute top-2 right-2 z-10 bg-slate-700/80 rounded-full p-1">
          <FiLock className="w-3 h-3 text-white" />
        </div>
      )}
      {/* Mini preview */}
      <div className="h-44 border-b border-slate-100 overflow-hidden bg-white">
        <Preview name={previewName} title={previewTitle} />
      </div>
      {/* Footer */}
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="font-semibold text-sm text-slate-900">{info.name}</p>
          <span className={clsx("text-[9px] px-1.5 py-0.5 rounded-full font-semibold",
            info.pages === 1 ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
          )}>
            {info.pages === 1 ? "1-page" : "2-page"}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-snug text-left">{info.description}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {info.traits.map(t => (
            <span key={t} className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{t}</span>
          ))}
        </div>
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

// ── Large selected-template preview panel ─────────────────────────────────────

export function LargeTemplatePreview({ info, previewName, previewTitle }: {
  info: TemplateInfo; previewName?: string; previewTitle?: string;
}) {
  const Preview = info.component;
  return (
    <div className="flex flex-col sm:flex-row gap-5 items-start card border-brand-200 bg-brand-50/30 p-4">
      {/* A4-ratio scaled preview */}
      <div className="shrink-0 w-full sm:w-44">
        <div className="relative w-full rounded-lg border border-slate-200 bg-white shadow-md overflow-hidden" style={{ paddingTop: "141%" }}>
          <div className="absolute inset-0">
            <div className="w-full h-full" style={{ transform: "scale(1.5)", transformOrigin: "top left", width: "66.6%", height: "66.6%" }}>
              <Preview name={previewName} title={previewTitle} />
            </div>
          </div>
        </div>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h3 className="font-bold text-slate-900 text-lg">{info.name}</h3>
          <span className="flex items-center gap-1 text-xs font-semibold text-brand-600 bg-brand-100 rounded-full px-2 py-0.5">
            <FiCheckCircle className="w-3 h-3" /> Selected
          </span>
          <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full",
            info.pages === 1 ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
          )}>
            {info.pages === 1 ? "1-page" : "2-page"}
          </span>
        </div>
        <p className="text-sm text-slate-600 mb-2">{info.description}</p>
        <p className="text-xs text-slate-500 mb-3">
          <span className="font-semibold">Best for:</span> {info.bestFor}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {info.traits.map(t => (
            <span key={t} className="text-xs bg-white border border-slate-200 text-slate-600 rounded-full px-2.5 py-0.5">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CV Score template suggestions (3 shown: mix 1-page + 2-page) ─────────────

export function TemplateSuggestions() {
  // Show 4: the 2 one-page templates + 2 two-page templates
  const shown = [
    ALL_TEMPLATES.find(t => t.key === "Clean")!,
    ALL_TEMPLATES.find(t => t.key === "Compact")!,
    ALL_TEMPLATES.find(t => t.key === "Modern")!,
    ALL_TEMPLATES.find(t => t.key === "Sidebar")!,
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-slate-900 text-lg">See your CV in our templates</h3>
        <p className="text-sm text-slate-500 mt-1">
          Choose between 1-page and 2-page layouts. Our AI builder applies your template when tailoring for a specific job.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {shown.map((info) => {
          const Preview = info.component;
          return (
            <div key={info.key} className="card p-0 overflow-hidden hover:shadow-lg hover:border-brand-300 transition">
              <div className="h-40 border-b border-slate-100 overflow-hidden bg-white relative">
                <Preview />
                <div className={clsx(
                  "absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                  info.pages === 1 ? "bg-blue-500 text-white" : "bg-slate-700 text-white"
                )}>
                  {info.pages === 1 ? "1-Page" : "2-Page"}
                </div>
              </div>
              <div className="p-2.5">
                <p className="font-semibold text-xs text-slate-900">{info.name}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{info.bestFor}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-2xl px-5 py-4">
        <div>
          <p className="font-semibold text-slate-800 text-sm">Tailor your CV and choose from 15 templates</p>
          <p className="text-xs text-slate-500 mt-0.5">Upload your CV, add a job description, pick a style — done in minutes.</p>
        </div>
        <Link href="/builder/upload" className="btn-primary text-sm px-4 py-2 shrink-0 ml-4 flex items-center gap-1.5">
          Try it free <FiArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
