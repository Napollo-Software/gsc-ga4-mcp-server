# GSC GA4 MCP Server

## Value Proposition

Enable the Napollo SEO team to identify which connected client accounts have
meaningful organic search, analytics, conversion, or tracking issues through a
single ChatGPT command.

Core actions:

1. List accessible Search Console and GA4 properties.
2. Scan all mapped accounts and prioritize detected issues.
3. Diagnose one account and identify the pages or metrics responsible.

## Architecture

- TypeScript and Next.js on Vercel
- Remote MCP endpoint at `/mcp`
- Vercel OIDC to Google Workload Identity Federation
- Google Search Console API
- Google Analytics Data API
- Google Analytics Admin API
- Read-only tools with no Google mutations
- Headless version 1 with native ChatGPT presentation

## Tools

- `list-accounts`
- `scan-all-accounts`
- `diagnose-account`
- `get-losing-pages`
- `check-tracking-status`

## Analysis Rules

- Latest complete 28 days versus preceding 28 complete days by default
- Critical at a meaningful decline of 35 percent or more
- Warning at a meaningful decline of 20 to less than 35 percent
- Healthy when no monitored metric crosses the warning threshold
- Ignore percentage-based flags when the baseline is too small

## Safety

- Read-only Google scopes
- No permanent Google key
- Bearer-protected MCP endpoint
- Aggregate reporting data only
- Account and request limits
