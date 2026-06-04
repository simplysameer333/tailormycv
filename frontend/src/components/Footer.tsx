import Link from "next/link";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white mt-16">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">

          <div className="col-span-2 sm:col-span-1">
            <Logo />
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              AI-powered resume builder that tailors your CV to every job description using multi-model quality evaluation.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Tools</p>
            <ul className="space-y-2">
              <li><Link href="/cv-score" className="text-sm text-slate-600 hover:text-brand-600 transition">CV Score</Link></li>
              <li><Link href="/builder/upload" className="text-sm text-slate-600 hover:text-brand-600 transition">CV Builder</Link></li>
              <li><Link href="/jobs"            className="text-sm text-slate-600 hover:text-brand-600 transition">Find Jobs</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Account</p>
            <ul className="space-y-2">
              <li><Link href="/auth/register"    className="text-sm text-slate-600 hover:text-brand-600 transition">Sign up free</Link></li>
              <li><Link href="/auth/login"        className="text-sm text-slate-600 hover:text-brand-600 transition">Sign in</Link></li>
              <li><Link href="/settings/overview" className="text-sm text-slate-600 hover:text-brand-600 transition">Settings</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Plans</p>
            <ul className="space-y-2">
              <li><Link href="/auth/register?plan=free" className="text-sm text-slate-600 hover:text-brand-600 transition">Free</Link></li>
              <li><Link href="/auth/register?plan=plus" className="text-sm text-slate-600 hover:text-brand-600 transition">Plus</Link></li>
              <li><Link href="/auth/register?plan=pro"  className="text-sm text-slate-600 hover:text-brand-600 transition">Pro</Link></li>
            </ul>
          </div>

        </div>

        <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} TailorMyCv. All rights reserved.</p>
          <p className="text-xs text-slate-400">
            Built with multi-model AI
          </p>
        </div>
      </div>
    </footer>
  );
}
