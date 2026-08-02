export interface ResearchQuestion {
  id: string;
  dataset_id: string;
  category: 'pre-processing' | 'eda';
  question_text: string;
  target_columns: string[];
  rationale: string;
  expected_output_type: 'table' | 'chart' | 'metric';
  status: 'pending' | 'running' | 'completed' | 'failed';
}

// 1. Customer Churn Q1 2026 Research Questions
const CHURN_QUESTIONS: ResearchQuestion[] = [
  {
    id: 'rq_churn_01',
    dataset_id: 'ds_churn_2026_01',
    category: 'pre-processing',
    question_text: 'Impute missing values in customer tenure and monthly charges columns.',
    target_columns: ['tenure_months', 'monthly_charges'],
    rationale: 'Missing variables (0.84% nulls in tenure) must be resolved. We will use median imputation for robust statistical alignment.',
    expected_output_type: 'table',
    status: 'pending'
  },
  {
    id: 'rq_churn_02',
    dataset_id: 'ds_churn_2026_01',
    category: 'pre-processing',
    question_text: 'Standardize subscription and payment method strings into category indexes.',
    target_columns: ['subscription_type', 'payment_method'],
    rationale: 'Categorical parameters must be indexed into standardized encodings for optimal feature mapping and correlation matrix checks.',
    expected_output_type: 'table',
    status: 'pending'
  },
  {
    id: 'rq_churn_03',
    dataset_id: 'ds_churn_2026_01',
    category: 'pre-processing',
    question_text: 'Identify and filter extreme anomalies in support calls and monthly charges.',
    target_columns: ['support_calls_q1', 'monthly_charges'],
    rationale: 'Outlying support calls (e.g. calls > 8) or zero-charge records distort statistical variances. Standardizing outliers is necessary.',
    expected_output_type: 'table',
    status: 'pending'
  },
  {
    id: 'rq_churn_04',
    dataset_id: 'ds_churn_2026_01',
    category: 'eda',
    question_text: 'Analyze the correlation between monthly charges and customer churn rate.',
    target_columns: ['monthly_charges', 'churn_indicator'],
    rationale: 'Tests the primary financial hypothesis: Are higher-paying subscribers significantly more prone to cancel subscriptions?',
    expected_output_type: 'chart',
    status: 'pending'
  },
  {
    id: 'rq_churn_05',
    dataset_id: 'ds_churn_2026_01',
    category: 'eda',
    question_text: 'Examine customer churn distribution grouped by contract length and support calls.',
    target_columns: ['contract_type', 'support_calls_q1', 'churn_indicator'],
    rationale: 'Maps user friction points: Determines if short-term contracts combined with support friction (calls > 2) triggers highest churn.',
    expected_output_type: 'chart',
    status: 'pending'
  },
  {
    id: 'rq_churn_06',
    dataset_id: 'ds_churn_2026_01',
    category: 'eda',
    question_text: 'Evaluate churn rate proportions across different billing and payment methods.',
    target_columns: ['paperless_billing', 'payment_method', 'churn_indicator'],
    rationale: 'Assesses financial transactional drivers: Shows if manual check payments experience higher friction and churn indicators.',
    expected_output_type: 'chart',
    status: 'pending'
  }
];

// 2. SaaS Revenue Metrics 2025 Research Questions
const FINANCE_QUESTIONS: ResearchQuestion[] = [
  {
    id: 'rq_finance_01',
    dataset_id: 'ds_finance_monthly_02',
    category: 'pre-processing',
    question_text: 'Clean null records in monthly expansion revenue and NPS scores.',
    target_columns: ['expansion_revenue_usd', 'nps_score'],
    rationale: 'Fills NPS missing rows using mean scores, and imputes expansion revenue nulls as 0 to indicate inactive periods.',
    expected_output_type: 'table',
    status: 'pending'
  },
  {
    id: 'rq_finance_02',
    dataset_id: 'ds_finance_monthly_02',
    category: 'pre-processing',
    question_text: 'Parse date formatting for SaaS billing periods into standardized timestamps.',
    target_columns: ['billing_period'],
    rationale: 'Formats billing string attributes into sequential timestamps to enable time-series cohort analyses.',
    expected_output_type: 'table',
    status: 'pending'
  },
  {
    id: 'rq_finance_03',
    dataset_id: 'ds_finance_monthly_02',
    category: 'eda',
    question_text: 'Determine the statistical relationship between CAC (Customer Acquisition Cost) and LTV (Lifetime Value).',
    target_columns: ['cac_usd', 'ltv_usd'],
    rationale: 'Calculates the LTV to CAC ratios to assess the return on marketing investments and overall capital efficiency.',
    expected_output_type: 'chart',
    status: 'pending'
  },
  {
    id: 'rq_finance_04',
    dataset_id: 'ds_finance_monthly_02',
    category: 'eda',
    question_text: 'Analyze the monthly trend of MRR growth relative to new vs. churned accounts.',
    target_columns: ['mrr_usd', 'new_customers_count', 'churned_customers_count'],
    rationale: 'Tracks historical trends: Pinpoints if MRR expansions are fueled by customer acquisition or high churn attrition.',
    expected_output_type: 'chart',
    status: 'pending'
  },
  {
    id: 'rq_finance_05',
    dataset_id: 'ds_finance_monthly_02',
    category: 'eda',
    question_text: 'Compare average Net Promoter Scores (NPS) across different billing regions.',
    target_columns: ['region', 'nps_score'],
    rationale: 'Assesses regional customer satisfaction indices to identify product-market fits or operational bottlenecks.',
    expected_output_type: 'chart',
    status: 'pending'
  }
];

// 3. Patient Readmission Trends Research Questions
const HEALTHCARE_QUESTIONS: ResearchQuestion[] = [
  {
    id: 'rq_health_01',
    dataset_id: 'ds_healthcare_encounters_03',
    category: 'pre-processing',
    question_text: 'Clean missing admission sources and primary diagnosis codes.',
    target_columns: ['admission_source', 'primary_diagnosis_code'],
    rationale: 'Resolves categorical null values by assigning a fallback "Unknown" marker to maintain categorical completeness.',
    expected_output_type: 'table',
    status: 'pending'
  },
  {
    id: 'rq_health_02',
    dataset_id: 'ds_healthcare_encounters_03',
    category: 'pre-processing',
    question_text: 'Binarize patient age groups and create comorbidity index groups.',
    target_columns: ['age_group', 'comorbidity_score'],
    rationale: 'Transforms textual age clusters (e.g. [70-80)) and numeric comorbidity indicators into structured bins.',
    expected_output_type: 'table',
    status: 'pending'
  },
  {
    id: 'rq_health_03',
    dataset_id: 'ds_healthcare_encounters_03',
    category: 'eda',
    question_text: 'Identify correlation between patient comorbidity score and 30-day readmission.',
    target_columns: ['comorbidity_score', 'readmitted_within_30d'],
    rationale: 'Investigates risk factors: Checks if patients with multiple chronic comorbidities have higher readmission probabilities.',
    expected_output_type: 'chart',
    status: 'pending'
  },
  {
    id: 'rq_health_04',
    dataset_id: 'ds_healthcare_encounters_03',
    category: 'eda',
    question_text: 'Analyze the impact of length of stay on prescription volumes and lab procedures.',
    target_columns: ['time_in_hospital_days', 'num_medications', 'num_lab_procedures'],
    rationale: 'Models treatment density: Checks if longer hospital stays reflect clinical severity or operational latency.',
    expected_output_type: 'chart',
    status: 'pending'
  },
  {
    id: 'rq_health_05',
    dataset_id: 'ds_healthcare_encounters_03',
    category: 'eda',
    question_text: 'Analyze 30-day readmission ratios grouped by primary diagnosis codes.',
    target_columns: ['primary_diagnosis_code', 'readmitted_within_30d'],
    rationale: 'Examines clinical readmission rates across specific conditions (e.g. Heart Failure) to guide target intervention programs.',
    expected_output_type: 'chart',
    status: 'pending'
  }
];

const STATIC_QUESTIONS: Record<string, ResearchQuestion[]> = {
  'ds_churn_2026_01': CHURN_QUESTIONS,
  'ds_finance_monthly_02': FINANCE_QUESTIONS,
  'ds_healthcare_encounters_03': HEALTHCARE_QUESTIONS
};

/**
 * Procedurally generate research questions for user-uploaded custom datasets
 */
export function generateDynamicQuestions(datasetId: string, filename: string): ResearchQuestion[] {
  const fileLower = filename.toLowerCase();
  
  // Decide domain keywords
  let domain = 'general';
  if (fileLower.includes('sales') || fileLower.includes('revenue') || fileLower.includes('price')) domain = 'finance';
  else if (fileLower.includes('customer') || fileLower.includes('user') || fileLower.includes('churn')) domain = 'customer';
  else if (fileLower.includes('patient') || fileLower.includes('health') || fileLower.includes('medical')) domain = 'medical';
  
  const idPrefix = `rq_dyn_${datasetId.replace('ds_', '')}`;
  
  if (domain === 'finance') {
    return [
      {
        id: `${idPrefix}_p1`,
        dataset_id: datasetId,
        category: 'pre-processing',
        question_text: 'Standardize numeric currency columns and filter negative transaction values.',
        target_columns: ['amount_usd', 'discount_percent'],
        rationale: 'Prepares raw sales metrics by cleaning outlier negative records and standardizing decimals.',
        expected_output_type: 'table',
        status: 'pending'
      },
      {
        id: `${idPrefix}_p2`,
        dataset_id: datasetId,
        category: 'pre-processing',
        question_text: 'Impute missing product categories and segment payment status indicators.',
        target_columns: ['product_category', 'payment_status'],
        rationale: 'Categorical missing fields are filled with "Uncategorized" to preserve classification ratios.',
        expected_output_type: 'table',
        status: 'pending'
      },
      {
        id: `${idPrefix}_e1`,
        dataset_id: datasetId,
        category: 'eda',
        question_text: 'Analyze daily sales volume and revenue totals over the transaction timeline.',
        target_columns: ['transaction_date', 'amount_usd'],
        rationale: 'Plots time-series cycles to identify seasonal spikes, weekend dips, or periodic sales dips.',
        expected_output_type: 'chart',
        status: 'pending'
      },
      {
        id: `${idPrefix}_e2`,
        dataset_id: datasetId,
        category: 'eda',
        question_text: 'Evaluate average discounts vs. order quantities across product categories.',
        target_columns: ['discount_percent', 'quantity', 'product_category'],
        rationale: 'Examines order sizing: Measures if higher order quantities are heavily correlated with high discount structures.',
        expected_output_type: 'chart',
        status: 'pending'
      },
      {
        id: `${idPrefix}_e3`,
        dataset_id: datasetId,
        category: 'eda',
        question_text: 'Compare transaction completion rates grouped by customer types.',
        target_columns: ['customer_type', 'payment_status'],
        rationale: 'Measures credit risk: Highlights if new or premium customer tiers show higher payment default counts.',
        expected_output_type: 'chart',
        status: 'pending'
      }
    ];
  } else if (domain === 'customer') {
    return [
      {
        id: `${idPrefix}_p1`,
        dataset_id: datasetId,
        category: 'pre-processing',
        question_text: 'Clean missing age values and impute user tenure counts.',
        target_columns: ['age', 'tenure_months'],
        rationale: 'Missing variables are resolved with median value imputation to avoid skewed age analyses.',
        expected_output_type: 'table',
        status: 'pending'
      },
      {
        id: `${idPrefix}_p2`,
        dataset_id: datasetId,
        category: 'pre-processing',
        question_text: 'Encode sign-up timestamps into chronological indexes.',
        target_columns: ['signup_date'],
        rationale: 'Indexes timestamp attributes into numerical dates suitable for duration cohort profiling.',
        expected_output_type: 'table',
        status: 'pending'
      },
      {
        id: `${idPrefix}_e1`,
        dataset_id: datasetId,
        category: 'eda',
        question_text: 'Evaluate monthly spending correlations relative to active tickets and user age.',
        target_columns: ['monthly_spend', 'support_tickets', 'age'],
        rationale: 'Tests satisfaction: Checks if customer spending tiers correspond with higher operational tickets.',
        expected_output_type: 'chart',
        status: 'pending'
      },
      {
        id: `${idPrefix}_e2`,
        dataset_id: datasetId,
        category: 'eda',
        question_text: 'Measure customer retention rates grouped by country.',
        target_columns: ['country', 'is_active'],
        rationale: 'Investigates churn geography: Determines if specific geographic markets have outlying retention metrics.',
        expected_output_type: 'chart',
        status: 'pending'
      }
    ];
  } else if (domain === 'medical') {
    return [
      {
        id: `${idPrefix}_p1`,
        dataset_id: datasetId,
        category: 'pre-processing',
        question_text: 'Impute diagnosis groups and resolve missing clinical cost rows.',
        target_columns: ['diagnosis_group', 'treatment_cost'],
        rationale: 'Imputes empty cost values with statistical mean indicators of identical diagnosis clusters.',
        expected_output_type: 'table',
        status: 'pending'
      },
      {
        id: `${idPrefix}_e1`,
        dataset_id: datasetId,
        category: 'eda',
        question_text: 'Analyze readmission ratios grouped by patient age and stay duration.',
        target_columns: ['patient_age', 'stay_duration_days', 'readmitted'],
        rationale: 'Examines clinical outcomes: Assesses if aged cohorts staying > 5 days show higher relapse indices.',
        expected_output_type: 'chart',
        status: 'pending'
      },
      {
        id: `${idPrefix}_e2`,
        dataset_id: datasetId,
        category: 'eda',
        question_text: 'Compare average treatment costs across clinical diagnosis groups.',
        target_columns: ['diagnosis_group', 'treatment_cost'],
        rationale: 'Examines billing metrics: Shows conditions that consume the highest proportion of hospital resources.',
        expected_output_type: 'chart',
        status: 'pending'
      }
    ];
  } else {
    // General
    return [
      {
        id: `${idPrefix}_p1`,
        dataset_id: datasetId,
        category: 'pre-processing',
        question_text: 'Clean missing fields and standardise category label records.',
        target_columns: ['category_label', 'metric_value'],
        rationale: 'Imputes numerical missing indexes with category mean values and maps unknown categorical rows.',
        expected_output_type: 'table',
        status: 'pending'
      },
      {
        id: `${idPrefix}_e1`,
        dataset_id: datasetId,
        category: 'eda',
        question_text: 'Investigate feature correlations between metric values and category metrics.',
        target_columns: ['feature_alpha', 'feature_beta', 'metric_value'],
        rationale: 'Performs statistical correlation searches to identify features exhibiting strong linear links.',
        expected_output_type: 'chart',
        status: 'pending'
      },
      {
        id: `${idPrefix}_e2`,
        dataset_id: datasetId,
        category: 'eda',
        question_text: 'Evaluate distribution frequencies grouped by label flags.',
        target_columns: ['category_label', 'flag_enabled'],
        rationale: 'Bar distribution charts are generated to check proportions of class balances.',
        expected_output_type: 'chart',
        status: 'pending'
      }
    ];
  }
}

/**
 * Retrieve list of questions for a dataset. Falls back to generating them dynamically if not found.
 */
export function getResearchQuestions(datasetId: string, filename?: string): ResearchQuestion[] {
  const questions = STATIC_QUESTIONS[datasetId];
  if (questions) return questions;
  
  return generateDynamicQuestions(datasetId, filename || 'dataset.csv');
}
