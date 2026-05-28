"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FiUser, FiMail, FiLock, FiCheck, FiEye, FiEyeOff } from "react-icons/fi";
import api from "@/lib/api";
import { signIn } from "next-auth/react";

const DEV = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

type Tier = "free" | "plus" | "pro";

const TIERS: {
  id: Tier;
  name: string;
  price: string;
  highlight?: boolean;
  features: string[];
}[] = [
  {
    id: "free",
    name: "Free",
    price: "$0 / mo",
    features: [
      "6-step AI resume builder",
      "DOCX + PDF export",
      "3 templates (Clean / Modern / Executive)",
      "1 AI quality evaluator",
      "3 key skills extracted from JD",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: "$9 / mo",
    highlight: true,
    features: [
      "Everything in Free",
      "2 AI quality evaluators",
      "5 key skills extracted",
      "Job search (Indeed / LinkedIn / Glassdoor)",
      "Save up to 25 jobs",
      "Resume Library (5 resumes)",
      "One-click Tailor from job listings",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19 / mo",
    features: [
      "Everything in Plus",
      "3 AI quality evaluators",
      "10 key skills extracted",
      "Section-level regeneration",
      "Locked Facts panel",
      "Sample CV formatting reference",
      "Unlimited Resume Library",
      "Unlimited saved jobs",
    ],
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const [tier, setTier] = useState<Tier>("free");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (DEV) router.replace("/profile");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/register", {
        email: form.email,
        name: form.name.trim(),
        password: form.password,
        tier,
      });
      const res = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (res?.error) throw new Error(res.error);
      router.push("/profile");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleGoogle() {
    toast("Google sign-in coming soon. Please use email and password for now.", { icon: "ℹ️" });
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-col gap-6">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-500 mt-1">Choose a plan — you can change it later</p>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTier(t.id)}
              className={`relative text-left rounded-2xl border-2 p-4 transition-all ${
                tier === t.id
                  ? "border-brand-500 bg-brand-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-brand-300"
              }`}
            >
              {t.highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-semibold bg-brand-600 text-white px-2.5 py-0.5 rounded-full">
                  Most popular
                </span>
              )}
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-900">{t.name}</span>
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  tier === t.id ? "border-brand-500 bg-brand-500" : "border-slate-300"
                }`}>
                  {tier === t.id && <FiCheck className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
              </div>
              <p className="text-sm font-bold text-brand-600 mb-3">{t.price}</p>
              <ul className="flex flex-col gap-1.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <FiCheck className="w-3 h-3 text-teal-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {/* Registration form */}
        <div className="card flex flex-col gap-5">
          <button
            type="button"
            onClick={handleGoogle}
            className="btn-secondary w-full justify-center gap-2"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Full name</label>
                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input pl-9"
                    placeholder="Jane Smith"
                  />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input pl-9"
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="input pl-9 pr-10"
                    placeholder="Min. 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Confirm password</label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                    className="input pl-9 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showConfirm ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-1">
              {loading ? "Creating account…" : `Create ${tier.charAt(0).toUpperCase() + tier.slice(1)} account`}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-semibold text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}
