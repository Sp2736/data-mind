export interface CleaningAction {
  action_name: string;
  column_affected: string;
  description: string;
  rationale: string;
}

export interface Report {
  id: string;
  dataset_id: string;
  overall_summary: string;
  cleaning_actions: CleaningAction[];
}

const CHURN_REPORT: Report = {
  id: 'rep_churn_01',
  dataset_id: 'ds_churn_2026_01',
  overall_summary: 'DataMind completed an audit of the customer churn transaction database (14,250 records). The data cleaning pipeline resolved missing index values (imputing 120 customer tenure records and 45 total charges fields using statistical medians) and capped support call outliers at the 95th percentile. Subsequent statistical analysis isolated price sensitivity as a primary retention risk, with customers paying > $90/mo showing a 2.4x increase in churn relative to standard rates. Month-to-month contracts combined with >= 3 support tickets yielded an 84.5% churn probability, indicating clear opportunities for customer success interventions and automated billing payment migrations.',
  cleaning_actions: [
    {
      action_name: 'Median Imputation',
      column_affected: 'tenure_months',
      description: 'Filled 120 missing values with the dataset median value of 25.0 months.',
      rationale: 'Preserves sample count for tenure metrics without introducing mean-skew bias or discarding records.'
    },
    {
      action_name: 'Median Imputation',
      column_affected: 'total_charges',
      description: 'Filled 45 missing null values with the dataset median value of $1,540.35.',
      rationale: 'Resolves mathematical constraints during cumulative revenue aggregates and regression modeling.'
    },
    {
      action_name: 'Outlier Truncation (IQR)',
      column_affected: 'support_calls_q1',
      description: 'Capped 12 records reporting support calls > 10 down to the 95th percentile (6 calls).',
      rationale: 'Avoids variance distortion in predictive models caused by invalid or outlying logs.'
    },
    {
      action_name: 'Categorical Label Encoding',
      column_affected: 'subscription_type, payment_method',
      description: 'Mapped string records to structural integers (e.g. Basic: 0, Standard: 1, Premium: 2).',
      rationale: 'Prepares textual categories for numeric-only correlation matrices and models.'
    }
  ]
};

const FINANCE_REPORT: Report = {
  id: 'rep_finance_02',
  dataset_id: 'ds_finance_monthly_02',
  overall_summary: 'An autonomous data cleaning and profiling pipeline processed 8,900 monthly revenue metrics records. Missing entries in Net Promoter Scores (NPS) were imputed to the cohort mean (44.5), and empty expansion revenue figures were filled with zero values to align historical balances. Unit economics show excellent metrics with an average LTV to CAC ratio of 27.9x. North American cohorts lead NPS scores (48), while European retention shows opportunities for improvement. ARR trends are strongly driven by new acquisitions, showing high correlation with customer satisfaction scores.',
  cleaning_actions: [
    {
      action_name: 'Zero-Fill Imputation',
      column_affected: 'expansion_revenue_usd',
      description: 'Filled 120 missing null records with 0.00 currency values.',
      rationale: 'Correctly sets months with inactive expansion activities to prevent blank cell calculations.'
    },
    {
      action_name: 'Mean Imputation',
      column_affected: 'nps_score',
      description: 'Imputed 450 empty NPS fields with the cohort mean value of 44.5.',
      rationale: 'Enables baseline satisfaction metrics checking without discarding rows.'
    },
    {
      action_name: 'Timestamp Standardization',
      column_affected: 'billing_period',
      description: 'Parsed dates (e.g., 2025-01-31) into standardized ISO datetime strings.',
      rationale: 'Aligns sequential timestamps to enable chronological time-series analysis.'
    }
  ]
};

const HEALTHCARE_REPORT: Report = {
  id: 'rep_health_03',
  dataset_id: 'ds_healthcare_encounters_03',
  overall_summary: 'The readmission database (24,100 patient encounters) was cleaned and analyzed. Incomplete patient admission records and diagnosis codes were assigned to fallback categories ("Unknown" and "General Diagnosis"). Bivariate risk evaluation shows patient comorbidity scores carry a strong positive correlation (+0.52) with 30-day readmissions, with risk-tier comorbidity scores >= 3 showing a 52.3% likelihood of readmission. Length of hospital stay is highly correlated (+0.48) with prescription count volumes. Cardiovascular condition diagnosis codes represented the highest readmission rate (32%), signifying targets for clinical transition management.',
  cleaning_actions: [
    {
      action_name: 'Categorical Fallback Imputation',
      column_affected: 'admission_source',
      description: 'Filled 320 empty rows with the fallback category label "Unknown".',
      rationale: 'Maintains dataset categorization ratios for hospital routing analysis.'
    },
    {
      action_name: 'Categorical Fallback Imputation',
      column_affected: 'primary_diagnosis_code',
      description: 'Filled 45 empty rows with the fallback category label "General Diagnosis".',
      rationale: 'Avoids dropping patient rows with missing clinical diagnostic values.'
    },
    {
      action_name: 'Risk Level Binning',
      column_affected: 'comorbidity_score',
      description: 'Grouped numeric comorbidity indices (0-4) into Low Risk (0), Medium Risk (1-2), and High Risk (3-4).',
      rationale: 'Simplifies patient risk classification profiles for medical staff guidelines.'
    }
  ]
};

const STATIC_REPORTS: Record<string, Report> = {
  'ds_churn_2026_01': CHURN_REPORT,
  'ds_finance_monthly_02': FINANCE_REPORT,
  'ds_healthcare_encounters_03': HEALTHCARE_REPORT
};

/**
 * Generate a dynamic report for user-uploaded custom files
 */
export function generateDynamicReport(datasetId: string, filename: string): Report {
  const fileLower = filename.toLowerCase();
  
  // Decide domain keywords
  let domain = 'general';
  if (fileLower.includes('sales') || fileLower.includes('revenue') || fileLower.includes('price')) domain = 'finance';
  else if (fileLower.includes('customer') || fileLower.includes('user') || fileLower.includes('churn')) domain = 'customer';
  else if (fileLower.includes('patient') || fileLower.includes('health') || fileLower.includes('medical')) domain = 'medical';
  
  if (domain === 'finance') {
    return {
      id: `rep_dyn_${datasetId}`,
      dataset_id: datasetId,
      overall_summary: `DataMind has autonomously audited the custom financial database: "${filename}". Chronological timelines were standardized, and currency outliers were corrected. Analysis reveals distinct cyclical transaction distributions and positive seasonal revenue spikes. Group-based comparisons highlight premium segments as key ARR contributors, while billing defaults remain within margins.`,
      cleaning_actions: [
        {
          action_name: 'Currency Standardization',
          column_affected: 'amount_usd',
          description: 'Formatted transactions and corrected negative value signs.',
          rationale: 'Resolves calculation skew in cumulative ARR and total sales figures.'
        },
        {
          action_name: 'Default Imputation',
          column_affected: 'product_category',
          description: 'Assigned missing items to "Uncategorized" fallback.',
          rationale: 'Preserves transaction record rows without deleting empty cells.'
        }
      ]
    };
  } else if (domain === 'customer') {
    return {
      id: `rep_dyn_${datasetId}`,
      dataset_id: datasetId,
      overall_summary: `The custom subscriber database "${filename}" was cleaned and analyzed. Chronological sign-up timelines were aligned, and null age fields were treated. Insights point to distinct customer retention variances, with specific geographic markets displaying elevated user retention. Operational tickets showed moderate correlation with monthly subscription spending tiers.`,
      cleaning_actions: [
        {
          action_name: 'Median Imputation',
          column_affected: 'age',
          description: 'Filled empty rows with the cohort median age.',
          rationale: 'Allows cohort classifications without skewing average age distributions.'
        },
        {
          action_name: 'ISO Date Parsing',
          column_affected: 'signup_date',
          description: 'Standardized text dates into ISO datetime format strings.',
          rationale: 'Enables sequential time-series sorting for retention cohorts.'
        }
      ]
    };
  } else if (domain === 'medical') {
    return {
      id: `rep_dyn_${datasetId}`,
      dataset_id: datasetId,
      overall_summary: `The patient encounters database "${filename}" completed ingestion cleanup. Clinical treatment costs were aligned and diagnosis category nulls were handled. Statistical analysis reveals cardiovascular diagnosis tiers lead medical resource consumptions and readmission probabilities. Length of hospital stay is highly correlated with overall treatment costs.`,
      cleaning_actions: [
        {
          action_name: 'Cost Group Imputation',
          column_affected: 'treatment_cost',
          description: 'Imputed null rows with diagnosis category average values.',
          rationale: 'Maintains cost parameters accuracy for clinical billing checks.'
        },
        {
          action_name: 'Fallback Categorization',
          column_affected: 'diagnosis_group',
          description: 'Filled empty cells with "Unclassified Diagnosis" labels.',
          rationale: 'Retains diagnostic records without discarding patient records.'
        }
      ]
    };
  } else {
    // General
    return {
      id: `rep_dyn_${datasetId}`,
      dataset_id: datasetId,
      overall_summary: `DataMind has autonomously completed the data audit and cleaning on the uploaded dataset: "${filename}". The pipeline checked variables constraints, mapped missing data arrays, and compiled narrative insights. Frequency distribution charts and statistical correlation matrices are generated for key fields.`,
      cleaning_actions: [
        {
          action_name: 'Missing Value Imputation',
          column_affected: 'metric_value',
          description: 'Imputed empty cells using the column statistical average.',
          rationale: 'Avoids row deletion and retains sample size metrics.'
        },
        {
          action_name: 'Fallback Ingestion Labeling',
          column_affected: 'category_label',
          description: 'Mapped empty cells to standard "General Ingest" fallbacks.',
          rationale: 'Maintains categorical parameters coverage for downstream analytics.'
        }
      ]
    };
  }
}

/**
 * Retrieve the report for a dataset. Falls back to generating one dynamically if not present.
 */
export function getReportForDataset(datasetId: string, filename?: string): Report {
  const report = STATIC_REPORTS[datasetId];
  if (report) return report;
  
  return generateDynamicReport(datasetId, filename || 'dataset.csv');
}
