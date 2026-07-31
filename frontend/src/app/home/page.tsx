"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { BentoGrid, BentoCard } from "@/components/layout/BentoGrid";
import { Badge } from "@/components/ui/Badge";
import { MOCK_DATASETS, Dataset } from "@/lib/mock/datasets";
import {
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  Database,
  ArrowRight,
  Sparkles,
  Layers,
  Activity,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Search
} from "lucide-react";

export default function HomePage() {
  const [datasets] = useState<Dataset[]>(MOCK_DATASETS);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDatasets = datasets.filter((ds) =>
    ds.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ds.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ds.primary_domain?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalRows = datasets.reduce((acc, curr) => acc + curr.row_count, 0);
  const readyCount = datasets.filter((ds) => ds.status === "ready").length;

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatFileSize = (bytes: number) => {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
        <Header />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {/* Welcome Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                Data Workspace
              </h1>
              <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                Manage your ingested datasets, trigger automated EDA, and explore AI insights.
              </p>
            </div>

            {/* Search Filter */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search datasets..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Bento Grid Layout */}
          <BentoGrid>
            {/* Primary CTA Card — Upload New Dataset (Span 2 cols on md/lg) */}
            <BentoCard colSpan="md:col-span-2 lg:col-span-2" className="bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 dark:from-indigo-950/40 dark:via-[#191921] dark:to-purple-950/20 border-indigo-100 dark:border-indigo-900/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Badge variant="indigo" icon={<Sparkles className="w-3 h-3" />}>
                    Primary Action
                  </Badge>
                  <span className="text-xs text-stone-400">FR-ING-01</span>
                </div>
                <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-50 mb-2">
                  Upload New Dataset
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 mb-6 leading-relaxed">
                  Drop `.csv` or `.json` files to initiate automated statistical profiling, schema inference, correlation summary, and research question planning.
                </p>
              </div>

              <Link
                href="/upload"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-2xl shadow-md shadow-indigo-200 dark:shadow-none transition-all group w-full sm:w-auto self-start"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload &amp; Analyze Dataset</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </BentoCard>

            {/* Quick Stat Card 1 — Total Datasets */}
            <BentoCard colSpan="col-span-1" className="flex flex-col justify-between">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-medium uppercase tracking-wider">Total Datasets</span>
                <Database className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="my-4">
                <div className="text-3xl font-bold text-stone-900 dark:text-stone-50">
                  {datasets.length}
                </div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {readyCount} ready for profiling
                </p>
              </div>
              <div className="pt-3 border-t border-stone-100 dark:border-stone-800 text-[11px] text-stone-400">
                Storage target: Cloudflare R2
              </div>
            </BentoCard>

            {/* Quick Stat Card 2 — Rows Processed */}
            <BentoCard colSpan="col-span-1" className="flex flex-col justify-between">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-medium uppercase tracking-wider">Rows Indexed</span>
                <TrendingUp className="w-4 h-4 text-purple-500" />
              </div>
              <div className="my-4">
                <div className="text-3xl font-bold text-stone-900 dark:text-stone-50">
                  {totalRows.toLocaleString()}
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  Across CSV and JSON fixtures
                </p>
              </div>
              <div className="pt-3 border-t border-stone-100 dark:border-stone-800 text-[11px] text-stone-400">
                Sandbox Limit: 100k rows
              </div>
            </BentoCard>

            {/* Dataset Cards List Header / Section Title */}
            <div className="col-span-full mt-4 mb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Ingested Datasets ({filteredDatasets.length})</span>
              </h3>
            </div>

            {/* Dataset Cards */}
            {filteredDatasets.map((ds) => (
              <BentoCard key={ds.id} colSpan="col-span-1 md:col-span-2 lg:col-span-2" className="flex flex-col justify-between hover:border-indigo-200 dark:hover:border-indigo-800/80">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                        {ds.format === "csv" ? (
                          <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <FileCode className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-stone-900 dark:text-stone-100 text-sm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate max-w-[220px] sm:max-w-xs">
                          {ds.filename}
                        </h4>
                        <span className="text-xs text-stone-400 block">
                          {ds.primary_domain || "General Data"}
                        </span>
                      </div>
                    </div>

                    <Badge
                      variant={
                        ds.status === "ready"
                          ? "success"
                          : ds.status === "processing"
                          ? "warning"
                          : "error"
                      }
                      icon={
                        ds.status === "ready" ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3 animate-spin" />
                        )
                      }
                    >
                      {ds.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 mb-4">
                    {ds.description}
                  </p>

                  <div className="grid grid-cols-3 gap-2 py-2.5 px-3 bg-stone-50 dark:bg-stone-900/60 rounded-2xl text-xs text-stone-600 dark:text-stone-300 mb-4">
                    <div>
                      <span className="text-[10px] text-stone-400 block">Rows</span>
                      <span className="font-medium">{ds.row_count.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block">Columns</span>
                      <span className="font-medium">{ds.column_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block">Size</span>
                      <span className="font-medium">{formatFileSize(ds.file_size_bytes)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800/80 text-xs text-stone-400">
                  <span>Uploaded {formatDate(ds.uploaded_at)}</span>

                  <Link
                    href={`/datasets/${ds.id}`}
                    className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    <span>View Profile</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </BentoCard>
            ))}

            {/* System Status / Agent Health Bento Card (Span full width) */}
            <BentoCard colSpan="col-span-full" className="bg-stone-900 text-stone-100 dark:bg-[#15151c]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-stone-100">
                      Autonomous Pipeline Status
                    </h4>
                    <p className="text-xs text-stone-400">
                      Planner Agent, Code Execution Sandbox, and Analyst Agent ready.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-stone-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Frontend Prototype — Auth State Connected</span>
                </div>
              </div>
            </BentoCard>
          </BentoGrid>
        </main>
      </div>
    </AuthGuard>
  );
}
