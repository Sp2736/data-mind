"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { BentoGrid, BentoCard } from "@/components/layout/BentoGrid";
import { Badge } from "@/components/ui/Badge";
import { getDatasetById } from "@/lib/mock/datasets";
import { getResearchQuestions } from "@/lib/mock/researchQuestions";
import { getInsightForRQ, Insight } from "@/lib/mock/insights";
import { getVisualizationForInsight, Visualization } from "@/lib/mock/visualizations";
import {
  ArrowLeft,
  ChevronRight,
  TrendingUp,
  FileText,
  PieChart,
  Grid,
  Sparkles,
  CheckCircle2,
  LineChart as LineChartIcon,
  Download,
  Share2,
  Bookmark
} from "lucide-react";

// --- CUSTOM SVG PASTEL CHART RENDERERS ---

function BarChart({ labels = [], values = [], title }: { labels?: string[], values?: number[], title: string }) {
  const maxVal = Math.max(...values, 10);
  const height = 180;
  const width = 360;
  const padding = 30;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const barWidth = (chartWidth / values.length) * 0.6;
  const gap = (chartWidth / values.length) * 0.4;
  
  const colors = [
    "fill-indigo-300 dark:fill-indigo-500/70",
    "fill-purple-300 dark:fill-purple-500/70",
    "fill-sky-300 dark:fill-sky-500/70",
    "fill-emerald-300 dark:fill-emerald-500/70",
    "fill-amber-300 dark:fill-amber-500/70"
  ];
  
  return (
    <div className="w-full flex flex-col items-center">
      <h5 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-2 truncate max-w-full">{title}</h5>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-48 overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
          const y = padding + chartHeight * (1 - p);
          return (
            <line key={idx} x1={padding} y1={y} x2={width - padding} y2={y} className="stroke-stone-200 dark:stroke-stone-800" strokeWidth={1} strokeDasharray="3 3" />
          );
        })}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-stone-300 dark:stroke-stone-700" strokeWidth={1.5} />
        
        {values.map((val, idx) => {
          const barHeight = (val / maxVal) * chartHeight;
          const x = padding + idx * (barWidth + gap) + gap / 2;
          const y = height - padding - barHeight;
          const color = colors[idx % colors.length];
          
          return (
            <g key={idx} className="group/bar cursor-pointer">
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={4} className={`${color} transition-all duration-300 hover:opacity-85`} />
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" className="text-[9px] font-bold fill-stone-600 dark:fill-stone-300 opacity-80 group-hover/bar:opacity-100 transition-opacity">
                {val}%
              </text>
              <text x={x + barWidth / 2} y={height - padding + 14} textAnchor="middle" className="text-[9px] font-semibold fill-stone-500 dark:fill-stone-400 select-none">
                {labels[idx] || ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DonutChart({ labels = [], values = [], title }: { labels?: string[], values?: number[], title: string }) {
  const total = values.reduce((a, b) => a + b, 0);
  const radius = 55;
  const circumference = 2 * Math.PI * radius;
  const center = 80;
  let accumulatedPercent = 0;
  
  const colors = [
    "stroke-indigo-300 dark:stroke-indigo-500/70",
    "stroke-purple-300 dark:stroke-purple-500/70",
    "stroke-sky-300 dark:stroke-sky-500/70",
    "stroke-emerald-300 dark:stroke-emerald-500/70",
    "stroke-amber-300 dark:stroke-amber-500/70"
  ];
  const legendBgColors = [
    "bg-indigo-300 dark:bg-indigo-500/70",
    "bg-purple-300 dark:bg-purple-500/70",
    "bg-sky-300 dark:bg-sky-500/70",
    "bg-emerald-300 dark:bg-emerald-500/70",
    "bg-amber-300 dark:bg-amber-500/70"
  ];

  return (
    <div className="w-full flex flex-col items-center">
      <h5 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-3 truncate max-w-full">{title}</h5>
      <div className="flex flex-col sm:flex-row items-center gap-6 justify-center w-full">
        <svg viewBox="0 0 160 160" className="w-32 h-32 overflow-visible shrink-0">
          {values.map((val, idx) => {
            const percent = val / total;
            const strokeDashoffset = circumference * (1 - percent);
            const rotation = accumulatedPercent * 360 - 90;
            accumulatedPercent += percent;
            const color = colors[idx % colors.length];

            return (
              <circle
                key={idx}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                className={`${color} transition-all duration-300 hover:opacity-85`}
                strokeWidth="18"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(${rotation} ${center} ${center})`}
              />
            );
          })}
          <circle cx={center} cy={center} r={radius - 9} className="fill-white dark:fill-[#191921]" />
          <text x={center} y={center - 2} textAnchor="middle" className="text-[8px] uppercase tracking-wider font-extrabold fill-stone-400">Total</text>
          <text x={center} y={center + 12} textAnchor="middle" className="text-xs font-black fill-stone-850 dark:fill-stone-100">{total}%</text>
        </svg>
        
        <div className="flex flex-col gap-1.5 text-[10px] w-full sm:w-auto font-medium">
          {labels.map((lbl, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${legendBgColors[idx % legendBgColors.length]} shrink-0`} />
              <span className="text-stone-600 dark:text-stone-300 truncate max-w-[130px] font-semibold">{lbl}</span>
              <span className="text-stone-400 font-bold ml-auto">{values[idx]}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LineChart({ labels = [], values = [], title }: { labels?: string[], values?: number[], title: string }) {
  const maxVal = Math.max(...values, 10);
  const minVal = Math.min(...values, 0);
  const height = 180;
  const width = 360;
  const padding = 30;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  
  const points = values.map((val, idx) => {
    const x = padding + (idx / (values.length - 1)) * chartWidth;
    const y = height - padding - ((val - minVal) / (maxVal - minVal)) * chartHeight;
    return { x, y, val };
  });
  
  const pathData = points.reduce((acc, p, idx) => {
    return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");

  return (
    <div className="w-full flex flex-col items-center">
      <h5 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-2 truncate max-w-full">{title}</h5>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-48 overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
          const y = padding + chartHeight * (1 - p);
          return (
            <g key={idx}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} className="stroke-stone-200 dark:stroke-stone-800" strokeWidth={1} strokeDasharray="3 3" />
              <text x={padding - 6} y={y + 3} textAnchor="end" className="text-[8px] font-semibold fill-stone-400">
                {Math.floor(minVal + p * (maxVal - minVal))}
              </text>
            </g>
          );
        })}
        
        <path d={pathData} fill="none" className="stroke-indigo-400 dark:stroke-indigo-500/80" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        
        {points.map((p, idx) => (
          <g key={idx} className="group/node cursor-pointer">
            <circle cx={p.x} cy={p.y} r={4} className="fill-indigo-600 dark:fill-indigo-400 stroke-white dark:stroke-stone-900" strokeWidth={1.5} />
            <circle cx={p.x} cy={p.y} r={8} className="fill-indigo-600/20 opacity-0 group-hover/node:opacity-100 transition-opacity" />
            <text x={p.x} y={p.y - 8} textAnchor="middle" className="text-[9px] font-extrabold fill-stone-700 dark:fill-stone-200 opacity-0 group-hover/node:opacity-100 transition-opacity pointer-events-none">
              {p.val}
            </text>
            {(idx % 2 === 0 || idx === values.length - 1) && (
              <text x={p.x} y={height - padding + 14} textAnchor="middle" className="text-[9px] font-semibold fill-stone-500 dark:fill-stone-400 select-none">
                {labels[idx] || ""}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ScatterPlot({ scatterData = [], title }: { scatterData?: { x: number, y: number, label?: string }[], title: string }) {
  const xValues = scatterData.map(d => d.x);
  const yValues = scatterData.map(d => d.y);
  const maxX = Math.max(...xValues, 10);
  const minX = Math.min(...xValues, 0);
  const maxY = Math.max(...yValues, 10);
  const minY = Math.min(...yValues, 0);
  
  const height = 180;
  const width = 360;
  const padding = 35;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;

  const points = scatterData.map(d => {
    const x = padding + ((d.x - minX) / (maxX - minX)) * chartWidth;
    const y = height - padding - ((d.y - minY) / (maxY - minY)) * chartHeight;
    return { x, y, dx: d.x, dy: d.y, label: d.label };
  });

  return (
    <div className="w-full flex flex-col items-center">
      <h5 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-2 truncate max-w-full">{title}</h5>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-48 overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
          const y = padding + chartHeight * (1 - p);
          const x = padding + chartWidth * p;
          return (
            <g key={idx}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} className="stroke-stone-200 dark:stroke-stone-850" strokeWidth={1} strokeDasharray="3 3" />
              <text x={padding - 6} y={y + 3} textAnchor="end" className="text-[8px] font-semibold fill-stone-400">
                {Math.floor(minY + p * (maxY - minY))}
              </text>
              <line x1={x} y1={padding} x2={x} y2={height - padding} className="stroke-stone-200 dark:stroke-stone-850" strokeWidth={1} strokeDasharray="3 3" />
              <text x={x} y={height - padding + 12} textAnchor="middle" className="text-[8px] font-semibold fill-stone-400">
                {Math.floor(minX + p * (maxX - minX))}
              </text>
            </g>
          );
        })}

        {points.map((p, idx) => {
          const isChurned = p.label === "Churned";
          const color = isChurned 
            ? "fill-rose-400/80 dark:fill-rose-500/70 stroke-rose-600 dark:stroke-rose-400/40" 
            : "fill-emerald-400/80 dark:fill-emerald-500/70 stroke-emerald-600 dark:stroke-emerald-400/40";
          
          return (
            <g key={idx} className="group/dot cursor-pointer">
              <circle cx={p.x} cy={p.y} r={4.5} className={`${color}`} strokeWidth={1} />
              <circle cx={p.x} cy={p.y} r={9} className="fill-stone-400/10 opacity-0 group-hover/dot:opacity-100 transition-opacity" />
              <title>
                {`x: ${p.dx}, y: ${p.dy} ${p.label ? `(${p.label})` : ''}`}
              </title>
            </g>
          );
        })}
      </svg>
      
      <div className="flex items-center gap-3 mt-3 text-[9px] font-bold text-stone-500 select-none">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400/80 dark:bg-emerald-500/70" />
          <span>Active / low correlation</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-400/80 dark:bg-rose-500/70" />
          <span>Churned / high correlation</span>
        </div>
      </div>
    </div>
  );
}

// --- MAIN PAGE COMPONENT ---

export default function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const datasetId = resolvedParams.id;
  const dataset = getDatasetById(datasetId);

  // Load research questions
  const allQuestions = getResearchQuestions(datasetId, dataset?.filename);
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<"all" | "pre-processing" | "eda">("all");

  // Read selected question IDs from sessionStorage
  useEffect(() => {
    let ids: string[] = [];
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(`datamind_selected_rqs_${datasetId}`);
      if (stored) {
        try {
          ids = JSON.parse(stored);
        } catch (e) {
          console.warn("Failed to parse selected RQs:", e);
        }
      }
    }
    
    // Fall back to all if empty
    if (ids.length === 0) {
      ids = allQuestions.map(q => q.id);
    }
    
    setSelectedIds(ids);
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

  // Filter questions that were selected and match the category filter
  const displayedQuestions = allQuestions.filter(q => 
    selectedIds.includes(q.id) && 
    (activeCategoryFilter === "all" || q.category === activeCategoryFilter)
  );

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100 pb-20">
        <Header />

        {/* Inner Progression Navigation Tracker */}
        <div className="border-b border-blue-100/60 dark:border-stone-800/80 bg-white/75 dark:bg-[#191921]/60 backdrop-blur-md sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between overflow-x-auto gap-4">
            <Link
              href={`/datasets/${datasetId}/status`}
              className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Execution</span>
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
          
          {/* Header section with export options */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="indigo" icon={<Sparkles className="w-3 h-3" />}>
                  FR-VIZ &amp; FR-RPT
                </Badge>
                <span className="text-xs text-stone-400 font-medium">Autonomous Report Dashboard</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                Analysis Insights Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                Explore cleaning metrics, statistical correlations, and interactive charts compiled by the Analyst Agent.
              </p>
            </div>

            {/* Export buttons */}
            <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-end">
              <button 
                onClick={() => alert("Cleaning code logs and execution summaries compiled. Cleaning report download started.")}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-stone-200 dark:border-stone-850 bg-white dark:bg-stone-800 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export cleaning report</span>
              </button>

              <Link
                href={`/datasets/${datasetId}/report`}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <span>Compile Final Report</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Sub category tabs filter */}
          <div className="flex items-center gap-2 border-b border-stone-200/60 dark:border-stone-800/80 pb-3 overflow-x-auto">
            <button
              onClick={() => setActiveCategoryFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeCategoryFilter === "all"
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              All Insights ({displayedQuestions.length})
            </button>
            <button
              onClick={() => setActiveCategoryFilter("pre-processing")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeCategoryFilter === "pre-processing"
                  ? "bg-purple-600 text-white dark:bg-purple-500"
                  : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              Cleaning &amp; Pre-processing
            </button>
            <button
              onClick={() => setActiveCategoryFilter("eda")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeCategoryFilter === "eda"
                  ? "bg-sky-600 text-white dark:bg-sky-500"
                  : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              Statistical Findings (EDA)
            </button>
          </div>

          {/* Empty state */}
          {displayedQuestions.length === 0 && (
            <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-12 text-center text-stone-400">
              <p className="text-sm font-semibold">No questions compiled</p>
              <p className="text-xs mt-1">Please go back to the Selection stage and select questions to run.</p>
            </div>
          )}

          {/* List of Insights cards */}
          <div className="flex flex-col gap-6">
            {displayedQuestions.map((q, idx) => {
              const insight = getInsightForRQ(q.id, q.question_text, q.category);
              const chartTypeFallback = q.expected_output_type === "chart" ? "bar" : "table";
              const visual = getVisualizationForInsight(insight.id, chartTypeFallback);
              const isPre = q.category === "pre-processing";

              return (
                <div 
                  key={q.id}
                  className={`bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col lg:flex-row gap-6 justify-between ${
                    isPre 
                      ? "border-l-4 border-l-purple-400/80 dark:border-l-purple-500/80" 
                      : "border-l-4 border-l-sky-400/80 dark:border-l-sky-500/80"
                  }`}
                >
                  
                  {/* Left Column: Narrative texts (Spans 3/5 on large) */}
                  <div className="flex-1 lg:max-w-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Finding #{idx + 1}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase ${
                        isPre
                          ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-100"
                          : "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-100"
                      }`}>
                        {q.category}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-white leading-snug">
                        {q.question_text}
                      </h3>
                      <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 mt-2.5 leading-relaxed">
                        {insight.summary_text}
                      </p>
                    </div>

                    {/* Key Takeaway list */}
                    <div className="bg-stone-50/50 dark:bg-stone-900/40 border border-stone-100 dark:border-stone-850 rounded-2xl p-4 space-y-2">
                      <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider block">Key Analytical Takeaways</span>
                      <ul className="space-y-1.5 text-xs text-stone-600 dark:text-stone-300 list-disc pl-4 font-semibold">
                        {insight.key_takeaways.map((takeaway, tIdx) => (
                          <li key={tIdx} className="leading-relaxed">
                            {takeaway}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Right Column: Dynamic SVG chart panel (Spans 2/5 on large) */}
                  <div className="w-full lg:w-[320px] shrink-0 border border-stone-100 dark:border-stone-800 bg-stone-50/30 dark:bg-stone-900/20 rounded-2xl p-4 flex flex-col justify-center items-center shadow-inner">
                    {visual.chart_type === "table" ? (
                      // Render Table fallback
                      <div className="w-full">
                        <h5 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-2.5 text-center truncate max-w-full">
                          {visual.chart_config.title}
                        </h5>
                        <div className="overflow-x-auto rounded-xl border border-stone-200/60 dark:border-stone-800 bg-white dark:bg-stone-950/20">
                          <table className="w-full text-left border-collapse text-[10px]">
                            <thead>
                              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 font-bold text-stone-500">
                                {visual.chart_config.table_headers?.map((header, hIdx) => (
                                  <th key={hIdx} className="py-2 px-2.5 whitespace-nowrap">{header}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visual.chart_config.table_rows?.map((row, rIdx) => (
                                <tr key={rIdx} className="border-b border-stone-100 dark:border-stone-800/40 hover:bg-stone-50/60 dark:hover:bg-stone-800/40 last:border-b-0 font-medium transition-colors">
                                  {visual.chart_config.table_headers?.map((header, hIdx) => (
                                    <td key={hIdx} className="py-2 px-2.5 text-stone-600 dark:text-stone-300 font-semibold">{row[header]}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : visual.chart_type === "bar" ? (
                      <BarChart 
                        labels={visual.chart_config.labels}
                        values={visual.chart_config.values}
                        title={visual.chart_config.title}
                      />
                    ) : visual.chart_type === "pie" ? (
                      <DonutChart
                        labels={visual.chart_config.labels}
                        values={visual.chart_config.values}
                        title={visual.chart_config.title}
                      />
                    ) : visual.chart_type === "line" ? (
                      <LineChart
                        labels={visual.chart_config.labels}
                        values={visual.chart_config.values}
                        title={visual.chart_config.title}
                      />
                    ) : (
                      // Scatter
                      <ScatterPlot
                        scatterData={visual.chart_config.scatter_data}
                        title={visual.chart_config.title}
                      />
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
