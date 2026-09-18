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
  getDatasetComparison,
  getCleanedDatasetUrl,
  ApiInsight,
  ApiVisualization,
  ApiResearchQuestion,
  DatasetComparison,
} from "@/lib/api/datasets";
import {
  ArrowLeft,
  ChevronRight,
  Sparkles,
  Download,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Minus,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";

// ─── SVG Chart Components (unchanged from original) ──────────────────────────

function BarChart({ labels = [], values = [], title }: { labels?: string[]; values?: number[]; title: string }) {
  const maxVal = Math.max(...values, 10);
  const height = 180, width = 360, padding = 30;
  const chartHeight = height - padding * 2, chartWidth = width - padding * 2;
  const barWidth = (chartWidth / Math.max(values.length, 1)) * 0.6;
  const gap = (chartWidth / Math.max(values.length, 1)) * 0.4;
  const colors = ["fill-indigo-300 dark:fill-indigo-500/70", "fill-purple-300 dark:fill-purple-500/70", "fill-sky-300 dark:fill-sky-500/70", "fill-emerald-300 dark:fill-emerald-500/70", "fill-amber-300 dark:fill-amber-500/70"];
  return (
    <div className="w-full flex flex-col items-center">
      <h5 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-2 truncate max-w-full">{title}</h5>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-48 overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => <line key={i} x1={padding} y1={padding + chartHeight * (1 - p)} x2={width - padding} y2={padding + chartHeight * (1 - p)} className="stroke-stone-200 dark:stroke-stone-800" strokeWidth={1} strokeDasharray="3 3" />)}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-stone-300 dark:stroke-stone-700" strokeWidth={1.5} />
        {values.map((val, i) => {
          const bh = (val / maxVal) * chartHeight;
          const x = padding + i * (barWidth + gap) + gap / 2;
          const y = height - padding - bh;
          return (
            <g key={i} className="group/bar cursor-pointer">
              <rect x={x} y={y} width={barWidth} height={bh} rx={4} className={`${colors[i % colors.length]} hover:opacity-85 transition-all`} />
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" className="text-[9px] font-bold fill-stone-600 dark:fill-stone-300 opacity-80">{val}%</text>
              <text x={x + barWidth / 2} y={height - padding + 14} textAnchor="middle" className="text-[9px] fill-stone-500 dark:fill-stone-400">{labels[i] ?? ""}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DonutChart({ labels = [], values = [], title }: { labels?: string[]; values?: number[]; title: string }) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const r = 55, circ = 2 * Math.PI * r, cx = 80;
  // Pre-compute cumulative percentages to avoid mutation inside render
  const cumulativePercents = values.reduce<number[]>((acc, v) => {
    acc.push((acc[acc.length - 1] ?? 0) + v / total);
    return acc;
  }, []);
  const colors = ["stroke-indigo-300 dark:stroke-indigo-500/70", "stroke-purple-300 dark:stroke-purple-500/70", "stroke-sky-300 dark:stroke-sky-500/70", "stroke-emerald-300 dark:stroke-emerald-500/70", "stroke-amber-300 dark:stroke-amber-500/70"];
  const bgColors = ["bg-indigo-300 dark:bg-indigo-500/70", "bg-purple-300 dark:bg-purple-500/70", "bg-sky-300 dark:bg-sky-500/70", "bg-emerald-300 dark:bg-emerald-500/70", "bg-amber-300 dark:bg-amber-500/70"];
  return (
    <div className="w-full flex flex-col items-center">
      <h5 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-3 truncate max-w-full">{title}</h5>
      <div className="flex flex-col sm:flex-row items-center gap-6 justify-center w-full">
        <svg viewBox="0 0 160 160" className="w-32 h-32 shrink-0">
          {values.map((v, i) => {
            const pct = v / total;
            const offset = circ * (1 - pct);
            const prevAcc = i === 0 ? 0 : cumulativePercents[i - 1];
            const rot = prevAcc * 360 - 90;
            return <circle key={i} cx={cx} cy={cx} r={r} fill="transparent" className={colors[i % colors.length]} strokeWidth="18" strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(${rot} ${cx} ${cx})`} />;
          })}
          <circle cx={cx} cy={cx} r={r - 9} className="fill-white dark:fill-[#191921]" />
          <text x={cx} y={cx + 5} textAnchor="middle" className="text-[10px] font-black fill-stone-800 dark:fill-stone-100">{total}%</text>
        </svg>
        <div className="flex flex-col gap-1.5 text-[10px] font-medium">
          {labels.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${bgColors[i % bgColors.length]} shrink-0`} />
              <span className="text-stone-600 dark:text-stone-300 truncate max-w-32 font-semibold">{l}</span>
              <span className="text-stone-400 font-bold ml-auto">{values[i]}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LineChart({ labels = [], values = [], title }: { labels?: string[]; values?: number[]; title: string }) {
  const maxVal = Math.max(...values, 10), minVal = Math.min(...values, 0);
  const h = 180, w = 360, p = 30, ch = h - p * 2, cw = w - p * 2;
  const pts = values.map((v, i) => ({ x: p + (i / Math.max(values.length - 1, 1)) * cw, y: h - p - ((v - minVal) / (maxVal - minVal || 1)) * ch, v }));
  const d = pts.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, "");
  return (
    <div className="w-full flex flex-col items-center">
      <h5 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-2 truncate max-w-full">{title}</h5>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto max-h-48 overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => { const y = p + ch * (1 - pct); return <g key={i}><line x1={p} y1={y} x2={w - p} y2={y} className="stroke-stone-200 dark:stroke-stone-800" strokeWidth={1} strokeDasharray="3 3" /><text x={p - 6} y={y + 3} textAnchor="end" className="text-[8px] fill-stone-400">{Math.floor(minVal + pct * (maxVal - minVal))}</text></g>; })}
        <path d={d} fill="none" className="stroke-indigo-400 dark:stroke-indigo-500/80" strokeWidth={2.5} strokeLinecap="round" />
        {pts.map((pt, i) => (
          <g key={i} className="group/node cursor-pointer">
            <circle cx={pt.x} cy={pt.y} r={4} className="fill-indigo-600 dark:fill-indigo-400 stroke-white dark:stroke-stone-900" strokeWidth={1.5} />
            <text x={pt.x} y={pt.y - 8} textAnchor="middle" className="text-[9px] font-extrabold fill-stone-700 dark:fill-stone-200 opacity-0 group-hover/node:opacity-100 transition-opacity">{pt.v}</text>
            {(i % 2 === 0 || i === values.length - 1) && <text x={pt.x} y={h - p + 14} textAnchor="middle" className="text-[9px] fill-stone-500 dark:fill-stone-400">{labels[i] ?? ""}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

// Categories that the LLM assigns at question-generation time.
// The DB stores whatever string the LLM chose, so we group them here.
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

function renderChart(visual: ApiVisualization) {
  const cfg = visual.chart_config as Record<string, unknown>;

  // "interactive" is the chart_type stored by visualization_builder node.
  // chart_config is a VisualizationSpec: { charts: InteractiveChart[], rationale: string }
  if (visual.chart_type === "interactive") {
    const charts = cfg.charts as Array<{
      chart_type: string; title: string; description?: string;
      x_axis_key: string; y_axis_keys: string[];
      data: Array<Record<string, unknown>>;
    }> | undefined;
    if (!charts || charts.length === 0) {
      return <p className="text-xs text-stone-400 text-center">No chart data available.</p>;
    }
    return (
      <div className="w-full flex flex-col gap-4">
        {charts.slice(0, 2).map((chart, i) => {
          const labels = chart.data.map(d => String(d[chart.x_axis_key] ?? ""));
          const yKey = chart.y_axis_keys?.[0] ?? "value";
          const values = chart.data.map(d => Number(d[yKey] ?? 0));
          const t = chart.chart_type?.toLowerCase();
          if (t === "pie") return <DonutChart key={i} labels={labels} values={values} title={chart.title} />;
          if (t === "line" || t === "area") return <LineChart key={i} labels={labels} values={values} title={chart.title} />;
          return <BarChart key={i} labels={labels} values={values} title={chart.title} />;
        })}
      </div>
    );
  }

  const labels = cfg.labels as string[] | undefined;
  const values = cfg.values as number[] | undefined;
  const title = (cfg.title as string) || "Chart";

  switch (visual.chart_type) {
    case "bar": return <BarChart labels={labels} values={values} title={title} />;
    case "pie": return <DonutChart labels={labels} values={values} title={title} />;
    case "line": return <LineChart labels={labels} values={values} title={title} />;
    case "table": {
      const headers = cfg.table_headers as string[] | undefined;
      const rows = cfg.table_rows as Record<string, unknown>[] | undefined;
      return (
        <div className="w-full">
          <h5 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mb-2.5 text-center">{title}</h5>
          <div className="overflow-x-auto rounded-xl border border-stone-200/60 dark:border-stone-800 bg-white dark:bg-stone-950/20">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 font-bold text-stone-500">
                  {headers?.map((h, i) => <th key={i} className="py-2 px-2.5 whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows?.map((row, i) => (
                  <tr key={i} className="border-b border-stone-100 dark:border-stone-800/40 hover:bg-stone-50/60 dark:hover:bg-stone-800/40 last:border-b-0 transition-colors">
                    {headers?.map((h, j) => <td key={j} className="py-2 px-2.5 text-stone-600 dark:text-stone-300 font-semibold">{String(row[h] ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    default: return <p className="text-xs text-stone-400 text-center">No visualization available.</p>;
  }
}

// ─── Before/After Comparison Section ─────────────────────────────────────────

function ComparisonSection({ datasetId }: { datasetId: string }) {
  const [comparison, setComparison] = useState<DatasetComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDatasetComparison(datasetId)
      .then(setComparison)
      .catch(err => setError(err?.message ?? "No cleaned dataset found yet."))
      .finally(() => setLoading(false));
  }, [datasetId]);

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-stone-400 py-6 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading comparison stats…
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-2 text-sm text-stone-400 py-6 justify-center">
      <AlertCircle className="w-4 h-4 text-amber-400" />
      <span>{error}</span>
    </div>
  );

  if (!comparison) return null;

  return (
    <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-7 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3" />}>Dataset Cleaned</Badge>
          </div>
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-50">
            Before vs. After Cleaning Comparison
          </h2>
        </div>
        <a
          href={getCleanedDatasetUrl(datasetId)}
          download
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors group shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Download Cleaned CSV
        </a>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Original Rows", val: comparison.original.row_count.toLocaleString(), sub: "before cleaning" },
          { label: "Cleaned Rows", val: comparison.cleaned.row_count.toLocaleString(), sub: "after cleaning", highlight: true },
          { label: "Rows Removed", val: comparison.rows_removed.toLocaleString(), sub: "dropped by cleaning", warn: comparison.rows_removed > 0 },
          { label: "Columns", val: comparison.cleaned.column_count.toLocaleString(), sub: "preserved" },
        ].map(({ label, val, sub, highlight, warn }) => (
          <div key={label} className={`rounded-2xl border p-3.5 text-center ${highlight ? "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20" : warn && comparison.rows_removed > 0 ? "border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20" : "border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/40"}`}>
            <p className="text-lg font-black text-stone-900 dark:text-white">{val}</p>
            <p className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wide">{label}</p>
            <p className="text-[9px] text-stone-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Per-column null comparison table */}
      <div className="overflow-x-auto rounded-2xl border border-stone-100 dark:border-stone-800">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 text-stone-500 font-bold uppercase tracking-wider">
              <th className="py-2 px-3">Column</th>
              <th className="py-2 px-3">Type</th>
              <th className="py-2 px-3 text-right">Before nulls</th>
              <th className="py-2 px-3 text-right">After nulls</th>
              <th className="py-2 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {comparison.column_comparison.slice(0, 15).map((col, i) => (
              <tr key={i} className="border-b border-stone-100 dark:border-stone-800/40 last:border-b-0 hover:bg-stone-50/40 dark:hover:bg-stone-800/30 transition-colors">
                <td className="py-2 px-3 font-semibold text-stone-800 dark:text-stone-200 font-mono">{col.column}</td>
                <td className="py-2 px-3 text-stone-400">{col.data_type}</td>
                <td className="py-2 px-3 text-right text-stone-500">
                  {col.original_null_count} <span className="text-stone-300">({col.original_null_pct?.toFixed(1)}%)</span>
                </td>
                <td className="py-2 px-3 text-right text-stone-500">
                  {col.cleaned_null_count ?? "—"}{col.cleaned_null_pct != null ? <span className="text-stone-300"> ({col.cleaned_null_pct.toFixed(1)}%)</span> : ""}
                </td>
                <td className="py-2 px-3 text-center">
                  {col.improved ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                      <TrendingDown className="w-3 h-3" /> Improved
                    </span>
                  ) : col.original_null_count === 0 ? (
                    <span className="text-stone-400 inline-flex items-center gap-1">
                      <Minus className="w-3 h-3" /> Clean
                    </span>
                  ) : (
                    <span className="text-amber-500 dark:text-amber-400 inline-flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Unchanged
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {comparison.column_comparison.length > 15 && (
          <p className="text-center text-[10px] text-stone-400 py-2">
            +{comparison.column_comparison.length - 15} more columns in downloaded CSV
          </p>
        )}
      </div>
    </div>
  );
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
              <a
                href={getCleanedDatasetUrl(datasetId)}
                download
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download Cleaned CSV
              </a>
              <Link
                href={`/datasets/${datasetId}/report`}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <span>Compile Final Report</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Before/After Comparison */}
          <ComparisonSection datasetId={datasetId} />

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
                  <div className="w-full lg:w-[320px] shrink-0 border border-stone-100 dark:border-stone-800 bg-stone-50/30 dark:bg-stone-900/20 rounded-2xl p-4 flex flex-col justify-center items-center shadow-inner">
                    {visual ? renderChart(visual) : (
                      <div className="text-center text-stone-400">
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
