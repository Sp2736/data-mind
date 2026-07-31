"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/lib/auth/useAuth";
import { LogOut, User as UserIcon, BrainCircuit } from "lucide-react";

export default function HomePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100 p-6 sm:p-10">
        <header className="max-w-5xl mx-auto flex items-center justify-between pb-6 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">DataMind Workspace</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
              <UserIcon className="w-4 h-4 text-stone-400" />
              <span>{user?.email}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                {user?.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200/60 dark:border-rose-900/60 rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto mt-10">
          <div className="p-8 rounded-3xl bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Module 1 Authentication Complete</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              You are authenticated as <strong className="text-stone-800 dark:text-stone-200">{user?.email}</strong>. Auth state is persisted in storage and protected by <code className="text-xs bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">AuthGuard</code>.
            </p>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
