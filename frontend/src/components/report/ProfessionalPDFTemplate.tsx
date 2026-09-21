"use client";

import React, { forwardRef } from "react";
import { ApiDataset, ApiDatasetProfile, ApiReport, ApiInsight, ApiResearchQuestion, ApiVisualization } from "@/lib/api/datasets";
import { InsightVisualRenderer } from "@/components/charts/InsightChart";

interface InsightBundle {
  insight: ApiInsight;
  question?: ApiResearchQuestion;
  visual?: ApiVisualization | null;
  base64Image?: string | null;
}

interface ProfessionalPDFTemplateProps {
  dataset: ApiDataset;
  profile: ApiDatasetProfile | null;
  report: ApiReport | null;
  bundles: InsightBundle[];
}

export const ProfessionalPDFTemplate = forwardRef<HTMLDivElement, ProfessionalPDFTemplateProps>(
  ({ dataset, profile, report, bundles }, ref) => {
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const displayFilename = dataset?.filename ? dataset.filename.split(/[/\\]/).pop() : "Dataset";
    
    return (
      <div 
        ref={ref} 
        style={{ width: '794px', position: 'absolute', left: '-9999px', top: 0, backgroundColor: '#ffffff' }}
        className="print-template"
      >
        <style dangerouslySetInnerHTML={{__html: `
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap');
          
          .report-theme {
            --ink: #111827;
            --ink-muted: #4B5563;
            --accent: #2563EB;
            --line: #E5E7EB;
            --surface: #F9FAFB;

            color: var(--ink);
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 14px;
            line-height: 1.6;
          }
          
          .report-theme h1, .report-theme h2, .report-theme h3, .report-theme h4 {
            color: var(--ink);
            margin: 0;
            font-weight: 600;
          }
          
          /* Allow natural pagination but prevent bad breaks inside important blocks */
          .avoid-break {
            break-inside: avoid;
          }
        `}} />

        <div className="report-theme bg-white p-0">
          
          {/* HEADER / TITLE */}
          <div className="mb-10 pb-6 border-b-2 border-[var(--accent)]">
            <div className="text-[10px] tracking-widest font-bold text-[var(--ink-muted)] uppercase mb-4">
              DataMind Analytics Report
            </div>
            <h1 className="text-4xl font-semibold leading-tight mb-4">
              {displayFilename}
            </h1>
            <div className="text-sm text-[var(--ink-muted)] flex items-center justify-between">
              <span>Generated on {dateStr}</span>
              <span className="font-mono text-xs">Dataset ID: {dataset.id.slice(0, 8)}</span>
            </div>
          </div>

          {/* OVERVIEW SECTION */}
          <div className="mb-10 avoid-break">
            <h2 className="text-2xl mb-4 text-[var(--accent)]">Executive Summary</h2>
            <div className="text-base text-[var(--ink)] leading-relaxed">
              {report?.overall_summary ? (
                <p>{report.overall_summary}</p>
              ) : (
                <p>The autonomous analytics pipeline successfully profiled and executed statistical analyses across the ingested schema, surfacing key distributions, correlation dynamics, and actionable segmentations.</p>
              )}
            </div>
          </div>

          {/* METHODOLOGY & DATASET INFO */}
          <div className="mb-10 avoid-break">
            <h2 className="text-2xl mb-4 text-[var(--accent)]">Dataset Overview</h2>
            
            <div className="mb-6">
              <table className="w-full text-left text-sm border-collapse border border-[var(--line)]">
                <tbody>
                  <tr className="border-b border-[var(--line)] bg-[var(--surface)]">
                    <th className="p-3 font-semibold w-1/3">Filename</th>
                    <td className="p-3">{displayFilename}</td>
                  </tr>
                  <tr className="border-b border-[var(--line)]">
                    <th className="p-3 font-semibold w-1/3 bg-[var(--surface)]">Format</th>
                    <td className="p-3">CSV / Tabular</td>
                  </tr>
                  <tr className="border-b border-[var(--line)]">
                    <th className="p-3 font-semibold w-1/3 bg-[var(--surface)]">Total Records</th>
                    <td className="p-3 tabular-nums">{dataset.row_count.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th className="p-3 font-semibold w-1/3 bg-[var(--surface)]">Total Attributes</th>
                    <td className="p-3 tabular-nums">{dataset.column_count}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {profile?.schema_summary && profile.schema_summary.length > 0 && (
              <div className="avoid-break mt-6">
                <h3 className="text-lg mb-3">Schema Health</h3>
                <table className="w-full text-left text-sm border-collapse border border-[var(--line)]">
                  <thead>
                    <tr className="bg-[var(--surface)] border-b-2 border-[var(--line)] text-[var(--ink-muted)]">
                      <th className="p-2 font-semibold">Column Name</th>
                      <th className="p-2 font-semibold">Type</th>
                      <th className="p-2 font-semibold text-right">Missing %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.schema_summary.slice(0, 30).map((col, idx) => (
                      <tr key={idx} className="border-b border-[var(--line)]">
                        <td className="p-2 font-mono text-xs">{col.column_name}</td>
                        <td className="p-2 text-xs text-[var(--ink-muted)]">{col.data_type}</td>
                        <td className="p-2 text-xs tabular-nums text-right">
                          {typeof col.null_percentage === "number" ? col.null_percentage.toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* FINDINGS SECTION */}
          <div className="mt-12">
            <h2 className="text-3xl mb-8 border-b border-[var(--line)] pb-4 text-[var(--accent)]">Key Findings & Analysis</h2>
            
            {bundles.map((bundle, idx) => (
              <div key={idx} className="mb-12 pb-8 border-b border-[var(--line)] avoid-break">
                
                <h3 className="text-xl font-semibold mb-4 leading-snug">
                  {idx + 1}. {bundle.question?.question_text ?? `Finding ${bundle.insight.id.slice(-6)}`}
                </h3>
                
                <div className="text-[15px] mb-6 leading-relaxed">
                  {bundle.insight.summary_text}
                </div>
                
                {bundle.insight.key_takeaways && bundle.insight.key_takeaways.length > 0 && (
                  <div className="mb-6 pl-4 border-l-2 border-[var(--accent)]">
                    <h4 className="text-sm font-semibold text-[var(--ink-muted)] mb-2 uppercase tracking-wider">Takeaways</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {bundle.insight.key_takeaways.map((k, i) => (
                        <li key={i} className="text-sm leading-relaxed">
                          {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {bundle.visual && (
                  <div className="mt-6 flex flex-col items-center border border-[var(--line)] p-4 bg-[var(--surface)]">
                    {bundle.base64Image ? (
                      <img 
                        src={bundle.base64Image} 
                        alt={bundle.question?.question_text ?? "Chart visualization"}
                        className="w-full max-w-[600px] h-auto object-contain"
                        style={{ maxHeight: '400px' }}
                      />
                    ) : (
                      <div className="w-full max-w-[600px] bg-white border border-[var(--line)] p-4">
                        <InsightVisualRenderer visual={bundle.visual} />
                      </div>
                    )}
                    <p className="mt-3 text-xs text-[var(--ink-muted)] text-center">
                      Figure {idx + 1}: {bundle.question?.question_text ?? "Visualization"}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* FOOTER */}
          <div className="mt-16 pt-4 border-t-2 border-[var(--accent)] flex justify-between items-center text-xs text-[var(--ink-muted)]">
            <span className="font-semibold uppercase tracking-wider">DataMind Analytics Engine</span>
            <span>{dateStr}</span>
          </div>

        </div>
      </div>
    );
  }
);

ProfessionalPDFTemplate.displayName = "ProfessionalPDFTemplate";
