"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { submitDatasetUrl, getDataset } from "@/lib/api/datasets";
import {
  ArrowLeft,
  Database,
  Sparkles,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  RefreshCw,
  Globe,
} from "lucide-react";

// Example datasets from kaggle_github_datasets.json (a curated subset)
const EXAMPLE_DATASETS = [
  { domain: "Finance", name: "Credit Card Fraud Detection", url: "mlg-ulb/creditcardfraud" },
  { domain: "Telecom", name: "Telco Customer Churn", url: "blastchar/telco-customer-churn" },
  { domain: "Healthcare", name: "Heart Disease UCI", url: "ronitf/heart-disease-uci" },
  { domain: "E-commerce", name: "Brazilian E-Commerce Orders", url: "olistbr/brazilian-ecommerce" },
  { domain: "HR", name: "IBM HR Analytics Attrition", url: "pavansubhasht/ibm-hr-analytics-attrition-dataset" },
  { domain: "Housing", name: "House Prices (Ames Iowa)", url: "c/house-prices-advanced-regression-techniques" },
  { domain: "Sports", name: "FIFA 22 Player Stats", url: "stefanoleone992/fifa-22-complete-player-dataset" },
  { domain: "Education", name: "Students Performance", url: "spscientist/students-performance-in-exams" },
];

const DOMAIN_COLORS: Record<string, string> = {
  Finance: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  Telecom: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  Healthcare: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  "E-commerce": "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  HR: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  Housing: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  Sports: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  Education: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
};

type Stage = "idle" | "submitting" | "polling" | "ready" | "error";

export default function UploadPage() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const submit = async (submittedUrl: string) => {
    const trimmed = submittedUrl.trim();
    if (!trimmed) return;
    setError(null);
    setStage("submitting");

    try {
      const dataset = await submitDatasetUrl(trimmed);
      setDatasetId(dataset.id);
      setStage("polling");
      pollForReady(dataset.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to submit dataset URL. Please check the format.");
      setStage("error");
    }
  };

  const pollForReady = async (id: string) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 60;

    const poll = async () => {
      attempts++;
      setPollCount(attempts);
      try {
        const ds = await getDataset(id);
        if (ds.status === "ready") {
          setStage("ready");
          setTimeout(() => router.push(`/datasets/${id}`), 1200);
          return;
        }
        if (ds.status === "failed") {
          setError(ds.description || "Dataset processing failed.");
          setStage("error");
          return;
        }
        if (attempts < MAX_ATTEMPTS) {
          setTimeout(poll, 3000);
        } else {
          setError("Timed out waiting for the dataset to be ready. Check the Home page later.");
          setStage("error");
        }
      } catch {
        if (attempts < MAX_ATTEMPTS) {
          setTimeout(poll, 3000);
        }
      }
    };

    setTimeout(poll, 2000);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(url);
  };

  const handleExample = (exampleUrl: string) => {
    setUrl(exampleUrl);
    submit(exampleUrl);
  };

  const isActive = stage === "submitting" || stage === "polling";

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
        <Header />

        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 flex flex-col gap-8">

          {/* Page header */}
          <div>
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors mb-6"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Workspace
            </Link>

            <div className="flex items-center gap-2 mb-2">
              <Badge variant="indigo" icon={<Sparkles className="w-3 h-3" />}>
                Step 1
              </Badge>
              <span className="text-xs text-stone-400 font-medium">Dataset Ingestion</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Connect a Dataset
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1 leading-relaxed max-w-2xl">
              Paste a Kaggle dataset URL, Kaggle shorthand reference <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">owner/slug</code>, or a direct GitHub raw CSV link. DataMind will download and profile it automatically.
            </p>
          </div>

          {/* URL Input card */}
          <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Globe className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-bold text-stone-800 dark:text-stone-100">
                Dataset URL or Reference
              </h2>
            </div>

            <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  id="dataset-url-input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isActive}
                  placeholder="e.g. mlg-ulb/creditcardfraud  or  https://www.kaggle.com/datasets/..."
                  className="w-full px-4 py-3 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={isActive || !url.trim()}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer group shrink-0"
              >
                {isActive ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                <span>{isActive ? "Processing…" : "Load Dataset"}</span>
                {!isActive && <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>

            {/* URL format help */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: "Kaggle ref", example: "owner/dataset-slug" },
                { label: "Kaggle URL", example: "kaggle.com/datasets/owner/slug" },
                { label: "GitHub raw", example: "raw.githubusercontent.com/…/file.csv" },
              ].map(({ label, example }) => (
                <div
                  key={label}
                  className="bg-stone-50 dark:bg-stone-900/40 border border-stone-100 dark:border-stone-800 rounded-xl px-3 py-2"
                >
                  <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider block mb-0.5">{label}</span>
                  <code className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono break-all">{example}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Status display */}
          {(stage === "submitting" || stage === "polling") && (
            <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/40 rounded-2xl p-5 flex items-center gap-4">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl shrink-0">
                <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200">
                  {stage === "submitting" ? "Submitting dataset…" : "Downloading & profiling…"}
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {stage === "polling"
                    ? `Kaggle datasets can take 30–90 seconds. Checking status… (${pollCount})`
                    : "Registering dataset with DataMind backend…"}
                </p>
              </div>
            </div>
          )}

          {stage === "ready" && (
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl p-5 flex items-center gap-4">
              <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Dataset ready!</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Redirecting to the data profile…
                </p>
              </div>
            </div>
          )}

          {stage === "error" && (
            <div className="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40 rounded-2xl p-5 flex items-start gap-4">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 rounded-xl shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Error</p>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed">{error}</p>
              </div>
              <button
                onClick={() => { setStage("idle"); setError(null); }}
                className="shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-200 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          )}

          {/* Example datasets */}
          {(stage === "idle" || stage === "error") && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-stone-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-400">
                  Try an example dataset
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EXAMPLE_DATASETS.map((ds) => (
                  <button
                    key={ds.url}
                    onClick={() => handleExample(ds.url)}
                    className="group text-left bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-2xl p-4 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full tracking-wide uppercase ${DOMAIN_COLORS[ds.domain] ?? "bg-stone-50 text-stone-500"}`}>
                        {ds.domain}
                      </span>
                      <ExternalLink className="w-3 h-3 text-stone-300 group-hover:text-indigo-500 shrink-0 transition-colors mt-0.5" />
                    </div>
                    <p className="text-sm font-bold text-stone-800 dark:text-stone-100 leading-snug mb-1">
                      {ds.name}
                    </p>
                    <code className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">
                      {ds.url}
                    </code>
                  </button>
                ))}
              </div>

              <p className="text-xs text-stone-400 mt-3 text-center">
                ⚠️ Kaggle datasets require{" "}
                <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">~/.kaggle/kaggle.json</code>{" "}
                to be configured on the server.
              </p>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
