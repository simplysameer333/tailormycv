import { Suspense } from "react";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Interview Prep — TailorMyCv",
  description: "Get AI-generated interview questions tailored to your resume and the job description. Know what to expect before you walk in.",
};

export default function InterviewPrepLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <main className="flex-1 max-w-6xl mx-auto w-full px-5 sm:px-6">
        <Suspense>{children}</Suspense>
      </main>
    </AppShell>
  );
}
