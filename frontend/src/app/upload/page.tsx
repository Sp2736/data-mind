"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/useAuth";
import { addStoredDataset, Dataset } from "@/lib/mock/datasets";
import {
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  X,
  Sparkles,
  ShieldCheck,
  FileText
} from "lucide-react";

export default function UploadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");

  const allowedExtensions = [".csv", ".json"];

  const validateAndSetFile = (file: File) => {
    setValidationError(null);
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      setValidationError(
        `Unsupported format (${ext || "unknown"}). Only .csv and .json files are allowed.`
      );
      setSelectedFile(null);
      return false;
    }

    setSelectedFile(file);
    return true;
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      validateAndSetFile(file);
    }
  };

  const handleStartUpload = () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(10);
    setUploadStage("Validating file structure...");

    // Simulated progress steps
    setTimeout(() => {
      setUploadProgress(40);
      setUploadStage("Uploading payload to Cloudflare R2 (mocked)...");
    }, 500);

    setTimeout(() => {
      setUploadProgress(75);
      setUploadStage("Indexing schema & estimating row statistics...");
    }, 1100);

    setTimeout(() => {
      setUploadProgress(100);
      setUploadStage("Dataset ready! Finalizing profile...");

      const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf(".")).replace(".", "") as 'csv' | 'json';
      const cleanName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const newDatasetId = `ds_upload_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString().slice(-4)}`;

      const newDataset: Dataset = {
        id: newDatasetId,
        user_id: user?.id || "usr_01HGB897XYZ",
        filename: cleanName,
        format: ext === "json" ? "json" : "csv",
        storage_path: `uploads/2026/07/${cleanName}`,
        row_count: Math.floor(Math.random() * 18000) + 1200,
        column_count: Math.floor(Math.random() * 20) + 8,
        file_size_bytes: selectedFile.size || 2450000,
        uploaded_at: new Date().toISOString(),
        status: "ready",
        description: `User uploaded ${cleanName} dataset. Automatic profiling completed.`,
        primary_domain: ext === "json" ? "Structured JSON" : "Tabular Data",
      };

      addStoredDataset(newDataset);

      setTimeout(() => {
        router.push(`/datasets/${newDataset.id}`);
      }, 600);
    }, 1800);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
        <Header />

        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Breadcrumb / Back link */}
          <div className="mb-6">
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-indigo-600 dark:text-stone-400 dark:hover:text-indigo-400 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Workspace</span>
            </Link>
          </div>

          {/* Header title */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="indigo" icon={<Sparkles className="w-3 h-3" />}>
                FR-ING-01 &amp; FR-ING-02
              </Badge>
              <span className="text-xs text-stone-400">CSV / JSON Format Support</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Upload New Dataset
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
              Select or drop a dataset file to generate automated summary profiles and research questions.
            </p>
          </div>

          {/* Main Card Container */}
          <div className="bg-white dark:bg-[#191921] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-8 shadow-sm">
            {/* Validation Error Alert */}
            {validationError && (
              <div className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Invalid File Type</span>
                    <span>{validationError}</span>
                  </div>
                </div>
                <button
                  onClick={() => setValidationError(null)}
                  className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Drag & Drop Area */}
            {!selectedFile && !isUploading && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all duration-200 ${
                  isDragOver
                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 scale-[1.005]"
                    : "border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/40 hover:border-indigo-300 dark:hover:border-indigo-800"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="mx-auto w-14 h-14 mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-100 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
                  <UploadCloud className="w-7 h-7" />
                </div>

                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1">
                  Click to choose or drag and drop file here
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mx-auto mb-4">
                  Supports <strong className="text-stone-700 dark:text-stone-300">.CSV</strong> and{" "}
                  <strong className="text-stone-700 dark:text-stone-300">.JSON</strong> files up to 100MB
                </p>

                <div className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl border border-indigo-200/50 dark:border-indigo-900/50">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Select File from Computer</span>
                </div>
              </div>
            )}

            {/* Selected File Card & Actions */}
            {selectedFile && !isUploading && (
              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200">
                      {selectedFile.name.endsWith(".csv") ? (
                        <FileSpreadsheet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <FileCode className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                        {selectedFile.name}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                        <span>{formatBytes(selectedFile.size)}</span>
                        <span>•</span>
                        <span className="uppercase font-medium text-indigo-600 dark:text-indigo-400">
                          {selectedFile.name.substring(selectedFile.name.lastIndexOf(".") + 1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="p-2 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="px-4 py-2.5 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleStartUpload}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Start Ingestion &amp; Analysis</span>
                  </button>
                </div>
              </div>
            )}

            {/* Simulated Progress View */}
            {isUploading && (
              <div className="py-8 px-4 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-100 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  {uploadProgress === 100 ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 animate-bounce" />
                  ) : (
                    <UploadCloud className="w-6 h-6 animate-pulse" />
                  )}
                </div>

                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1">
                  {uploadProgress === 100 ? "Upload & Indexing Complete!" : "Processing Dataset Payload..."}
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mb-6">
                  {uploadStage}
                </p>

                {/* Animated Progress Bar */}
                <div className="max-w-md mx-auto">
                  <div className="w-full h-3 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-stone-400 font-medium">
                    <span>{uploadProgress}%</span>
                    <span>FR-ING-04 Automated Profiling</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scope notice */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-stone-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Frontend Execution Scope: Upload simulation updates local session data</span>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
