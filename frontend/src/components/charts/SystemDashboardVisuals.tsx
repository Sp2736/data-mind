"use client";

import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ScatterChart, Scatter, PieChart, Pie, AreaChart, Area, Cell
} from "recharts";
import { InteractiveChart } from "@/lib/api/datasets";

type Props = {
  charts: InteractiveChart[];
};


const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#3b82f6'];

export function SystemDashboardVisuals({ charts }: Props) {
  if (!charts || charts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-stone-400 bg-stone-50 dark:bg-stone-900/20 rounded-xl border border-dashed border-stone-200 dark:border-stone-800 p-8">
        <p className="text-sm">No interactive charts generated yet.</p>
      </div>
    );
  }

  const renderChart = (chart: InteractiveChart) => {
    switch (chart.chart_type) {
      case "bar":
      case "histogram":
        return (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chart.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={chart.x_axis_key} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} 
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {chart.y_axis_keys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      case "line":
        return (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chart.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={chart.x_axis_key} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} 
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {chart.y_axis_keys.map((key, i) => (
                <Line type="monotone" key={key} dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      case "area":
        return (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chart.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={chart.x_axis_key} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} 
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {chart.y_axis_keys.map((key, i) => (
                <Area type="monotone" key={key} dataKey={key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );
      case "pie":
        // For pie, we usually just need one value key and one name key
        const valueKey = chart.y_axis_keys[0];
        return (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} 
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Pie 
                data={chart.data} 
                dataKey={valueKey} 
                nameKey={chart.x_axis_key} 
                cx="50%" 
                cy="50%" 
                outerRadius={80} 
                fill="#8884d8" 
                label={{ fontSize: 10 }}
              >
                {chart.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        );
      case "scatter":
        return (
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={chart.x_axis_key} type="number" name={chart.x_axis_key} tick={{ fontSize: 11 }} />
              <YAxis dataKey={chart.y_axis_keys[0]} type="number" name={chart.y_axis_keys[0]} tick={{ fontSize: 11 }} />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }} 
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} 
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Scatter name={chart.title} data={chart.data} fill={COLORS[0]} />
            </ScatterChart>
          </ResponsiveContainer>
        );
      default:
        return (
          <div className="h-[250px] flex items-center justify-center text-sm text-stone-500">
            Unsupported chart type: {chart.chart_type}
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 overflow-y-auto max-h-[500px] pr-2 scrollbar-thin">
      {charts.map((chart, idx) => (
        <div key={idx} className="bg-white dark:bg-stone-950 border border-stone-100 dark:border-stone-800 rounded-xl p-4 shadow-sm flex flex-col gap-2">
          <div>
            <h4 className="text-sm font-semibold text-stone-800 dark:text-stone-200">{chart.title}</h4>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{chart.description}</p>
          </div>
          <div className="mt-2">
            {renderChart(chart)}
          </div>
        </div>
      ))}
    </div>
  );
}
