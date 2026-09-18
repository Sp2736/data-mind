"use client";

import React, { use, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { getDataset, listRuns, listQuestions, ApiAnalysisRun, ApiResearchQuestion } from "@/lib/api/datasets";
import {
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Terminal,
  Activity,
  ArrowRight,
  RotateCw,
  Sliders,
  XCircle,
  Loader2,
} from "lucide-react";

const STORAGE_KEY_TOKEN = "datamind_auth_token";
const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://localhost:8000";

type RunStatus = ApiAnalysisRun["status"] | "succeeded";

function isSuccess(s: RunStatus) {
  return s === "completed" || s === "succeeded";
}

function isTerminal(s: RunStatus) {
  return isSuccess(s) || s === "failed";
}

interface EnrichedRun extends ApiAnalysisRun {
  question_text?: string;
  category?: "pre-processing" | "eda";
}

function statusIcon(s: RunStatus) {
  switch (s) {
    case "completed":
    case "succeeded": return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    case "failed": return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
    case "running": return <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />;
    default: return <Clock className="w-3.5 h-3.5 text-stone-400" />;
  }
}

export default function JobStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const datasetId = resolvedParams.id;

  const [datasetName, setDatasetName] = useState<string>("");
  const [runs, setRuns] = useState<EnrichedRun[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(true);
  const [isPipelineFinished, setIsPipelineFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const logEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch enriched runs (with question text attached).
  // This is the single source of truth for isPipelineFinished — WS handlers
  // call this after patching local state so the API always has the final word.
  const fetchRuns = useCallback(async () => {
    try {
      const [rawRuns, questions] = await Promise.all([
        listRuns(datasetId),
        listQuestions(datasetId).catch(() => [] as ApiResearchQuestion[]),
      ]);

      const qMap = Object.fromEntries(questions.map(q => [q.id, q]));

      // Filter to selected RQ IDs from sessionStorage if available
      let selectedIds: string[] = [];
      if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem(`datamind_selected_rqs_${datasetId}`);
        if (stored) {
          try { selectedIds = JSON.parse(stored); } catch { /* ignore */ }
        }
      }

      const filtered = selectedIds.length > 0
        ? rawRuns.filter(r => selectedIds.includes(r.rq_id))
        : rawRuns;

      const enriched: EnrichedRun[] = filtered.map(r => ({
        ...r,
        question_text: qMap[r.rq_id]?.question_text,
        category: qMap[r.rq_id]?.category as "pre-processing" | "eda",
      }));

      setRuns(enriched);

      const allDone = enriched.length > 0 && enriched.every(r => isTerminal(r.status as RunStatus));
      if (allDone) {
        setIsPipelineFinished(true);
        // Stop the fallback polling — no more work to do
        if (pollRef.current) {
          clearTimeout(pollRef.current);
          pollRef.current = null;
        }
        addLog(`[pipeline] [${ts()}] All runs finished. Navigate to Insights to see results.`);
      }
    } catch {
      /* silent — WS events will fill the gap */
    }
  }, [datasetId]);

  const ts = () => new Date().toLocaleTimeString();

  const addLog = (msg: string) => {
    setConsoleLogs(prev => [...prev, msg]);
  };

  // Auto-scroll console
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLogs]);

  // Initial data load
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const ds = await getDataset(datasetId);
        if (isMounted) setDatasetName(ds.filename);
      } catch { /* ignore */ }

      await fetchRuns();
      if (isMounted) setIsLoading(false);
    };
    init();
    return () => { isMounted = false; };
  }, [datasetId, fetchRuns]);

  // WebSocket connection
  useEffect(() => {
    const token = typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEY_TOKEN) ?? sessionStorage.getItem(STORAGE_KEY_TOKEN)
      : null;

    const ws = new WebSocket(`${WS_BASE}/ws/datasets/${datasetId}/status${token ? `?token=${token}` : ""}`);
    wsRef.current = ws;

    ws.onopen = () => {
      addLog(`[pipeline] [${ts()}] WebSocket connected — live run updates active.`);
    };

    ws.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data);
        // Backend publishes with "type" key (not "event")
        const evtType = event.type ?? event.event;
        const { run_id, status, attempt, error_traceback } = event;

        switch (evtType) {
          case "run_update":
          case "run_started":
            addLog(`[task] [${ts()}] Run ${run_id?.slice(-6)} → ${status ?? "updated"}${attempt ? ` (attempt ${attempt})` : ""}`);
            if (status) {
              // Patch local state immediately for snappy UI, then let fetchRuns
              // confirm completion from the API (avoids race with empty runs[]).
              setRuns(prev => prev.map(r =>
                r.id === run_id ? { ...r, status: status as RunStatus, attempts: attempt ?? r.attempts } : r
              ));
              setTimeout(() => fetchRuns(), 600);
            }
            break;

          case "run_completed":
            addLog(`[pipeline] [${ts()}] ✓ Run ${run_id?.slice(-6)} completed successfully.`);
            setRuns(prev => prev.map(r =>
              r.id === run_id ? { ...r, status: "completed" as RunStatus } : r
            ));
            // Re-fetch from API — this is what actually sets isPipelineFinished
            setTimeout(() => fetchRuns(), 600);
            break;

          case "run_failed":
            addLog(`[error] [${ts()}] Run ${run_id?.slice(-6)} FAILED${error_traceback ? `: ${error_traceback.split("\n")[0]}` : "."}`);
            setRuns(prev => prev.map(r =>
              r.id === run_id ? { ...r, status: "failed" as RunStatus, error_traceback } : r
            ));
            setTimeout(() => fetchRuns(), 600);
            break;

          case "code_generated":
            addLog(`[coder] [${ts()}] Code generated for run ${run_id?.slice(-6)}.`);
            break;

          case "sandbox_output":
            addLog(`[sandbox] ${event.stdout ?? ""}`);
            break;

          case "correction_triggered":
            addLog(`[coder] [${ts()}] Self-correction triggered (attempt ${attempt})…`);
            setRuns(prev => prev.map(r => r.id === run_id ? { ...r, status: "running" as RunStatus, attempts: attempt ?? r.attempts } : r));
            break;

          case "insight_written":
            addLog(`[analyst] [${ts()}] Insight written for run ${run_id?.slice(-6)}.`);
            break;

          default:
            if (event.message) addLog(`[ws] ${event.message}`);
            break;
        }
      } catch {
        /* ignore malformed WS messages */
      }
    };

    ws.onclose = () => {
      addLog(`[pipeline] [${ts()}] WebSocket disconnected.`);
      // Fall back to polling
      const poll = () => {
        fetchRuns();
        pollRef.current = setTimeout(poll, 5000);
      };
      pollRef.current = setTimeout(poll, 5000);
    };

    ws.onerror = () => {
      addLog(`[error] [${ts()}] WebSocket error — falling back to polling.`);
    };

    return () => {
      ws.close();
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [datasetId, fetchRuns]);

  const completedCount = runs.filter(r => isSuccess(r.status as RunStatus)).length;
  const failedCount = runs.filter(r => r.status === "failed").length;
  const progressPercent = runs.length > 0 ? Math.floor(((completedCount + failedCount) / runs.length) * 100) : 0;

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
        <Header />

        {/* Stage breadcrumb */}
        <div className="border-b border-stone-200/60 dark:border-stone-800/80 bg-white/70 dark:bg-[#191921]/60 backdrop-blur-md sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between overflow-x-auto gap-4">
            <Link href={`/datasets/${datasetId}/rqs`} className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors shrink-0">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Selection
            </Link>
            <div className="flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs text-stone-400 shrink-0">
              <Link href={`/datasets/${datasetId}`} className="hover:text-stone-600 dark:hover:text-stone-300">1. Data Profile</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <Link href={`/datasets/${datasetId}/rqs`} className="hover:text-stone-600 dark:hover:text-stone-300">2. Research Questions</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40">3. Execution Logs</span>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              {isPipelineFinished ? (
                <Link
                  href={`/datasets/${datasetId}/insights`}
                  className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  4. Analysis Insights ✓
                </Link>
              ) : (
                <span className="cursor-not-allowed">4. Analysis Insights</span>
              )}
            </div>
            <div className="w-10 sm:w-20 shrink-0" />
          </div>
        </div>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-6">

          {/* Header progress card */}
          <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 flex items-center gap-2">
                  <Activity className={`w-6 h-6 shrink-0 ${
                    isPipelineFinished
                      ? "text-emerald-500"
                      : "text-indigo-600 dark:text-indigo-400 animate-pulse"
                  }`} />
                  <span>Sandbox Code Execution</span>
                </h1>
                <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-0.5">
                  Executing autonomous pipeline on{" "}
                  <code className="bg-stone-50 dark:bg-stone-900 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-semibold">
                    {datasetName || datasetId}
                  </code>
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                  {completedCount} of {runs.length} completed
                </span>
                {failedCount > 0 && (
                  <span className="text-xs text-rose-500 font-semibold block">
                    {failedCount} failed
                  </span>
                )}
                <span className="text-xs text-stone-400 block font-medium">Pipeline Progression</span>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="w-full h-3 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mb-1">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-stone-400 font-medium">
                <span>{progressPercent}% completed</span>
                <span>Self-Correction Retry Cap: {runs[0]?.max_attempts ?? 3}</span>
              </div>
            </div>
          </div>

          {/* Main grid: task list + console */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

            {/* Task list */}
            <div className="lg:col-span-1 flex flex-col gap-3 max-h-[520px] overflow-y-auto pr-1">
              <h3 className="text-xs uppercase tracking-wider font-extrabold text-stone-400 flex items-center gap-1.5 pl-2">
                <Sliders className="w-3.5 h-3.5" />
                Sandbox Processes
              </h3>

              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                </div>
              ) : runs.map((run) => {
                const isRunning = run.status === "running";
                const isComplete = isSuccess(run.status as RunStatus);
                const isFailed = run.status === "failed";
                const isPre = run.category === "pre-processing";

                return (
                  <div
                    key={run.id}
                    className={`rounded-2xl border p-4 transition-all duration-200 bg-white dark:bg-[#191921] ${
                      isRunning ? "border-indigo-400 dark:border-indigo-700/80 shadow-sm"
                      : isFailed ? "border-rose-200 dark:border-rose-800/40 opacity-80"
                      : isComplete ? "border-stone-200/50 dark:border-stone-850 opacity-90"
                      : "border-stone-200/80 dark:border-stone-800 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                        isPre
                          ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300"
                          : "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
                      }`}>
                        {run.category ?? "analysis"}
                      </span>

                      <div className="flex items-center gap-1">
                        {statusIcon(run.status)}
                        <span className="text-[9px] font-bold text-stone-500 dark:text-stone-400 uppercase">
                          {run.status}
                        </span>
                        {run.attempts > 1 && (
                          <span className="flex items-center gap-0.5 text-[9px] text-amber-600 font-bold">
                            <RotateCw className="w-2.5 h-2.5" />
                            {run.attempts}
                          </span>
                        )}
                      </div>
                    </div>
                    <h4 className="text-xs font-bold text-stone-850 dark:text-stone-100 leading-snug line-clamp-2">
                      {run.question_text ?? `Run ${run.id.slice(-8)}`}
                    </h4>
                    {isFailed && run.error_traceback && (
                      <p className="text-[9px] text-rose-500 mt-1.5 leading-tight line-clamp-2 font-mono">
                        {run.error_traceback.split("\n").slice(-2).join(" ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Console logger */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex items-center justify-between pl-2">
                <h3 className="text-xs uppercase tracking-wider font-extrabold text-stone-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  Sandbox Log Output
                </h3>
                <button
                  onClick={() => setIsConsoleExpanded(!isConsoleExpanded)}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  {isConsoleExpanded ? "Collapse Output" : "Expand Output"}
                </button>
              </div>

              {isConsoleExpanded && (
                <div className="dark:bg-[#121215] bg-stone-950 border border-stone-800 rounded-3xl p-4 sm:p-5 shadow-inner flex flex-col font-mono text-[11px] h-[380px] overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-800 mb-3 text-[10px] text-stone-500 font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <span>TERMINAL — SANDBOX LOG</span>
                    <span className={isPipelineFinished ? "text-emerald-400" : "text-indigo-400 animate-pulse"}>
                      {isPipelineFinished ? "DONE" : "ACTIVE"}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin select-text">
                    {consoleLogs.map((log, idx) => {
                      let cls = "text-stone-400";
                      if (log.startsWith("[error]")) cls = "text-rose-400 font-semibold";
                      else if (log.startsWith("[pipeline] Warning")) cls = "text-amber-400 font-semibold";
                      else if (log.startsWith("[pipeline]")) cls = "text-indigo-400";
                      else if (log.startsWith("[sandbox]")) cls = "text-stone-400";
                      else if (log.startsWith("[coder]")) cls = "text-purple-400";
                      else if (log.startsWith("[analyst]")) cls = "text-sky-400";
                      else if (log.startsWith("[task]")) cls = "text-stone-300";
                      else if (log.startsWith("[ws]")) cls = "text-stone-500 italic";

                      return (
                        <div key={idx} className={`${cls} leading-relaxed break-all`}>{log}</div>
                      );
                    })}
                    <div ref={logEndRef} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Completion CTA */}
          {isPipelineFinished && (
            <div className="mt-4 p-6 sm:p-8 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/25 dark:border-emerald-500/15 rounded-3xl animate-fade-in flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="p-3.5 rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-200 dark:shadow-none shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-stone-900 dark:text-white">
                    Pipeline Completed!
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 mt-0.5 leading-relaxed">
                    {completedCount} run{completedCount !== 1 ? "s" : ""} succeeded
                    {failedCount > 0 ? `, ${failedCount} failed` : ""}.
                    Insights and cleaned dataset are ready.
                  </p>
                </div>
              </div>

              <Link
                href={`/datasets/${datasetId}/insights`}
                className="inline-flex items-center justify-center gap-1.5 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs sm:text-sm font-bold transition-all group shrink-0 w-full sm:w-auto cursor-pointer"
              >
                <span>View Analysis Insights</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}

        </main>
      </div>
    </AuthGuard>
  );
}
