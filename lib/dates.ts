import type { ComparisonRanges, DateRange } from "./types";

const DAY_MS = 86_400_000;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function utcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function comparisonRanges(
  days: number,
  now: Date = new Date(),
): ComparisonRanges {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("Comparison days must be an integer between 1 and 90.");
  }

  const today = utcDay(now);
  const currentEnd = addDays(today, -1);
  const currentStart = addDays(currentEnd, -(days - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  return {
    current: {
      startDate: formatDate(currentStart),
      endDate: formatDate(currentEnd),
    },
    previous: {
      startDate: formatDate(previousStart),
      endDate: formatDate(previousEnd),
    },
  };
}

export function recentCompleteDays(
  days: number,
  lagDays: number,
  now: Date = new Date(),
): DateRange {
  const today = utcDay(now);
  const end = addDays(today, -Math.max(1, lagDays));
  const start = addDays(end, -(days - 1));
  return { startDate: formatDate(start), endDate: formatDate(end) };
}
