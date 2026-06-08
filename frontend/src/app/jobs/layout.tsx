import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import AuthGuard from "@/components/AuthGuard";

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AuthGuard />
      <main className="flex-1 max-w-6xl mx-auto w-full px-5 sm:px-6 py-6 sm:py-10">
        <Suspense>{children}</Suspense>
      </main>
    </AppShell>
  );
}
