"use client";

import React, { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { getDataset, listQuestions, generateQuestions, triggerRuns, ApiResearchQuestion } from "@/lib/api/datasets";
import {
  ArrowLeft,
  ChevronRight,
  Play,
  CheckSquare,
  Square,
  Sparkles,
  PieChart,
  Grid,
  FileSpreadsheet,
  RefreshCw,
  Loader2,
  AlertCircle,
  Star,
  StarHalf,
} from "lucide-react";

function QualityBadge({ score, label }: { score: number; label: string | null }) {
  const colorMap: Record<number, string> = {
    5: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
    4: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800/40",
    3: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
    2: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/40",
    1: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40",
  };
  const color = colorMap[Math.min(Math.max(score, 1), 5)] ?? colorMap[3];
  const stars = "★".repeat(score) + "☆".repeat(5 - score);
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wide ${color}`}>
      <span className="tracking-tight">{stars}</span>
      <span className="uppercase">{label || `Q${score}`}</span>
    </span>
  );
}

function getOutputTypeConfig(type: string) {
  switch (type) {
    case "chart":
      return {
        label: "Chart Output",
        icon: <PieChart className="w-3 h-3 text-emerald-500" />,
        color: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40",
      };
    case "table":
      return {
        label: "Cleaned Table Output",
        icon: <FileSpreadsheet className="w-3 h-3 text-indigo-500" />,
        color: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40",
      };
    default:
      return {
        label: "Metric Summary",
        icon: <Grid className="w-3 h-3 text-purple-500" />,
        color: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-900/40",
      };
  }
}

type LoadingState = "loading-dataset" | "loading-questions" | "generating" | "triggering" | "ready" | "error";

export default function RQSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const datasetId = resolvedParams.id;

  const [loadingState, setLoadingState] = useState<LoadingState>("loading-dataset");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [dataset, setDataset] = useState<{ id: string; filename: string } | null>(null);
  const [questions, setQuestions] = useState<ApiResearchQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "pre-processing" | "eda">("all");

  // Load dataset then questions
  const loadData = useCallback(async (regenerate = false) => {
    setErrorMsg(null);
    try {
      if (!dataset) {
        setLoadingState("loading-dataset");
        const ds = await getDataset(datasetId);
        setDataset({ id: ds.id, filename: ds.filename });
      }

      if (regenerate) {
        setLoadingState("generating");
        const generated = await generateQuestions(datasetId);
        setQuestions(generated);
        setSelectedIds(generated.map(q => q.id));
      } else {
        setLoadingState("loading-questions");
        let existing = await listQuestions(datasetId);
        if (existing.length === 0) {
          setLoadingState("generating");
          existing = await generateQuestions(datasetId);
        }
        setQuestions(existing);
        setSelectedIds(existing.map(q => q.id));
      }

      setLoadingState("ready");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setLoadingState("error");
    }
  }, [datasetId, dataset]);

  useEffect(() => {
    loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => setSelectedIds(questions.map(q => q.id));
  const handleClearAll = () => setSelectedIds([]);

  const handleRunSelected = async () => {
    if (selectedIds.length === 0) return;
    setLoadingState("triggering");
    try {
      await triggerRuns(datasetId, selectedIds);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(`datamind_selected_rqs_${datasetId}`, JSON.stringify(selectedIds));
      }
      router.push(`/datasets/${datasetId}/status`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setLoadingState("ready");
    }
  };

  const preprocessingQuestions = questions.filter(q => q.category === "pre-processing");
  const edaQuestions = questions.filter(q => q.category === "eda");
  const displayedQuestions = questions.filter(q =>
    activeTab === "all" ? true : q.category === activeTab
  );

  const isLoading = loadingState !== "ready" && loadingState !== "error";

  // Loading state
  if (loadingState === "loading-dataset" || (loadingState === "loading-questions" && questions.length === 0)) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-(--background) text-(--foreground)">
          <Header />
          <main className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            <p className="text-sm text-stone-400 animate-pulse">
              {loadingState === "loading-dataset" ? "Loading dataset…" : "Fetching research questions…"}
            </p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (loadingState === "generating" && questions.length === 0) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-(--background) text-(--foreground)">
          <Header />
          <main className="flex-1 flex flex-col items-center justify-center gap-4 max-w-md mx-auto text-center px-4">
            <div className="p-4 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40">
              <Sparkles className="w-8 h-8 text-indigo-500 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-1">
                Generating Research Questions
              </h2>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                The AI orchestrator is analysing your dataset profile and generating tailored research questions. This takes 10–30 seconds…
              </p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (loadingState === "error" && questions.length === 0) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-(--background) text-(--foreground)">
          <Header />
          <main className="flex-1 flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white dark:bg-[#191921] border border-rose-200 dark:border-rose-800/40 rounded-3xl p-8 shadow-sm text-center">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
              <h2 className="text-lg font-bold mb-2">Failed to load questions</h2>
              <p className="text-sm text-stone-500 dark:text-stone-400 mb-5">{errorMsg}</p>
              <button
                onClick={() => loadData(false)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-(--background) text-(--foreground) pb-28">
        <Header />

        {/* Stage breadcrumb */}
        <div className="border-b border-blue-100/60 dark:border-stone-800/80 bg-white/75 dark:bg-[#191921]/60 backdrop-blur-md sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between overflow-x-auto gap-4">
            <Link
              href={`/datasets/${datasetId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Data Profile</span>
            </Link>
            <div className="flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs text-stone-400 shrink-0">
              <Link href={`/datasets/${datasetId}`} className="hover:text-stone-600 dark:hover:text-stone-300">1. Data Profile</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40">2. Research Questions</span>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="cursor-not-allowed">3. Execution Logs</span>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="cursor-not-allowed">4. Analysis Insights</span>
            </div>
            <div className="w-10 sm:w-20 shrink-0" />
          </div>
        </div>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="indigo" icon={<Sparkles className="w-3 h-3" />}>
                AI-Generated Questions
              </Badge>
              <span className="text-xs text-stone-400 font-medium">
                {questions.length} questions • quality-scored by LLM
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                  Select Research Questions
                </h1>
                <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1 max-w-3xl leading-relaxed">
                  The orchestrator generated these questions from{" "}
                  <code className="bg-white dark:bg-stone-800 px-1 rounded text-indigo-600 dark:text-indigo-400">
                    {dataset?.filename}
                  </code>
                  &apos;s profile. Each question has been rated for quality. Select the ones to run.
                </p>
              </div>
              <button
                onClick={() => loadData(true)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-stone-200 dark:border-stone-800 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
              >
                {loadingState === "generating" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Regenerate Questions
              </button>
            </div>
          </div>

          {/* Error banner (non-fatal) */}
          {loadingState === "error" && questions.length > 0 && (
            <div className="mb-4 flex items-center gap-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-2xl px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 mb-6 border-b border-stone-200/60 dark:border-stone-800/80 pb-3 overflow-x-auto">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${activeTab === "all" ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}
            >
              All Questions ({questions.length})
            </button>
            <button
              onClick={() => setActiveTab("pre-processing")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${activeTab === "pre-processing" ? "bg-purple-600 text-white dark:bg-purple-500" : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}
            >
              Pre-processing ({preprocessingQuestions.length})
            </button>
            <button
              onClick={() => setActiveTab("eda")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${activeTab === "eda" ? "bg-sky-600 text-white dark:bg-sky-500" : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}
            >
              Exploratory Analysis ({edaQuestions.length})
            </button>
          </div>

          {/* Question cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedQuestions.map((q) => {
              const isSelected = selectedIds.includes(q.id);
              const outputStyle = getOutputTypeConfig(q.expected_output_type);
              const isPre = q.category === "pre-processing";

              return (
                <div
                  key={q.id}
                  onClick={() => toggleSelect(q.id)}
                  className={`group relative rounded-3xl bg-white dark:bg-[#191921] border p-6 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer select-none flex flex-col justify-between ${
                    isSelected
                      ? isPre
                        ? "border-purple-300 dark:border-purple-800/80 ring-1 ring-purple-100 dark:ring-purple-950/20"
                        : "border-sky-300 dark:border-sky-800/80 ring-1 ring-sky-100 dark:ring-sky-950/20"
                      : "border-stone-200/80 dark:border-stone-800/90"
                  } ${isPre
                    ? "border-l-4 border-l-purple-400/80 dark:border-l-purple-500/80"
                    : "border-l-4 border-l-sky-400/80 dark:border-l-sky-500/80"
                  }`}
                >
                  <div className="flex gap-4 items-start mb-4">
                    {/* Checkbox */}
                    <div className="shrink-0 mt-0.5">
                      {isSelected ? (
                        <CheckSquare className={`w-5 h-5 ${isPre ? "text-purple-600 dark:text-purple-400" : "text-sky-600 dark:text-sky-400"}`} />
                      ) : (
                        <Square className="w-5 h-5 text-stone-300 dark:text-stone-700" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase ${isPre ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-900/40" : "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-100 dark:border-sky-900/40"}`}>
                          {q.category}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${outputStyle.color}`}>
                          {outputStyle.icon}
                          <span>{outputStyle.label}</span>
                        </span>
                        <QualityBadge score={q.quality_score} label={q.quality_label} />
                      </div>

                      <h3 className="text-sm font-bold text-stone-900 dark:text-stone-50 leading-snug mb-2">
                        {q.question_text}
                      </h3>
                      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                        {q.rationale}
                      </p>
                    </div>
                  </div>

                  {/* Target columns */}
                  <div className="pt-3.5 border-t border-stone-100 dark:border-stone-800/80 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mr-1">Target fields:</span>
                    {q.target_columns.map(col => (
                      <span key={col} className="inline-flex items-center text-[10px] font-semibold text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800 py-0.5 px-2 rounded-lg">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {displayedQuestions.length === 0 && loadingState === "ready" && (
            <div className="text-center py-16 text-stone-400">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-semibold">No questions in this category.</p>
            </div>
          )}
        </main>

        {/* Sticky bottom action bar */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-blue-100/80 dark:border-stone-800 bg-white/95 dark:bg-[#191921]/90 backdrop-blur-md shadow-lg z-30 py-4 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div>
                <span className="text-sm font-bold text-stone-800 dark:text-stone-200">
                  {selectedIds.length} of {questions.length} Questions Selected
                </span>
                <p className="text-[11px] text-stone-400 mt-0.5 font-medium">
                  Select research questions to compile into the sandbox run.
                </p>
              </div>
              <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-stone-200/80 dark:border-stone-800 pt-2 sm:pt-0 sm:pl-3.5 text-xs">
                <button onClick={handleSelectAll} className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer">Select All</button>
                <span className="text-stone-300 dark:text-stone-700">|</span>
                <button onClick={handleClearAll} className="text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 font-semibold hover:underline cursor-pointer">Clear All</button>
              </div>
            </div>

            <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
              <Link
                href={`/datasets/${datasetId}`}
                className="px-4 py-2.5 text-xs font-semibold border border-stone-200/80 dark:border-stone-800 rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
              >
                Back to Profile
              </Link>
              <button
                onClick={handleRunSelected}
                disabled={selectedIds.length === 0 || loadingState === "triggering"}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer group"
              >
                {loadingState === "triggering" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>{loadingState === "triggering" ? "Starting…" : "Run Selected Pipeline"}</span>
                {loadingState !== "triggering" && <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
