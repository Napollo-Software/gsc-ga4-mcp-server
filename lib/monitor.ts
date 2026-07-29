import { buildHealth, compareMetric } from "./analyzer";
import { comparisonRanges, recentCompleteDays } from "./dates";
import { getLimits } from "./config";
import {
  getGa4OrganicTotals,
  getGscTotals,
  getLosingPages,
} from "./google";
import type { AccountConfig } from "./types";

export async function scanAccount(account: AccountConfig, days: number) {
  const ranges = comparisonRanges(days);
  const { minBaseline } = getLimits();

  const [gscCurrent, gscPrevious, gaCurrent, gaPrevious] = await Promise.all([
    getGscTotals(account.gscSiteUrl, ranges.current),
    getGscTotals(account.gscSiteUrl, ranges.previous),
    getGa4OrganicTotals(account.ga4PropertyId, ranges.current),
    getGa4OrganicTotals(account.ga4PropertyId, ranges.previous),
  ]);

  const metrics = [
    compareMetric("gsc_clicks", gscCurrent.clicks, gscPrevious.clicks, minBaseline),
    compareMetric(
      "gsc_impressions",
      gscCurrent.impressions,
      gscPrevious.impressions,
      minBaseline,
    ),
    compareMetric(
      "ga4_organic_users",
      gaCurrent.activeUsers,
      gaPrevious.activeUsers,
      minBaseline,
    ),
    compareMetric(
      "ga4_organic_sessions",
      gaCurrent.sessions,
      gaPrevious.sessions,
      minBaseline,
    ),
    compareMetric(
      "ga4_key_events",
      gaCurrent.keyEvents,
      gaPrevious.keyEvents,
      Math.max(5, Math.floor(minBaseline / 4)),
    ),
  ];

  return {
    ranges,
    health: buildHealth(account.id, account.name, metrics),
    additionalEvidence: {
      currentCtr: Number((gscCurrent.ctr * 100).toFixed(2)),
      previousCtr: Number((gscPrevious.ctr * 100).toFixed(2)),
      currentAveragePosition: Number(gscCurrent.position.toFixed(2)),
      previousAveragePosition: Number(gscPrevious.position.toFixed(2)),
    },
  };
}

export async function diagnoseAccount(account: AccountConfig, days: number) {
  const scan = await scanAccount(account, days);
  const pages = await getLosingPages(
    account,
    scan.ranges.current,
    scan.ranges.previous,
    10,
  );

  const likelyCauses: string[] = [];
  const metric = Object.fromEntries(
    scan.health.metrics.map((item) => [item.metric, item]),
  );

  if (
    (metric.gsc_impressions?.percentChange ?? 0) <= -20 &&
    (metric.gsc_clicks?.percentChange ?? 0) <= -20
  ) {
    likelyCauses.push(
      "Search visibility declined because both impressions and clicks fell.",
    );
  }
  if (
    scan.additionalEvidence.currentAveragePosition >
    scan.additionalEvidence.previousAveragePosition + 1
  ) {
    likelyCauses.push("Average Search Console position worsened.");
  }
  if (
    (metric.gsc_clicks?.current ?? 0) > 0 &&
    (metric.ga4_organic_sessions?.current ?? 0) === 0
  ) {
    likelyCauses.push(
      "GSC reports clicks while GA4 reports no organic sessions; verify GA4 tagging and consent behavior.",
    );
  }
  if (pages.length > 0) {
    likelyCauses.push(
      `${pages.length} high-impact pages account for measurable click losses.`,
    );
  }
  if (likelyCauses.length === 0) {
    likelyCauses.push(
      "The available aggregate data does not identify a definitive cause.",
    );
  }

  return { ...scan, losingPages: pages, likelyCauses };
}

export async function checkTracking(account: AccountConfig) {
  const gaRange = recentCompleteDays(2, 1);
  const gscRange = recentCompleteDays(7, 3);
  const [ga4, gsc] = await Promise.all([
    getGa4OrganicTotals(account.ga4PropertyId, gaRange),
    getGscTotals(account.gscSiteUrl, gscRange),
  ]);

  const issues: string[] = [];
  if (ga4.sessions === 0 && gsc.clicks > 0) {
    issues.push(
      "GSC reports recent clicks but GA4 reports zero organic sessions. GA4 tracking or attribution may be broken.",
    );
  }
  if (ga4.activeUsers === 0 && ga4.sessions === 0 && gsc.clicks === 0) {
    issues.push(
      "Both sources report no recent activity. Confirm the property mapping and site activity.",
    );
  }

  return {
    accountId: account.id,
    accountName: account.name,
    status: issues.length ? "warning" : "healthy",
    issues: issues.length ? issues : ["No obvious tracking mismatch detected."],
    evidence: {
      ga4Range: gaRange,
      ga4OrganicUsers: ga4.activeUsers,
      ga4OrganicSessions: ga4.sessions,
      gscRange,
      gscClicks: gsc.clicks,
    },
  };
}
