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
    
    // Extract a "hero stat" from each insight for the Key Findings rail
    const extractHeroStat = (text: string) => {
      const match = text.match(/\b\d+(?:\.\d+)?%?\b/);
      return match ? match[0] : "Key";
    };

    return (
      <div 
        ref={ref} 
        style={{ width: '794px', position: 'absolute', left: '-9999px', top: 0, backgroundColor: '#ffffff' }}
        className="print-template"
      >
        <style dangerouslySetInnerHTML={{__html: `
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,600;0,700;1,400&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap');
          
          .mckinsey-theme {
            --ink: #0F1115;
            --ink-muted: #5B6472;
            --accent: #2D5BFF;
            --accent-soft: #EEF2FF;
            --line: #E4E7EC;
            --surface: #FAFBFC;
            --good: #16A34A;
            --warn: #D97706;
            --bad: #DC2626;

            color: var(--ink);
            font-family: 'IBM Plex Sans', sans-serif;
          }
          
          .mckinsey-theme h1, 
          .mckinsey-theme h2, 
          .mckinsey-theme h3, 
          .mckinsey-theme .font-serif {
            font-family: 'Source Serif 4', serif;
          }
        `}} />

        <div className="mckinsey-theme bg-white">
          
          {/* PAGE 1: COVER */}
          <div data-pdf-block="true" className="w-full h-[1123px] flex flex-col justify-between p-16 bg-white relative box-border">
            {/* Top Left Wordmark */}
            <div>
              <div className="text-[10px] tracking-[0.2em] font-bold text-[var(--ink-muted)] uppercase">
                <span className="font-black text-[var(--ink)]">DATAMIND</span> AUTONOMOUS ANALYTICS ENGINE
              </div>
            </div>

            {/* Center: Title & Metadata */}
            <div className="flex flex-col gap-4">
              <h1 className="font-serif text-5xl font-semibold leading-tight text-[var(--ink)] break-words">
                {displayFilename}
              </h1>
              <div className="text-sm text-[var(--ink-muted)] flex items-center gap-4">
                <span>{dateStr}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-[var(--surface)] border border-[var(--line)] rounded">
                  {dataset.id.slice(0, 8)}
                </span>
              </div>
            </div>

            {/* Bottom: Stat Strip */}
            <div className="flex flex-col gap-8 w-full">
              <div className="w-full h-[1px] bg-[var(--accent)]"></div>
              <div className="grid grid-cols-4 gap-8">
                <div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mb-1">{dataset.row_count.toLocaleString()}</div>
                  <div className="text-[10px] tracking-wider uppercase text-[var(--ink-muted)] font-semibold">Records</div>
                </div>
                <div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mb-1">{dataset.column_count}</div>
                  <div className="text-[10px] tracking-wider uppercase text-[var(--ink-muted)] font-semibold">Attributes</div>
                </div>
                <div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mb-1">{bundles.filter(b => b.question).length}</div>
                  <div className="text-[10px] tracking-wider uppercase text-[var(--ink-muted)] font-semibold">Research Questions</div>
                </div>
                <div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mb-1">{bundles.length}</div>
                  <div className="text-[10px] tracking-wider uppercase text-[var(--ink-muted)] font-semibold">Insights Synthesized</div>
                </div>
              </div>
            </div>
          </div>

          {/* PAGE 2: AT A GLANCE */}
          <div data-pdf-block="true" className="w-full min-h-[1123px] p-16 bg-white flex flex-col gap-10 box-border">
            <h2 className="font-serif text-3xl font-semibold text-[var(--ink)] mb-4">At a Glance</h2>
            
            <div className="flex gap-12 flex-1">
              {/* Left Column (60%) */}
              <div className="w-[60%] flex flex-col gap-8">
                <div className="p-8 bg-[var(--accent-soft)] border-l-4 border-[var(--accent)] text-[var(--ink)]">
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-4 text-[var(--accent)]">Executive Summary</h3>
                  <div className="font-serif text-base leading-relaxed">
                    {report?.overall_summary ? (
                      <p>{report.overall_summary}</p>
                    ) : (
                      <p>The autonomous analytics pipeline successfully profiled and executed statistical analyses across the ingested schema, surfacing key distributions, correlation dynamics, and actionable segmentations.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column (40%) */}
              <div className="w-[40%] flex flex-col gap-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-2 border-b border-[var(--line)] pb-2">Key Findings</h3>
                {bundles.slice(0, 5).map((bundle, idx) => (
                  <div key={idx} className="flex flex-col gap-2 p-4 bg-[var(--surface)] border border-[var(--line)] rounded-sm">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--accent)]">
                          {bundle.question?.rq_category || "Insight"}
                        </span>
                        <p className="text-sm font-semibold leading-tight text-[var(--ink)] line-clamp-3">
                          {bundle.question?.question_text || `Insight ${idx + 1}`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 text-right">
                        <span className="text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums">
                          {extractHeroStat(bundle.insight.summary_text)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PAGE 3: DATASET & METHODOLOGY */}
          <div data-pdf-block="true" className="w-full min-h-[1123px] p-16 bg-white box-border">
            <h2 className="font-serif text-3xl font-semibold text-[var(--ink)] mb-8">Dataset & Methodology</h2>
            
            <div className="mb-12 border border-[var(--line)] rounded-sm overflow-hidden bg-white">
              <table className="w-full text-left text-sm border-collapse">
                <tbody>
                  <tr className="border-b border-[var(--line)]">
                    <th className="p-4 bg-[var(--surface)] w-1/3 font-medium text-[var(--ink-muted)]">Filename</th>
                    <td className="p-4 font-semibold text-[var(--ink)]">{displayFilename}</td>
                  </tr>
                  <tr className="border-b border-[var(--line)]">
                    <th className="p-4 bg-[var(--surface)] w-1/3 font-medium text-[var(--ink-muted)]">Format</th>
                    <td className="p-4 font-semibold text-[var(--ink)]">CSV / Tabular</td>
                  </tr>
                  <tr className="border-b border-[var(--line)]">
                    <th className="p-4 bg-[var(--surface)] w-1/3 font-medium text-[var(--ink-muted)]">Total Records</th>
                    <td className="p-4 font-semibold text-[var(--ink)] tabular-nums">{dataset.row_count.toLocaleString()}</td>
                  </tr>
                  <tr className="border-b border-[var(--line)]">
                    <th className="p-4 bg-[var(--surface)] w-1/3 font-medium text-[var(--ink-muted)]">Total Attributes</th>
                    <td className="p-4 font-semibold text-[var(--ink)] tabular-nums">{dataset.column_count}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-4 border-b border-[var(--line)] pb-2">Schema Health</h3>
            {profile?.schema_summary && profile.schema_summary.length > 0 ? (
              <div className="border border-[var(--line)] rounded-sm overflow-hidden bg-white">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-[var(--surface)] border-b border-[var(--line)] text-[var(--ink-muted)]">
                      <th className="p-3 font-semibold uppercase text-[10px] tracking-wider w-1/3">Column Name</th>
                      <th className="p-3 font-semibold uppercase text-[10px] tracking-wider">Type</th>
                      <th className="p-3 font-semibold uppercase text-[10px] tracking-wider text-right">Missing %</th>
                      <th className="p-3 font-semibold uppercase text-[10px] tracking-wider text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.schema_summary.slice(0, 30).map((col, idx) => {
                      const isHighMissing = typeof col.null_percentage === 'number' && col.null_percentage > 5;
                      return (
                        <tr key={idx} className="border-b border-[var(--line)] last:border-0">
                          <td className="p-3 font-mono font-medium text-[11px] text-[var(--ink)]">{col.column_name}</td>
                          <td className="p-3 text-xs text-[var(--ink-muted)]">{col.data_type}</td>
                          <td className="p-3 text-xs tabular-nums text-right text-[var(--ink-muted)]">
                            {typeof col.null_percentage === "number" ? col.null_percentage.toFixed(1) : 0}%
                          </td>
                          <td className="p-3 text-center">
                            {isHighMissing ? (
                              <span className="inline-block w-2 h-2 rounded-full bg-[var(--warn)]"></span>
                            ) : (
                              <span className="inline-block w-2 h-2 rounded-full bg-[var(--good)]"></span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[var(--ink-muted)]">Schema health data not available.</p>
            )}
          </div>

          {/* PAGE 4+: DETAILED INSIGHTS */}
          {bundles.map((bundle, idx) => (
            <div key={idx} data-pdf-block="true" className="w-full min-h-[500px] p-16 bg-white break-inside-avoid border-t border-[var(--line)] box-border">
              
              <div className="mb-8">
                <span className="inline-block px-2 py-1 mb-4 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] bg-[var(--accent-soft)] rounded-sm">
                  {bundle.question?.rq_category || "Analytical Finding"}
                </span>
                <h2 className="font-serif text-2xl font-semibold text-[var(--ink)] leading-snug">
                  {bundle.question?.question_text ?? `Finding ${bundle.insight.id.slice(-6)}`}
                </h2>
              </div>
              
              <div className="flex flex-col gap-8">
                {/* Narrative & Takeaways */}
                <div className="flex flex-col gap-6">
                  <p className="text-[15px] leading-relaxed text-[var(--ink)]">{bundle.insight.summary_text}</p>
                  
                  {bundle.insight.key_takeaways && bundle.insight.key_takeaways.length > 0 && (
                    <div className="p-6 bg-[var(--surface)] border border-[var(--line)] rounded-sm">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-[var(--ink-muted)] mb-4">Takeaways</h4>
                      <ul className="list-none m-0 p-0 space-y-3">
                        {bundle.insight.key_takeaways.map((k, i) => (
                          <li key={i} className="flex gap-3 text-sm text-[var(--ink)] leading-relaxed">
                            <span className="text-[var(--accent)] mt-0.5">•</span>
                            <span>{k}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                
                {/* Visual */}
                {bundle.visual && (
                  <div className="mt-4 flex flex-col items-center justify-center p-8 bg-[var(--surface)] border border-[var(--line)] rounded-sm text-center">
                    {bundle.base64Image ? (
                      <div className="w-full max-w-[600px] flex flex-col items-center justify-center">
                        <img 
                          src={bundle.base64Image} 
                          alt={bundle.question?.question_text ?? "Visual"}
                          className="w-full h-auto object-contain"
                          style={{ maxHeight: '450px' }}
                        />
                      </div>
                    ) : (
                      <div className="w-full max-w-[600px] bg-white border border-[var(--line)] p-4">
                        <InsightVisualRenderer visual={bundle.visual} />
                      </div>
                    )}
                    <p className="mt-6 text-xs italic text-[var(--ink-muted)] font-serif">
                      Figure {idx + 1}: {bundle.question?.question_text ?? "Empirical Chart"}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Footer */}
              <div className="mt-16 pt-6 border-t border-[var(--line)] flex justify-between items-center text-[10px] font-medium tracking-wider text-[var(--ink-muted)] uppercase">
                <span>DataMind Autonomous Analytics</span>
                <span className="text-right">{displayFilename}</span>
              </div>
            </div>
          ))}

        </div>
      </div>
    );
  }
);

ProfessionalPDFTemplate.displayName = "ProfessionalPDFTemplate";
