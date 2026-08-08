"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { BentoGrid, BentoCard } from "@/components/layout/BentoGrid";
import { Badge } from "@/components/ui/Badge";
import { getDatasetById } from "@/lib/mock/datasets";
import { getResearchQuestions, ResearchQuestion } from "@/lib/mock/researchQuestions";
import {
  ArrowLeft,
  ChevronRight,
  Play,
  CheckSquare,
  Square,
  Sparkles,
  Settings2,
  PieChart,
  Grid,
  FileSpreadsheet,
  Layers,
  Database,
  RefreshCw,
  Plus
} from "lucide-react";

export default function RQSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const datasetId = resolvedParams.id;
  const dataset = getDatasetById(datasetId);

  // Fetch all research questions
  const allQuestions = getResearchQuestions(datasetId, dataset?.filename);

  // State to track selected RQs
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "pre-processing" | "eda">("all");

  // Select all questions by default on load
  useEffect(() => {
    if (allQuestions.length > 0) {
      setSelectedIds(allQuestions.map(q => q.id));
    }
  }, [datasetId]);

  if (!dataset) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-(--background) text-(--foreground)">
          <Header />
          <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 text-center">
            <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-8 shadow-sm">
              <h2 className="text-xl font-semibold mb-2">Dataset Not Found</h2>
              <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
                The dataset ID <code className="bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">{datasetId}</code> could not be located in your workspace.
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

  // Group questions
  const preprocessingQuestions = allQuestions.filter(q => q.category === "pre-processing");
  const edaQuestions = allQuestions.filter(q => q.category === "eda");

  // Filter based on active tab
  const displayedQuestions = allQuestions.filter(q => {
    if (activeTab === "all") return true;
    return q.category === activeTab;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllCategory = (category: 'pre-processing' | 'eda') => {
    const categoryIds = allQuestions.filter(q => q.category === category).map(q => q.id);
    setSelectedIds(prev => {
      // Add all ids of this category if not present
      const otherCategoryIds = prev.filter(id => !categoryIds.includes(id));
      return [...otherCategoryIds, ...categoryIds];
    });
  };

  const deselectAllCategory = (category: 'pre-processing' | 'eda') => {
    const categoryIds = allQuestions.filter(q => q.category === category).map(q => q.id);
    setSelectedIds(prev => prev.filter(id => !categoryIds.includes(id)));
  };

  const handleSelectAll = () => {
    setSelectedIds(allQuestions.map(q => q.id));
  };

  const handleClearAll = () => {
    setSelectedIds([]);
  };

  const handleRunSelected = () => {
    if (selectedIds.length === 0) return;
    
    // Save to sessionStorage to simulate execution status page transition
    if (typeof window !== "undefined") {
      sessionStorage.setItem(`datamind_selected_rqs_${datasetId}`, JSON.stringify(selectedIds));
    }
    
    router.push(`/datasets/${datasetId}/status`);
  };

  // Expected output type styling helpers
  const getOutputTypeConfig = (type: 'table' | 'chart' | 'metric') => {
    switch (type) {
      case "chart":
        return {
          label: "Chart Output",
          icon: <PieChart className="w-3 h-3 text-emerald-500" />,
          color: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40"
        };
      case "table":
        return {
          label: "Cleaned Table Output",
          icon: <FileSpreadsheet className="w-3 h-3 text-indigo-500" />,
          color: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40"
        };
      case "metric":
        return {
          label: "Metric summary",
          icon: <Grid className="w-3 h-3 text-purple-500" />,
          color: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-900/40"
        };
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-(--background) text-(--foreground) pb-28">
        <Header />

        {/* Stage Progression Navigation Bar */}
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
          {/* Main Title Card */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="indigo" icon={<Sparkles className="w-3 h-3" />}>
                FR-PLAN-01 &amp; FR-PLAN-02
              </Badge>
              <span className="text-xs text-stone-400 font-medium">Automatic Pipeline Mapping</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Select Research Questions
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1 max-w-3xl leading-relaxed">
              Based on the metadata profile of <code className="bg-white dark:bg-stone-800 px-1 rounded text-indigo-600 dark:text-indigo-400">{dataset.filename}</code>, DataMind has inferred the following analytical pathways. Select the cleaning and analysis targets to formulate your insight report.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 mb-6 border-b border-stone-200/60 dark:border-stone-800/80 pb-3 overflow-x-auto">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeTab === "all"
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              All Questions ({allQuestions.length})
            </button>
            <button
              onClick={() => setActiveTab("pre-processing")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeTab === "pre-processing"
                  ? "bg-purple-600 text-white dark:bg-purple-500"
                  : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              Pre-processing ({preprocessingQuestions.length})
            </button>
            <button
              onClick={() => setActiveTab("eda")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeTab === "eda"
                  ? "bg-sky-600 text-white dark:bg-sky-500"
                  : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              Exploratory Analysis (EDA) ({edaQuestions.length})
            </button>
          </div>

          {/* Bento Grid layout of questions */}
          <BentoGrid>
            {displayedQuestions.map((q) => {
              const isSelected = selectedIds.includes(q.id);
              const outputStyle = getOutputTypeConfig(q.expected_output_type);
              const isPre = q.category === "pre-processing";

              return (
                <div
                  key={q.id}
                  onClick={() => toggleSelect(q.id)}
                  className={`group relative rounded-3xl bg-white dark:bg-[#191921] border p-6 sm:p-7 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer select-none col-span-1 md:col-span-2 lg:col-span-2 flex flex-col justify-between ${
                    isSelected
                      ? isPre
                        ? "border-purple-300 dark:border-purple-800/80 bg-purple-50/10 dark:bg-purple-950/5 ring-1 ring-purple-100 dark:ring-purple-950/20"
                        : "border-sky-300 dark:border-sky-800/80 bg-sky-50/10 dark:bg-sky-950/5 ring-1 ring-sky-100 dark:ring-sky-950/20"
                      : "border-stone-200/80 dark:border-stone-800/90"
                  } ${
                    isPre 
                      ? "border-l-4 border-l-purple-400/80 dark:border-l-purple-500/80" 
                      : "border-l-4 border-l-sky-400/80 dark:border-l-sky-500/80"
                  }`}
                >
                  <div className="flex gap-4 items-start mb-4">
                    {/* Checkbox Selector Icon */}
                    <div className="shrink-0 mt-0.5">
                      {isSelected ? (
                        <CheckSquare className={`w-5 h-5 ${isPre ? "text-purple-600 dark:text-purple-400" : "text-sky-600 dark:text-sky-400"}`} />
                      ) : (
                        <Square className="w-5 h-5 text-stone-300 dark:text-stone-700" />
                      )}
                    </div>

                    <div>
                      {/* Category Badge & Output indicator */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase ${
                          isPre
                            ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-900/40"
                            : "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-100 dark:border-sky-900/40"
                        }`}>
                          {q.category}
                        </span>
                        
                        {outputStyle && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${outputStyle.color}`}>
                            {outputStyle.icon}
                            <span>{outputStyle.label}</span>
                          </span>
                        )}
                      </div>

                      {/* Question Text */}
                      <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-50 leading-snug mb-2">
                        {q.question_text}
                      </h3>
                      
                      {/* Rationale explanation */}
                      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed font-medium">
                        {q.rationale}
                      </p>
                    </div>
                  </div>

                  {/* Target Column Pills */}
                  <div className="pt-3.5 border-t border-stone-100 dark:border-stone-800/80 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mr-1">Target fields:</span>
                    {q.target_columns.map(col => (
                      <span
                        key={col}
                        className="inline-flex items-center text-[10px] font-semibold text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800 py-0.5 px-2 rounded-lg"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </BentoGrid>
        </main>

        {/* Floating / Sticky bottom action control bar */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-blue-100/80 dark:border-stone-800 bg-white/95 dark:bg-[#191921]/90 backdrop-blur-md shadow-lg shadow-blue-100/40 dark:shadow-none z-30 py-4 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            {/* Left Selection status details */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div>
                <span className="text-sm font-bold text-stone-800 dark:text-stone-200">
                  {selectedIds.length} of {allQuestions.length} Questions Selected
                </span>
                <p className="text-[11px] text-stone-400 mt-0.5 font-medium">
                  Select pathways to compile into the autonomous Coder/Analyst sandbox run.
                </p>
              </div>

              {/* Action shortcuts */}
              <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-stone-200/80 dark:border-stone-800 pt-2 sm:pt-0 sm:pl-3.5 text-xs">
                <button
                  onClick={handleSelectAll}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-stone-300 dark:text-stone-700">|</span>
                <button
                  onClick={handleClearAll}
                  className="text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 font-semibold hover:underline cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Right Action buttons */}
            <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
              <Link
                href={`/datasets/${datasetId}`}
                className="px-4 py-2.5 text-xs font-semibold border border-stone-200/80 dark:border-stone-800 rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
              >
                Back to Profile
              </Link>
              
              <button
                onClick={handleRunSelected}
                disabled={selectedIds.length === 0}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer group"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Selected Pipeline</span>
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
