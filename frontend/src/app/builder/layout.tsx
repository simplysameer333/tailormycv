import AppShell from "@/components/AppShell";
import StepBar from "@/components/StepBar";
import JobContextBanner from "@/components/JobContextBanner";
import SessionGuard from "./SessionGuard";
import AuthGuard from "@/components/AuthGuard";

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AuthGuard />
      <SessionGuard />
      <StepBar />
      <JobContextBanner />
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-6 py-6 sm:py-10">
        {children}
      </main>
    </AppShell>
  );
}
