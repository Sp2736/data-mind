import { fetchApi } from "./client";

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

/**
 * Upload a dataset file (.csv or .json) via multipart form data.
 */
export async function uploadDataset(file: File): Promise<ApiDataset> {
  const formData = new FormData();
  formData.append("file", file);

  return fetchApi<ApiDataset>("/datasets", {
    method: "POST",
    body: formData,
  });
}

/**
 * Get all datasets for the authenticated user.
 */
export async function listDatasets(): Promise<ApiDataset[]> {
  return fetchApi<ApiDataset[]>("/datasets");
}

/**
 * Get a specific dataset by ID.
 */
export async function getDataset(id: string): Promise<ApiDataset> {
  return fetchApi<ApiDataset>(`/datasets/${id}`);
}

/**
 * Get detailed profile for a dataset by ID.
 */
export async function getDatasetProfile(id: string): Promise<ApiDatasetProfile> {
  return fetchApi<ApiDatasetProfile>(`/datasets/${id}/profile`);
}
