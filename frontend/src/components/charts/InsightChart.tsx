"use client";

import React, { useState } from "react";
import { ApiVisualization } from "@/lib/api/datasets";

// ─── Number Formatting Utility ────────────────────────────────────────────────

export function formatSmartValue(val: number, titleHint = ""): string {
  if (val === null || val === undefined || isNaN(val)) return "—";

  const lowerHint = titleHint.toLowerCase();
  const isPercentContext =
    lowerHint.includes("rate") ||
    lowerHint.includes("percentage") ||
    lowerHint.includes("pct") ||
    lowerHint.includes("proportion") ||
    lowerHint.includes("share");

  const isCorrelation =
    lowerHint.includes("correlation") ||
    lowerHint.includes("coefficient") ||
    (val >= -1 && val <= 1 && !isPercentContext && Math.abs(val) > 0 && Math.abs(val) < 1);

  if (isCorrelation) {
    return (val > 0 ? "+" : "") + val.toFixed(2);
  }

  if (isPercentContext && Math.abs(val) <= 100) {
    return `${val.toFixed(val % 1 === 0 ? 0 : 2)}%`;
  }

  const abs = Math.abs(val);
  if (abs >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 10_000) {
    return `${(val / 1_000).toFixed(1)}k`;
  }
  if (abs >= 1_000) {
    return val.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (abs >= 10) {
    return val.toFixed(val % 1 === 0 ? 0 : 1);
  }
  if (abs > 0 && abs < 1) {
    return val.toFixed(3);
  }

  return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ─── Clean Un-Cluttered Bar Chart ─────────────────────────────────────────────

export function CleanBarChart({
  labels = [],
  values = [],
  title = "",
  compact = false,
}: {
  labels?: string[];
  values?: number[];
  title?: string;
  compact?: boolean;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!values || values.length === 0) {
    return <p className="text-xs text-stone-400 py-6 text-center">No data points available.</p>;
  }

  // Determine dynamic range
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const hasNegative = rawMin < 0;

  // Compute scale boundaries
  let yMin = hasNegative ? rawMin * 1.15 : 0;
  let yMax = rawMax > 0 ? rawMax * 1.15 : 0;

  // Handle flat or zero range
  if (yMax === yMin) {
    yMax = yMax === 0 ? 1 : yMax * 1.2;
    yMin = hasNegative ? yMin * 1.2 : 0;
  }

  const range = yMax - yMin || 1;

  const width = 360;
  const height = compact ? 170 : 190;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 22;
  const padBottom = 32;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const zeroY = padTop + ((yMax - 0) / range) * chartH;
  const clampedZeroY = Math.max(padTop, Math.min(padTop + chartH, zeroY));

  const n = values.length;
  const slotW = chartW / n;
  const barW = Math.min(Math.max(slotW * 0.55, 6), 34);

  // Colors
  const colors = [
    "fill-indigo-500 hover:fill-indigo-600",
    "fill-purple-500 hover:fill-purple-600",
    "fill-sky-500 hover:fill-sky-600",
    "fill-emerald-500 hover:fill-emerald-600",
    "fill-amber-500 hover:fill-amber-600",
    "fill-rose-500 hover:fill-rose-600",
  ];

  // Axis grid ticks (3 ticks: max, mid, min/0)
  const gridTicks = [
    { y: padTop, val: yMax },
    { y: clampedZeroY, val: 0 },
    ...(hasNegative ? [{ y: padTop + chartH, val: yMin }] : []),
  ];

  return (
    <div className="w-full flex flex-col items-center select-none relative">
      {title && (
        <h5 className="text-[11px] font-bold text-stone-600 dark:text-stone-300 mb-1 truncate max-w-full text-center">
          {title}
        </h5>
      )}

      {/* Floating Hover Tooltip */}
      {hoveredIdx !== null && (
        <div className="absolute top-0 z-30 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-[10px] font-bold px-2 py-1 rounded-md shadow-md pointer-events-none transition-all">
          <span>{labels[hoveredIdx] || `Item ${hoveredIdx + 1}`}: </span>
          <span className="text-indigo-300 dark:text-indigo-600 font-mono">
            {formatSmartValue(values[hoveredIdx], title)}
          </span>
        </div>
      )}

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-52 overflow-visible">
        {/* Grid lines & tick labels */}
        {gridTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              y1={tick.y}
              x2={width - padRight}
              y2={tick.y}
              className="stroke-stone-200 dark:stroke-stone-800"
              strokeWidth={tick.val === 0 ? 1.5 : 1}
              strokeDasharray={tick.val === 0 ? undefined : "3 3"}
            />
            <text
              x={padLeft - 5}
              y={tick.y + 3}
              textAnchor="end"
              className="text-[8px] fill-stone-400 font-mono"
            >
              {formatSmartValue(tick.val, title)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {values.map((val, i) => {
          const valY = padTop + ((yMax - val) / range) * chartH;
          const barTop = Math.min(valY, clampedZeroY);
          const barH = Math.max(Math.abs(valY - clampedZeroY), 2);
          const barX = padLeft + i * slotW + (slotW - barW) / 2;

          const labelText = labels[i] ?? `V${i + 1}`;
          const isCrowded = n > 8;

          return (
            <g
              key={i}
              className="cursor-pointer group"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <rect
                x={barX}
                y={barTop}
                width={barW}
                height={barH}
                rx={3}
                className={`${colors[i % colors.length]} transition-colors duration-150`}
              />

              {/* Data label on bar (hide if too crowded to prevent collision) */}
              {!isCrowded && (
                <text
                  x={barX + barW / 2}
                  y={val >= 0 ? barTop - 4 : barTop + barH + 9}
                  textAnchor="middle"
                  className="text-[8px] font-bold fill-stone-700 dark:fill-stone-200"
                >
                  {formatSmartValue(val, title)}
                </text>
              )}

              {/* X Axis label (truncated if long) */}
              <text
                x={barX + barW / 2}
                y={height - padBottom + 13}
                textAnchor="middle"
                className="text-[8px] font-semibold fill-stone-500 dark:fill-stone-400"
              >
                {labelText.length > 8 ? labelText.slice(0, 7) + "…" : labelText}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Clean Un-Cluttered Line Chart ────────────────────────────────────────────

export function CleanLineChart({
  labels = [],
  values = [],
  title = "",
  compact = false,
}: {
  labels?: string[];
  values?: number[];
  title?: string;
  compact?: boolean;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!values || values.length === 0) {
    return <p className="text-xs text-stone-400 py-6 text-center">No data points available.</p>;
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  // Dynamic scale — tight padding so low variations (e.g. 0.01 to 2.05) show full peaks!
  let yMin = rawMin >= 0 ? 0 : rawMin * 1.15;
  let yMax = rawMax > 0 ? rawMax * 1.2 : 1;

  if (yMax === yMin) {
    yMax += 1;
  }

  const range = yMax - yMin || 1;

  const width = 360;
  const height = compact ? 170 : 190;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 22;
  const padBottom = 28;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const n = values.length;
  const pts = values.map((v, i) => {
    const x = padLeft + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
    const y = padTop + ((yMax - v) / range) * chartH;
    return { x, y, v, label: labels[i] || `${i}` };
  });

  const pathD = pts.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ""
  );

  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${padTop + chartH} L ${pts[0].x} ${padTop + chartH} Z`;

  // Determine smart X-axis ticks (max 5-6 ticks, evenly spaced)
  const tickCount = Math.min(n, 6);
  const tickStep = n > 1 ? (n - 1) / (tickCount - 1) : 1;
  const xTicks = Array.from({ length: tickCount }, (_, i) => Math.round(i * tickStep));

  // Ticks for Y axis
  const yTicks = [
    { y: padTop, val: yMax },
    { y: padTop + chartH / 2, val: (yMax + yMin) / 2 },
    { y: padTop + chartH, val: yMin },
  ];

  return (
    <div className="w-full flex flex-col items-center select-none relative">
      {title && (
        <h5 className="text-[11px] font-bold text-stone-600 dark:text-stone-300 mb-1 truncate max-w-full text-center">
          {title}
        </h5>
      )}

      {/* Floating Hover Tooltip */}
      {hoveredIdx !== null && (
        <div className="absolute top-0 z-30 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-[10px] font-bold px-2 py-1 rounded-md shadow-md pointer-events-none transition-all">
          <span>{pts[hoveredIdx].label}: </span>
          <span className="text-indigo-300 dark:text-indigo-600 font-mono">
            {formatSmartValue(pts[hoveredIdx].v, title)}
          </span>
        </div>
      )}

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-52 overflow-visible">
        <defs>
          <linearGradient id={`areaGrad-${title.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              y1={tick.y}
              x2={width - padRight}
              y2={tick.y}
              className="stroke-stone-200 dark:stroke-stone-800"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={padLeft - 5}
              y={tick.y + 3}
              textAnchor="end"
              className="text-[8px] fill-stone-400 font-mono"
            >
              {formatSmartValue(tick.val, title)}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={padLeft}
          y1={padTop + chartH}
          x2={width - padRight}
          y2={padTop + chartH}
          className="stroke-stone-300 dark:stroke-stone-700"
          strokeWidth={1.2}
        />

        {/* Filled Area */}
        <path d={areaD} fill={`url(#areaGrad-${title.replace(/\s+/g, "")})`} />

        {/* Main Line */}
        <path
          d={pathD}
          fill="none"
          className="stroke-indigo-600 dark:stroke-indigo-400"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Selected or Peak Points */}
        {pts.map((pt, i) => {
          const isHovered = hoveredIdx === i;
          const showDot = n <= 15 || isHovered;

          return (
            <g
              key={i}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Transparent target area for easier hovering */}
              <circle cx={pt.x} cy={pt.y} r={8} fill="transparent" />

              {showDot && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 4.5 : 2.5}
                  className={`${
                    isHovered
                      ? "fill-indigo-600 stroke-white dark:stroke-stone-900"
                      : "fill-indigo-500 stroke-white dark:stroke-stone-900"
                  } transition-all`}
                  strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}

        {/* X Axis Sparse Ticks */}
        {xTicks.map((idx) => {
          const pt = pts[idx];
          if (!pt) return null;
          return (
            <text
              key={idx}
              x={pt.x}
              y={height - padBottom + 12}
              textAnchor="middle"
              className="text-[8px] font-semibold fill-stone-500 dark:fill-stone-400"
            >
              {pt.label.length > 7 ? pt.label.slice(0, 6) : pt.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Clean Un-Cluttered Donut Chart ───────────────────────────────────────────

export function CleanDonutChart({
  labels = [],
  values = [],
  title = "",
}: {
  labels?: string[];
  values?: number[];
  title?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!values || values.length === 0) {
    return <p className="text-xs text-stone-400 py-6 text-center">No data points available.</p>;
  }

  const total = values.reduce((a, b) => a + b, 0) || 1;
  const r = 48,
    circ = 2 * Math.PI * r,
    cx = 75,
    cy = 75;

  const cumulativePercents = values.reduce<number[]>((acc, v) => {
    acc.push((acc[acc.length - 1] ?? 0) + v / total);
    return acc;
  }, []);

  const strokeColors = [
    "stroke-indigo-500",
    "stroke-purple-500",
    "stroke-sky-500",
    "stroke-emerald-500",
    "stroke-amber-500",
    "stroke-rose-500",
  ];

  const bgColors = [
    "bg-indigo-500",
    "bg-purple-500",
    "bg-sky-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
  ];

  return (
    <div className="w-full flex flex-col items-center select-none">
      {title && (
        <h5 className="text-[11px] font-bold text-stone-600 dark:text-stone-300 mb-2 truncate max-w-full text-center">
          {title}
        </h5>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-5 justify-center w-full">
        <svg viewBox="0 0 150 150" className="w-28 h-28 shrink-0 overflow-visible">
          {values.map((v, i) => {
            const pct = v / total;
            const offset = circ * (1 - pct);
            const prevAcc = i === 0 ? 0 : cumulativePercents[i - 1];
            const rot = prevAcc * 360 - 90;
            const isHovered = hoveredIdx === i;

            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="transparent"
                className={`${strokeColors[i % strokeColors.length]} cursor-pointer transition-all duration-150`}
                strokeWidth={isHovered ? 18 : 14}
                strokeDasharray={circ}
                strokeDashoffset={offset}
                transform={`rotate(${rot} ${cx} ${cy})`}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
          <circle cx={cx} cy={cy} r={r - 9} className="fill-white dark:fill-[#191921]" />
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            className="text-[10px] font-black fill-stone-800 dark:fill-stone-100"
          >
            {hoveredIdx !== null
              ? `${((values[hoveredIdx] / total) * 100).toFixed(1)}%`
              : `${total > 1000 ? formatSmartValue(total) : "100%"}`}
          </text>
        </svg>

        {/* Legend */}
        <div className="flex flex-col gap-1.5 text-[10px] font-medium max-w-44">
          {labels.slice(0, 5).map((l, i) => {
            const pct = ((values[i] / total) * 100).toFixed(1);
            return (
              <div
                key={i}
                className="flex items-center gap-2 cursor-pointer hover:opacity-80"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <span className={`w-2 h-2 rounded-full ${bgColors[i % bgColors.length]} shrink-0`} />
                <span className="text-stone-600 dark:text-stone-300 truncate font-semibold">
                  {l || `Group ${i + 1}`}
                </span>
                <span className="text-stone-400 font-bold ml-auto font-mono">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Universal Insight Chart Renderer ─────────────────────────────────────────

export function InsightVisualRenderer({
  visual,
  compact = false,
}: {
  visual: ApiVisualization;
  compact?: boolean;
}) {
  const cfg = visual.chart_config as Record<string, unknown>;

  // Interactive specification
  if (visual.chart_type === "interactive") {
    const charts = cfg.charts as
      | Array<{
          chart_type: string;
          title: string;
          x_axis_key: string;
          y_axis_keys: string[];
          data: Array<Record<string, unknown>>;
        }>
      | undefined;

    if (!charts || charts.length === 0) {
      return <p className="text-xs text-stone-400 text-center py-4">No chart data available.</p>;
    }

    return (
      <div className="w-full flex flex-col gap-4">
        {charts.slice(0, compact ? 1 : 2).map((chart, i) => {
          const labels = chart.data.map((d) => String(d[chart.x_axis_key] ?? ""));
          const yKey = chart.y_axis_keys?.[0] ?? "value";
          const values = chart.data.map((d) => Number(d[yKey] ?? 0));
          const t = chart.chart_type?.toLowerCase();

          if (t === "pie" || t === "donut") {
            return <CleanDonutChart key={i} labels={labels} values={values} title={chart.title} />;
          }
          if (t === "line" || t === "area") {
            return (
              <CleanLineChart
                key={i}
                labels={labels}
                values={values}
                title={chart.title}
                compact={compact}
              />
            );
          }
          return (
            <CleanBarChart
              key={i}
              labels={labels}
              values={values}
              title={chart.title}
              compact={compact}
            />
          );
        })}
      </div>
    );
  }

  const labels = cfg.labels as string[] | undefined;
  const values = cfg.values as number[] | undefined;
  const title = (cfg.title as string) || "Visual Analysis";

  switch (visual.chart_type) {
    case "bar":
      return <CleanBarChart labels={labels} values={values} title={title} compact={compact} />;
    case "pie":
    case "donut":
      return <CleanDonutChart labels={labels} values={values} title={title} />;
    case "line":
    case "area":
      return <CleanLineChart labels={labels} values={values} title={title} compact={compact} />;
    case "table": {
      const headers = cfg.table_headers as string[] | undefined;
      const rows = cfg.table_rows as Record<string, unknown>[] | undefined;
      return (
        <div className="w-full overflow-hidden">
          <h5 className="text-[11px] font-bold text-stone-600 dark:text-stone-300 mb-2 text-center">
            {title}
          </h5>
          <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 font-bold text-stone-500">
                  {headers?.map((h, i) => (
                    <th key={i} className="py-1.5 px-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows?.slice(0, 6).map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-stone-100 dark:border-stone-850 hover:bg-stone-50/60 dark:hover:bg-stone-800/40 last:border-b-0"
                  >
                    {headers?.map((h, j) => (
                      <td key={j} className="py-1.5 px-2 text-stone-600 dark:text-stone-300 font-semibold">
                        {String(row[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    default:
      return <p className="text-xs text-stone-400 text-center py-4">No visualization available.</p>;
  }
}
