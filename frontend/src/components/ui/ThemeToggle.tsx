"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`
        relative flex items-center gap-0 p-0.5 rounded-2xl border transition-all duration-300 cursor-pointer
        w-14 h-7 shrink-0
        ${isDark
          ? "bg-indigo-950/80 border-indigo-800/60 shadow-inner shadow-indigo-900/30"
          : "bg-blue-50 border-blue-200/70 shadow-inner shadow-blue-100/60"
        }
      `}
    >
      {/* Sliding thumb */}
      <span
        className={`
          absolute top-0.5 flex items-center justify-center w-6 h-6 rounded-xl transition-all duration-300 shadow-sm
          ${isDark
            ? "left-0.5 bg-indigo-600 text-white shadow-indigo-700/40"
            : "left-[calc(100%-26px)] bg-white text-amber-500 shadow-amber-200/60 shadow-md"
          }
        `}
      >
        {isDark ? (
          <Moon className="w-3.5 h-3.5" />
        ) : (
          <Sun className="w-3.5 h-3.5" />
        )}
      </span>

      {/* Track labels */}
      <span className={`absolute right-1.5 text-[9px] font-bold transition-opacity duration-300 ${isDark ? "opacity-100 text-indigo-400" : "opacity-0"}`}>
        D
      </span>
      <span className={`absolute left-1.5 text-[9px] font-bold transition-opacity duration-300 ${!isDark ? "opacity-100 text-blue-500" : "opacity-0"}`}>
        L
      </span>
    </button>
  );
}

