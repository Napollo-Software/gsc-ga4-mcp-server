# GSC + GA4 MCP Server

A read-only Vercel Native MCP server that lets ChatGPT identify Google Search
Console and GA4 account issues.

## Tools

- `list-accounts`
- `scan-all-accounts`
- `diagnose-account`
- `get-losing-pages`
- `check-tracking-status`

## Requirements

- Node.js 20 or newer
- A Vercel project linked to this repository
- Google Search Console API enabled
- Google Analytics Data API enabled
- Google Analytics Admin API enabled
- A Google service account added to the required GSC and GA4 properties
- Vercel OIDC connected through Google Workload Identity Federation

## Environment variables

Copy `.env.example` and configure these values in Vercel:

| Variable | Purpose |
| --- | --- |
| `GCP_PROJECT_NUMBER` | Numeric Google Cloud project number |
| `GCP_SERVICE_ACCOUNT_EMAIL` | Service account to impersonate |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | Google workload identity pool ID |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | Vercel OIDC provider ID |
| `MCP_BEARER_TOKEN` | Long random token protecting `/mcp` |
| `ACCOUNT_MAP_JSON` | GSC and GA4 account pairs |

Example account map:

```json
[
  {
    "id": "example",
    "name": "Example Site",
    "gscSiteUrl": "sc-domain:example.com",
    "ga4PropertyId": "123456789"
  }
]
```

For a URL-prefix Search Console property, preserve the complete URL:

```json
[
  {
    "id": "example",
    "name": "Example Site",
    "gscSiteUrl": "https://www.example.com/",
    "ga4PropertyId": "123456789"
  }
]
```

## Local validation

Install dependencies:

```bash
npm install
```

Run tests and type checking:

```bash
npm test
npm run type-check
npm run build
```

Google calls use Application Default Credentials outside Vercel. Unit tests do
not require Google credentials.

## Deploy

1. Push all files to the root of the GitHub repository.
2. Import the repository into Vercel with the framework preset set to Next.js
   or allow Vercel to detect it.
3. Add all environment variables.
4. Enable Vercel OIDC for the project.
5. Complete Google Workload Identity Federation.
6. Deploy.

The MCP URL will be:

```text
https://YOUR-PROJECT.vercel.app/mcp
```

The landing page is:

```text
https://YOUR-PROJECT.vercel.app/
```

## ChatGPT connection

Create a custom app in ChatGPT and enter the `/mcp` URL. Configure bearer
authentication with the same value used for `MCP_BEARER_TOKEN`.

Start with:

```text
List my configured GSC and GA4 accounts.
```

Then run:

```text
Scan all accounts and tell me which ones have issues.
```

## Security notes

- Never commit `.env`, service account JSON, or access tokens.
- Production requests fail closed when `MCP_BEARER_TOKEN` is missing.
- The Google scopes are read only.
- Rotate the MCP bearer token if it is ever exposed.
- Restrict the Google workload identity provider to the intended Vercel
  project and production environment.
