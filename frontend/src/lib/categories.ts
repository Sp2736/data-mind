export const CATEGORIES = ["data_cleaning","distribution","correlation","trend","anomaly","segmentation"] as const;
export type ResearchCategory = typeof CATEGORIES[number];
export const isCleaning = (c: string) => c === "data_cleaning";
export const isAnalysis = (c: string) => (CATEGORIES as readonly string[]).includes(c) && c !== "data_cleaning";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export const isTerminal = (s: string) => s === "succeeded" || s === "failed";
export const normalizeRunStatus = (s: string): RunStatus =>
  s === "completed" ? "succeeded" : s === "pending" ? "queued" : (s as RunStatus);
