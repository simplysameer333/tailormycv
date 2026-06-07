import { Suspense } from "react";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Free CV Score — TailorMyCv",
  description: "Instant AI-powered CV analysis. Get scored on ATS compatibility, content quality, design, skills, experience and more. Free, no sign-in required.",
};

export default function CvScoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <main className="flex-1">
        <Suspense>{children}</Suspense>
      </main>
    </AppShell>
  );
}
