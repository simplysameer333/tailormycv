"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DownloadRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/builder/template"); }, [router]);
  return null;
}
