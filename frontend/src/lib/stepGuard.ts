/**
 * Step navigation guards for the builder flow.
 *
 * Each step requires specific localStorage keys to exist before it can be
 * accessed. If prerequisites are missing the user is redirected back to the
 * earliest incomplete step with an explanatory toast.
 *
 * Usage (call at the top of a page component):
 *   useStepGuard("profile")   // ensures session exists
 *   useStepGuard("download")  // ensures session + generated resume exist
 */
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

const LS = {
  session:   "tailormycv_session_id",
  generated: "tailormycv_generated",
};

type Step = "profile" | "job" | "template" | "preview";

const MESSAGES: Record<Step, string> = {
  profile:  "Please upload your resume first.",
  job:      "Please upload your resume first.",
  preview:  "Please upload your resume first.",
  template: "Please generate your resume first.",
};

const REDIRECTS: Record<Step, string> = {
  profile:  "/builder/upload",
  job:      "/builder/upload",
  preview:  "/builder/upload",
  template: "/builder/preview",
};

function check(step: Step): boolean {
  if (typeof window === "undefined") return true;
  const hasSession = Boolean(localStorage.getItem(LS.session));
  if (!hasSession) return false;
  if (step === "template") return Boolean(localStorage.getItem(LS.generated));
  return true;
}

export function useStepGuard(step: Step) {
  const router = useRouter();

  useEffect(() => {
    if (!check(step)) {
      toast.error(MESSAGES[step]);
      router.replace(REDIRECTS[step]);
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
}
