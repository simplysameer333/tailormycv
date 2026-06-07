import AppShell from "@/components/AppShell";
import AuthGuard from "@/components/AuthGuard";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell className="bg-slate-50">
      <AuthGuard />
      <div className="flex-1">{children}</div>
    </AppShell>
  );
}
