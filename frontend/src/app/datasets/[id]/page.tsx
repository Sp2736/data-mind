"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { BentoGrid, BentoCard } from "@/components/layout/BentoGrid";
import { Badge } from "@/components/ui/Badge";
import { getDatasetById } from "@/lib/mock/datasets";
import { getDatasetProfile } from "@/lib/mock/datasetProfiles";
import { 
  ArrowLeft, 
  FileSpreadsheet, 
  FileCode, 
  CheckCircle2, 
  ArrowRight,
  Search,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  Binary,
  Download,
  Percent,
  Layers,
  ChevronRight,
  HelpCircle,
  FileText
} from "lucide-react";

const convertToCSV = (objArray: Record<string, any>[]) => {
  if (objArray.length === 0) return "";
  const headers = Object.keys(objArray[0]);
  const rows = objArray.map((row) =>
    headers
      .map((headerName) => {
        const val = row[headerName];
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
};

export default function DatasetProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const datasetId = resolvedParams.id;
  const dataset = getDatasetById(datasetId);
  
  // Get detailed profile
  const profile = getDatasetProfile(
    datasetId,
    dataset?.filename,
    dataset?.format,
    dataset?.row_count,
    dataset?.column_count
  );

  const [schemaSearch, setSchemaSearch] = useState("");
  const [selectedStatColumn, setSelectedStatColumn] = useState<string>("");

  // Initialize selected stat column once profile is loaded
  useEffect(() => {
    if (profile && profile.schema_summary.length > 0) {
      // Prefer numeric columns for stats representation first, else first column
      const numericCols = profile.schema_summary.filter(
        c => c.data_type.startsWith("NUMERIC") || c.data_type === "INTEGER"
      );
      if (numericCols.length > 0) {
        setSelectedStatColumn(numericCols[0].column_name);
      } else {
        setSelectedStatColumn(profile.schema_summary[0].column_name);
      }
    }
  }, [datasetId]);

  if (!dataset) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
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

  // Filter schema summary based on user query
  const filteredSchema = profile.schema_summary.filter(col =>
    col.column_name.toLowerCase().includes(schemaSearch.toLowerCase()) ||
    col.data_type.toLowerCase().includes(schemaSearch.toLowerCase())
  );

  // Find stats for the currently selected column
  const activeColStats = profile.stats_summary.find(s => s.column_name === selectedStatColumn);
  const activeColSchema = profile.schema_summary.find(s => s.column_name === selectedStatColumn);

  // Helper for type icons
  const getTypeIcon = (dataType: string) => {
    const type = dataType.toUpperCase();
    if (type.includes("INT") || type === "INTEGER") return <Hash className="w-3.5 h-3.5 text-blue-500" />;
    if (type.includes("NUMERIC") || type.includes("DECIMAL") || type.includes("FLOAT") || type.includes("DOUBLE")) return <Binary className="w-3.5 h-3.5 text-emerald-500" />;
    if (type.includes("TIMESTAMP") || type.includes("DATE") || type.includes("TIME")) return <Calendar className="w-3.5 h-3.5 text-pink-500" />;
    if (type.includes("BOOL")) return <ToggleLeft className="w-3.5 h-3.5 text-amber-500" />;
    return <Type className="w-3.5 h-3.5 text-purple-500" />;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "0 Bytes";
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    return new Date(isoString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col bg-[#faf8f5] dark:bg-[#121216] text-stone-800 dark:text-stone-100">
        <Header />

        {/* Inner Nav Bar for Stage Progression */}
        <div className="border-b border-stone-200/60 dark:border-stone-800/80 bg-white/70 dark:bg-[#191921]/60 backdrop-blur-md sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between overflow-x-auto gap-4">
            <Link
              href="/home"
              className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Workspace</span>
            </Link>
            
            <div className="flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs text-stone-400 shrink-0">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40">1. Data Profile</span>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <Link href={`/datasets/${datasetId}/rqs`} className="hover:text-stone-600 dark:hover:text-stone-300">2. Research Questions</Link>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="cursor-not-allowed">3. Execution Logs</span>
              <ChevronRight className="w-3 h-3 text-stone-300 dark:text-stone-700" />
              <span className="cursor-not-allowed">4. Analysis Insights</span>
            </div>
            
            <div className="w-10 sm:w-20 shrink-0" /> {/* Spacer */}
          </div>
        </div>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <BentoGrid>
            {/* Header / Info Bento Card (Spans full width on lg) */}
            <BentoCard colSpan="col-span-full" className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-br from-indigo-50/30 via-white to-purple-50/20 dark:from-[#1b1928] dark:via-[#191921] dark:to-[#14141c] border-indigo-100/40 dark:border-stone-800/80">
              <div className="flex items-start gap-4">
                <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/80 border border-indigo-100/60 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                  {dataset.format === "json" ? (
                    <FileCode className="w-7 h-7" />
                  ) : (
                    <FileSpreadsheet className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
                      {dataset.filename}
                    </h1>
                    <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3" />}>
                      {dataset.status}
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 max-w-2xl leading-relaxed">
                    {dataset.description || "Statistical profiling and analytical mapping completed successfully."}
                  </p>
                  
                  {/* Metadata Indicators */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-stone-500 dark:text-stone-400 font-medium">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
                      Domain: <strong className="text-stone-700 dark:text-stone-200">{dataset.primary_domain || "General"}</strong>
                    </span>
                    <span>•</span>
                    <span>Rows: <strong className="text-stone-700 dark:text-stone-200">{dataset.row_count.toLocaleString()}</strong></span>
                    <span>•</span>
                    <span>Columns: <strong className="text-stone-700 dark:text-stone-200">{dataset.column_count}</strong></span>
                    <span>•</span>
                    <span>Size: <strong className="text-stone-700 dark:text-stone-200">{formatFileSize(dataset.file_size_bytes)}</strong></span>
                    <span>•</span>
                    <span>Uploaded: <strong className="text-stone-700 dark:text-stone-200">{formatDate(dataset.uploaded_at)}</strong></span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex sm:items-center gap-2.5 shrink-0 self-stretch sm:self-auto flex-col sm:flex-row">
                <button 
                  onClick={() => {
                    let dataStr = "";
                    let filename = `sample_${dataset.filename}`;
                    
                    if (dataset.format === "csv") {
                      const csvContent = convertToCSV(profile.sample_rows);
                      dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
                      if (!filename.toLowerCase().endsWith(".csv")) {
                        filename += ".csv";
                      }
                    } else {
                      const jsonContent = JSON.stringify(profile.sample_rows, null, 2);
                      dataStr = "data:application/json;charset=utf-8," + encodeURIComponent(jsonContent);
                      if (!filename.toLowerCase().endsWith(".json")) {
                        filename += ".json";
                      }
                    }
                    
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", filename);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-xl text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors shadow-sm cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample</span>
                </button>
                <Link
                  href={`/datasets/${datasetId}/rqs`}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-100 dark:shadow-none hover:shadow-lg transition-all group cursor-pointer"
                >
                  <span>Select RQs</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </BentoCard>

            {/* Schema Summary Bento Card (Spans 2 columns on lg) */}
            <BentoCard colSpan="col-span-1 md:col-span-2 lg:col-span-2" className="flex flex-col h-[480px]">
              <div className="flex items-center justify-between mb-4 gap-4">
                <div>
                  <h3 className="font-bold text-stone-900 dark:text-stone-50 text-base flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <span>Schema Catalog</span>
                  </h3>
                  <p className="text-[11px] text-stone-400">
                    Fields, mapped data types, and index constraints
                  </p>
                </div>
                
                {/* Inline filter search */}
                <div className="relative w-36 sm:w-48 shrink-0">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={schemaSearch}
                    onChange={(e) => setSchemaSearch(e.target.value)}
                    placeholder="Filter fields..."
                    className="w-full pl-8 pr-2 py-1 text-[11px] bg-stone-50 dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* Table Container */}
              <div className="flex-1 overflow-y-auto scrollbar-thin border border-stone-100 dark:border-stone-800 rounded-2xl bg-stone-50/50 dark:bg-stone-900/20">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-stone-100 dark:border-stone-800 text-[10px] uppercase text-stone-400 font-semibold bg-stone-50 dark:bg-stone-900 sticky top-0 z-10">
                      <th className="py-2.5 px-3.5">Column Name</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Unique</th>
                      <th className="py-2.5 px-3 text-right">Missing %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSchema.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-stone-400 text-xs">
                          No matching columns found
                        </td>
                      </tr>
                    ) : (
                      filteredSchema.map((col) => (
                        <tr 
                          key={col.column_name} 
                          onClick={() => setSelectedStatColumn(col.column_name)}
                          className={`border-b border-stone-100/60 dark:border-stone-800/40 hover:bg-stone-100/40 dark:hover:bg-stone-800/40 transition-colors cursor-pointer ${
                            selectedStatColumn === col.column_name ? "bg-indigo-50/40 dark:bg-indigo-950/20 font-medium" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3.5 truncate max-w-[130px] sm:max-w-[180px]">
                            <div className="flex items-center gap-1.5">
                              {col.is_primary_key && (
                                <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/60 px-1 rounded" title="Primary Key">PK</span>
                              )}
                              <span className="font-semibold text-stone-800 dark:text-stone-200">{col.column_name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 dark:text-stone-400 bg-stone-100/70 dark:bg-stone-800/70 py-0.5 px-1.5 rounded-md">
                              {getTypeIcon(col.data_type)}
                              <span>{col.data_type.toLowerCase()}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-stone-600 dark:text-stone-400">
                            {col.unique_count.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {col.null_percentage > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400 font-semibold inline-flex items-center gap-1 text-[11px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                                {col.null_percentage}%
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">0%</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </BentoCard>

            {/* Column Statistics Bento Card (Spans 1 or 2 columns on lg) */}
            <BentoCard colSpan="col-span-1 md:col-span-1 lg:col-span-2" className="flex flex-col h-[480px]">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-stone-900 dark:text-stone-50 text-base flex items-center gap-1.5">
                    <Binary className="w-4 h-4 text-emerald-500" />
                    <span>Summary Statistics</span>
                  </h3>
                  <div className="text-[10px] font-medium text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-md uppercase">
                    Interactive
                  </div>
                </div>
                <p className="text-[11px] text-stone-400">
                  Select a column in the catalog to inspect distribution metrics
                </p>
              </div>

              {/* Column Selector for mobile / convenience */}
              <div className="mb-3">
                <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Inspect Column</label>
                <select
                  value={selectedStatColumn}
                  onChange={(e) => setSelectedStatColumn(e.target.value)}
                  className="w-full text-xs font-semibold px-2.5 py-1.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl focus:outline-none focus:border-indigo-400 opacity-90 hover:opacity-100 transition-opacity"
                >
                  {profile.schema_summary.map(c => (
                    <option key={c.column_name} value={c.column_name}>
                      {c.column_name} ({c.data_type.toLowerCase()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Details box */}
              <div className="flex-1 flex flex-col justify-center">
                {activeColSchema && activeColStats ? (
                  <div className="space-y-4">
                    {/* Selected column header */}
                    <div className="p-3 rounded-2xl bg-indigo-50/30 dark:bg-indigo-950/10 border border-indigo-100/40 dark:border-indigo-900/10">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900 dark:text-stone-100 text-sm truncate">{selectedStatColumn}</span>
                        <span className="text-[10px] text-stone-400 font-medium">Mapped as {activeColSchema.data_type}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                        <span>Total Count: <strong>{activeColStats.count.toLocaleString()}</strong></span>
                        <span>Null Count: <strong>{activeColSchema.null_count.toLocaleString()}</strong></span>
                      </div>
                    </div>

                    {/* Numeric stats list */}
                    {(activeColSchema.data_type.startsWith("NUMERIC") || activeColSchema.data_type === "INTEGER") ? (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Mean Value", value: activeColStats.mean?.toLocaleString(), icon: <Percent className="w-3.5 h-3.5 text-stone-400" /> },
                          { label: "Std Deviation", value: activeColStats.std?.toLocaleString(), icon: <HelpCircle className="w-3.5 h-3.5 text-stone-400" /> },
                          { label: "Minimum", value: activeColStats.min?.toLocaleString() },
                          { label: "25% Quantile", value: activeColStats.q25?.toLocaleString() },
                          { label: "50% (Median)", value: activeColStats.q50?.toLocaleString(), highlight: true },
                          { label: "75% Quantile", value: activeColStats.q75?.toLocaleString() },
                          { label: "Maximum", value: activeColStats.max?.toLocaleString() }
                        ].map((stat, i) => (
                          <div 
                            key={i} 
                            className={`p-2.5 rounded-xl border border-stone-200/60 dark:border-stone-800 text-left ${
                              stat.highlight ? "col-span-2 bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-200/40" : "bg-stone-50/30 dark:bg-stone-900/40"
                            }`}
                          >
                            <span className="text-[10px] text-stone-400 font-medium block">{stat.label}</span>
                            <span className={`text-xs font-bold ${stat.highlight ? "text-emerald-700 dark:text-emerald-400 text-sm" : "text-stone-800 dark:text-stone-200"}`}>
                              {stat.value !== undefined ? stat.value : "N/A"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Categorical/Boolean stats list */
                      <div className="space-y-3">
                        <div className="p-4 rounded-xl border border-stone-200/60 dark:border-stone-800 bg-stone-50/30 dark:bg-stone-900/40">
                          <span className="text-[10px] text-stone-400 font-medium block mb-1">Most Frequent Value (Mode)</span>
                          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
                            &quot;{activeColStats.most_frequent_value}&quot;
                          </span>
                        </div>

                        <div className="p-4 rounded-xl border border-stone-200/60 dark:border-stone-800 bg-stone-50/30 dark:bg-stone-900/40">
                          <span className="text-[10px] text-stone-400 font-medium block mb-1">Occurrence Statistics</span>
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="text-xl font-bold text-stone-800 dark:text-stone-200">
                                {activeColStats.most_frequent_count?.toLocaleString()}
                              </span>
                              <span className="text-[11px] text-stone-400 ml-1">records</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {activeColStats.most_frequent_count && activeColStats.count
                                  ? `${((activeColStats.most_frequent_count / activeColStats.count) * 100).toFixed(1)}%`
                                  : "N/A"}
                              </span>
                              <span className="text-[10px] text-stone-400 block font-medium">Dataset Prevalence</span>
                            </div>
                          </div>
                          
                          {/* Visual progress bar */}
                          <div className="w-full h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mt-3.5">
                            <div 
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ 
                                width: activeColStats.most_frequent_count && activeColStats.count 
                                  ? `${(activeColStats.most_frequent_count / activeColStats.count) * 100}%` 
                                  : "0%" 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-12 text-center text-stone-400">
                    No column statistics mapped
                  </div>
                )}
              </div>
            </BentoCard>

            {/* Correlation Summary Bento Card (Spans 2 columns) */}
            <BentoCard colSpan="col-span-1 md:col-span-2 lg:col-span-2" className="flex flex-col h-[340px]">
              <div className="mb-4">
                <h3 className="font-bold text-stone-900 dark:text-stone-50 text-base flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-purple-500" />
                  <span>Key Column Associations</span>
                </h3>
                <p className="text-[11px] text-stone-400">
                  Statistical correlation coefficients indicating feature relationships
                </p>
              </div>

              {/* Associations Grid list */}
              <div className="flex-1 overflow-y-auto scrollbar-thin border border-stone-100 dark:border-stone-800 rounded-2xl bg-stone-50/50 dark:bg-stone-900/20 p-4">
                {profile.correlation_summary.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-stone-400 text-xs">
                    No significant numeric correlations found
                  </div>
                ) : (
                  <div className="space-y-4">
                    {profile.correlation_summary.map((corr, idx) => {
                      const isPositive = corr.coefficient >= 0;
                      const absVal = Math.abs(corr.coefficient);
                      
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-stone-100 dark:border-stone-800 last:border-b-0 last:pb-0">
                          {/* Variables label */}
                          <div className="flex-1 min-w-[200px]">
                            <div className="flex items-center gap-1 text-xs font-semibold text-stone-800 dark:text-stone-200">
                              <span className="truncate max-w-[140px]">{corr.column_x}</span>
                              <span className="text-stone-400 px-1 font-normal">&amp;</span>
                              <span className="truncate max-w-[140px]">{corr.column_y}</span>
                            </div>
                            <span className="text-[10px] text-stone-400 block font-medium">
                              {absVal >= 0.7 
                                ? "Strong association indicator" 
                                : absVal >= 0.4 
                                ? "Moderate association indicator" 
                                : "Weak association indicator"}
                            </span>
                          </div>

                          {/* Visual slider and coefficient score */}
                          <div className="flex items-center gap-3 shrink-0">
                            {/* Visual slider centered */}
                            <div className="relative w-28 h-2 bg-stone-200/80 dark:bg-stone-800 rounded-full overflow-hidden shrink-0">
                              {/* Central line */}
                              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-stone-400/60 z-10" />
                              
                              {/* Filled slider bar */}
                              <div 
                                className={`absolute h-full top-0 ${
                                  isPositive 
                                    ? "left-1/2 bg-emerald-400/80 dark:bg-emerald-500/70" 
                                    : "bg-rose-400/80 dark:bg-rose-500/70"
                                }`}
                                style={{ 
                                  width: `${(absVal * 50)}%`,
                                  left: isPositive ? "50%" : `${50 - (absVal * 50)}%` 
                                }}
                              />
                            </div>

                            {/* Badge */}
                            <span className={`inline-flex items-center justify-center w-12 px-1.5 py-0.5 text-xs font-bold rounded-lg border ${
                              isPositive
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/40"
                                : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-900/40"
                            }`}>
                              {isPositive ? `+${corr.coefficient.toFixed(2)}` : corr.coefficient.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </BentoCard>

            {/* Quick Helper Bento Card (Spans 1 or 2 columns) */}
            <BentoCard colSpan="col-span-1 md:col-span-1 lg:col-span-2" className="flex flex-col justify-between bg-stone-900 text-stone-100 dark:bg-[#15151c] h-[340px]">
              <div>
                <Badge variant="indigo" icon={<CheckCircle2 className="w-3 h-3 text-indigo-400" />}>
                  EDA Planning Stage
                </Badge>
                <h3 className="text-base font-bold text-white mt-3 mb-1.5">
                  Automated Pre-Processing Ready
                </h3>
                <p className="text-xs text-stone-300 leading-relaxed">
                  DataMind has parsed the index shape, null ratios, and column associations. In the next stage, the system will use this information to:
                </p>
                <ul className="text-xs text-stone-400 space-y-1.5 mt-3 list-disc pl-4 font-medium">
                  <li>Formulate research questions grouped by category.</li>
                  <li>Target appropriate column relationships.</li>
                  <li>Write sandboxed execution scripts to clean missing parameters.</li>
                </ul>
              </div>

              <div className="pt-4 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between">
                <span>Ingestion Layer: Module 4 Complete</span>
                <Link
                  href={`/datasets/${datasetId}/rqs`}
                  className="font-semibold text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 cursor-pointer"
                >
                  <span>Select RQs</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </BentoCard>

            {/* Sample Rows Bento Card (Spans full width) */}
            <BentoCard colSpan="col-span-full" className="flex flex-col">
              <div className="flex items-center justify-between mb-4 gap-4">
                <div>
                  <h3 className="font-bold text-stone-900 dark:text-stone-50 text-base flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
                    <span>Data Sample Preview</span>
                  </h3>
                  <p className="text-[11px] text-stone-400">
                    Preview of the first 10 rows index to verify ingestion structure
                  </p>
                </div>
                
                <span className="text-[10px] text-stone-400 font-semibold px-2 py-0.5 bg-stone-100 dark:bg-stone-800 rounded-md">
                  Showing 10 of {dataset.row_count.toLocaleString()} rows
                </span>
              </div>

              {/* Grid Table with horizontal scroll */}
              <div className="overflow-x-auto border border-stone-100 dark:border-stone-800 rounded-2xl bg-stone-50/50 dark:bg-stone-900/20 scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-stone-100 dark:border-stone-800 text-[10px] uppercase text-stone-400 font-semibold bg-stone-50 dark:bg-stone-900">
                      {profile.schema_summary.map((col) => (
                        <th key={col.column_name} className="py-2.5 px-4">
                          <div className="flex items-center gap-1">
                            {getTypeIcon(col.data_type)}
                            <span>{col.column_name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profile.sample_rows.map((row, rIdx) => (
                      <tr 
                        key={rIdx} 
                        className="border-b border-stone-100/60 dark:border-stone-800/40 hover:bg-stone-100/30 dark:hover:bg-stone-800/20 last:border-b-0 transition-colors"
                      >
                        {profile.schema_summary.map((col) => {
                          const val = row[col.column_name];
                          let valStr = "";
                          if (val === null || val === undefined) {
                            valStr = "null";
                          } else if (typeof val === "boolean") {
                            valStr = val ? "true" : "false";
                          } else {
                            valStr = val.toString();
                          }

                          return (
                            <td 
                              key={col.column_name} 
                              className={`py-2.5 px-4 font-mono text-[11px] ${
                                val === null || val === undefined 
                                  ? "text-stone-400 italic" 
                                  : typeof val === "boolean" 
                                  ? "text-amber-600 dark:text-amber-400 font-semibold"
                                  : typeof val === "number"
                                  ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                  : "text-stone-800 dark:text-stone-200"
                              }`}
                            >
                              {valStr}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BentoCard>
          </BentoGrid>
        </main>
      </div>
    </AuthGuard>
  );
}
