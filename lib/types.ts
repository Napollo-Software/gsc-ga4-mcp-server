export type Severity = "critical" | "warning" | "healthy";

export type AccountConfig = {
  id: string;
  name: string;
  gscSiteUrl: string;
  ga4PropertyId: string;
};

export type DateRange = {
  startDate: string;
  endDate: string;
};

export type ComparisonRanges = {
  current: DateRange;
  previous: DateRange;
};

export type MetricComparison = {
  metric: string;
  current: number;
  previous: number;
  absoluteChange: number;
  percentChange: number | null;
};

export type AccountHealth = {
  accountId: string;
  accountName: string;
  severity: Severity;
  issues: string[];
  metrics: MetricComparison[];
};

export type LosingPage = {
  page: string;
  currentClicks: number;
  previousClicks: number;
  clickLoss: number;
  percentChange: number | null;
};
