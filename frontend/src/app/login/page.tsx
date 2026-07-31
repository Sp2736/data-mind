"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BrainCircuit,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  AlertCircle,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";
import { useAuth } from "@/lib/auth/useAuth";
import { MOCK_CURRENT_USER } from "@/lib/mock/users";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [touched, setTouched] = useState({ email: false, password: false });

  // Inline Validation checks
  const isEmailValid = /\S+@\S+\.\S+/.test(email);
  const isPasswordValid = password.length >= 6;
  const isFormValid = isEmailValid && isPasswordValid;

  const emailError = touched.email && !email
    ? "Email is required"
    : touched.email && !isEmailValid
    ? "Please enter a valid email address"
    : null;

  const passwordError = touched.password && !password
    ? "Password is required"
    : touched.password && !isPasswordValid
    ? "Password must be at least 6 characters"
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setAuthError(null);

    if (!isFormValid) return;

    setIsSubmitting(true);
    const res = await login(email, password);
    setIsSubmitting(false);

    if (res.success) {
      router.push("/home");
    } else {
      setAuthError(res.error || "Authentication failed.");
    }
  };

  const handleQuickFill = () => {
    setEmail(MOCK_CURRENT_USER.email);
    setPassword("datamind2026");
    setTouched({ email: false, password: false });
    setAuthError(null);
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100 p-4 sm:p-6 selection:bg-indigo-100 dark:selection:bg-indigo-900">
      {/* Soft pastel ambient background blobs */}
      <div className="absolute top-12 left-12 w-80 h-80 bg-indigo-100/60 dark:bg-indigo-950/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-12 right-12 w-96 h-96 bg-purple-100/60 dark:bg-purple-950/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-sky-100/50 dark:bg-sky-950/30 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 shadow-sm">
            <BrainCircuit className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            DataMind
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-normal">
            Autonomous Data Analytics &amp; Insights Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-stone-200/40 dark:shadow-none">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-100 dark:border-stone-800/80">
            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Welcome Back</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">Sign in to access your workspace</p>
            </div>
            <button
              type="button"
              onClick={handleQuickFill}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 border border-indigo-200/60 dark:border-indigo-800/60 rounded-full transition-all"
              title="Auto-fill demo credentials"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Demo Fill
            </button>
          </div>

          {/* Soft Coral Error State Alert */}
          {authError && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Authentication Error</span>
                <span>{authError}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email Input */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  placeholder="analyst@datamind.ai"
                  className={`w-full pl-10 pr-4 py-2.5 text-sm bg-stone-50 dark:bg-stone-900/70 text-stone-900 dark:text-stone-100 placeholder-stone-400 rounded-xl border transition-all focus:outline-none ${
                    emailError
                      ? "border-rose-300 dark:border-rose-800 bg-rose-50/30"
                      : "border-stone-200 dark:border-stone-800 focus:border-indigo-400 dark:focus:border-indigo-500 focus:bg-white dark:focus:bg-stone-900"
                  }`}
                />
              </div>
              {emailError && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {emailError}
                </p>
              )}
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-stone-600 dark:text-stone-300"
                >
                  Password
                </label>
                <a
                  href="#forgot"
                  onClick={(e) => e.preventDefault()}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Forgot?
                </a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  placeholder="••••••••••••"
                  className={`w-full pl-10 pr-10 py-2.5 text-sm bg-stone-50 dark:bg-stone-900/70 text-stone-900 dark:text-stone-100 placeholder-stone-400 rounded-xl border transition-all focus:outline-none ${
                    passwordError
                      ? "border-rose-300 dark:border-rose-800 bg-rose-50/30"
                      : "border-stone-200 dark:border-stone-800 focus:border-indigo-400 dark:focus:border-indigo-500 focus:bg-white dark:focus:bg-stone-900"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {passwordError}
                </p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-stone-600 dark:text-stone-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <span>Remember session</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className="w-full mt-2 py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Scope notice */}
          <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Mocked Auth Phase — Use demo fill or any email</span>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-stone-400 dark:text-stone-500">
          DataMind &copy; 2026. Minimalist UI &amp; Auth Module.
        </p>
      </div>
    </div>
  );
}
