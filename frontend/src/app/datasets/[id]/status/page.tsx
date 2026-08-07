"use client";

import React, { use, useState, useEffect, useRef } from "react";
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
  CheckCircle2,
  Clock,
  AlertCircle,
  Terminal,
  Activity,
  ArrowRight,
  RotateCw,
  Sliders,
  Database,
  Search
} from "lucide-react";

interface JobState {
  id: string;
  question_text: string;
  category: 'pre-processing' | 'eda';
  status: 'queued' | 'running' | 'retrying' | 'completed' | 'failed';
  attempts: number;
  error_traceback?: string;
}

export default function JobStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const datasetId = resolvedParams.id;
  const dataset = getDatasetById(datasetId);

  // Load questions
  const allQuestions = getResearchQuestions(datasetId, dataset?.filename);
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [activeJobIndex, setActiveJobIndex] = useState<number>(-1);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState<boolean>(true);
  const [isPipelineFinished, setIsPipelineFinished] = useState<boolean>(false);
  
  const logTerminalEndRef = useRef<HTMLDivElement>(null);

  // 1. Initialise selected questions from sessionStorage (fall back to all if none selected)
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
    
    if (ids.length === 0) {
      ids = allQuestions.map(q => q.id);
    }
    
    setSelectedIds(ids);
    
    const initialJobs: JobState[] = allQuestions
      .filter(q => ids.includes(q.id))
      .map(q => ({
        id: q.id,
        question_text: q.question_text,
        category: q.category,
        status: 'queued',
        attempts: 1
      }));
      
    setJobs(initialJobs);
    
    if (initialJobs.length > 0) {
      setActiveJobIndex(0);
      setConsoleLogs([
        `[pipeline] [${new Date().toLocaleTimeString()}] DataMind Autonomous Execution Sandbox initialized.`,
        `[pipeline] Target Dataset: ${dataset?.filename || datasetId}`,
        `[pipeline] Loaded ${initialJobs.length} analysis pipeline tasks.`,
        `[pipeline] Starting batch runner...`
      ]);
    }
  }, [datasetId]);

  // 2. Autoscroll console logs to bottom
  useEffect(() => {
    if (logTerminalEndRef.current) {
      logTerminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs]);

  // 3. Simulated Execution Timing Loops
  useEffect(() => {
    if (activeJobIndex === -1 || activeJobIndex >= jobs.length || isPipelineFinished) return;
    
    const activeJob = jobs[activeJobIndex];
    let step = 0;
    
    // Set active job to 'running'
    setJobs(prev => prev.map((j, idx) => idx === activeJobIndex ? { ...j, status: 'running' } : j));
    
    const intervalTime = 400; // Log print interval
    const logsTimer = setInterval(() => {
      const timeStr = new Date().toLocaleTimeString();
      
      // Question-specific log scripts
      if (activeJob.category === 'pre-processing') {
        // PRE-PROCESSING SIMULATION LOGS
        // We simulate a failure and retry on the first pre-processing question to demonstrate the self-correcting retry loop!
        const isRetryTarget = activeJobIndex === 0; 
        
        if (isRetryTarget) {
          switch (step) {
            case 0:
              setConsoleLogs(prev => [...prev, `[task-${activeJobIndex + 1}] [${timeStr}] Initializing Pre-processing Clean node: "${activeJob.question_text}"`]);
              break;
            case 1:
              setConsoleLogs(prev => [...prev, `[sandbox] Spinning up isolated python-runner environment...`]);
              break;
            case 2:
              setConsoleLogs(prev => [...prev, `[sandbox] Loading pandas dataframes for targets: [${activeJob.id.includes('churn') ? 'tenure_months, monthly_charges' : 'nps_score, expansion_revenue_usd'}]`]);
              break;
            case 3:
              setConsoleLogs(prev => [...prev, `[coder] Generating column alignment script...`]);
              break;
            case 4:
              // Simulate syntax error
              setConsoleLogs(prev => [
                ...prev, 
                `[sandbox] Executing cleanup code...`,
                `[error] Traceback (most recent call last):`,
                `[error]   File "<sandbox_main.py>", line 14, in <module>`,
                `[error]     df_clean['tenure_months'].fillna(df['tenure_months'].medan(), inplace=True)`,
                `[error] AttributeError: 'Series' object has no attribute 'medan'. Did you mean: 'median'?`
              ]);
              // Trigger retry status
              setJobs(prev => prev.map((j, idx) => idx === activeJobIndex ? { ...j, status: 'retrying', attempts: 2 } : j));
              break;
            case 5:
              setConsoleLogs(prev => [
                ...prev,
                `[pipeline] Warning: Task failed. Coder Agent invoking self-correction loop...`,
                `[coder] Analyzing traceback error on line 14. Identified typo: '.medan()' should be '.median()'.`,
                `[coder] Correcting execution script...`
              ]);
              break;
            case 6:
              setConsoleLogs(prev => [
                ...prev,
                `[pipeline] Retrying task execution (Attempt 2)...`,
                `[sandbox] Reloading sandbox variables...`,
                `[sandbox] Executing corrected script...`
              ]);
              // Reset status to running
              setJobs(prev => prev.map((j, idx) => idx === activeJobIndex ? { ...j, status: 'running' } : j));
              break;
            case 7:
              setConsoleLogs(prev => [
                ...prev,
                `[sandbox] Imputation completed successfully. Null count in target columns: 0.`,
                `[sandbox] Running validation tests...`,
                `[sandbox] Check-01: Null checks passed.`,
                `[sandbox] Check-02: Variance matches control bounds. Passed.`
              ]);
              break;
            case 8:
              setConsoleLogs(prev => [...prev, `[task-${activeJobIndex + 1}] [${timeStr}] Pre-processing clean node completed successfully.`]);
              setJobs(prev => prev.map((j, idx) => idx === activeJobIndex ? { ...j, status: 'completed' } : j));
              clearInterval(logsTimer);
              
              // Proceed to next job
              setTimeout(() => {
                if (activeJobIndex + 1 < jobs.length) {
                  setActiveJobIndex(prev => prev + 1);
                } else {
                  setIsPipelineFinished(true);
                  setConsoleLogs(prev => [...prev, `[pipeline] [${new Date().toLocaleTimeString()}] Batch processing completed successfully. All pipelines verified.`]);
                }
              }, 400);
              break;
          }
        } else {
          // Standard Pre-processing task log
          switch (step) {
            case 0:
              setConsoleLogs(prev => [...prev, `[task-${activeJobIndex + 1}] [${timeStr}] Initializing Pre-processing Clean node: "${activeJob.question_text}"`]);
              break;
            case 1:
              setConsoleLogs(prev => [...prev, `[sandbox] Spinning up python-runner environment...`]);
              break;
            case 2:
              setConsoleLogs(prev => [...prev, `[sandbox] Running string standardization mapper...`]);
              break;
            case 3:
              setConsoleLogs(prev => [...prev, `[sandbox] Alignment completed. Dimensions verified.`]);
              break;
            case 4:
              setConsoleLogs(prev => [...prev, `[task-${activeJobIndex + 1}] [${timeStr}] Task completed.`]);
              setJobs(prev => prev.map((j, idx) => idx === activeJobIndex ? { ...j, status: 'completed' } : j));
              clearInterval(logsTimer);
              
              setTimeout(() => {
                if (activeJobIndex + 1 < jobs.length) {
                  setActiveJobIndex(prev => prev + 1);
                } else {
                  setIsPipelineFinished(true);
                  setConsoleLogs(prev => [...prev, `[pipeline] [${new Date().toLocaleTimeString()}] Batch processing completed successfully. All pipelines verified.`]);
                }
              }, 400);
              break;
          }
        }
      } else {
        // EDA SIMULATION LOGS
        switch (step) {
          case 0:
            setConsoleLogs(prev => [...prev, `[task-${activeJobIndex + 1}] [${timeStr}] Launching EDA analysis node: "${activeJob.question_text}"`]);
            break;
          case 1:
            setConsoleLogs(prev => [...prev, `[sandbox] Loading mathematical frameworks (numpy, statsmodels)...`]);
            break;
          case 2:
            setConsoleLogs(prev => [...prev, `[coder] Executing correlation analysis and grouping scripts...`]);
            break;
          case 3:
            setConsoleLogs(prev => [...prev, `[analyst] Computing cross-tabulations and category metrics...`]);
            break;
          case 4:
            setConsoleLogs(prev => [...prev, `[analyst] Chart config selected: "${activeJob.id.includes('06') ? 'Pie' : activeJob.id.includes('05') ? 'Scatter' : 'Bar'}". Mapping SVG values...`]);
            break;
          case 5:
            setConsoleLogs(prev => [...prev, `[task-${activeJobIndex + 1}] [${timeStr}] EDA Analysis complete. Insight registered.`]);
            setJobs(prev => prev.map((j, idx) => idx === activeJobIndex ? { ...j, status: 'completed' } : j));
            clearInterval(logsTimer);
            
            setTimeout(() => {
              if (activeJobIndex + 1 < jobs.length) {
                setActiveJobIndex(prev => prev + 1);
              } else {
                setIsPipelineFinished(true);
                setConsoleLogs(prev => [...prev, `[pipeline] [${new Date().toLocaleTimeString()}] Batch processing completed successfully. All pipelines verified.`]);
              }
            }, 400);
            break;
        }
      }
      
      step++;
    }, intervalTime);

    return () => clearInterval(logsTimer);
  }, [activeJobIndex, jobs.length, isPipelineFinished]);

  // Calculations
  const completedJobsCount = jobs.filter(j => j.status === 'completed').length;
  const progressPercent = jobs.length > 0 ? Math.floor((completedJobsCount / jobs.length) * 100) : 0;
  
  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
        <Header />

        {/* Stage Progression Tracker */}
        <div className="border-b border-stone-200/60 dark:border-stone-800/80 bg-white/70 dark:bg-[#191921]/60 backdrop-blur-md sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between overflow-x-auto gap-4">
            <Link
              href={`/datasets/${datasetId}/rqs`}
              className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Selection</span>
            </Link>
            
            <div className="flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs text-stone-400 shrink-0">
              <Link href={`/datasets/${datasetId}`} className="hover:text-stone-600 dark:hover:text-stone-300">1. Data Profile</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <Link href={`/datasets/${datasetId}/rqs`} className="hover:text-stone-600 dark:hover:text-stone-300">2. Research Questions</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40">3. Execution Logs</span>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="cursor-not-allowed">4. Analysis Insights</span>
            </div>
            
            <div className="w-10 sm:w-20 shrink-0" />
          </div>
        </div>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-6">
          
          {/* Header Progress Indicators */}
          <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 flex items-center gap-2">
                  <Activity className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-pulse shrink-0" />
                  <span>Sandbox Code Execution</span>
                </h1>
                <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400">
                  Executing python compiler sequences on <code className="bg-stone-50 dark:bg-stone-900 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-semibold">{dataset?.filename}</code> fields.
                </p>
              </div>

              {/* Progress counter */}
              <div className="text-right shrink-0">
                <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                  {completedJobsCount} of {jobs.length} completed
                </span>
                <span className="text-xs text-stone-400 block font-medium">Pipeline Progression</span>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="w-full h-3 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mb-1">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-stone-400 font-medium">
                <span>{progressPercent}% completed</span>
                <span>Self-Correction Retry Cap: 3</span>
              </div>
            </div>
          </div>

          {/* Grid Layout: Task List and Logger */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Task list cards (Spans 1/3) */}
            <div className="lg:col-span-1 flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
              <h3 className="text-xs uppercase tracking-wider font-extrabold text-stone-400 mb-1 flex items-center gap-1.5 pl-2">
                <Sliders className="w-3.5 h-3.5 text-stone-400" />
                <span>Sandbox Processes</span>
              </h3>
              
              {jobs.map((job, idx) => {
                const isActive = idx === activeJobIndex;
                const isQueued = job.status === 'queued';
                const isRunning = job.status === 'running';
                const isRetrying = job.status === 'retrying';
                const isComplete = job.status === 'completed';

                return (
                  <div
                    key={job.id}
                    className={`rounded-2xl border p-4 transition-all duration-200 bg-white dark:bg-[#191921] ${
                      isActive
                        ? "border-indigo-400 dark:border-indigo-700/80 shadow-sm"
                        : isComplete
                        ? "border-stone-200/50 dark:border-stone-850 opacity-90"
                        : "border-stone-200/80 dark:border-stone-800 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                        job.category === 'pre-processing'
                          ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300"
                          : "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
                      }`}>
                        {job.category}
                      </span>

                      {/* Status Badges */}
                      {isComplete && (
                        <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3" />}>
                          complete
                        </Badge>
                      )}
                      {isRunning && (
                        <Badge variant="warning" icon={<Clock className="w-3 h-3 animate-spin" />}>
                          running
                        </Badge>
                      )}
                      {isRetrying && (
                        <Badge variant="warning" className="bg-amber-50 dark:bg-amber-950/60 border-amber-200 text-amber-600 dark:text-amber-400" icon={<RotateCw className="w-3 h-3 animate-spin" />}>
                          retry {job.attempts}
                        </Badge>
                      )}
                      {isQueued && (
                        <Badge variant="neutral">
                          queued
                        </Badge>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-stone-850 dark:text-stone-100 leading-snug line-clamp-2">
                      {job.question_text}
                    </h4>
                  </div>
                );
              })}
            </div>

            {/* Expandable Console Logger (Spans 2/3) */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex items-center justify-between pl-2">
                <h3 className="text-xs uppercase tracking-wider font-extrabold text-stone-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-stone-400" />
                  <span>Sandbox Log Output</span>
                </h3>
                <button
                  onClick={() => setIsConsoleExpanded(!isConsoleExpanded)}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  {isConsoleExpanded ? "Collapse Output" : "Expand Output"}
                </button>
              </div>

              {isConsoleExpanded && (
                <div className="bg-white-30/10 dark:bg-[#121215] border border-stone-800 rounded-3xl p-4 sm:p-5 shadow-inner flex flex-col font-mono text-[11px] h-[360px] overflow-hidden relative">
                  
                  {/* Console header lights */}
                  <div className="flex items-center justify-between pb-3 border-b border-stone-800 mb-3 text-[10px] text-stone-500 font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <span>TERMINAL LOGS: SANDBOX</span>
                    <span>ACTIVE</span>
                  </div>

                  {/* Autoscrolling Log Statements */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 text-stone-300 pr-1 scrollbar-thin select-text">
                    {consoleLogs.map((log, idx) => {
                      let colorClass   = "text-stone-400";
                      if (log.includes("[error]")) colorClass = "text-rose-400 font-semibold";
                      else if (log.includes("[pipeline] Warning:")) colorClass = "text-amber-400 font-semibold";
                      else if (log.includes("[pipeline]")) colorClass = "text-indigo-400";
                      else if (log.includes("[sandbox]")) colorClass = "text-stone-400";
                      else if (log.includes("[coder]")) colorClass = "text-purple-400";
                      else if (log.includes("[analyst]")) colorClass = "text-sky-400";

                      return (
                        <div key={idx} className={`${colorClass} leading-relaxed break-all`}>
                          {log}
                        </div>
                      );
                    })}
                    <div ref={logTerminalEndRef} />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Success / Redirection Card once complete */}
          {isPipelineFinished && (
            <div className="mt-4 p-6 sm:p-8 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/25 dark:border-emerald-500/15 rounded-3xl animate-fade-in flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="p-3.5 rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-200 dark:shadow-none shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-stone-900 dark:text-white">
                    Autonomous Execution Completed Successfully!
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 mt-0.5 leading-relaxed">
                    DataMind has cleaned the columns, performed statistics profiling, generated narrative answers, and mapped all requested charts in the pastel visualization suite.
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
