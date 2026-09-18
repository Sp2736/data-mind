import { fetchApi } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiDataset {
  id: string;
  filename: string;
  format: string;
  row_count: number;
  column_count: number;
  file_size_bytes: number;
  status: "processing" | "ready" | "failed";
  description?: string | null;
  primary_domain?: string | null;
  source_url?: string | null;
  uploaded_at: string;
}

export interface SchemaColumn {
  column_name: string;
  data_type: string;
  is_primary_key: boolean;
  null_count: number;
  null_percentage: number;
  unique_count: number;
}

export interface ColumnStats {
  column_name: string;
  count: number;
  mean?: number | null;
  std?: number | null;
  min?: number | null;
  q25?: number | null;
  q50?: number | null;
  q75?: number | null;
  max?: number | null;
  most_frequent_value?: string | number | null;
  most_frequent_count?: number | null;
}

export interface CorrelationItem {
  column_x: string;
  column_y: string;
  coefficient: number;
}

export interface ApiDatasetProfile {
  dataset_id: string;
  schema_summary: SchemaColumn[];
  stats_summary: ColumnStats[];
  correlation_summary: CorrelationItem[];
  sample_rows: Record<string, unknown>[];
  created_at: string;
}

export interface ApiResearchQuestion {
  id: string;
  dataset_id: string;
  category: "pre-processing" | "eda";
  question_text: string;
  target_columns: string[];
  rationale: string;
  expected_output_type: "chart" | "table" | "metric" | "statistic";
  status: string;
  sort_order: number;
  quality_score: number;
  quality_label: string | null;
  created_at: string;
}

export interface ApiAnalysisRun {
  id: string;
  dataset_id: string;
  rq_id: string;
  status: "pending" | "running" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  error_traceback?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export interface ApiInsight {
  id: string;
  run_id: string;
  rq_id: string;
  category: string;
  summary_text: string;
  key_takeaways: string[];
  created_at: string;
}

export interface InteractiveChart {
  chart_type: "bar" | "line" | "pie" | "area" | "scatter" | "histogram";
  title: string;
  description: string;
  x_axis_key: string;
  y_axis_keys: string[];
  data: Record<string, unknown>[];
}

export interface ApiVisualization {
  id: string;
  insight_id: string;
  chart_type: string;
  chart_config: {
    charts?: InteractiveChart[];
    [key: string]: unknown;
  };
  chart_file_path?: string | null;
  created_at: string;
}

export interface ColumnComparison {
  column: string;
  data_type: string;
  original_null_count: number;
  original_null_pct: number;
  cleaned_null_count: number | null;
  cleaned_null_pct: number | null;
  improved: boolean;
}

export interface DatasetComparison {
  dataset_id: string;
  original: { row_count: number; column_count: number };
  cleaned: { row_count: number; column_count: number };
  rows_removed: number;
  rows_added: number;
  column_comparison: ColumnComparison[];
}

// ─── Dataset helpers ──────────────────────────────────────────────────────────

/** Submit a Kaggle/GitHub URL to register a new dataset. */
export async function submitDatasetUrl(url: string): Promise<ApiDataset> {
  return fetchApi<ApiDataset>("/datasets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

/** Get all datasets for the authenticated user. */
export async function listDatasets(): Promise<ApiDataset[]> {
  return fetchApi<ApiDataset[]>("/datasets");
}

/** Get a specific dataset by ID. */
export async function getDataset(id: string): Promise<ApiDataset> {
  return fetchApi<ApiDataset>(`/datasets/${id}`);
}

/** Delete a dataset by ID. */
export async function deleteDataset(id: string): Promise<void> {
  return fetchApi<void>(`/datasets/${id}`, {
    method: "DELETE",
  });
}

/** Get detailed profile for a dataset by ID. */
export async function getDatasetProfile(id: string): Promise<ApiDatasetProfile> {
  return fetchApi<ApiDatasetProfile>(`/datasets/${id}/profile`);
}

/** Get before/after cleaning comparison stats. */
export async function getDatasetComparison(id: string): Promise<DatasetComparison> {
  return fetchApi<DatasetComparison>(`/datasets/${id}/comparison`);
}

/** Returns the URL to download the cleaned dataset CSV. */
export function getCleanedDatasetUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  return `${base}/datasets/${id}/cleaned`;
}

// ─── System Profile helpers ─────────────────────────────────────────────────────

export interface ApiSystemProfileDashboard {
  run_status: string | null;
  insight: ApiInsight | null;
  visualization: ApiVisualization | null;
}

export async function getSystemProfileDashboard(id: string): Promise<ApiSystemProfileDashboard> {
  return fetchApi<ApiSystemProfileDashboard>(`/datasets/${id}/system-profile`);
}

// ─── Research Question helpers ────────────────────────────────────────────────

/** Generate (or regenerate) LLM research questions for a dataset. */
export async function generateQuestions(
  datasetId: string,
  useRag = true
): Promise<ApiResearchQuestion[]> {
  return fetchApi<ApiResearchQuestion[]>(`/datasets/${datasetId}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ use_rag: useRag }),
  });
}

/** List already-generated research questions. */
export async function listQuestions(datasetId: string): Promise<ApiResearchQuestion[]> {
  return fetchApi<ApiResearchQuestion[]>(`/datasets/${datasetId}/questions`);
}

// ─── Analysis Run helpers ─────────────────────────────────────────────────────

/** Trigger analysis runs for the given RQ IDs. */
export async function triggerRuns(
  datasetId: string,
  rqIds: string[]
): Promise<ApiAnalysisRun[]> {
  return fetchApi<ApiAnalysisRun[]>(`/datasets/${datasetId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rq_ids: rqIds }),
  });
}

/** List all runs for a dataset. */
export async function listRuns(datasetId: string): Promise<ApiAnalysisRun[]> {
  return fetchApi<ApiAnalysisRun[]>(`/datasets/${datasetId}/runs`);
}

// ─── Insights helpers ─────────────────────────────────────────────────────────

/** List all insights for a dataset. */
export async function listInsights(datasetId: string): Promise<ApiInsight[]> {
  return fetchApi<ApiInsight[]>(`/datasets/${datasetId}/insights`);
}

/** Get visualization for a specific insight. */
export async function getVisualization(
  datasetId: string,
  insightId: string
): Promise<ApiVisualization | null> {
  try {
    return await fetchApi<ApiVisualization>(
      `/datasets/${datasetId}/insights/${insightId}/visualization`
    );
  } catch {
    return null;
  }
}

// ─── Report helpers ───────────────────────────────────────────────────────────

export interface ApiReport {
  id: string;
  dataset_id: string;
  overall_summary: string;
  cleaning_actions: Array<{
    action_name: string;
    column_affected: string;
    description: string;
    rationale: string;
  }>;
  created_at: string;
}

/** Get existing generated executive report. */
export async function getReport(datasetId: string): Promise<ApiReport> {
  return fetchApi<ApiReport>(`/datasets/${datasetId}/report`);
}

/** Trigger generating / compiling the executive report from insights. */
export async function buildReport(datasetId: string): Promise<ApiReport> {
  return fetchApi<ApiReport>(`/datasets/${datasetId}/report`, {
    method: "POST",
  });
}
