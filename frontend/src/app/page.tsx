"use client";
import Link from "next/link";
import { FiUpload, FiZap, FiDownload } from "react-icons/fi";
import Navbar from "@/components/Navbar";
import PricingTiers from "@/components/PricingTiers";

const steps = [
  {
    icon: FiUpload,
    title: "Upload Your Resume",
    desc: "PDF or DOCX — we extract everything automatically.",
    iconBg: "bg-brand-100",
    iconColor: "text-brand-600",
  },
  {
    icon: FiZap,
    title: "Multi-Agent AI Tailoring",
    desc: "AI agents collaboratively rewrite and review your resume until it's perfectly matched to the role.",
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
  },
  {
    icon: FiDownload,
    title: "Download",
    desc: "Get a polished .docx in your chosen template, ready to send.",
    iconBg: "bg-brand-100",
    iconColor: "text-brand-600",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col">

      <Navbar />

      {/* ── Hero ── */}
      <section className="flex flex-1 flex-col items-center justify-center text-center px-4 sm:px-6 py-16 sm:py-24 bg-gradient-to-b from-brand-50 via-white to-teal-50">
        <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-teal-200 mb-6">
          <FiZap className="w-3.5 h-3.5" /> Multi-Agent AI · Built for Job Seekers
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 max-w-3xl leading-tight">
          Land More Interviews with an{" "}
          <span className="text-teal-500">AI-Tailored</span> Resume
        </h1>
        <p className="mt-4 sm:mt-6 text-base sm:text-xl text-slate-600 max-w-2xl">
          Paste a job description, upload your resume, and let a multi-agent AI pipeline
          rewrite, review, and polish it — crafted specifically for the role you want.
        </p>
        <div className="mt-8 sm:mt-10">
          <Link href="/builder/upload" className="btn-primary text-base px-8 py-3">
            Start for Free
          </Link>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-14 sm:py-20 px-4 sm:px-6 bg-white">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-slate-900 mb-10 sm:mb-12">
          How It Works
        </h2>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {steps.map(({ icon: Icon, title, desc, iconBg, iconColor }, i) => (
            <div key={i} className="card flex flex-col items-center text-center gap-4">
              <div className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-7 h-7 ${iconColor}`} />
              </div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-slate-500 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-14 sm:py-20 px-4 sm:px-6 bg-slate-50 border-t border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Simple, transparent pricing</h2>
            <p className="mt-3 text-slate-500 text-sm sm:text-base max-w-xl mx-auto">
              Start for free — no credit card required. Upgrade any time to unlock job search, resume library, and advanced AI features.
            </p>
          </div>
          <PricingTiers />
        </div>
      </section>

      <footer className="text-center py-6 text-sm text-slate-400 border-t border-slate-200 px-4">
        © {new Date().getFullYear()} TailorMyCv · AI-powered resume tailoring
      </footer>
    </main>
  );
}
