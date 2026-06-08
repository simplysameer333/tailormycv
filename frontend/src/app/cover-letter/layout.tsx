import { Suspense } from "react";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Cover Letter Generator — TailorMyCv",
  description: "Generate a tailored cover letter in seconds. Paste your resume and the job description — AI does the rest.",
};

export default function CoverLetterLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <main className="flex-1 max-w-6xl mx-auto w-full px-5 sm:px-6">
        <Suspense>{children}</Suspense>
      </main>
    </AppShell>
  );
}
