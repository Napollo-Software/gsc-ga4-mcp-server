import type {
  AccountHealth,
  MetricComparison,
  Severity,
} from "./types";

export function compareMetric(
  metric: string,
  current: number,
  previous: number,
  minBaseline: number,
): MetricComparison {
  const absoluteChange = current - previous;
  const percentChange =
    previous >= minBaseline ? (absoluteChange / previous) * 100 : null;

  return {
    metric,
    current,
    previous,
    absoluteChange,
    percentChange:
      percentChange === null ? null : Number(percentChange.toFixed(1)),
  };
}

export function severityFor(metrics: MetricComparison[]): Severity {
  const declines = metrics
    .map((metric) => metric.percentChange)
    .filter((value): value is number => value !== null);

  if (declines.some((value) => value <= -35)) return "critical";
  if (declines.some((value) => value <= -20)) return "warning";
  return "healthy";
}

function metricLabel(metric: string): string {
  return metric
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function buildHealth(
  accountId: string,
  accountName: string,
  metrics: MetricComparison[],
): AccountHealth {
  const severity = severityFor(metrics);
  const issues = metrics
    .filter(
      (metric) =>
        metric.percentChange !== null && metric.percentChange <= -20,
    )
    .map(
      (metric) =>
        `${metricLabel(metric.metric)} declined ${Math.abs(
          metric.percentChange ?? 0,
        ).toFixed(1)}%.`,
    );

  if (issues.length === 0) {
    issues.push("No monitored metric declined by 20% or more.");
  }

  return {
    accountId,
    accountName,
    severity,
    issues,
    metrics,
  };
}
