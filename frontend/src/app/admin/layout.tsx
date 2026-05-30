import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import { FiShield } from "react-icons/fi";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AuthGuard />
      <Navbar />
      {/* Admin context banner — sits directly below the navbar */}
      <div className="bg-brand-600 text-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-1.5 flex items-center gap-2">
          <FiShield className="w-3.5 h-3.5 opacity-80" />
          <span className="text-xs font-semibold tracking-wide uppercase opacity-90">
            Superadmin — Admin Dashboard
          </span>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
