export interface Visualization {
  id: string;
  insight_id: string;
  chart_type: 'bar' | 'scatter' | 'line' | 'pie' | 'table';
  chart_config: {
    title: string;
    labels?: string[];
    values?: number[];
    x_axis_label?: string;
    y_axis_label?: string;
    scatter_data?: { x: number; y: number; label?: string }[];
    table_headers?: string[];
    table_rows?: Record<string, any>[];
    series_name?: string;
    legend?: string[];
  };
}

const MOCK_VISUALIZATIONS: Record<string, Visualization> = {
  // --- CHURN DATASET VISUALIZATIONS ---
  'ins_churn_01': {
    id: 'vis_churn_01',
    insight_id: 'ins_churn_01',
    chart_type: 'table',
    chart_config: {
      title: 'Missing Value Imputation Log',
      table_headers: ['Column Name', 'Null Count (Before)', 'Imputation Method', 'Null Count (After)'],
      table_rows: [
        { 'Column Name': 'tenure_months', 'Null Count (Before)': '120', 'Imputation Method': 'Median (25.0 months)', 'Null Count (After)': '0' },
        { 'Column Name': 'total_charges', 'Null Count (Before)': '45', 'Imputation Method': 'Median ($1,540.35)', 'Null Count (After)': '0' }
      ]
    }
  },
  'ins_churn_02': {
    id: 'vis_churn_02',
    insight_id: 'ins_churn_02',
    chart_type: 'table',
    chart_config: {
      title: 'Categorical Text Encodings Map',
      table_headers: ['Column Name', 'Unique Categories', 'Encodings Assigned'],
      table_rows: [
        { 'Column Name': 'subscription_type', 'Unique Categories': '3', 'Encodings Assigned': 'Basic (0), Standard (1), Premium (2)' },
        { 'Column Name': 'payment_method', 'Unique Categories': '4', 'Encodings Assigned': 'Electronic Check (0), Credit Card (1), Bank Transfer (2), Mailed Check (3)' }
      ]
    }
  },
  'ins_churn_03': {
    id: 'vis_churn_03',
    insight_id: 'ins_churn_03',
    chart_type: 'table',
    chart_config: {
      title: 'Outlier Truncation Summary (IQR Analysis)',
      table_headers: ['Column Name', 'Outliers Detected', 'Percentile Limit', 'Action Taken'],
      table_rows: [
        { 'Column Name': 'support_calls_q1', 'Outliers Detected': '12', 'Percentile Limit': '95th Percentile (Capped at 6)', 'Action': 'Capped extreme values' },
        { 'Column Name': 'monthly_charges', 'Outliers Detected': '0', 'Percentile Limit': 'None', 'Action': 'No modification' }
      ]
    }
  },
  'ins_churn_04': {
    id: 'vis_churn_04',
    insight_id: 'ins_churn_04',
    chart_type: 'bar',
    chart_config: {
      title: 'Churn Rate vs. Monthly Charges Brackets',
      x_axis_label: 'Monthly Charge Brackets',
      y_axis_label: 'Churn Percentage (%)',
      labels: ['<$30 / mo', '$30 - $60', '$60 - $90', '>$90 / mo'],
      values: [10.2, 18.5, 25.4, 45.8]
    }
  },
  'ins_churn_05': {
    id: 'vis_churn_05',
    insight_id: 'ins_churn_05',
    chart_type: 'scatter',
    chart_config: {
      title: 'Tenure (Months) vs. Total Charges (Colored by Churn)',
      x_axis_label: 'Tenure (Months)',
      y_axis_label: 'Total Charges ($)',
      scatter_data: [
        { x: 3, y: 74, label: 'Churned' },
        { x: 8, y: 361, label: 'Churned' },
        { x: 12, y: 780, label: 'Churned' },
        { x: 15, y: 1048, label: 'Churned' },
        { x: 24, y: 1438, label: 'Active' },
        { x: 36, y: 2692, label: 'Active' },
        { x: 48, y: 4790, label: 'Active' },
        { x: 60, y: 6294, label: 'Active' },
        { x: 72, y: 8276, label: 'Active' },
        { x: 5, y: 240, label: 'Churned' },
        { x: 18, y: 1100, label: 'Active' },
        { x: 42, y: 3100, label: 'Active' }
      ],
      legend: ['Active User', 'Churned User']
    }
  },
  'ins_churn_06': {
    id: 'vis_churn_06',
    insight_id: 'ins_churn_06',
    chart_type: 'pie',
    chart_config: {
      title: 'Distribution of Churned Cases by Payment Method',
      labels: ['Electronic Check', 'Mailed Check', 'Bank Transfer', 'Credit Card'],
      values: [53, 20, 15, 12]
    }
  },

  // --- FINANCE DATASET VISUALIZATIONS ---
  'ins_finance_01': {
    id: 'vis_finance_01',
    insight_id: 'ins_finance_01',
    chart_type: 'table',
    chart_config: {
      title: 'Finance Imputations Record',
      table_headers: ['Column', 'Imputation Detail', 'Count Treated'],
      table_rows: [
        { 'Column': 'expansion_revenue_usd', 'Imputation Detail': 'Zero Fill (0.00)', 'Count Treated': '120' },
        { 'Column': 'nps_score', 'Imputation Detail': 'Mean score imputation (44.5)', 'Count Treated': '450' }
      ]
    }
  },
  'ins_finance_02': {
    id: 'vis_finance_02',
    insight_id: 'ins_finance_02',
    chart_type: 'table',
    chart_config: {
      title: 'Datetime Formatting Pipeline',
      table_headers: ['Original Sample', 'Standard Output', 'Status'],
      table_rows: [
        { 'Original Sample': '2025-01-31', 'Standard Output': '2025-01-31T00:00:00.000Z', 'Status': 'Success' },
        { 'Original Sample': '2025-02-28', 'Standard Output': '2025-02-28T00:00:00.000Z', 'Status': 'Success' }
      ]
    }
  },
  'ins_finance_03': {
    id: 'vis_finance_03',
    insight_id: 'ins_finance_03',
    chart_type: 'scatter',
    chart_config: {
      title: 'CAC vs. LTV Scatter Plots',
      x_axis_label: 'CAC ($)',
      y_axis_label: 'LTV ($)',
      scatter_data: [
        { x: 215, y: 6200 },
        { x: 220, y: 6150 },
        { x: 222, y: 6250 },
        { x: 218, y: 6400 },
        { x: 230, y: 6450 },
        { x: 235, y: 6500 },
        { x: 242, y: 6700 },
        { x: 248, y: 6800 },
        { x: 252, y: 6900 },
        { x: 255, y: 7100 }
      ]
    }
  },
  'ins_finance_04': {
    id: 'vis_finance_04',
    insight_id: 'ins_finance_04',
    chart_type: 'line',
    chart_config: {
      title: 'Monthly ARR Trend (thousands of $)',
      x_axis_label: 'Billing Month',
      y_axis_label: 'ARR ($k)',
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      values: [1180, 1225, 1281, 1336, 1394, 1464, 1497, 1554, 1600]
    }
  },
  'ins_finance_05': {
    id: 'vis_finance_05',
    insight_id: 'ins_finance_05',
    chart_type: 'bar',
    chart_config: {
      title: 'Average NPS score by Billing Region',
      x_axis_label: 'Region',
      y_axis_label: 'Average NPS score',
      labels: ['North America', 'Europe', 'Asia-Pacific', 'LATAM'],
      values: [48, 43, 40, 37]
    }
  },

  // --- HEALTHCARE DATASET VISUALIZATIONS ---
  'ins_health_01': {
    id: 'vis_health_01',
    insight_id: 'ins_health_01',
    chart_type: 'table',
    chart_config: {
      title: 'Clinical Categorical Alignments',
      table_headers: ['Column Mapped', 'Missing Records', 'Fallback Imputed'],
      table_rows: [
        { 'Column Mapped': 'admission_source', 'Missing Records': '320', 'Fallback Imputed': '"Unknown"' },
        { 'Column Mapped': 'primary_diagnosis_code', 'Missing Records': '45', 'Fallback Imputed': '"General Diagnosis"' }
      ]
    }
  },
  'ins_health_02': {
    id: 'vis_health_02',
    insight_id: 'ins_health_02',
    chart_type: 'table',
    chart_config: {
      title: 'Risk Binning Transformations Map',
      table_headers: ['Original Class', 'Assigned Ordinal Rank', 'Risk Label'],
      table_rows: [
        { 'Original Class': 'Comorbidity Score: 0', 'Assigned Ordinal Rank': '0', 'Risk Label': 'Low Risk' },
        { 'Original Class': 'Comorbidity Score: 1-2', 'Assigned Ordinal Rank': '1', 'Risk Label': 'Medium Risk' },
        { 'Original Class': 'Comorbidity Score: 3-4', 'Assigned Ordinal Rank': '2', 'Risk Label': 'High Risk' }
      ]
    }
  },
  'ins_health_03': {
    id: 'vis_health_03',
    insight_id: 'ins_health_03',
    chart_type: 'bar',
    chart_config: {
      title: '30-Day Readmission Percentage by Comorbidity Risk Tier',
      x_axis_label: 'Comorbidity Risk Tier',
      y_axis_label: 'Readmission Probability (%)',
      labels: ['Low Risk (0)', 'Medium Risk (1-2)', 'High Risk (3-4)'],
      values: [12.4, 28.5, 52.3]
    }
  },
  'ins_health_04': {
    id: 'vis_health_04',
    insight_id: 'ins_health_04',
    chart_type: 'line',
    chart_config: {
      title: 'Average Medication Counts by Days in Hospital',
      x_axis_label: 'Hospital Stay (Days)',
      y_axis_label: 'Average Medications Prescribed',
      labels: ['1 Day', '2 Days', '3 Days', '4 Days', '5 Days', '6 Days', '8 Days', '10 Days'],
      values: [8, 12, 14, 15, 17, 22, 28, 32]
    }
  },
  'ins_health_05': {
    id: 'vis_health_05',
    insight_id: 'ins_health_05',
    chart_type: 'pie',
    chart_config: {
      title: 'Readmission Cases Distribution by Diagnosis Category',
      labels: ['Cardiovascular', 'Respiratory', 'Diabetes', 'Urogenital', 'Other'],
      values: [45, 22, 15, 10, 8]
    }
  }
};

/**
 * Retrieve visualizations for a specific insight. Falls back to generating a dynamic chart configuration if not present.
 */
export function getVisualizationForInsight(insightId: string, chartType?: 'bar' | 'scatter' | 'line' | 'pie' | 'table'): Visualization {
  const staticVisual = MOCK_VISUALIZATIONS[insightId];
  if (staticVisual) return staticVisual;

  // Dynamic fallback generator
  const type = chartType || (insightId.includes('_p') ? 'table' : 'bar');
  
  if (type === 'table') {
    return {
      id: `vis_dyn_${insightId}`,
      insight_id: insightId,
      chart_type: 'table',
      chart_config: {
        title: 'Preprocessing Ingestion Logs',
        table_headers: ['Process Log', 'System Output', 'Response Code'],
        table_rows: [
          { 'Process Log': 'Evaluated missing nodes', 'System Output': 'No critical skew found', 'Response Code': 'COMPLETED' },
          { 'Process Log': 'Created category indices', 'System Output': 'Dimension count verified', 'Response Code': 'COMPLETED' }
        ]
      }
    };
  } else if (type === 'line') {
    return {
      id: `vis_dyn_${insightId}`,
      insight_id: insightId,
      chart_type: 'line',
      chart_config: {
        title: 'Time-Series Progression Metrics',
        x_axis_label: 'Sequence interval',
        y_axis_label: 'Value metrics',
        labels: ['Interval-1', 'Interval-2', 'Interval-3', 'Interval-4', 'Interval-5'],
        values: [100, 140, 185, 210, 260]
      }
    };
  } else if (type === 'pie') {
    return {
      id: `vis_dyn_${insightId}`,
      insight_id: insightId,
      chart_type: 'pie',
      chart_config: {
        title: 'Categorical Proportions Audit',
        labels: ['Class-A', 'Class-B', 'Class-C'],
        values: [55, 30, 15]
      }
    };
  } else if (type === 'scatter') {
    return {
      id: `vis_dyn_${insightId}`,
      insight_id: insightId,
      chart_type: 'scatter',
      chart_config: {
        title: 'Feature Coordinates Plot',
        x_axis_label: 'Parameter X',
        y_axis_label: 'Parameter Y',
        scatter_data: [
          { x: 10, y: 12 }, { x: 20, y: 35 }, { x: 30, y: 44 },
          { x: 40, y: 55 }, { x: 50, y: 78 }, { x: 60, y: 92 }
        ]
      }
    };
  } else {
    // Bar
    return {
      id: `vis_dyn_${insightId}`,
      insight_id: insightId,
      chart_type: 'bar',
      chart_config: {
        title: 'Comparative Variable Metrics',
        x_axis_label: 'Categories',
        y_axis_label: 'Calculated value (%)',
        labels: ['Group Alpha', 'Group Beta', 'Group Gamma'],
        values: [32.4, 68.2, 44.1]
      }
    };
  }
}
