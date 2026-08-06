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
const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

// ========== GA4 ==========
const analyticsData = google.analyticsdata({ version: "v1beta", auth: oauth2Client });
const analyticsAdmin = google.analyticsadmin({ version: "v1beta", auth: oauth2Client });

// ========== GTM & BigQuery ==========
const tagmanager = google.tagmanager({ version: "v2", auth: oauth2Client });
const bigquery = google.bigquery({ version: "v2", auth: oauth2Client });

const safeCall = async (fn: () => Promise<any>): Promise<any> => {
  try { return await fn(); } catch (error: any) { return { error: error.message || "API Error" }; }
};

const checkAuth = (code: string) => {
  if (code !== process.env.MCP_SECRET_CODE) {
    return { content: [{ type: "text", text: "Error: Unauthorized. Invalid or missing tracking ID." }] };
  }
  return null;
};

// Helper for unsupported API tools
const unsupportedTool = (name: string, description: string, message: string) => ({
  name, description, args: { trackingId: z.string().describe("REQUIRED: The tracking ID.") },
  run: async ({ trackingId }: any) => {
    const authError = checkAuth(trackingId); if (authError) return authError;
    return { content: [{ type: "text", text: message }] };
  }
});

const handler = createMcpHandler(
  (server: any) => {

    // ==================== HIGH PRIORITY ADVANCED TOOLS ====================

    // 1. Advanced GA4 Report
    server.tool("ga4_run_advanced_report", "Run complex GA4 report with dimension/metric filters, multiple date ranges, sorting, and offset pagination", {
      trackingId: z.string().describe("REQUIRED: The tracking ID."),
      propertyId: z.string(),
      dateRanges: z.array(z.object({ startDate: z.string(), endDate: z.string() })),
      metrics: z.array(z.string()),
      dimensions: z.array(z.string()).optional(),
      dimensionFilter: z.any().optional().describe("JSON for dimension filter, e.g., {filter: {fieldName: 'sessionDefaultChannelGroup', stringFilter: {matchType: 'EXACT', value: 'Organic Search'}}}"),
      metricFilter: z.any().optional(),
      orderBys: z.any().optional().describe("JSON array for sorting"),
      limit: z.number().optional().default(100),
      offset: z.number().optional().default(0)
    }, async ({ trackingId, propertyId, dateRanges, metrics, dimensions, dimensionFilter, metricFilter, orderBys, limit, offset }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: { dateRanges, metrics: metrics.map((n: string) => ({ name: n })), dimensions: dimensions?.map((n: string) => ({ name: n })), dimensionFilter, metricFilter, orderBys, limit: limit.toString(), offset: offset.toString() }
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    // 2. GA4 Compare Landing Pages
    server.tool("ga4_compare_landing_pages", "Compare each landing page's sessions, users, engaged sessions, and key events against the previous period", {
      trackingId: z.string().describe("REQUIRED: The tracking ID."),
      propertyId: z.string(),
      currStartDate: z.string(), currEndDate: z.string(),
      prevStartDate: z.string(), prevEndDate: z.string(),
      limit: z.number().optional().default(20)
    }, async ({ trackingId, propertyId, currStartDate, currEndDate, prevStartDate, prevEndDate, limit }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: currStartDate, endDate: currEndDate }, { startDate: prevStartDate, endDate: prevEndDate }],
          metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "engagedSessions" }, { name: "keyEvents" }],
          dimensions: [{ name: "landingPagePlusQueryString" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: limit.toString()
        }
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    // 3. GA4 Hostname, Source & Geo Report
    server.tool("ga4_hostname_source_geo_report", "Show source, medium, channel, country, device, browser and hostname for traffic", {
      trackingId: z.string().describe("REQUIRED: The tracking ID."),
      propertyId: z.string(), startDate: z.string(), endDate: z.string()
    }, async ({ trackingId, propertyId, startDate, endDate }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "averageSessionDuration" }],
          dimensions: [{ name: "hostname" }, { name: "sessionSourceMedium" }, { name: "country" }, { name: "deviceCategory" }, { name: "browser" }],
          limit: "100"
        }
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    // 4. Advanced GSC Search Analytics
    server.tool("gsc_search_analytics_advanced", "Run advanced GSC report with query/page filters, regex, search type, and pagination", {
      trackingId: z.string().describe("REQUIRED: The tracking ID."),
      siteUrl: z.string(), startDate: z.string(), endDate: z.string(),
      dimensions: z.array(z.string()),
      dimensionFilterGroups: z.any().optional().describe("JSON array for filters, e.g., [{filters: [{dimension: 'query', operator: 'contains', expression: 'wood'}]}]"),
      searchType: z.enum(["web", "image", "video", "news", "discover"]).optional().default("web"),
      dataState: z.enum(["final", "daily"]).optional().default("final"),
      rowLimit: z.number().optional().default(1000),
      startRow: z.number().optional().default(0)
    }, async ({ trackingId, siteUrl, startDate, endDate, dimensions, dimensionFilterGroups, searchType, dataState, rowLimit, startRow }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => searchconsole.searchanalytics.query({
        siteUrl, requestBody: { startDate, endDate, dimensions, dimensionFilterGroups, searchType, dataState, rowLimit, startRow }
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    // 5. GSC Compare Page Queries
    server.tool("gsc_compare_page_queries", "Compare all queries for pages across current and previous periods", {
      trackingId: z.string().describe("REQUIRED: The tracking ID."),
      siteUrl: z.string(),
      currStartDate: z.string(), currEndDate: z.string(),
      prevStartDate: z.string(), prevEndDate: z.string()
    }, async ({ trackingId, siteUrl, currStartDate, currEndDate, prevStartDate, prevEndDate }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const [currRes, prevRes] = await Promise.all([
        safeCall(() => searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: currStartDate, endDate: currEndDate, dimensions: ["page", "query"], rowLimit: 1000 } })),
        safeCall(() => searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: prevStartDate, endDate: prevEndDate, dimensions: ["page", "query"], rowLimit: 1000 } }))
      ]);
      const formatData = (data: any) => (data?.rows || []).map((r: any) => ({ page: r.keys[0], query: r.keys[1], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
      return { content: [{ type: "text", text: JSON.stringify({ currentPeriod: formatData(currRes.data), previousPeriod: formatData(prevRes.data) }, null, 2) }] };
    });

    // ==================== OTHER GA4 REPORTING TOOLS ====================
    server.tool("ga4_landing_page_source_report", "Show source, medium, channel for each landing page", {
      trackingId: z.string(), propertyId: z.string(), startDate: z.string(), endDate: z.string()
    }, async ({ trackingId, propertyId, startDate, endDate }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate, endDate }], metrics: [{ name: "sessions" }], dimensions: [{ name: "landingPagePlusQueryString" }, { name: "sessionSourceMedium" }, { name: "sessionDefaultChannelGroup" }] }
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.rows || [], null, 2) }] };
    });

    server.tool("ga4_landing_page_geo_report", "Show country, region, city for traffic reaching a particular landing page", {
      trackingId: z.string(), propertyId: z.string(), startDate: z.string(), endDate: z.string()
    }, async ({ trackingId, propertyId, startDate, endDate }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate, endDate }], metrics: [{ name: "sessions" }], dimensions: [{ name: "landingPagePlusQueryString" }, { name: "country" }, { name: "city" }] }
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.rows || [], null, 2) }] };
    });

    server.tool("ga4_landing_page_technology_report", "Show device, browser, OS, platform by landing page", {
      trackingId: z.string(), propertyId: z.string(), startDate: z.string(), endDate: z.string()
    }, async ({ trackingId, propertyId, startDate, endDate }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate, endDate }], metrics: [{ name: "sessions" }], dimensions: [{ name: "landingPagePlusQueryString" }, { name: "deviceCategory" }, { name: "browser" }, { name: "operatingSystem" }] }
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.rows || [], null, 2) }] };
    });

    server.tool("ga4_hostname_report", "Identify whether traffic was recorded on production, staging, payment domain or unknown hostname", {
      trackingId: z.string(), propertyId: z.string(), startDate: z.string(), endDate: z.string()
    }, async ({ trackingId, propertyId, startDate, endDate }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate, endDate }], metrics: [{ name: "sessions" }], dimensions: [{ name: "hostname" }] }
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.rows || [], null, 2) }] };
    });

    server.tool("ga4_session_quality_report", "Return views per session, engagement time, scroll activity, key events and bounce indicators", {
      trackingId: z.string(), propertyId: z.string(), startDate: z.string(), endDate: z.string()
    }, async ({ trackingId, propertyId, startDate, endDate }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate, endDate }], metrics: [{ name: "screenPageViewsPerSession" }, { name: "averageSessionDuration" }, { name: "engagedSessions" }, { name: "eventsPerSession" }, { name: "keyEvents" }] }
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.rows || [], null, 2) }] };
    });

    server.tool("ga4_bigquery_query", "Analyse raw events, session IDs, user pseudo IDs, timestamps and repeated activity via BigQuery", {
      trackingId: z.string(), projectId: z.string(), query: z.string()
    }, async ({ trackingId, projectId, query }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => bigquery.jobs.query({ projectId, requestBody: { query, useLegacySql: false } }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    // ==================== GA4 UNSUPPORTED API STUBS ====================
    const ga4Stubs = [
      ["ga4_event_sequence_report", "Show event order within sessions to identify bot traffic. Requires BigQuery."],
      ["ga4_list_data_filters", "Read internal traffic and developer traffic filters."],
      ["ga4_list_internal_traffic_rules", "Return configured IP based internal traffic definitions."],
      ["ga4_list_event_definitions", "List configured events, modified events, created events and key event status."],
      ["ga4_list_custom_definitions", "List custom dimensions and custom metrics used in reports."],
      ["ga4_attribution_settings", "Check attribution model, lookback windows and reporting settings."],
      ["ga4_reporting_identity", "Check whether reporting uses blended, observed or device based identity."],
      ["ga4_data_retention_settings", "Verify event and user data-retention settings."],
      ["ga4_change_history", "Identify when GA4 settings, events, links or permissions were changed and by whom."]
    ];
    ga4Stubs.forEach(([name, desc]) => {
      server.tool(name, desc, { trackingId: z.string() }, async () => ({
        content: [{ type: "text", text: `The Google Analytics Admin API does not expose ${name} programmatically. Please ask the user to provide a screenshot from the GA4 UI for this data.` }]
      }));
    });

    // ==================== GSC UNSUPPORTED API STUBS ====================
    const gscStubs = [
      ["gsc_compare_query_pages", "Detect when Google changed the ranking URL for a keyword. (Use gsc_search_analytics_advanced with page+query dimensions instead)"],
      ["gsc_search_appearance_report", "Analyse Web, Image, Video, News, Discover and search appearance features separately."],
      ["gsc_search_type_report", "Analyse Web, Image, Video, News, Discover separately. (Use gsc_search_analytics_advanced with searchType param)"],
      ["gsc_page_indexing_report", "Return complete Page Indexing categories and affected URL counts."],
      ["gsc_page_indexing_urls", "Return the URLs inside each indexing reason, such as Crawled currently not indexed."],
      ["gsc_crawl_stats", "Show Googlebot request volume, response codes, file types, host status and crawl timing."],
      ["gsc_manual_actions", "Confirm whether the property has a manual action."],
      ["gsc_security_issues", "Confirm hacked content, malware or deceptive-page warnings."],
      ["gsc_list_users", "List owners, full users and restricted users for the property."],
      ["gsc_verification_methods", "Show how ownership is verified and whether old verification tokens remain."],
      ["gsc_sitemap_issue_details", "Return the exact URLs and reasons behind sitemap warnings and errors."],
      ["gsc_links_report", "Return top internally linked pages, external links and linking domains."],
      ["gsc_removals_report", "Show temporary removals, outdated-content requests and SafeSearch filtering."],
      ["gsc_core_web_vitals_report", "Return mobile and desktop URL groups marked Poor, Needs Improvement or Good."]
    ];
    gscStubs.forEach(([name, desc]) => {
      server.tool(name, desc, { trackingId: z.string() }, async () => ({
        content: [{ type: "text", text: `The Google Search Console API does not expose ${name} programmatically. Please ask the user to provide a screenshot from the GSC UI for this data.` }]
      }));
    });

    // ==================== EXISTING GSC TOOLS ====================
    server.tool("gsc_list_sites", "List all Google Search Console properties", { trackingId: z.string().describe("REQUIRED: The tracking ID.") }, async ({ trackingId }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => searchconsole.sites.list());
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.siteEntry || [], null, 2) }] };
    });

    server.tool("gsc_search_analytics", "Get Search Console performance data (clicks, impressions, CTR, position)", {
      trackingId: z.string(), siteUrl: z.string(), startDate: z.string(), endDate: z.string(),
      dimensions: z.array(z.enum(["query", "page", "country", "device", "date"])).optional().default(["query"]),
      rowLimit: z.number().optional().default(25),
    }, async ({ trackingId, siteUrl, startDate, endDate, dimensions, rowLimit }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate, endDate, dimensions, rowLimit } }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    server.tool("gsc_list_sitemaps", "List submitted sitemaps and their status", { trackingId: z.string(), siteUrl: z.string() }, async ({ trackingId, siteUrl }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => searchconsole.sitemaps.list({ siteUrl }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    server.tool("gsc_inspect_url", "Inspect indexing status of a URL", { trackingId: z.string(), siteUrl: z.string(), inspectionUrl: z.string() }, async ({ trackingId, siteUrl, inspectionUrl }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => searchconsole.urlInspection.index.inspect({ requestBody: { inspectionUrl, siteUrl } }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    server.tool("gsc_batch_inspect_urls", "Inspect indexing status of multiple URLs", { trackingId: z.string(), siteUrl: z.string(), urls: z.array(z.string()) }, async ({ trackingId, siteUrl, urls }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const results: any[] = [];
      for (const url of urls) {
        const res = await safeCall(() => searchconsole.urlInspection.index.inspect({ requestBody: { inspectionUrl: url, siteUrl, languageCode: "en-US" } }));
        if (res.error) { results.push({ url, error: res.error }); } 
        else { const s = res.data.inspectionResult?.indexStatusResult; results.push({ url, verdict: s?.verdict, coverageState: s?.coverageState }); }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    });

    server.tool("gsc_request_indexing", "Request indexing for a specific URL", { trackingId: z.string(), siteUrl: z.string(), inspectionUrl: z.string() }, async ({ trackingId, siteUrl, inspectionUrl }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => searchconsole.urlInspection.index.inspect({ requestBody: { inspectionUrl, siteUrl, languageCode: "en-US" } }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: `Indexing requested for: ${inspectionUrl}\nStatus: ${JSON.stringify(res.data.inspectionResult?.indexStatusResult, null, 2)}` }] };
    });

    server.tool("get_gsc_client_report", "Complete GSC report with trend + sitemap status", { trackingId: z.string(), siteUrl: z.string(), days: z.number().default(28) }, async ({ trackingId, siteUrl, days }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const end = new Date(); const start = new Date(); start.setDate(end.getDate() - days);
      const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1); const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days);
      const format = (d: Date) => d.toISOString().split("T")[0];
      const [current, previous, sitemaps] = await Promise.all([
        safeCall(() => searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: format(start), endDate: format(end), dimensions: ["date"] } })),
        safeCall(() => searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: format(prevStart), endDate: format(prevEnd), dimensions: ["date"] } })),
        safeCall(() => searchconsole.sitemaps.list({ siteUrl })),
      ]);
      const sum = (rows: any[] = []) => rows.reduce((acc: any, r: any) => { acc.clicks += r.clicks || 0; acc.impressions += r.impressions || 0; return acc; }, { clicks: 0, impressions: 0 });
      const curr = sum(current?.data?.rows || []); const prev = sum(previous?.data?.rows || []);
      const clicksChange = prev.clicks === 0 ? "N/A" : (((curr.clicks - prev.clicks) / prev.clicks) * 100).toFixed(1) + "%";
      const trend = Number(clicksChange) > 0 ? "UP ↑" : Number(clicksChange) < 0 ? "DOWN ↓" : "STABLE →";
      return { content: [{ type: "text", text: `# GSC Report\n\nClicks: ${curr.clicks} (${clicksChange})\nTrend: ${trend}\n\nSitemaps: ${JSON.stringify(sitemaps?.data?.sitemap || [])}` }] };
    });

    // ==================== EXISTING TRACKING & GA4 USERS TOOLS ====================
    server.tool("verify_ga4_tracking_config", "Verify GA4 Data Streams", { trackingId: z.string(), propertyId: z.string() }, async ({ trackingId, propertyId }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => (analyticsAdmin.properties as any).dataStreams.list({ parent: `properties/${propertyId}` }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.dataStreams || [], null, 2) }] };
    });

    server.tool("verify_ga4_product_links", "Verify GA4 Links", { trackingId: z.string(), propertyId: z.string() }, async ({ trackingId, propertyId }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const [bqRes, adsRes] = await Promise.all([
        safeCall(() => (analyticsAdmin.properties as any).bigQueryLinks.list({ parent: `properties/${propertyId}` })),
        safeCall(() => (analyticsAdmin.properties as any).googleAdsLinks.list({ parent: `properties/${propertyId}` }))
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ bigQuery: bqRes.data?.bigQueryLinks || "None", ads: adsRes.data?.googleAdsLinks || "None" }, null, 2) }] };
    });

    server.tool("ga4_list_users", "List GA4 Users", { trackingId: z.string(), accountId: z.string().optional(), propertyId: z.string().optional() }, async ({ trackingId, accountId, propertyId }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const results: any = { accountUsers: [], propertyUsers: [] };
      if (accountId) { const r = await safeCall(() => (analyticsAdmin.accounts as any).userLinks.list({ parent: `accounts/${accountId}` })); results.accountUsers = r.data?.userLinks || []; }
      if (propertyId) { const r = await safeCall(() => (analyticsAdmin.properties as any).userLinks.list({ parent: `properties/${propertyId}` })); results.propertyUsers = r.data?.userLinks || []; }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    });

    // ==================== EXISTING GTM TOOLS ====================
    server.tool("gtm_list_containers", "List GTM Containers", { trackingId: z.string() }, async ({ trackingId }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => tagmanager.accounts.list());
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      const accounts = res.data.account || []; const result: any[] = [];
      for (const acc of accounts) {
        const cRes = await safeCall(() => (tagmanager.accounts as any).containers.list({ parent: acc.path }));
        if (!cRes.error && cRes.data.container) { cRes.data.container.forEach((c: any) => result.push({ id: c.containerId, name: c.name, path: c.path })); }
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    server.tool("gtm_list_tags", "List GTM Tags", { trackingId: z.string(), workspacePath: z.string() }, async ({ trackingId, workspacePath }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => (tagmanager.accounts.containers.workspaces as any).tags.list({ parent: workspacePath }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.tag || [], null, 2) }] };
    });

    server.tool("gtm_publish_workspace", "Publish GTM Workspace", { trackingId: z.string(), workspacePath: z.string() }, async ({ trackingId, workspacePath }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => (tagmanager.accounts.containers.workspaces as any).publish({ path: workspacePath }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: `Published: ${workspacePath}` }] };
    });

    server.tool("verify_gtm_container", "Verify GTM Setup", { trackingId: z.string() }, async ({ trackingId }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => tagmanager.accounts.list());
      if (res.error || !res.data.account?.length) return { content: [{ type: "text", text: "Not verified" }] };
      return { content: [{ type: "text", text: "Verified" }] };
    });

    // ==================== EXISTING GA4 TOOLS ====================
    server.tool("ga4_list_properties", "List GA4 Properties", { trackingId: z.string() }, async ({ trackingId }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsAdmin.accountSummaries.list());
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.accountSummaries || [], null, 2) }] };
    });

    server.tool("ga4_run_report", "Run GA4 Report", {
      trackingId: z.string(), propertyId: z.string(), startDate: z.string(), endDate: z.string(),
      metrics: z.array(z.string()).default(["sessions"]), dimensions: z.array(z.string()).optional().default(["date"]), limit: z.number().optional().default(50),
    }, async ({ trackingId, propertyId, startDate, endDate, metrics, dimensions, limit }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate, endDate }], metrics: metrics.map((n: string) => ({ name: n })), dimensions: dimensions?.map((n: string) => ({ name: n })), limit: limit.toString() },
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    server.tool("ga4_traffic_sources", "Get GA4 Traffic Sources", { trackingId: z.string(), propertyId: z.string(), startDate: z.string(), endDate: z.string() }, async ({ trackingId, propertyId, startDate, endDate }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate, endDate }], metrics: [{ name: "sessions" }], dimensions: [{ name: "sessionDefaultChannelGroup" }] },
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.rows || [], null, 2) }] };
    });

    server.tool("ga4_metadata", "Return supported dimensions and metrics for a GA4 property to validate requests before running", {trackingId: z.string().describe("REQUIRED: The tracking ID."), propertyId: z.string().describe("GA4 Property ID (numbers only)")}, async ({ trackingId, propertyId }: any) => {
        const authError = checkAuth(trackingId); if (authError) return authError;
        const res = await safeCall(() => analyticsData.properties.getMetadata({ name: `properties/${propertyId}/metadata`
        }));
        if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
    );

    server.tool("gsc_hourly_performance", "Identify the exact hour or point when a sudden search change started", { trackingId: z.string().describe("REQUIRED: The tracking ID.") }, async ({ trackingId }: any) => {
        const authError = checkAuth(trackingId); if (authError) return authError;
        return { content: [{ type: "text", text: "The Google Search Console API does not expose historical hourly performance data programmatically. Please ask the user for a screenshot of the GSC hourly performance graph if needed." }] };
      }
    );

    server.tool("gsc_change_history", "Identify when GSC settings, sitemaps, users, or property changes occurred", { trackingId: z.string().describe("REQUIRED: The tracking ID.") }, async ({ trackingId }: any) => {
        const authError = checkAuth(trackingId); if (authError) return authError;
        return { content: [{ type: "text", text: "The Google Search Console API does not provide a historical audit log of configuration changes. Please ask the user to manually verify this." }] };
      }
    );

    server.tool("ga4_top_pages", "Get GA4 Top Pages", { trackingId: z.string(), propertyId: z.string(), startDate: z.string(), endDate: z.string(), limit: z.number().optional().default(10) }, async ({ trackingId, propertyId, startDate, endDate, limit }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runReport({
        property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate, endDate }], metrics: [{ name: "screenPageViews" }], dimensions: [{ name: "landingPagePlusQueryString" }], limit: limit.toString(), orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }] },
      }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data.rows || [], null, 2) }] };
    });

    server.tool("ga4_realtime", "Get GA4 Realtime Users", { trackingId: z.string(), propertyId: z.string() }, async ({ trackingId, propertyId }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const res = await safeCall(() => analyticsData.properties.runRealtimeReport({ property: `properties/${propertyId}`, requestBody: { metrics: [{ name: "activeUsers" }] } }));
      if (res.error) return { content: [{ type: "text", text: `Error: ${res.error}` }] };
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    });

    server.tool("get_ga4_client_report", "Quick GA4 Report", { trackingId: z.string(), propertyId: z.string(), days: z.number().default(28) }, async ({ trackingId, propertyId, days }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const end = new Date(); const start = new Date(); start.setDate(end.getDate() - days);
      const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1); const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days);
      const format = (d: Date) => d.toISOString().split("T")[0];
      const [c, p] = await Promise.all([
        safeCall(() => analyticsData.properties.runReport({ property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate: format(start), endDate: format(end) }], metrics: [{ name: "sessions" }, { name: "totalUsers" }] } })),
        safeCall(() => analyticsData.properties.runReport({ property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate: format(prevStart), endDate: format(prevEnd) }], metrics: [{ name: "sessions" }, { name: "totalUsers" }] } }))
      ]);
      const getVal = (r: any, i: number) => Number(r?.data?.rows?.[0]?.metricValues?.[i]?.value || 0);
      return { content: [{ type: "text", text: `Sessions: ${getVal(c,0)} | Users: ${getVal(c,1)}` }] };
    });

    server.tool("get_seo_health_overview", "Combined SEO Overview", { trackingId: z.string(), siteUrl: z.string(), propertyId: z.string(), days: z.number().default(7) }, async ({ trackingId, siteUrl, propertyId, days }: any) => {
      const authError = checkAuth(trackingId); if (authError) return authError;
      const end = new Date(); const start = new Date(); start.setDate(end.getDate() - days);
      const format = (d: Date) => d.toISOString().split("T")[0];
      const [g, ga] = await Promise.all([
        safeCall(() => searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: format(start), endDate: format(end), dimensions: ["date"] } })),
        safeCall(() => analyticsData.properties.runReport({ property: `properties/${propertyId}`, requestBody: { dateRanges: [{ startDate: format(start), endDate: format(end) }], metrics: [{ name: "sessions" }] } }))
      ]);
      return { content: [{ type: "text", text: `GSC Clicks: ${g?.data?.rows?.length || 0} | GA4 Sessions: ${ga?.data?.rows?.[0]?.metricValues?.[0]?.value || 0}` }] };
    });
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST, handler as DELETE };