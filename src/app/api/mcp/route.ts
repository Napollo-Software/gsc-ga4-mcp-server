import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GSC_CLIENT_ID,
  process.env.GSC_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GSC_REFRESH_TOKEN,
});

// ========== GSC ==========
const searchconsole = google.searchconsole({
  version: "v1",
  auth: oauth2Client,
});

// ========== GA4 ==========
const analyticsData = google.analyticsdata({
  version: "v1beta",
  auth: oauth2Client,
});

const analyticsAdmin = google.analyticsadmin({
  version: "v1beta",
  auth: oauth2Client,
});

// Helper function for safe API calls (Prevents server crash on API errors)
const safeCall = async (fn: () => Promise<any>) => {
  try {
    return await fn();
  } catch (error: any) {
    return { error: error.message || "API Error" };
  }
};

const handler = createMcpHandler(
  (server) => {
    // ==================== GSC TOOLS ====================

    server.tool(
      "gsc_list_sites",
      "List all Google Search Console properties",
      {},
      async () => {
        const res = await safeCall(() => searchconsole.sites.list());
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return {
          content: [{ type: "text", text: JSON.stringify(res.data.siteEntry || [], null, 2) }],
        };
      }
    );

    server.tool(
      "gsc_search_analytics",
      "Get Search Console performance data (clicks, impressions, CTR, position)",
      {
        siteUrl: z.string().describe("e.g. sc-domain:example.com or https://example.com/"),
        startDate: z.string().describe("YYYY-MM-DD"),
        endDate: z.string().describe("YYYY-MM-DD"),
        dimensions: z.array(z.enum(["query", "page", "country", "device", "date"])).optional().default(["query"]),
        rowLimit: z.number().optional().default(25),
      },
      async ({ siteUrl, startDate, endDate, dimensions, rowLimit }) => {
        const res = await safeCall(() => searchconsole.searchanalytics.query({
          siteUrl,
          requestBody: { startDate, endDate, dimensions, rowLimit },
        }));
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return {
          content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
        };
      }
    );

    server.tool(
      "gsc_list_sitemaps",
      "List submitted sitemaps and their status",
      {
        siteUrl: z.string(),
      },
      async ({ siteUrl }) => {
        const res = await safeCall(() => searchconsole.sitemaps.list({ siteUrl }));
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return {
          content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
        };
      }
    );

    server.tool(
      "gsc_inspect_url",
      "Inspect indexing status of a URL",
      {
        siteUrl: z.string(),
        inspectionUrl: z.string(),
      },
      async ({ siteUrl, inspectionUrl }) => {
        const res = await safeCall(() => searchconsole.urlInspection.index.inspect({
          requestBody: { inspectionUrl, siteUrl },
        }));
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return {
          content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
        };
      }
    );

    server.tool(
      "gsc_batch_inspect_urls",
      "Inspect indexing status of multiple URLs to find 'Why pages aren't indexed'",
      {
        siteUrl: z.string().describe("The property URL (e.g. sc-domain:example.com)"),
        urls: z.array(z.string()).describe("Array of URLs to inspect"),
      },
      async ({ siteUrl, urls }) => {
        const results = [];
        for (const url of urls) {
          const res = await safeCall(() => searchconsole.urlInspection.index.inspect({
            requestBody: { inspectionUrl: url, siteUrl, languageCode: "en-US" },
          }));
          if (res.error) {
            results.push({ url, error: res.error });
          } else {
            const status = res.data.inspectionResult?.indexStatusResult;
            results.push({
              url,
              verdict: status?.verdict,
              coverageState: status?.coverageState,
              indexingState: status?.indexingState,
              lastCrawlTime: status?.lastCrawlTime,
              googleCanonical: status?.googleCanonical,
            });
          }
          // Small delay to avoid Google API rate limits
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }
    );

    // NEW TOOL: Request Indexing
    server.tool(
      "gsc_request_indexing",
      "Request indexing for a specific URL through Google Search Console",
      {
        siteUrl: z.string().describe("The property URL (e.g. sc-domain:example.com)"),
        inspectionUrl: z.string().describe("The exact URL to request indexing for"),
      },
      async ({ siteUrl, inspectionUrl }) => {
        const res = await safeCall(() => searchconsole.urlInspection.index.inspect({
          requestBody: { inspectionUrl, siteUrl, languageCode: "en-US" },
        }));
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        
        const indexStatus = res.data.inspectionResult?.indexStatusResult;
        return {
          content: [{ type: "text", text: `Indexing requested for: ${inspectionUrl}\nCurrent Status: ${JSON.stringify(indexStatus, null, 2)}`}],
        };
      }
    );

    server.tool(
      "get_gsc_client_report",
      "Complete Search Console report with trend (up/down) + sitemap status",
      {
        siteUrl: z.string().describe("sc-domain:example.com or https://example.com/"),
        days: z.number().default(28),
      },
      async ({ siteUrl, days }) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);

        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - days);

        const format = (d: Date) => d.toISOString().split("T")[0];

        const [current, previous, sitemaps] = await Promise.all([
          safeCall(() => searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: { startDate: format(start), endDate: format(end), dimensions: ["date"] },
          })),
          safeCall(() => searchconsole.searchanalytics.query({
            siteUrl,
            requestBody: { startDate: format(prevStart), endDate: format(prevEnd), dimensions: ["date"] },
          })),
          safeCall(() => searchconsole.sitemaps.list({ siteUrl })),
        ]);

        const sum = (rows: any[] = []) =>
          rows.reduce(
            (acc, r) => {
              acc.clicks += r.clicks || 0;
              acc.impressions += r.impressions || 0;
              return acc;
            },
            { clicks: 0, impressions: 0 }
          );

        const curr = sum(current?.data?.rows || []);
        const prev = sum(previous?.data?.rows || []);

        const clicksChange =
          prev.clicks === 0 ? "N/A" : (((curr.clicks - prev.clicks) / prev.clicks) * 100).toFixed(1) + "%";
        const imprChange =
          prev.impressions === 0 ? "N/A" : (((curr.impressions - prev.impressions) / prev.impressions) * 100).toFixed(1) + "%";

        const trend = Number(clicksChange) > 0 ? "UP ↑" : Number(clicksChange) < 0 ? "DOWN ↓" : "STABLE →";

        const report = `# Search Console Client Report

**Site:** ${siteUrl}
**Period:** Last ${days} days vs previous ${days} days

## Performance Trend
- **Clicks:** ${curr.clicks.toLocaleString()} (${clicksChange})
- **Impressions:** ${curr.impressions.toLocaleString()} (${imprChange})
- **Trend:** ${trend}

## Sitemaps Status
 ${JSON.stringify(sitemaps?.data?.sitemap || [], null, 2)}
`;

        return {
          content: [{ type: "text", text: report }],
        };
      }
    );

    // ==================== GA4 TOOLS ====================

    server.tool(
      "ga4_list_properties",
      "List all GA4 accounts and properties accessible by the authenticated user",
      {},
      async () => {
        const res = await safeCall(() => analyticsAdmin.accountSummaries.list());
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return {
          content: [{ type: "text", text: JSON.stringify(res.data.accountSummaries || [], null, 2) }],
        };
      }
    );

    server.tool(
      "ga4_run_report",
      "Run a GA4 report (sessions, users, pageviews, etc.)",
      {
        propertyId: z.string().describe("GA4 Property ID (numbers only, e.g. 123456789)"),
        startDate: z.string().describe("YYYY-MM-DD or yesterday / 7daysAgo"),
        endDate: z.string().describe("YYYY-MM-DD or today"),
        metrics: z.array(z.string()).default(["sessions", "totalUsers", "screenPageViews"]),
        dimensions: z.array(z.string()).optional().default(["date"]),
        limit: z.number().optional().default(50),
      },
      async ({ propertyId, startDate, endDate, metrics, dimensions, limit }) => {
        const res = await safeCall(() => analyticsData.properties.runReport({
          property: `properties/${propertyId}`,
          requestBody: {
            dateRanges: [{ startDate, endDate }],
            metrics: metrics.map((name) => ({ name })),
            dimensions: dimensions?.map((name) => ({ name })),
            limit: limit.toString(),
          },
        }));

        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return {
          content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
        };
      }
    );

    // NEW TOOL: Traffic Sources
    server.tool(
      "ga4_traffic_sources",
      "Get GA4 traffic sources (where users are coming from)",
      {
        propertyId: z.string().describe("GA4 Property ID"),
        startDate: z.string().describe("YYYY-MM-DD or 7daysAgo"),
        endDate: z.string().describe("YYYY-MM-DD or today"),
      },
      async ({ propertyId, startDate, endDate }) => {
        const res = await safeCall(() => analyticsData.properties.runReport({
          property: `properties/${propertyId}`,
          requestBody: {
            dateRanges: [{ startDate, endDate }],
            metrics: [{ name: "sessions" }, { name: "totalUsers" }],
            dimensions: [{ name: "sessionDefaultChannelGroup" }],
          },
        }));
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return { content: [{ type: "text", text: JSON.stringify(res.data.rows || [], null, 2) }] };
      }
    );

    // NEW TOOL: Top Performing Pages
    server.tool(
      "ga4_top_pages",
      "Get GA4 top performing pages/landing pages",
      {
        propertyId: z.string().describe("GA4 Property ID"),
        startDate: z.string().describe("YYYY-MM-DD or 7daysAgo"),
        endDate: z.string().describe("YYYY-MM-DD or today"),
        limit: z.number().optional().default(10),
      },
      async ({ propertyId, startDate, endDate, limit }) => {
        const res = await safeCall(() => analyticsData.properties.runReport({
          property: `properties/${propertyId}`,
          requestBody: {
            dateRanges: [{ startDate, endDate }],
            metrics: [{ name: "screenPageViews" }, { name: "sessions" }, { name: "averageSessionDuration" }],
            dimensions: [{ name: "landingPagePlusQueryString" }],
            limit: limit.toString(),
            orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          },
        }));
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return { content: [{ type: "text", text: JSON.stringify(res.data.rows || [], null, 2) }] };
      }
    );

    server.tool(
      "ga4_realtime",
      "Get GA4 realtime active users (last 30 minutes)",
      {
        propertyId: z.string().describe("GA4 Property ID (numbers only)"),
      },
      async ({ propertyId }) => {
        const res = await safeCall(() => analyticsData.properties.runRealtimeReport({
          property: `properties/${propertyId}`,
          requestBody: {
            metrics: [{ name: "activeUsers" }],
            dimensions: [{ name: "country" }],
          },
        }));
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return {
          content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
        };
      }
    );

    server.tool(
      "get_ga4_client_report",
      "Quick GA4 performance report with trend comparison",
      {
        propertyId: z.string().describe("GA4 Property ID (numbers only)"),
        days: z.number().default(28),
      },
      async ({ propertyId, days }) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);

        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - days);

        const format = (d: Date) => d.toISOString().split("T")[0];

        const [current, previous] = await Promise.all([
          safeCall(() => analyticsData.properties.runReport({
            property: `properties/${propertyId}`,
            requestBody: {
              dateRanges: [{ startDate: format(start), endDate: format(end) }],
              metrics: [
                { name: "sessions" },
                { name: "totalUsers" },
                { name: "screenPageViews" },
                { name: "bounceRate" },
              ],
            },
          })),
          safeCall(() => analyticsData.properties.runReport({
            property: `properties/${propertyId}`,
            requestBody: {
              dateRanges: [{ startDate: format(prevStart), endDate: format(prevEnd) }],
              metrics: [
                { name: "sessions" },
                { name: "totalUsers" },
                { name: "screenPageViews" },
                { name: "bounceRate" },
              ],
            },
          })),
        ]);

        const getValue = (report: any, index: number) =>
          Number(report?.data?.rows?.[0]?.metricValues?.[index]?.value || 0);

        const currSessions = getValue(current, 0);
        const prevSessions = getValue(previous, 0);
        const currUsers = getValue(current, 1);
        const prevUsers = getValue(previous, 1);

        const sessionsChange =
          prevSessions === 0 ? "N/A" : (((currSessions - prevSessions) / prevSessions) * 100).toFixed(1) + "%";
        const usersChange =
          prevUsers === 0 ? "N/A" : (((currUsers - prevUsers) / prevUsers) * 100).toFixed(1) + "%";

        const trend = Number(sessionsChange) > 0 ? "UP ↑" : Number(sessionsChange) < 0 ? "DOWN ↓" : "STABLE →";

        const report = `# GA4 Client Report

**Property ID:** ${propertyId}
**Period:** Last ${days} days vs previous ${days} days

## Performance Trend
- **Sessions:** ${currSessions.toLocaleString()} (${sessionsChange})
- **Users:** ${currUsers.toLocaleString()} (${usersChange})
- **Trend:** ${trend}
`;

        return {
          content: [{ type: "text", text: report }],
        };
      }
    );

    // NEW TOOL: Combined SEO Health Report
    server.tool(
      "get_seo_health_overview",
      "Generates a combined SEO health overview combining GSC clicks and GA4 sessions for a specific property.",
      {
        siteUrl: z.string().describe("GSC Property URL"),
        propertyId: z.string().describe("GA4 Property ID"),
        days: z.number().default(7),
      },
      async ({ siteUrl, propertyId, days }) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        const format = (d: Date) => d.toISOString().split("T")[0];

        const [gscRes, ga4Res] = await Promise.all([
          safeCall(() => searchconsole.searchanalytics.query({ 
            siteUrl, 
            requestBody: { startDate: format(start), endDate: format(end), dimensions: ["date"] } 
          })),
          safeCall(() => analyticsData.properties.runReport({
            property: `properties/${propertyId}`,
            requestBody: {
              dateRanges: [{ startDate: format(start), endDate: format(end) }],
              metrics: [{ name: "sessions" }, { name: "totalUsers" }],
            },
          }))
        ]);

        const gscClicks = gscRes?.data?.rows?.reduce((acc: any, r: any) => acc + (r.clicks || 0), 0) || 0;
        const ga4Sessions = ga4Res?.data?.rows?.[0]?.metricValues?.[0]?.value || "0";

        const report = `# SEO Health Overview (Last ${days} Days)\n\n## Google Search Console\n- Total Clicks: ${gscClicks}\n\n## Google Analytics 4\n- Total Sessions: ${ga4Sessions}\n\n*Use this combined data to analyze the correlation between search visibility and actual website traffic.*`;

        return { content: [{ type: "text", text: report }] };
      }
    );
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST, handler as DELETE };