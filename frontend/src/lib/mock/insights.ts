export interface Insight {
  id: string;
  rq_id: string;
  category: 'pre-processing' | 'eda';
  summary_text: string;
  key_takeaways: string[];
}

const MOCK_INSIGHTS: Record<string, Insight> = {
  // Churn Dataset Insights
  'rq_churn_01': {
    id: 'ins_churn_01',
    rq_id: 'rq_churn_01',
    category: 'pre-processing',
    summary_text: 'Successfully imputed missing data values in `tenure_months` (120 records) and `total_charges` (45 records) using statistical median distribution parameters.',
    key_takeaways: [
      'Median imputation prevents outliers from skewing average metrics.',
      'Completed records restored dataset completeness to 100%.',
      'No structural rows were dropped, preserving statistical sample size.'
    ]
  },
  'rq_churn_02': {
    id: 'ins_churn_02',
    rq_id: 'rq_churn_02',
    category: 'pre-processing',
    summary_text: 'Standardized text category labels in `subscription_type` and `payment_method` into label-indexed vectors to enable mathematical analysis.',
    key_takeaways: [
      'Enables high-fidelity correlation matrices with categorical attributes.',
      'Reduced memory footprint of raw textual columns by 74%.',
      'Created mappings: Basic (0), Standard (1), Premium (2).'
    ]
  },
  'rq_churn_03': {
    id: 'ins_churn_03',
    rq_id: 'rq_churn_03',
    category: 'pre-processing',
    summary_text: 'Detected and treated extreme statistical outliers in `support_calls_q1` and `monthly_charges` columns using the Interquartile Range (IQR) filter.',
    key_takeaways: [
      'Identified 12 records where support calls were registered as invalid (>10).',
      'Capped extreme outliers to the 95th percentile limit (6 calls).',
      'Prevented variance distortion in linear predictive models.'
    ]
  },
  'rq_churn_04': {
    id: 'ins_churn_04',
    rq_id: 'rq_churn_04',
    category: 'eda',
    summary_text: 'Bivariate correlation analysis indicates a positive correlation (+0.38) between monthly subscription charges and customer churn rate indicators.',
    key_takeaways: [
      'Customers paying > $90/mo are 2.4x more likely to churn than those paying < $30/mo.',
      'Price sensitivity represents a key driver in early-stage subscriber churn.',
      'Recommends introducing discount tiers to high-risk customers.'
    ]
  },
  'rq_churn_05': {
    id: 'ins_churn_05',
    rq_id: 'rq_churn_05',
    category: 'eda',
    summary_text: 'Multi-variable categorization shows month-to-month contracts coupled with higher customer support calls represent the highest churn density.',
    key_takeaways: [
      'Subscribers on month-to-month contracts with >= 3 support calls show an 84.5% churn probability.',
      'Support ticket friction acts as a secondary trigger for contract cancellation.',
      'Recommends proactively targeting month-to-month customers with high ticket activity.'
    ]
  },
  'rq_churn_06': {
    id: 'ins_churn_06',
    rq_id: 'rq_churn_06',
    category: 'eda',
    summary_text: 'Distribution analysis of payment methods shows electronic check transactions have a disproportionately high churn rate (48%).',
    key_takeaways: [
      'Electronic checks account for 53% of all churn events, despite being only 37% of active users.',
      'Automatic payment methods (Credit Cards / Bank Transfers) display stable churn rates (< 15%).',
      'Friction in manual check payments or renewal failures represents a major target.'
    ]
  },

  // Finance Dataset Insights
  'rq_finance_01': {
    id: 'ins_finance_01',
    rq_id: 'rq_finance_01',
    category: 'pre-processing',
    summary_text: 'Processed missing entries in NPS scores and expansion revenue. Assigned NPS nulls to the cohort mean (44.5) and filled expansion revenue nulls as 0.0.',
    key_takeaways: [
      'Filled missing NPS values without affecting average variance.',
      'Zero-filling expansion revenue correctly aligns inactive period calculations.',
      'Verified zero structural correlation skew after imputations.'
    ]
  },
  'rq_finance_02': {
    id: 'ins_finance_02',
    rq_id: 'rq_finance_02',
    category: 'pre-processing',
    summary_text: 'Standardized monthly billing timestamps into ISO datetime coordinates for chronological time-series analysis.',
    key_takeaways: [
      'Enables sequential sorting and calendar mapping.',
      'Standardized dates align perfectly across multi-region transaction tables.'
    ]
  },
  'rq_finance_03': {
    id: 'ins_finance_03',
    rq_id: 'rq_finance_03',
    category: 'eda',
    summary_text: 'Evaluated the LTV to CAC efficiency ratio. The average LTV to CAC ratio stands at 27.9x, indicating strong capital efficiency.',
    key_takeaways: [
      'Average CAC ($245) relative to high average LTV ($6850) shows excellent unit economics.',
      'NPS levels correlate positively with customer retention and arr growth.'
    ]
  },
  'rq_finance_04': {
    id: 'ins_finance_04',
    rq_id: 'rq_finance_04',
    category: 'eda',
    summary_text: 'Time-series analysis shows monthly recurring revenue (MRR) growth is strongly driven by new customer acquisition cohorts.',
    key_takeaways: [
      'New customer MRR contribution peaks in Q2 ($148K MRR).',
      'Churn rates show high correlation with low NPS score segments.'
    ]
  },
  'rq_finance_05': {
    id: 'ins_finance_05',
    rq_id: 'rq_finance_05',
    category: 'eda',
    summary_text: 'Geographic distribution shows North American user cohorts lead average NPS scores (48), while Europe averages 43.',
    key_takeaways: [
      'North America represents the most stable NPS and ARR contributor.',
      'European NPS shows room for improvement in payment localized checkout flow.'
    ]
  },

  // Healthcare Dataset Insights
  'rq_health_01': {
    id: 'ins_health_01',
    rq_id: 'rq_health_01',
    category: 'pre-processing',
    summary_text: 'Imputed missing hospital admission sources (1.0% nulls) and diagnosis codes (0.14% nulls) using fallback categories.',
    key_takeaways: [
      'Assigned missing admission sources to the categorical fallback "Unknown".',
      'Assigned 45 missing primary diagnosis codes to the category "General Diagnosis".',
      'Ensured 100% categorical alignment for downstream cohort tracking.'
    ]
  },
  'rq_health_02': {
    id: 'ins_health_02',
    rq_id: 'rq_health_02',
    category: 'pre-processing',
    summary_text: 'Transformed clinical text age groups into numeric category scales and binned comorbidity scores into risk index classes.',
    key_takeaways: [
      'Binned comorbidity indexes (0-4) into three risk categories: Low, Medium, High.',
      'Mapped textual age brackets (e.g., [70-80)) to ordinal indexes.'
    ]
  },
  'rq_health_03': {
    id: 'ins_health_03',
    rq_id: 'rq_health_03',
    category: 'eda',
    summary_text: 'Bivariate risk evaluation shows comorbidity scores have a strong positive correlation (+0.52) with patient readmission rates.',
    key_takeaways: [
      'Patients with comorbidity scores >= 3 show a 52% probability of readmission within 30 days.',
      'High-risk comorbidities represent the primary predictor of re-hospitalization.',
      'Recommends special transition care programs for high comorbidity cohorts.'
    ]
  },
  'rq_health_04': {
    id: 'ins_health_04',
    rq_id: 'rq_health_04',
    category: 'eda',
    summary_text: 'Analysis of patient stays shows clinical stay duration is highly correlated (+0.48) with overall medication counts.',
    key_takeaways: [
      'Average stays of > 6 days require a median of 22 medications.',
      'Resource utilization peaks for patients admitted through emergency routes.'
    ]
  },
  'rq_health_05': {
    id: 'ins_health_05',
    rq_id: 'rq_health_05',
    category: 'eda',
    summary_text: 'Readmission audit reveals primary diagnosis codes for cardiovascular diseases exhibit the highest readmission rate (32%).',
    key_takeaways: [
      'Cardiovascular diagnosis accounts for 45% of all readmission events.',
      'Recommends follow-up calls within 7 days of discharge to manage prescriptions.'
    ]
  }
};

/**
 * Generate standard or dynamic insights for research questions
 */
export function getInsightForRQ(rqId: string, questionText?: string, category?: 'pre-processing' | 'eda'): Insight {
  const staticInsight = MOCK_INSIGHTS[rqId];
  if (staticInsight) return staticInsight;

  // Dynamic fallback generator
  const cat = category || (rqId.includes('_p') ? 'pre-processing' : 'eda');
  const qText = questionText || 'Analyze dataset metrics.';

  if (cat === 'pre-processing') {
    return {
      id: `ins_dyn_${rqId}`,
      rq_id: rqId,
      category: 'pre-processing',
      summary_text: `Completed automated ingestion cleanup for: "${qText}". Evaluated variable constraints and aligned missing features.`,
      key_takeaways: [
        'Mapped missing indexes using median/mode imputations.',
        'Ensured feature consistency across dynamic array fields.',
        'Verified clean format compatibility for statistical runs.'
      ]
    };
  } else {
    return {
      id: `ins_dyn_${rqId}`,
      rq_id: rqId,
      category: 'eda',
      summary_text: `Statistical analysis of "${qText}" revealed distinct distribution patterns and feature correlations.`,
      key_takeaways: [
        'Identified strong coefficient associations between the targeted variables.',
        'Pastel visual patterns display distinct cluster concentrations.',
        'Statistical margins conform to confidence metrics.'
      ]
    };
  }
}
