"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { BrainCircuit, LogOut, User as UserIcon, Plus } from "lucide-react";

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-[#faf8f5]/80 dark:bg-[#121216]/80 backdrop-blur-md border-b border-stone-200/70 dark:border-stone-800/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/home" className="flex items-center gap-2.5 group">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-100 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <span className="font-semibold text-stone-900 dark:text-stone-100 text-base tracking-tight block leading-none">
              DataMind
            </span>
            <span className="text-[10px] text-stone-400 dark:text-stone-500 font-medium">
              Autonomous Analytics
            </span>
          </div>
        </Link>

        {/* Action Controls & User Identity */}
        <div className="flex items-center gap-3">
          <Link
            href="/upload"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Dataset</span>
          </Link>

          <div className="h-4 w-[1px] bg-stone-200 dark:bg-stone-800 hidden sm:block" />

          {/* User badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 text-xs">
            <UserIcon className="w-3.5 h-3.5 text-stone-400" />
            <span className="font-medium text-stone-700 dark:text-stone-300 max-w-[120px] sm:max-w-[180px] truncate">
              {user?.email || "analyst@datamind.ai"}
            </span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] uppercase font-semibold bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
              {user?.role || "analyst"}
            </span>
          </div>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="p-2 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
