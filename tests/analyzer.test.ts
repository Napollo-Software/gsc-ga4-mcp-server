import { describe, expect, it } from "vitest";
import {
  buildHealth,
  compareMetric,
  severityFor,
} from "../lib/analyzer";

describe("metric analysis", () => {
  it("marks a 35% decline critical", () => {
    const metric = compareMetric("gsc_clicks", 65, 100, 20);
    expect(metric.percentChange).toBe(-35);
    expect(severityFor([metric])).toBe("critical");
  });

  it("does not calculate unstable percentages for tiny baselines", () => {
    const metric = compareMetric("ga4_key_events", 0, 3, 5);
    expect(metric.percentChange).toBeNull();
    expect(severityFor([metric])).toBe("healthy");
  });

  it("builds human-readable warning evidence", () => {
    const health = buildHealth("client", "Client", [
      compareMetric("gsc_clicks", 75, 100, 20),
    ]);
    expect(health.severity).toBe("warning");
    expect(health.issues[0]).toContain("25.0%");
  });
});
