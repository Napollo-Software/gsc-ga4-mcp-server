server.tool(
  "get_gsc_client_report",
  "Get complete Search Console health report for a client (trend + sitemap + issues)",
  {
    site: z.string().describe("Site URL or sc-domain:example.com"),
    days: z.number().default(28).describe("Number of days to analyze"),
  },
  async ({ site, days }) => {
    // 1. Get performance data (current vs previous period)
    // 2. Get sitemaps list + status
    // 3. Get indexing/coverage issues if available
    // 4. Build clean report
    return {
      content: [{ type: "text", text: markdownReport }]
    };
  }
);