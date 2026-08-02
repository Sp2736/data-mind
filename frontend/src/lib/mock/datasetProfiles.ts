export interface SchemaSummaryItem {
  column_name: string;
  data_type: string;
  null_count: number;
  null_percentage: number;
  unique_count: number;
  is_primary_key?: boolean;
}

export interface StatsSummaryItem {
  column_name: string;
  count: number;
  mean?: number;
  std?: number;
  min?: number;
  q25?: number;
  q50?: number; // median
  q75?: number;
  max?: number;
  most_frequent_value?: string | number;
  most_frequent_count?: number;
}

export interface CorrelationItem {
  column_x: string;
  column_y: string;
  coefficient: number;
}

export interface DatasetProfile {
  id: string;
  dataset_id: string;
  schema_summary: SchemaSummaryItem[];
  stats_summary: StatsSummaryItem[];
  correlation_summary: CorrelationItem[];
  sample_rows: Record<string, any>[];
}

// 1. Customer Churn Q1 2026 Profiles
const CHURN_PROFILE: DatasetProfile = {
  id: 'dp_churn_01',
  dataset_id: 'ds_churn_2026_01',
  schema_summary: [
    { column_name: 'customer_id', data_type: 'VARCHAR(50)', null_count: 0, null_percentage: 0, unique_count: 14250, is_primary_key: true },
    { column_name: 'gender', data_type: 'VARCHAR(10)', null_count: 0, null_percentage: 0, unique_count: 2 },
    { column_name: 'age', data_type: 'INTEGER', null_count: 0, null_percentage: 0, unique_count: 68 },
    { column_name: 'tenure_months', data_type: 'INTEGER', null_count: 120, null_percentage: 0.84, unique_count: 73 },
    { column_name: 'subscription_type', data_type: 'VARCHAR(20)', null_count: 0, null_percentage: 0, unique_count: 3 },
    { column_name: 'contract_type', data_type: 'VARCHAR(20)', null_count: 0, null_percentage: 0, unique_count: 3 },
    { column_name: 'monthly_charges', data_type: 'NUMERIC(10,2)', null_count: 0, null_percentage: 0, unique_count: 1420 },
    { column_name: 'total_charges', data_type: 'NUMERIC(12,2)', null_count: 45, null_percentage: 0.32, unique_count: 13800 },
    { column_name: 'paperless_billing', data_type: 'BOOLEAN', null_count: 0, null_percentage: 0, unique_count: 2 },
    { column_name: 'support_calls_q1', data_type: 'INTEGER', null_count: 0, null_percentage: 0, unique_count: 10 },
    { column_name: 'payment_method', data_type: 'VARCHAR(30)', null_count: 0, null_percentage: 0, unique_count: 4 },
    { column_name: 'churn_indicator', data_type: 'BOOLEAN', null_count: 0, null_percentage: 0, unique_count: 2 }
  ],
  stats_summary: [
    { column_name: 'age', count: 14250, mean: 42.45, std: 13.12, min: 18, q25: 31, q50: 42, q75: 53, max: 80 },
    { column_name: 'tenure_months', count: 14130, mean: 28.34, std: 19.85, min: 0, q25: 9, q50: 25, q75: 46, max: 72 },
    { column_name: 'monthly_charges', count: 14250, mean: 68.75, std: 28.45, min: 19.95, q25: 45.30, q50: 70.15, q75: 89.90, max: 119.85 },
    { column_name: 'total_charges', count: 14205, mean: 2185.40, std: 1950.60, min: 19.95, q25: 480.20, q50: 1540.35, q75: 3500.80, max: 8550.00 },
    { column_name: 'support_calls_q1', count: 14250, mean: 2.14, std: 1.45, min: 0, q25: 1, q50: 2, q75: 3, max: 9 },
    { column_name: 'gender', count: 14250, most_frequent_value: 'Female', most_frequent_count: 7210 },
    { column_name: 'subscription_type', count: 14250, most_frequent_value: 'Standard', most_frequent_count: 6120 },
    { column_name: 'contract_type', count: 14250, most_frequent_value: 'Month-to-Month', most_frequent_count: 7850 },
    { column_name: 'payment_method', count: 14250, most_frequent_value: 'Electronic Check', most_frequent_count: 5320 }
  ],
  correlation_summary: [
    { column_x: 'support_calls_q1', column_y: 'churn_indicator', coefficient: 0.68 },
    { column_x: 'tenure_months', column_y: 'churn_indicator', coefficient: -0.59 },
    { column_x: 'contract_type', column_y: 'churn_indicator', coefficient: -0.52 },
    { column_x: 'monthly_charges', column_y: 'churn_indicator', coefficient: 0.38 },
    { column_x: 'tenure_months', column_y: 'total_charges', coefficient: 0.82 },
    { column_x: 'monthly_charges', column_y: 'total_charges', coefficient: 0.65 },
    { column_x: 'age', column_y: 'churn_indicator', coefficient: 0.12 }
  ],
  sample_rows: [
    { customer_id: 'CUST-0021-X', gender: 'Female', age: 34, tenure_months: 12, subscription_type: 'Standard', contract_type: 'Month-to-Month', monthly_charges: 64.95, total_charges: 780.40, paperless_billing: true, support_calls_q1: 3, payment_method: 'Electronic Check', churn_indicator: true },
    { customer_id: 'CUST-1049-A', gender: 'Male', age: 52, tenure_months: 48, subscription_type: 'Premium', contract_type: 'One Year', monthly_charges: 99.85, total_charges: 4790.20, paperless_billing: true, support_calls_q1: 1, payment_method: 'Credit Card', churn_indicator: false },
    { customer_id: 'CUST-3820-K', gender: 'Male', age: 23, tenure_months: 3, subscription_type: 'Basic', contract_type: 'Month-to-Month', monthly_charges: 24.50, total_charges: 74.30, paperless_billing: false, support_calls_q1: 5, payment_method: 'Mailed Check', churn_indicator: true },
    { customer_id: 'CUST-8830-W', gender: 'Female', age: 41, tenure_months: 72, subscription_type: 'Premium', contract_type: 'Two Year', monthly_charges: 114.95, total_charges: 8276.40, paperless_billing: true, support_calls_q1: 0, payment_method: 'Bank Transfer', churn_indicator: false },
    { customer_id: 'CUST-4112-D', gender: 'Female', age: 29, tenure_months: 24, subscription_type: 'Standard', contract_type: 'One Year', monthly_charges: 59.95, total_charges: 1438.80, paperless_billing: false, support_calls_q1: 2, payment_method: 'Credit Card', churn_indicator: false },
    { customer_id: 'CUST-9003-L', gender: 'Male', age: 67, tenure_months: 8, subscription_type: 'Basic', contract_type: 'Month-to-Month', monthly_charges: 45.20, total_charges: 361.60, paperless_billing: true, support_calls_q1: 4, payment_method: 'Electronic Check', churn_indicator: true },
    { customer_id: 'CUST-2231-M', gender: 'Female', age: 45, tenure_months: 36, subscription_type: 'Standard', contract_type: 'One Year', monthly_charges: 74.80, total_charges: 2692.80, paperless_billing: true, support_calls_q1: 1, payment_method: 'Bank Transfer', churn_indicator: false },
    { customer_id: 'CUST-6554-N', gender: 'Male', age: 19, tenure_months: 1, subscription_type: 'Basic', contract_type: 'Month-to-Month', monthly_charges: 19.95, total_charges: 19.95, paperless_billing: false, support_calls_q1: 2, payment_method: 'Mailed Check', churn_indicator: false },
    { customer_id: 'CUST-0891-P', gender: 'Female', age: 38, tenure_months: 60, subscription_type: 'Premium', contract_type: 'Two Year', monthly_charges: 104.90, total_charges: 6294.00, paperless_billing: true, support_calls_q1: 0, payment_method: 'Credit Card', churn_indicator: false },
    { customer_id: 'CUST-4456-R', gender: 'Male', age: 50, tenure_months: 15, subscription_type: 'Standard', contract_type: 'Month-to-Month', monthly_charges: 69.90, total_charges: 1048.50, paperless_billing: true, support_calls_q1: 3, payment_method: 'Electronic Check', churn_indicator: true }
  ]
};

// 2. SaaS Revenue Metrics 2025 Profiles
const FINANCE_PROFILE: DatasetProfile = {
  id: 'dp_finance_02',
  dataset_id: 'ds_finance_monthly_02',
  schema_summary: [
    { column_name: 'metric_id', data_type: 'VARCHAR(50)', null_count: 0, null_percentage: 0, unique_count: 8900, is_primary_key: true },
    { column_name: 'billing_period', data_type: 'DATE', null_count: 0, null_percentage: 0, unique_count: 12 },
    { column_name: 'mrr_usd', data_type: 'NUMERIC(14,2)', null_count: 0, null_percentage: 0, unique_count: 840 },
    { column_name: 'arr_usd', data_type: 'NUMERIC(15,2)', null_count: 0, null_percentage: 0, unique_count: 840 },
    { column_name: 'active_customers', data_type: 'INTEGER', null_count: 0, null_percentage: 0, unique_count: 12 },
    { column_name: 'new_customers_count', data_type: 'INTEGER', null_count: 0, null_percentage: 0, unique_count: 32 },
    { column_name: 'churned_customers_count', data_type: 'INTEGER', null_count: 0, null_percentage: 0, unique_count: 22 },
    { column_name: 'expansion_revenue_usd', data_type: 'NUMERIC(12,2)', null_count: 120, null_percentage: 1.34, unique_count: 610 },
    { column_name: 'cac_usd', data_type: 'NUMERIC(8,2)', null_count: 0, null_percentage: 0, unique_count: 12 },
    { column_name: 'ltv_usd', data_type: 'NUMERIC(12,2)', null_count: 0, null_percentage: 0, unique_count: 12 },
    { column_name: 'nps_score', data_type: 'INTEGER', null_count: 450, null_percentage: 5.05, unique_count: 35 },
    { column_name: 'region', data_type: 'VARCHAR(30)', null_count: 0, null_percentage: 0, unique_count: 5 }
  ],
  stats_summary: [
    { column_name: 'mrr_usd', count: 8900, mean: 124500.50, std: 14520.10, min: 98000.00, q25: 112000.00, q50: 126000.00, q75: 135000.00, max: 148000.00 },
    { column_name: 'arr_usd', count: 8900, mean: 1494006.00, std: 174241.20, min: 1176000.00, q25: 1344000.00, q50: 1512000.00, q75: 1620000.00, max: 1776000.00 },
    { column_name: 'active_customers', count: 8900, mean: 1420, std: 115, min: 1210, q25: 1310, q50: 1440, q75: 1510, max: 1600 },
    { column_name: 'new_customers_count', count: 8900, mean: 54, std: 14, min: 21, q25: 44, q50: 55, q75: 64, max: 88 },
    { column_name: 'churned_customers_count', count: 8900, mean: 18, std: 6, min: 5, q25: 14, q50: 18, q75: 22, max: 32 },
    { column_name: 'cac_usd', count: 8900, mean: 245.50, std: 18.20, min: 210.00, q25: 232.00, q50: 248.00, q75: 258.00, max: 285.00 },
    { column_name: 'ltv_usd', count: 8900, mean: 6850.00, std: 420.00, min: 6100.00, q25: 6480.00, q50: 6920.00, q75: 7150.00, max: 7500.00 },
    { column_name: 'nps_score', count: 8450, mean: 44.50, std: 6.80, min: 30, q25: 40, q50: 45, q75: 50, max: 58 },
    { column_name: 'region', count: 8900, most_frequent_value: 'North America', most_frequent_count: 3800 }
  ],
  correlation_summary: [
    { column_x: 'cac_usd', column_y: 'new_customers_count', coefficient: -0.74 },
    { column_x: 'nps_score', column_y: 'churned_customers_count', coefficient: -0.68 },
    { column_x: 'mrr_usd', column_y: 'active_customers', coefficient: 0.94 },
    { column_x: 'new_customers_count', column_y: 'expansion_revenue_usd', coefficient: 0.58 },
    { column_x: 'churned_customers_count', column_y: 'mrr_usd', coefficient: -0.45 }
  ],
  sample_rows: [
    { metric_id: 'MET-001', billing_period: '2025-01-31', mrr_usd: 98400.00, arr_usd: 1180800.00, active_customers: 1210, new_customers_count: 42, churned_customers_count: 14, expansion_revenue_usd: 4800.00, cac_usd: 215.00, ltv_usd: 6200.00, nps_score: 41, region: 'North America' },
    { metric_id: 'MET-002', billing_period: '2025-01-31', mrr_usd: 98400.00, arr_usd: 1180800.00, active_customers: 1210, new_customers_count: 42, churned_customers_count: 14, expansion_revenue_usd: 3100.00, cac_usd: 220.00, ltv_usd: 6150.00, nps_score: 38, region: 'Europe' },
    { metric_id: 'MET-013', billing_period: '2025-02-28', mrr_usd: 102100.00, arr_usd: 1225200.00, active_customers: 1238, new_customers_count: 48, churned_customers_count: 20, expansion_revenue_usd: 5400.00, cac_usd: 222.00, ltv_usd: 6250.00, nps_score: 42, region: 'North America' },
    { metric_id: 'MET-024', billing_period: '2025-03-31', mrr_usd: 106800.00, arr_usd: 1281600.00, active_customers: 1280, new_customers_count: 55, churned_customers_count: 13, expansion_revenue_usd: 6200.00, cac_usd: 218.00, ltv_usd: 6400.00, nps_score: 45, region: 'Asia-Pacific' },
    { metric_id: 'MET-035', billing_period: '2025-04-30', mrr_usd: 111400.00, arr_usd: 1336800.00, active_customers: 1315, new_customers_count: 50, churned_customers_count: 15, expansion_revenue_usd: 5900.00, cac_usd: 230.00, ltv_usd: 6450.00, nps_score: 44, region: 'LATAM' },
    { metric_id: 'MET-046', billing_period: '2025-05-31', mrr_usd: 116200.00, arr_usd: 1394400.00, active_customers: 1350, new_customers_count: 52, churned_customers_count: 17, expansion_revenue_usd: 6100.00, cac_usd: 235.00, ltv_usd: 6500.00, nps_score: 43, region: 'Europe' },
    { metric_id: 'MET-057', billing_period: '2025-06-30', mrr_usd: 122000.00, arr_usd: 1464000.00, active_customers: 1385, new_customers_count: 58, churned_customers_count: 23, expansion_revenue_usd: 7800.00, cac_usd: 242.00, ltv_usd: 6700.00, nps_score: 47, region: 'North America' },
    { metric_id: 'MET-068', billing_period: '2025-07-31', mrr_usd: 124800.00, arr_usd: 1497600.00, active_customers: 1412, new_customers_count: 45, churned_customers_count: 18, expansion_revenue_usd: 4200.00, cac_usd: 248.00, ltv_usd: 6800.00, nps_score: 46, region: 'Asia-Pacific' },
    { metric_id: 'MET-079', billing_period: '2025-08-31', mrr_usd: 129500.00, arr_usd: 1554000.00, active_customers: 1444, new_customers_count: 62, churned_customers_count: 30, expansion_revenue_usd: 8100.00, cac_usd: 252.00, ltv_usd: 6900.00, nps_score: 48, region: 'North America' },
    { metric_id: 'MET-090', billing_period: '2025-09-30', mrr_usd: 133400.00, arr_usd: 1600800.00, active_customers: 1475, new_customers_count: 60, churned_customers_count: 29, expansion_revenue_usd: 7200.00, cac_usd: 255.00, ltv_usd: 7100.00, nps_score: 51, region: 'Europe' }
  ]
};

// 3. Healthcare Patient Readmission Profiles
const HEALTHCARE_PROFILE: DatasetProfile = {
  id: 'dp_healthcare_03',
  dataset_id: 'ds_healthcare_encounters_03',
  schema_summary: [
    { column_name: 'encounter_id', data_type: 'VARCHAR(50)', null_count: 0, null_percentage: 0, unique_count: 32000, is_primary_key: true },
    { column_name: 'patient_id', data_type: 'VARCHAR(50)', null_count: 0, null_percentage: 0, unique_count: 22100 },
    { column_name: 'age_group', data_type: 'VARCHAR(20)', null_count: 0, null_percentage: 0, unique_count: 8 },
    { column_name: 'admission_source', data_type: 'VARCHAR(30)', null_count: 320, null_percentage: 1.0, unique_count: 4 },
    { column_name: 'time_in_hospital_days', data_type: 'INTEGER', null_count: 0, null_percentage: 0, unique_count: 14 },
    { column_name: 'num_lab_procedures', data_type: 'INTEGER', null_count: 0, null_percentage: 0, unique_count: 110 },
    { column_name: 'num_medications', data_type: 'INTEGER', null_count: 0, null_percentage: 0, unique_count: 85 },
    { column_name: 'primary_diagnosis_code', data_type: 'VARCHAR(15)', null_count: 45, null_percentage: 0.14, unique_count: 420 },
    { column_name: 'comorbidity_score', data_type: 'INTEGER', null_count: 0, null_percentage: 0, unique_count: 5 },
    { column_name: 'insulin_prescribed', data_type: 'BOOLEAN', null_count: 0, null_percentage: 0, unique_count: 2 },
    { column_name: 'readmitted_within_30d', data_type: 'BOOLEAN', null_count: 0, null_percentage: 0, unique_count: 2 }
  ],
  stats_summary: [
    { column_name: 'time_in_hospital_days', count: 32000, mean: 4.38, std: 2.98, min: 1, q25: 2, q50: 4, q75: 6, max: 14 },
    { column_name: 'num_lab_procedures', count: 32000, mean: 43.12, std: 19.64, min: 1, q25: 31, q50: 44, q75: 57, max: 132 },
    { column_name: 'num_medications', count: 32000, mean: 16.02, std: 8.12, min: 1, q25: 10, q50: 15, q75: 20, max: 81 },
    { column_name: 'comorbidity_score', count: 32000, mean: 1.84, std: 1.15, min: 0, q25: 1, q50: 2, q75: 3, max: 4 },
    { column_name: 'age_group', count: 32000, most_frequent_value: '[70-80)', most_frequent_count: 8200 },
    { column_name: 'admission_source', count: 31680, most_frequent_value: 'Emergency Room', most_frequent_count: 18450 },
    { column_name: 'primary_diagnosis_code', count: 31955, most_frequent_value: 'ICD-9-428', most_frequent_count: 1450 }
  ],
  correlation_summary: [
    { column_x: 'comorbidity_score', column_y: 'readmitted_within_30d', coefficient: 0.52 },
    { column_x: 'time_in_hospital_days', column_y: 'num_medications', coefficient: 0.48 },
    { column_x: 'time_in_hospital_days', column_y: 'readmitted_within_30d', coefficient: 0.35 },
    { column_x: 'num_lab_procedures', column_y: 'num_medications', coefficient: 0.27 },
    { column_x: 'num_medications', column_y: 'readmitted_within_30d', coefficient: 0.22 }
  ],
  sample_rows: [
    { encounter_id: 'ENC-00984-Z', patient_id: 'PAT-4401-B', age_group: '[70-80)', admission_source: 'Emergency Room', time_in_hospital_days: 6, num_lab_procedures: 52, num_medications: 22, primary_diagnosis_code: 'ICD-9-428', comorbidity_score: 3, insulin_prescribed: true, readmitted_within_30d: true },
    { encounter_id: 'ENC-01045-A', patient_id: 'PAT-9031-K', age_group: '[50-60)', admission_source: 'Physician Referral', time_in_hospital_days: 3, num_lab_procedures: 31, num_medications: 12, primary_diagnosis_code: 'ICD-9-250', comorbidity_score: 1, insulin_prescribed: false, readmitted_within_30d: false },
    { encounter_id: 'ENC-18450-X', patient_id: 'PAT-1102-L', age_group: '[80-90)', admission_source: 'Emergency Room', time_in_hospital_days: 9, num_lab_procedures: 78, num_medications: 31, primary_diagnosis_code: 'ICD-9-599', comorbidity_score: 4, insulin_prescribed: true, readmitted_within_30d: true },
    { encounter_id: 'ENC-09312-W', patient_id: 'PAT-3829-M', age_group: '[60-70)', admission_source: 'Emergency Room', time_in_hospital_days: 2, num_lab_procedures: 42, num_medications: 14, primary_diagnosis_code: 'ICD-9-410', comorbidity_score: 2, insulin_prescribed: false, readmitted_within_30d: false },
    { encounter_id: 'ENC-28491-M', patient_id: 'PAT-4830-S', age_group: '[70-80)', admission_source: 'Physician Referral', time_in_hospital_days: 4, num_lab_procedures: 28, num_medications: 15, primary_diagnosis_code: 'ICD-9-428', comorbidity_score: 2, insulin_prescribed: true, readmitted_within_30d: false },
    { encounter_id: 'ENC-04539-Q', patient_id: 'PAT-5821-T', age_group: '[30-40)', admission_source: 'Emergency Room', time_in_hospital_days: 1, num_lab_procedures: 15, num_medications: 8, primary_diagnosis_code: 'ICD-9-466', comorbidity_score: 0, insulin_prescribed: false, readmitted_within_30d: false },
    { encounter_id: 'ENC-14028-H', patient_id: 'PAT-0845-F', age_group: '[60-70)', admission_source: 'Clinic Referral', time_in_hospital_days: 5, num_lab_procedures: 61, num_medications: 18, primary_diagnosis_code: 'ICD-9-428', comorbidity_score: 2, insulin_prescribed: true, readmitted_within_30d: true },
    { encounter_id: 'ENC-22948-K', patient_id: 'PAT-7819-P', age_group: '[40-50)', admission_source: 'Physician Referral', time_in_hospital_days: 3, num_lab_procedures: 34, num_medications: 10, primary_diagnosis_code: 'ICD-9-491', comorbidity_score: 1, insulin_prescribed: false, readmitted_within_30d: false },
    { encounter_id: 'ENC-07734-L', patient_id: 'PAT-1829-Y', age_group: '[80-90)', admission_source: 'Emergency Room', time_in_hospital_days: 11, num_lab_procedures: 82, num_medications: 29, primary_diagnosis_code: 'ICD-9-425', comorbidity_score: 3, insulin_prescribed: true, readmitted_within_30d: false },
    { encounter_id: 'ENC-11880-P', patient_id: 'PAT-3390-C', age_group: '[70-80)', admission_source: 'Emergency Room', time_in_hospital_days: 4, num_lab_procedures: 48, num_medications: 17, primary_diagnosis_code: 'ICD-9-482', comorbidity_score: 2, insulin_prescribed: false, readmitted_within_30d: true }
  ]
};

const STATIC_PROFILES: Record<string, DatasetProfile> = {
  'ds_churn_2026_01': CHURN_PROFILE,
  'ds_finance_monthly_02': FINANCE_PROFILE,
  'ds_healthcare_encounters_03': HEALTHCARE_PROFILE
};

/**
 * Generate a realistic dataset profile dynamically for newly uploaded/custom datasets
 */
export function generateDynamicProfile(datasetId: string, filename: string, format: 'csv' | 'json', rowCount: number, colCount: number): DatasetProfile {
  // Infer column names based on dataset characteristics
  const columns: string[] = ['id'];
  
  // Decide some column names based on filename keywords
  const fileLower = filename.toLowerCase();
  let typePrefix = 'general';
  
  if (fileLower.includes('sales') || fileLower.includes('revenue') || fileLower.includes('price')) {
    typePrefix = 'finance';
    columns.push('transaction_date', 'product_category', 'amount_usd', 'quantity', 'customer_type', 'discount_percent', 'payment_status');
  } else if (fileLower.includes('customer') || fileLower.includes('user') || fileLower.includes('churn')) {
    typePrefix = 'customer';
    columns.push('signup_date', 'country', 'age', 'tenure_months', 'monthly_spend', 'support_tickets', 'is_active');
  } else if (fileLower.includes('patient') || fileLower.includes('health') || fileLower.includes('medical')) {
    typePrefix = 'medical';
    columns.push('encounter_date', 'patient_age', 'diagnosis_group', 'stay_duration_days', 'treatment_cost', 'readmitted');
  } else {
    columns.push('created_at', 'category_label', 'feature_alpha', 'feature_beta', 'metric_value', 'flag_enabled');
  }
  
  // Fill in the rest of columns to match colCount
  while (columns.length < colCount) {
    columns.push(`metric_field_${columns.length}`);
  }
  
  // Create Schema Summary
  const schemaSummary: SchemaSummaryItem[] = columns.map((col, idx) => {
    let type = 'VARCHAR(50)';
    let isPk = idx === 0;
    
    if (col === 'id') type = 'VARCHAR(36)';
    else if (col.includes('date') || col.includes('at')) type = 'TIMESTAMP';
    else if (col.includes('amount') || col.includes('spend') || col.includes('percent') || col.includes('cost') || col.includes('value')) type = 'NUMERIC(12,2)';
    else if (col.includes('age') || col.includes('tenure') || col.includes('tickets') || col.includes('duration') || col.includes('quantity')) type = 'INTEGER';
    else if (col.startsWith('is_') || col.startsWith('flag_') || col.includes('readmitted')) type = 'BOOLEAN';
    
    const nulls = Math.random() > 0.7 ? Math.floor(Math.random() * (rowCount * 0.05)) : 0;
    const nullPct = Number(((nulls / rowCount) * 100).toFixed(2));
    
    let uniques = Math.floor(Math.random() * 10) + 2;
    if (isPk) uniques = rowCount;
    else if (type.startsWith('NUMERIC') || type === 'TIMESTAMP') uniques = Math.floor(rowCount * 0.9);
    else if (type === 'INTEGER') uniques = Math.min(100, Math.floor(rowCount * 0.1) + 2);
    
    return {
      column_name: col,
      data_type: type,
      null_count: nulls,
      null_percentage: nullPct,
      unique_count: uniques,
      is_primary_key: isPk
    };
  });
  
  // Create Stats Summary
  const statsSummary: StatsSummaryItem[] = [];
  schemaSummary.forEach(col => {
    const isNumeric = col.data_type.startsWith('NUMERIC') || col.data_type === 'INTEGER';
    const isBool = col.data_type === 'BOOLEAN';
    
    if (isNumeric) {
      const isAge = col.column_name.includes('age');
      const isTenure = col.column_name.includes('tenure');
      const isSpend = col.column_name.includes('spend') || col.column_name.includes('amount') || col.column_name.includes('cost');
      
      let mean = 150.5;
      let std = 45.2;
      let min = 1.0;
      let max = 1000.0;
      
      if (isAge) {
        mean = 41.2;
        std = 12.8;
        min = 18;
        max = 85;
      } else if (isTenure) {
        mean = 24.5;
        std = 15.4;
        min = 1;
        max = 72;
      } else if (isSpend) {
        mean = 250.45;
        std = 185.30;
        min = 9.99;
        max = 2499.00;
      }
      
      const q25 = Number((mean - std * 0.67).toFixed(2));
      const q50 = Number(mean.toFixed(2));
      const q75 = Number((mean + std * 0.67).toFixed(2));
      
      statsSummary.push({
        column_name: col.column_name,
        count: rowCount - col.null_count,
        mean: Number(mean.toFixed(2)),
        std: Number(std.toFixed(2)),
        min: Number(min.toFixed(2)),
        q25: q25 < min ? min : q25,
        q50: q50,
        q75: q75 > max ? max : q75,
        max: Number(max.toFixed(2))
      });
    } else if (isBool) {
      statsSummary.push({
        column_name: col.column_name,
        count: rowCount - col.null_count,
        most_frequent_value: Math.random() > 0.4 ? 'true' : 'false',
        most_frequent_count: Math.floor((rowCount - col.null_count) * (0.5 + Math.random() * 0.2))
      });
    } else if (col.column_name !== 'id') {
      let freqValue = 'Premium';
      if (col.column_name.includes('country')) freqValue = 'United States';
      else if (col.column_name.includes('category')) freqValue = 'Electronics';
      else if (col.column_name.includes('date')) freqValue = '2026-07-28 12:00:00';
      else if (col.column_name.includes('diagnosis')) freqValue = 'General Checkup';
      else if (col.column_name.includes('status')) freqValue = 'Completed';
      
      statsSummary.push({
        column_name: col.column_name,
        count: rowCount - col.null_count,
        most_frequent_value: freqValue,
        most_frequent_count: Math.floor((rowCount - col.null_count) * 0.35)
      });
    }
  });
  
  // Create Correlation Summary
  const numericColumns = schemaSummary.filter(col => col.data_type.startsWith('NUMERIC') || col.data_type === 'INTEGER').map(c => c.column_name);
  const correlationSummary: CorrelationItem[] = [];
  
  if (numericColumns.length >= 2) {
    for (let i = 0; i < Math.min(numericColumns.length - 1, 4); i++) {
      const colX = numericColumns[i];
      const colY = numericColumns[i + 1];
      const coef = Number((Math.random() * 1.6 - 0.8).toFixed(2)); // range [-0.8, 0.8]
      correlationSummary.push({
        column_x: colX,
        column_y: colY,
        coefficient: coef
      });
    }
  }
  
  // Generate Sample Rows (10 rows)
  const sampleRows: Record<string, any>[] = Array.from({ length: 10 }).map((_, rIdx) => {
    const row: Record<string, any> = {};
    schemaSummary.forEach(col => {
      if (col.column_name === 'id') {
        row['id'] = `row_${rIdx + 1}_${Math.random().toString(36).substring(2, 6)}`;
      } else if (col.data_type === 'TIMESTAMP' || col.column_name.includes('date')) {
        row[col.column_name] = new Date(Date.now() - rIdx * 86400000).toISOString().split('T')[0];
      } else if (col.data_type === 'BOOLEAN') {
        row[col.column_name] = Math.random() > 0.45;
      } else if (col.data_type.startsWith('NUMERIC')) {
        const stats = statsSummary.find(s => s.column_name === col.column_name);
        const minVal = stats?.min ?? 10.0;
        const maxVal = stats?.max ?? 500.0;
        row[col.column_name] = Number((minVal + Math.random() * (maxVal - minVal)).toFixed(2));
      } else if (col.data_type === 'INTEGER') {
        const stats = statsSummary.find(s => s.column_name === col.column_name);
        const minVal = stats?.min ?? 18;
        const maxVal = stats?.max ?? 80;
        row[col.column_name] = Math.floor(minVal + Math.random() * (maxVal - minVal));
      } else {
        // String
        const stats = statsSummary.find(s => s.column_name === col.column_name);
        const baseVal = stats?.most_frequent_value?.toString() ?? 'Category-A';
        row[col.column_name] = Math.random() > 0.5 ? baseVal : `${baseVal}_Alt`;
      }
    });
    return row;
  });
  
  return {
    id: `dp_dyn_${datasetId.replace('ds_', '')}`,
    dataset_id: datasetId,
    schema_summary: schemaSummary,
    stats_summary: statsSummary,
    correlation_summary: correlationSummary,
    sample_rows: sampleRows
  };
}

/**
 * Main retrieval function.
 * Attempts to retrieve profile from static mock objects, otherwise generates dynamically.
 */
export function getDatasetProfile(datasetId: string, datasetName?: string, format?: 'csv' | 'json', rowCount?: number, colCount?: number): DatasetProfile {
  const profile = STATIC_PROFILES[datasetId];
  if (profile) return profile;
  
  // Dynamic generation
  const name = datasetName || 'custom_dataset.csv';
  const fmt = format || (name.endsWith('.json') ? 'json' : 'csv');
  const rows = rowCount || 10000;
  const cols = colCount || 10;
  
  return generateDynamicProfile(datasetId, name, fmt, rows, cols);
}
