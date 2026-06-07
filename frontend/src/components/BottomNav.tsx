"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiCheckSquare, FiEdit2, FiMail, FiBriefcase, FiUser } from "react-icons/fi";
import { useAuth } from "@/lib/useAuth";

const TABS = [
  { href: "/cv-score",     icon: FiCheckSquare, label: "CV Score"      },
  { href: "/builder/upload", icon: FiEdit2,     label: "Builder"       },
  { href: "/cover-letter", icon: FiMail,        label: "Cover Letter"  },
  { href: "/jobs",         icon: FiBriefcase,   label: "Jobs"          },
  { href: "/profile",      icon: FiUser,        label: "Profile"       },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { status } = useAuth();

  // Only show on authenticated pages; hide on auth flow
  if (status !== "authenticated") return null;

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 safe-area-inset-bottom">
      <div className="flex items-stretch h-16">
        {TABS.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active
                  ? "text-brand-600 bg-brand-50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "text-brand-600" : ""}`} />
              <span className="truncate max-w-[52px] text-center leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
