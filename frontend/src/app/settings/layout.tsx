"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { href: "/settings/overview",    label: "Overview" },
    { href: "/settings/plan",        label: "Plan & Usage" },
    { href: "/settings/professions", label: "Profession Profiles" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <AuthGuard />
      {/* Nav — same max-w-4xl container as all other pages */}
      <header className="w-full bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-3 sm:py-4 flex items-center gap-4 sm:gap-6">
          <Link href="/" className="text-xl font-bold text-brand-600 shrink-0">
            TailorMyCv
          </Link>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide hidden sm:inline">
            Settings
          </span>
          <nav className="flex gap-4 ml-auto sm:ml-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                  pathname === item.href
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-5 sm:px-6 py-6 sm:py-10">{children}</main>
    </div>
  );
}
