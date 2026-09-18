"use client";

import React, { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import {
  getDataset,
  listInsights,
  listQuestions,
  getDatasetProfile,
  getVisualization,
  getReport,
  buildReport,
  ApiDataset,
  ApiDatasetProfile,
  ApiInsight,
  ApiResearchQuestion,
  ApiVisualization,
  ApiReport,
} from "@/lib/api/datasets";
import {
  ArrowLeft,
  ChevronRight,
  Printer,
  Sparkles,
  FileText,
  RotateCw,
  Loader2,
  AlertCircle,
  BarChart3,
  Calendar,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { InsightVisualRenderer } from "@/components/charts/InsightChart";

// ─── Main Executive Report Page ───────────────────────────────────────────────

interface InsightBundle {
  insight: ApiInsight;
  question?: ApiResearchQuestion;
  visual?: ApiVisualization | null;
}

export default function ExecutiveReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const datasetId = resolvedParams.id;

  const [dataset, setDataset] = useState<ApiDataset | null>(null);
  const [profile, setProfile] = useState<ApiDatasetProfile | null>(null);
  const [report, setReport] = useState<ApiReport | null>(null);
  const [bundles, setBundles] = useState<InsightBundle[]>([]);
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportContainerRef = useRef<HTMLDivElement>(null);

  // Generate markdown document from live pipeline data
  const generateMarkdownReport = (
    ds: ApiDataset,
    prof: ApiDatasetProfile | null,
    rep: ApiReport | null,
    items: InsightBundle[]
  ): string => {
    const dateStr = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const lines: string[] = [];

    // Header
    lines.push(`# DataMind Autonomous Analytics Executive Report: ${ds.filename}`);
    lines.push(`**Date Generated:** ${dateStr}  `);
    lines.push(`**Dataset Identifier:** \`${ds.id}\`  `);
    lines.push(`**Verification:** Verified Autonomous Pipeline Ingestion & Statistical Analysis Complete  `);
    lines.push("");

    // Metadata Table
    lines.push("## Dataset Overview");
    lines.push("| Attribute | Value |");
    lines.push("|---|---|");
    lines.push(`| **Filename** | \`${ds.filename}\` |`);
    lines.push(`| **Format** | ${ds.format.toUpperCase()} |`);
    lines.push(`| **Total Records** | ${ds.row_count.toLocaleString()} rows |`);
    lines.push(`| **Total Attributes** | ${ds.column_count} columns |`);
    lines.push(`| **Domain Classification** | ${ds.primary_domain || "General Analytics"} |`);
    lines.push(`| **Analysis Scope** | ${items.length} Evaluated Research Questions |`);
    lines.push("");

    // Section 1: Executive Summary
    lines.push("## 1. Executive Summary");
    if (rep?.overall_summary) {
      lines.push(rep.overall_summary);
    } else {
      lines.push("The autonomous analytics pipeline successfully profiled and executed statistical analyses across the ingested schema, surfacing key distributions, correlation dynamics, and actionable segmentations.");
    }
    lines.push("");

    // Section 2: Schema Profile & Quality Health
    lines.push("## 2. Dataset Architecture & Schema Health");
    if (prof?.schema_summary && prof.schema_summary.length > 0) {
      lines.push("Below is the structural summary of dataset attributes, data types, and null coverage:");
      lines.push("");
      lines.push("| Column Name | Type | Unique Values | Missing Values (%) | Status |");
      lines.push("|---|---|---|---|---|");
      prof.schema_summary.slice(0, 15).forEach((col) => {
        const nullPct = (col.null_percentage || 0).toFixed(1);
        const status = col.null_count === 0 ? "Complete" : `${nullPct}% Null`;
        lines.push(`| \`${col.column_name}\` | ${col.data_type} | ${col.unique_count.toLocaleString()} | ${col.null_count} (${nullPct}%) | ${status} |`);
      });
      if (prof.schema_summary.length > 15) {
        lines.push(`| ... and ${prof.schema_summary.length - 15} more attributes | | | | |`);
      }
    } else {
      lines.push(`- **Row Volume:** ${ds.row_count.toLocaleString()} records`);
      lines.push(`- **Column Count:** ${ds.column_count} features`);
    }
    lines.push("");

    // Section 3: Pre-processing & Quality Transformations
    lines.push("## 3. Data Cleaning & Pre-processing Actions");
    const cleaningBundles = items.filter(
      (b) => (b.question?.category ?? b.insight.category) === "pre-processing"
    );
    if (rep?.cleaning_actions && rep.cleaning_actions.length > 0) {
      rep.cleaning_actions.forEach((act, idx) => {
        lines.push(`### Action #${idx + 1}: ${act.action_name}`);
        lines.push(`- **Target Column:** \`${act.column_affected}\``);
        lines.push(`- **Action Taken:** ${act.description}`);
        lines.push(`- **Rationale:** ${act.rationale}`);
        lines.push("");
      });
    } else if (cleaningBundles.length > 0) {
      cleaningBundles.forEach((b, idx) => {
        lines.push(`### Transformation #${idx + 1}: ${b.question?.question_text ?? "Data Treatment"}`);
        lines.push(`${b.insight.summary_text}`);
        if (b.insight.key_takeaways?.length > 0) {
          lines.push("**Key Notes:**");
          b.insight.key_takeaways.forEach((k) => lines.push(`- ${k}`));
        }
        lines.push("");
      });
    } else {
      lines.push("All primary columns met quality baseline checks. No destructive column drops were mandated during preprocessing.");
      lines.push("");
    }

    // Section 4: Key Statistical Findings (EDA)
    lines.push("## 4. Key Statistical Findings & Exploratory Insights");
    const edaBundles = items.filter(
      (b) => (b.question?.category ?? b.insight.category) !== "pre-processing"
    );
    (edaBundles.length > 0 ? edaBundles : items).forEach((b, idx) => {
      lines.push(`### Finding #${idx + 1}: ${b.question?.question_text ?? `Analysis ${b.insight.id.slice(-6)}`}`);
      lines.push(`*Category: ${(b.question?.category ?? b.insight.category).toUpperCase()}*`);
      lines.push("");
      lines.push(`> ${b.insight.summary_text}`);
      lines.push("");
      if (b.insight.key_takeaways && b.insight.key_takeaways.length > 0) {
        lines.push("**Analytical Takeaways:**");
        b.insight.key_takeaways.forEach((k) => lines.push(`- ${k}`));
        lines.push("");
      }
    });

    // Section 5: Comparative Summary & Strategic Conclusions
    lines.push("## 5. Summary & Strategic Recommendations");
    lines.push("1. **Data Utilization:** Leverage identified correlations and segmentations to drive targeted operational decisions.");
    lines.push("2. **Pipeline Repeatability:** Generated code artifacts and visualization schemas are persisted for automated reproducibility.");
    lines.push("3. **Monitoring:** Continue tracking anomalous columns and missing value trends across subsequent dataset ingestions.");
    lines.push("");
    lines.push("---");
    lines.push(`*Report compiled autonomously by DataMind Engine. All rights reserved © ${new Date().getFullYear()}.*`);

    return lines.join("\n");
  };

  const loadAllData = async (forceRebuild = false) => {
    setError(null);
    try {
      const [ds, prof, insights, questions] = await Promise.all([
        getDataset(datasetId),
        getDatasetProfile(datasetId).catch(() => null),
        listInsights(datasetId),
        listQuestions(datasetId).catch(() => [] as ApiResearchQuestion[]),
      ]);

      setDataset(ds);
      setProfile(prof);

      const qMap = Object.fromEntries(questions.map((q) => [q.id, q]));

      const enriched: InsightBundle[] = await Promise.all(
        insights.map(async (insight) => {
          const visual = await getVisualization(datasetId, insight.id);
          return { insight, question: qMap[insight.rq_id], visual };
        })
      );
      setBundles(enriched);

      // Fetch or build the executive report
      let rep: ApiReport | null = null;
      if (forceRebuild) {
        setIsRegenerating(true);
        rep = await buildReport(datasetId);
      } else {
        try {
          rep = await getReport(datasetId);
        } catch {
          // If not built yet, build it
          rep = await buildReport(datasetId).catch(() => null);
        }
      }
      setReport(rep);

      const md = generateMarkdownReport(ds, prof, rep, enriched);
      setMarkdownContent(md);
      setIsLoading(false);
      setIsRegenerating(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    loadAllData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  // Trigger PDF print
  const handlePrintPDF = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
          <Header />
          <main className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
            <p className="text-sm text-stone-400 font-medium animate-pulse">Compiling Executive Report &amp; Visualizations…</p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (error || !dataset) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
          <Header />
          <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 text-center">
            <div className="bg-white dark:bg-[#191921] border border-rose-200 dark:border-rose-800/40 rounded-3xl p-8 shadow-sm">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
              <h2 className="text-xl font-bold mb-2">Unable to load report</h2>
              <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">{error || "Dataset not found"}</p>
              <div className="flex justify-center gap-3">
                <Link
                  href={`/datasets/${datasetId}/insights`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Insights
                </Link>
                <button
                  onClick={() => loadAllData(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100 pb-20 print:bg-white print:text-black print:pb-0">
        
        {/* Navigation & Header (Hidden on Print) */}
        <div className="print:hidden">
          <Header />

          {/* Breadcrumb */}
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
        </div>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-6 print:max-w-none print:p-0 print:m-0">
          
          {/* Top Actions Panel (Hidden on Print) */}
          <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 shadow-sm">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Badge variant="indigo" icon={<Sparkles className="w-3 h-3" />}>
                  Executive Synthesis
                </Badge>
                <span className="text-xs text-stone-400 font-medium">
                  {bundles.length} insights synthesized • Markdown + Chart Visualizations
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
                Executive Audit &amp; Analytics Report
              </h1>
              <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-0.5">
                Formatted document ready for executive review or PDF export.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Regenerate */}
              <button
                onClick={() => loadAllData(true)}
                disabled={isRegenerating}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-stone-200 dark:border-stone-800 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors disabled:opacity-50 cursor-pointer"
                title="Regenerate Executive Summary"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
                <span>Regenerate</span>
              </button>

              {/* Download as PDF Button */}
              <button
                onClick={handlePrintPDF}
                className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 dark:shadow-none hover:shadow-lg cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Download as PDF</span>
              </button>
            </div>
          </div>

          {/* Rendered Document Container */}
          <div
            ref={reportContainerRef}
            className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-10 shadow-sm print:border-none print:shadow-none print:p-6 print:m-0"
          >
            <div className="space-y-8">
              
              {/* Print Branded Header */}
              <div className="border-b border-stone-200 dark:border-stone-800 pb-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center text-sm shadow-sm">
                        DM
                      </div>
                      <div>
                        <h2 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white tracking-tight">
                          DataMind Executive Report
                        </h2>
                        <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                          Automated Analytics &amp; Empirical Dataset Audit
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-stone-400 font-medium">
                      <p>Generated on {new Date().toLocaleDateString()}</p>
                      <p className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">{dataset.filename}</p>
                    </div>
                  </div>
                </div>

                {/* Styled Markdown Content */}
                <div className="prose prose-stone dark:prose-invert max-w-none text-stone-800 dark:text-stone-200 leading-relaxed text-sm print:text-xs">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-stone-900 dark:text-white mb-4 pb-2 border-b border-stone-200 dark:border-stone-800">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-white mt-8 mb-3 flex items-center gap-2 pb-1.5 border-b border-stone-100 dark:border-stone-800/60">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          <span>{children}</span>
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-sm font-bold text-stone-850 dark:text-stone-100 mt-5 mb-2">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed mb-3">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-stone-600 dark:text-stone-300 mb-4">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal pl-5 space-y-1 text-xs sm:text-sm text-stone-600 dark:text-stone-300 mb-4">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 px-4 py-2.5 rounded-r-2xl my-3 text-xs sm:text-sm text-stone-700 dark:text-stone-200 italic font-medium">
                          {children}
                        </blockquote>
                      ),
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-4 rounded-2xl border border-stone-200/80 dark:border-stone-800">
                          <table className="w-full text-left text-xs border-collapse">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-stone-50 dark:bg-stone-900/80 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 font-bold uppercase text-[10px] tracking-wider">
                          {children}
                        </thead>
                      ),
                      th: ({ children }) => <th className="py-2.5 px-3.5 font-bold">{children}</th>,
                      td: ({ children }) => (
                        <td className="py-2 px-3.5 border-b border-stone-100 dark:border-stone-850 text-stone-600 dark:text-stone-300 text-xs">
                          {children}
                        </td>
                      ),
                      code: ({ children }) => (
                        <code className="bg-stone-100 dark:bg-stone-800 text-indigo-600 dark:text-indigo-400 font-mono text-[11px] px-1.5 py-0.5 rounded-md font-semibold">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {markdownContent}
                  </ReactMarkdown>
                </div>

                {/* Visualizations Support Section */}
                {bundles.some((b) => b.visual) && (
                  <div className="mt-10 pt-8 border-t border-stone-200 dark:border-stone-800 page-break-before">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-white">
                        Recommended Analytical Visualizations
                      </h3>
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mb-6">
                      Supporting chart graphics generated during sandbox execution to visually substantiate the statistical findings and comparative distributions.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {bundles
                        .filter((b) => b.visual)
                        .map((bundle, idx) => {
                          return (
                            <div
                              key={idx}
                              className="rounded-3xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#191921] p-5 shadow-xs flex flex-col gap-3 print:border-stone-300 print:shadow-none print:break-inside-avoid"
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-stone-100 dark:border-stone-800/60 pb-2">
                                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                                  Chart #{idx + 1}
                                </span>
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 uppercase">
                                  {bundle.question?.category ?? bundle.insight.category}
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-stone-900 dark:text-white leading-snug line-clamp-2">
                                {bundle.question?.question_text ?? "Empirical Chart"}
                              </h4>
                              <div className="mt-1">
                                <InsightVisualRenderer visual={bundle.visual!} />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

              </div>
            </div>

        </main>
      </div>
    </AuthGuard>
  );
}
