"use client";

import React, { use } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { getDatasetById } from "@/lib/mock/datasets";
import { ArrowLeft, Database, FileSpreadsheet, FileCode, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export default function DatasetProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const dataset = getDatasetById(resolvedParams.id);

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
        <Header />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-indigo-600 dark:text-stone-400 dark:hover:text-indigo-400 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Workspace</span>
            </Link>
          </div>

          <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
                  {dataset?.format === "json" ? (
                    <FileCode className="w-6 h-6" />
                  ) : (
                    <FileSpreadsheet className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 dark:text-stone-50">
                    {dataset?.filename || `Dataset: ${resolvedParams.id}`}
                  </h1>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    ID: {resolvedParams.id} • {dataset?.primary_domain || "General Data"}
                  </p>
                </div>
              </div>

              <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3" />}>
                {dataset?.status || "ready"}
              </Badge>
            </div>

            <div className="p-6 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/60 dark:border-stone-800 text-stone-600 dark:text-stone-300 text-sm">
              <p className="mb-2 font-semibold text-stone-900 dark:text-stone-100">
                Module 3 Ingestion Complete
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                Dataset <code className="bg-white dark:bg-stone-800 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400">{dataset?.filename || resolvedParams.id}</code> has been indexed into session state ({dataset?.row_count.toLocaleString() || "14,250"} rows, {dataset?.column_count || "24"} columns). Detailed Bento Cards for Module 4 (Schema Summary, Stats Summary, Correlations, and Sample Rows) will be rendered here in Module 4.
              </p>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
