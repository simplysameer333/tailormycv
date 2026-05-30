import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AuthGuard />
      <Navbar />
      {children}
    </div>
  );
}
