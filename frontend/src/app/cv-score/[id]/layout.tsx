import { Suspense } from "react";

export const metadata = {
  title: "CV Score Results — TailorMyCv",
  description: "Your AI-powered CV analysis results — scores across 8 categories and 54 checks.",
};

export default function CvScoreResultLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
