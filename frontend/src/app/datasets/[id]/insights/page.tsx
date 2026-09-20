"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import {
  listInsights,
  listQuestions,
  getVisualization,
  getDataset,
  ApiInsight,
  ApiVisualization,
  ApiResearchQuestion,
} from "@/lib/api/datasets";
import {
  ArrowLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { InsightVisualRenderer } from "@/components/charts/InsightChart";

// Categories that the LLM assigns at question-generation time.
// The DB stores whatever string the LLM chose, so we group them here.
// These must stay in sync with the valid category values in question_generator_system_prompt.md
const EDA_CATEGORIES = new Set(["eda", "correlation", "trend", "anomaly", "segmentation", "distribution", "comparison", "statistical", "summary"]);
const CLEANING_CATEGORIES = new Set(["pre-processing", "preprocessing", "cleaning", "data_cleaning", "data-cleaning", "pre_processing"]);

function resolveTabGroup(category: string): "pre-processing" | "eda" | "other" {
  const c = (category ?? "").toLowerCase().trim();
  if (CLEANING_CATEGORIES.has(c)) return "pre-processing";
  if (EDA_CATEGORIES.has(c)) return "eda";
  // Partial match fallback
  if (c.includes("clean") || c.includes("preprocess") || c.includes("pre-process")) return "pre-processing";
  return "eda"; // Default unknown categories to EDA so they're not lost
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface InsightWithExtras {
  insight: ApiInsight;
  question?: ApiResearchQuestion;
  visual?: ApiVisualization | null;
}

export default function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const datasetId = resolvedParams.id;

  const [datasetName, setDatasetName] = useState<string>("");
  const [items, setItems] = useState<InsightWithExtras[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<"all" | "pre-processing" | "eda">("all");

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const [ds, insights, questions] = await Promise.all([
          getDataset(datasetId).catch(() => null),
          listInsights(datasetId),
          listQuestions(datasetId).catch(() => [] as ApiResearchQuestion[]),
        ]);

        if (!isMounted) return;
        if (ds) setDatasetName(ds.filename);

        const qMap = Object.fromEntries(questions.map(q => [q.id, q]));

        const enriched: InsightWithExtras[] = await Promise.all(
          insights.map(async (insight) => {
            const visual = await getVisualization(datasetId, insight.id);
            return { insight, question: qMap[insight.rq_id], visual };
          })
        );

        if (isMounted) {
          setItems(enriched);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [datasetId]);

  const displayed = items.filter(({ insight, question }) => {
    if (activeCategoryFilter === "all") return true;
    const rawCategory = question?.category ?? insight.category ?? "";
    return resolveTabGroup(rawCategory) === activeCategoryFilter;
  });

  const cleaningCount = items.filter(({ insight, question }) =>
    resolveTabGroup(question?.category ?? insight.category ?? "") === "pre-processing"
  ).length;
  const edaCount = items.filter(({ insight, question }) =>
    resolveTabGroup(question?.category ?? insight.category ?? "") === "eda"
  ).length;

  if (isLoading) return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216]">
        <Header />
        <main className="flex-1 flex items-center justify-center gap-3 flex-col">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          <p className="text-sm text-stone-400 animate-pulse">Loading insights…</p>
        </main>
      </div>
    </AuthGuard>
  );

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100 pb-20">
        <Header />

        {/* Breadcrumb */}
        <div className="border-b border-blue-100/60 dark:border-stone-800/80 bg-white/75 dark:bg-[#191921]/60 backdrop-blur-md sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between overflow-x-auto gap-4">
            <Link href={`/datasets/${datasetId}/status`} className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors shrink-0">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Execution
            </Link>
            <div className="flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs text-stone-400 shrink-0">
              <Link href={`/datasets/${datasetId}`} className="hover:text-stone-600 dark:hover:text-stone-300">1. Data Profile</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <Link href={`/datasets/${datasetId}/rqs`} className="hover:text-stone-600 dark:hover:text-stone-300">2. Research Questions</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <Link href={`/datasets/${datasetId}/status`} className="hover:text-stone-600 dark:hover:text-stone-300">3. Execution Logs</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40">4. Analysis Insights</span>
            </div>
            <div className="w-10 sm:w-20 shrink-0" />
          </div>
        </div>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-6">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="indigo" icon={<Sparkles className="w-3 h-3" />}>Autonomous Report</Badge>
                <span className="text-xs text-stone-400 font-medium">{items.length} insight{items.length !== 1 ? "s" : ""} generated</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                Analysis Insights Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                LLM-generated findings for{" "}
                <code className="bg-white dark:bg-stone-800 px-1 rounded text-indigo-600 dark:text-indigo-400">{datasetName || datasetId}</code>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-end">
              <Link
                href={`/datasets/${datasetId}/report`}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
              >
                <span>Compile Final Report</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Category filter tabs */}
          <div className="flex items-center gap-2 border-b border-stone-200/60 dark:border-stone-800/80 pb-3 overflow-x-auto">
            {(["all", "pre-processing", "eda"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveCategoryFilter(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                  activeCategoryFilter === tab
                    ? tab === "all" ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                      : tab === "pre-processing" ? "bg-purple-600 text-white"
                      : "bg-sky-600 text-white"
                    : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
                }`}
              >
                {tab === "all"
                  ? `All Insights (${items.length})`
                  : tab === "pre-processing"
                  ? `Cleaning & Pre-processing (${cleaningCount})`
                  : `Statistical Findings (EDA) (${edaCount})`}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-2xl px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Empty state */}
          {displayed.length === 0 && !error && (
            <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-12 text-center text-stone-400">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-semibold">No insights available yet.</p>
              <p className="text-xs mt-1">Run the pipeline first, or check back shortly.</p>
            </div>
          )}

          {/* Insight cards */}
          <div className="flex flex-col gap-6">
            {displayed.map(({ insight, question, visual }, idx) => {
                const rawCategory = question?.category ?? insight.category ?? "";
                const isPre = resolveTabGroup(rawCategory) === "pre-processing";
              return (
                <div
                  key={insight.id}
                  className={`bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col lg:flex-row gap-6 justify-between ${
                    isPre
                      ? "border-l-4 border-l-purple-400/80 dark:border-l-purple-500/80"
                      : "border-l-4 border-l-sky-400/80 dark:border-l-sky-500/80"
                  }`}
                >
                  {/* Left: text */}
                  <div className="flex-1 lg:max-w-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Finding #{idx + 1}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase ${isPre ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-100" : "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-100"}`}>
                        {question?.category ?? insight.category}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-white leading-snug">
                        {question?.question_text ?? `Insight from run ${insight.run_id.slice(-8)}`}
                      </h3>
                      <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 mt-2.5 leading-relaxed">
                        {insight.summary_text}
                      </p>
                    </div>

                    {insight.key_takeaways?.length > 0 && (
                      <div className="bg-stone-50/50 dark:bg-stone-900/40 border border-stone-100 dark:border-stone-850 rounded-2xl p-4 space-y-2">
                        <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider block">Key Analytical Takeaways</span>
                        <ul className="space-y-1.5 text-xs text-stone-600 dark:text-stone-300 list-disc pl-4 font-semibold">
                          {insight.key_takeaways.map((t, i) => <li key={i} className="leading-relaxed">{t}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Right: chart */}
                  <div className="w-full lg:w-[340px] shrink-0 border border-stone-100 dark:border-stone-800 bg-stone-50/30 dark:bg-stone-900/20 rounded-2xl p-4 flex flex-col justify-center items-center shadow-inner">
                    {visual ? (
                      <InsightVisualRenderer visual={visual} compact />
                    ) : (
                      <div className="text-center text-stone-400 py-6">
                        <FileSpreadsheet className="w-6 h-6 mx-auto mb-2 opacity-40" />
                        <p className="text-xs">No visualization for this insight.</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
