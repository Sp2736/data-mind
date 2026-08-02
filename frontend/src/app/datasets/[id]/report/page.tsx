"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { BentoGrid, BentoCard } from "@/components/layout/BentoGrid";
import { Badge } from "@/components/ui/Badge";
import { getDatasetById } from "@/lib/mock/datasets";
import { getReportForDataset } from "@/lib/mock/reports";
import { getDatasetProfile } from "@/lib/mock/datasetProfiles";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Download,
  CheckCircle2,
  ListTodo,
  ShieldCheck,
  Calendar,
  Layers,
  Sparkles,
  Info,
  Clock
} from "lucide-react";

export default function ExecutiveReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const datasetId = resolvedParams.id;
  const dataset = getDatasetById(datasetId);
  const report = getReportForDataset(datasetId, dataset?.filename);
  const profile = getDatasetProfile(datasetId, dataset?.filename);

  const [downloadingCleaned, setDownloadingCleaned] = useState<boolean>(false);
  const [downloadingReport, setDownloadingReport] = useState<boolean>(false);

  if (!dataset || !report) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
          <Header />
          <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 text-center">
            <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-8 shadow-sm">
              <h2 className="text-xl font-semibold mb-2">Report Not Found</h2>
              <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
                The report data for dataset ID <code className="bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">{datasetId}</code> could not be located.
              </p>
              <Link
                href="/home"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Workspace</span>
              </Link>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  // Convert array of sample records into CSV string
  const convertToCSV = (rows: Record<string, any>[]): string => {
    if (!rows || rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const csvRows = [
      headers.join(","), // header row
      ...rows.map(row => 
        headers.map(fieldName => {
          const value = row[fieldName];
          const escaped = ("" + (value ?? "")).replace(/"/g, '\\"');
          return `"${escaped}"`;
        }).join(",")
      )
    ];
    return csvRows.join("\n");
  };

  // Helper to trigger browser downloads of text blobs
  const triggerBlobDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Download cleaned dataset file
  const handleDownloadDataset = () => {
    setDownloadingCleaned(true);
    setTimeout(() => {
      if (dataset.format === "csv") {
        const csvContent = convertToCSV(profile.sample_rows);
        triggerBlobDownload(csvContent, `${dataset.filename.replace('.csv', '')}_cleaned.csv`, "text/csv;charset=utf-8;");
      } else {
        const jsonContent = JSON.stringify(profile.sample_rows, null, 2);
        triggerBlobDownload(jsonContent, `${dataset.filename.replace('.json', '')}_cleaned.json`, "application/json;charset=utf-8;");
      }
      setDownloadingCleaned(false);
    }, 800);
  };

  // Download summary report in Markdown
  const handleDownloadReport = () => {
    setDownloadingReport(true);
    setTimeout(() => {
      const reportMarkdown = `# DataMind Executive Audit Report: ${dataset.filename}
Date Generated: ${new Date().toLocaleDateString()}
Status: Verified Data Pipeline Ingestion Complete

## 1. Executive Summary
${report.overall_summary}

## 2. Dataset Profile Information
- **Total Ingested Rows:** ${dataset.row_count.toLocaleString()}
- **Total Columns:** ${dataset.column_count}
- **Ingestion Size:** ${(dataset.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
- **Primary Domain:** ${dataset.primary_domain || "General"}

## 3. Data Pre-processing & Cleaning Logs
DataMind resolved categorical anomalies, missing data elements, and outlier properties according to the following log list:

${report.cleaning_actions.map((act, idx) => `### Action #${idx + 1}: ${act.action_name}
- **Affected Column(s):** ${act.column_affected}
- **Details:** ${act.description}
- **Rationale:** ${act.rationale}
`).join("\n")}

---
Report compiled autonomously by DataMind. Copyright (c) 2026. All rights reserved.
`;
      triggerBlobDownload(reportMarkdown, `datamind_report_${datasetId}.md`, "text/markdown;charset=utf-8;");
      setDownloadingReport(false);
    }, 800);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100 pb-20">
        <Header />

        {/* Stage Progression Tracker */}
        <div className="border-b border-stone-200/60 dark:border-stone-800/80 bg-white/70 dark:bg-[#191921]/60 backdrop-blur-md sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between overflow-x-auto gap-4">
            <Link
              href={`/datasets/${datasetId}/insights`}
              className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Insights</span>
            </Link>
            
            <div className="flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs text-stone-400 shrink-0">
              <Link href={`/datasets/${datasetId}`} className="hover:text-stone-600 dark:hover:text-stone-300">1. Data Profile</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <Link href={`/datasets/${datasetId}/rqs`} className="hover:text-stone-600 dark:hover:text-stone-300">2. Research Questions</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <Link href={`/datasets/${datasetId}/status`} className="hover:text-stone-600 dark:hover:text-stone-300">3. Execution Logs</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <Link href={`/datasets/${datasetId}/insights`} className="hover:text-stone-600 dark:hover:text-stone-300">4. Analysis Insights</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40">5. Executive Report</span>
            </div>
            
            <div className="w-10 sm:w-20 shrink-0" />
          </div>
        </div>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-6">
          
          {/* Main Title Header */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="indigo" icon={<ShieldCheck className="w-3 h-3" />}>
                FR-OUT-01 – 03
              </Badge>
              <span className="text-xs text-stone-400 font-medium">Compliance-Verified Audit Report</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Executive Audit &amp; Clean Summary
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
              Download the treated csv schema or export the compile-verified analytical executive brief.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left: Overall Summary & Logs timeline (Spans 2/3) */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              
              {/* Executive Summary Card */}
              <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-7 shadow-sm space-y-4">
                <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Executive Summary Narrative</span>
                </h3>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed font-semibold">
                  {report.overall_summary}
                </p>
                <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex flex-wrap gap-4 text-xs font-semibold text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Audit Status: Passed</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-stone-450" />
                    <span>Date: {new Date().toLocaleDateString()}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-stone-450" />
                    <span>System Time: 2026-08-02</span>
                  </span>
                </div>
              </div>

              {/* Cleaning Actions Timeline (Screen-9) */}
              <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
                <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-white flex items-center gap-2">
                  <ListTodo className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span>Preprocessing &amp; Ingestion Cleaning Timeline</span>
                </h3>
                
                <div className="relative pl-6 border-l border-stone-200 dark:border-stone-800 space-y-8 ml-3 py-1">
                  {report.cleaning_actions.map((act, idx) => (
                    <div key={idx} className="relative group">
                      
                      {/* Timeline dot */}
                      <span className="absolute -left-[31px] top-1 w-4.5 h-4.5 rounded-full border-2 border-white dark:border-stone-900 bg-purple-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
                        {idx + 1}
                      </span>
                      
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-stone-850 dark:text-stone-100">
                            {act.action_name}
                          </h4>
                          <span className="inline-flex text-[9px] font-extrabold text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 px-2 py-0.5 rounded-md">
                            Column: {act.column_affected}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed font-semibold">
                          {act.description}
                        </p>
                        <div className="bg-stone-50 dark:bg-stone-900/40 border border-stone-100 dark:border-stone-850 rounded-xl p-3 text-[11px] text-stone-500 leading-relaxed">
                          <span className="font-extrabold uppercase text-[9px] text-stone-400 tracking-wider block mb-0.5">Pipeline Rationale</span>
                          {act.rationale}
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right: Export Panel (Screen-8) (Spans 1/3) */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              
              {/* Profile Card snippet */}
              <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 shadow-sm space-y-4">
                <h4 className="text-xs uppercase tracking-wider font-extrabold text-stone-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Target profile summary</span>
                </h4>
                <div className="space-y-3 font-semibold text-xs">
                  <div className="flex justify-between pb-2.5 border-b border-stone-100 dark:border-stone-800/40">
                    <span className="text-stone-500">Dataset File</span>
                    <span className="text-stone-850 dark:text-stone-150 truncate max-w-[150px]">{dataset.filename}</span>
                  </div>
                  <div className="flex justify-between pb-2.5 border-b border-stone-100 dark:border-stone-800/40">
                    <span className="text-stone-500">Record format</span>
                    <span className="text-stone-850 dark:text-stone-150 uppercase">{dataset.format}</span>
                  </div>
                  <div className="flex justify-between pb-2.5 border-b border-stone-100 dark:border-stone-800/40">
                    <span className="text-stone-500">Row volume</span>
                    <span className="text-stone-850 dark:text-stone-150">{dataset.row_count.toLocaleString()} rows</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Primary domain</span>
                    <span className="text-stone-850 dark:text-stone-150">{dataset.primary_domain || "General"}</span>
                  </div>
                </div>
              </div>

              {/* Export Panel controls */}
              <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 shadow-sm space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>Audit Export Panel</span>
                  </h4>
                  <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                    Trigger direct downloads of the compliance-treated datasets or compile executive summaries.
                  </p>
                </div>

                <div className="flex flex-col gap-3.5">
                  {/* Cleaned Dataset trigger */}
                  <button
                    onClick={handleDownloadDataset}
                    disabled={downloadingCleaned}
                    className="w-full inline-flex items-center justify-between px-5 py-3 bg-transparent hover:bg-stone-50 dark:hover:bg-stone-800/80 border border-stone-200 dark:border-stone-800 rounded-2xl text-xs font-bold text-stone-800 dark:text-stone-200 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div className="text-left">
                        <span>{downloadingCleaned ? "Compiling Cleaned..." : `Cleaned ${dataset.format.toUpperCase()} Sample`}</span>
                        <span className="text-[9px] text-stone-400 block font-semibold">{dataset.filename.replace(`.${dataset.format}`, '')}_cleaned.{dataset.format}</span>
                      </div>
                    </div>
                    <Download className="w-4 h-4 text-stone-400" />
                  </button>

                  {/* Summary Executive Document trigger */}
                  <button
                    onClick={handleDownloadReport}
                    disabled={downloadingReport}
                    className="w-full inline-flex items-center justify-between px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-indigo-100 dark:shadow-none hover:shadow-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 shrink-0" />
                      <div className="text-left">
                        <span>{downloadingReport ? "Compiling Report..." : "Download Report"}</span>
                        <span className="text-[9px] text-indigo-200 block font-semibold">datamind_report_${datasetId}.md</span>
                      </div>
                    </div>
                    <Download className="w-4 h-4 text-indigo-100" />
                  </button>
                </div>

                {/* Integration notice */}
                <div className="bg-stone-50 dark:bg-stone-900 border border-stone-100 dark:border-stone-850 rounded-2xl p-4 flex gap-3 text-[10px] text-stone-500 leading-relaxed font-semibold">
                  <Info className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold uppercase text-stone-450 block mb-0.5">Pipeline Integration</span>
                    These files are generated on-the-fly directly in the browser sandbox to ensure secure, local-compliance workspace execution.
                  </div>
                </div>

              </div>

            </div>

          </div>

        </main>
      </div>
    </AuthGuard>
  );
}
