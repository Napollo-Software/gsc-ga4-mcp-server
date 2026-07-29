import { describe, expect, it } from "vitest";
import { comparisonRanges, recentCompleteDays } from "../lib/dates";

describe("comparisonRanges", () => {
  it("creates adjacent complete 28-day periods", () => {
    expect(comparisonRanges(28, new Date("2026-07-30T12:00:00Z"))).toEqual({
      current: { startDate: "2026-07-02", endDate: "2026-07-29" },
      previous: { startDate: "2026-06-04", endDate: "2026-07-01" },
    });
  });

  it("rejects invalid periods", () => {
    expect(() => comparisonRanges(0)).toThrow();
    expect(() => comparisonRanges(91)).toThrow();
  });
});

describe("recentCompleteDays", () => {
  it("honors the reporting lag", () => {
    expect(
      recentCompleteDays(7, 3, new Date("2026-07-30T12:00:00Z")),
    ).toEqual({
      startDate: "2026-07-21",
      endDate: "2026-07-27",
    });
  });
});
