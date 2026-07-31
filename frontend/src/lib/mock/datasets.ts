export interface Dataset {
  id: string;
  user_id: string;
  filename: string;
  format: 'csv' | 'json';
  storage_path: string;
  row_count: number;
  column_count: number;
  file_size_bytes: number;
  uploaded_at: string;
  status: 'ready' | 'processing' | 'failed';
  description?: string;
  primary_domain?: string;
}

export const MOCK_DATASETS: Dataset[] = [
  {
    id: 'ds_churn_2026_01',
    user_id: 'usr_01HGB897XYZ',
    filename: 'customer_churn_q1_2026.csv',
    format: 'csv',
    storage_path: 'uploads/2026/01/customer_churn_q1_2026.csv',
    row_count: 14250,
    column_count: 24,
    file_size_bytes: 3840120, // ~3.8 MB
    uploaded_at: '2026-07-28T14:20:00Z',
    status: 'ready',
    description: 'Quarterly customer subscription & churn indicators dataset with demographic and usage metrics.',
    primary_domain: 'Customer Analytics',
  },
  {
    id: 'ds_finance_monthly_02',
    user_id: 'usr_01HGB897XYZ',
    filename: 'saas_revenue_metrics_2025.json',
    format: 'json',
    storage_path: 'uploads/2026/01/saas_revenue_metrics_2025.json',
    row_count: 8900,
    column_count: 18,
    file_size_bytes: 2150000, // ~2.15 MB
    uploaded_at: '2026-07-29T09:15:00Z',
    status: 'ready',
    description: 'Monthly SaaS recurring revenue, expansion revenue, and customer acquisition cost breakdown.',
    primary_domain: 'Financial Modeling',
  },
  {
    id: 'ds_healthcare_encounters_03',
    user_id: 'usr_01HGB897XYZ',
    filename: 'patient_readmission_trends.csv',
    format: 'csv',
    storage_path: 'uploads/2026/01/patient_readmission_trends.csv',
    row_count: 32000,
    column_count: 31,
    file_size_bytes: 7890120, // ~7.89 MB
    uploaded_at: '2026-07-30T18:45:00Z',
    status: 'ready',
    description: 'Anonymized clinical encounter logs, readmission windows, and diagnosis clusters.',
    primary_domain: 'Healthcare Analytics',
  },
  {
    id: 'ds_marketing_campaign_04',
    user_id: 'usr_01HGB897XYZ',
    filename: 'ad_campaign_conversions_raw.csv',
    format: 'csv',
    storage_path: 'uploads/2026/01/ad_campaign_conversions_raw.csv',
    row_count: 5400,
    column_count: 14,
    file_size_bytes: 1120000, // ~1.12 MB
    uploaded_at: '2026-07-31T11:05:00Z',
    status: 'processing',
    description: 'Multi-channel digital ad attribution logs currently undergoing automated profiling.',
    primary_domain: 'Marketing Operations',
  },
];
