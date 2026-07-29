import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getAccounts, getLimits, resolveAccount } from "@/lib/config";
import { comparisonRanges } from "@/lib/dates";
import { getLosingPages, listGoogleProperties } from "@/lib/google";
import { checkTracking, diagnoseAccount, scanAccount } from "@/lib/monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function errorResult(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected server error.";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list-accounts",
      {
        title: "List Google Accounts",
        description:
          "List configured account pairs and Google Search Console and GA4 properties accessible to the server.",
        inputSchema: z.object({}),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async () => {
        try {
          const [accessible, configured] = await Promise.all([
            listGoogleProperties(),
            Promise.resolve(getAccounts()),
          ]);
          return textResult({
            configuredAccounts: configured,
            accessibleProperties: accessible,
          });
        } catch (error) {
          return errorResult(error);
        }
      },
    );

    server.registerTool(
      "scan-all-accounts",
      {
        title: "Scan All Accounts",
        description:
          "Compare the latest complete period with the preceding period for every configured GSC and GA4 account and prioritize detected issues.",
        inputSchema: z.object({
          days: z
            .number()
            .int()
            .min(7)
            .max(90)
            .optional()
            .describe("Days per comparison period. Defaults to 28."),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async ({ days }) => {
        try {
          const limits = getLimits();
          const accounts = getAccounts();
          if (accounts.length > limits.maxAccounts) {
            throw new Error(
              `Configured account count exceeds MAX_ACCOUNTS_PER_SCAN (${limits.maxAccounts}).`,
            );
          }
          const comparisonDays = days ?? limits.defaultDays;
          const results = [];
          for (const account of accounts) {
            const result = await scanAccount(account, comparisonDays);
            results.push(result.health);
          }
          const severityOrder = { critical: 0, warning: 1, healthy: 2 };
          results.sort(
            (a, b) =>
              severityOrder[a.severity] - severityOrder[b.severity],
          );
          return textResult({
            comparison: comparisonRanges(comparisonDays),
            accountsScanned: results.length,
            results,
          });
        } catch (error) {
          return errorResult(error);
        }
      },
    );

    server.registerTool(
      "diagnose-account",
      {
        title: "Diagnose Account",
        description:
          "Diagnose one configured account using GSC clicks, impressions, CTR, position, GA4 organic traffic, key events, and losing pages.",
        inputSchema: z.object({
          accountId: z.string().min(1),
          days: z.number().int().min(7).max(90).optional(),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async ({ accountId, days }) => {
        try {
          const account = resolveAccount(accountId);
          const result = await diagnoseAccount(
            account,
            days ?? getLimits().defaultDays,
          );
          return textResult(result);
        } catch (error) {
          return errorResult(error);
        }
      },
    );

    server.registerTool(
      "get-losing-pages",
      {
        title: "Get Losing Pages",
        description:
          "Return pages with the largest absolute GSC click decline for one configured account.",
        inputSchema: z.object({
          accountId: z.string().min(1),
          days: z.number().int().min(7).max(90).optional(),
          limit: z.number().int().min(1).max(50).default(10),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async ({ accountId, days, limit }) => {
        try {
          const account = resolveAccount(accountId);
          const ranges = comparisonRanges(days ?? getLimits().defaultDays);
          const pages = await getLosingPages(
            account,
            ranges.current,
            ranges.previous,
            limit,
          );
          return textResult({ accountId: account.id, ranges, pages });
        } catch (error) {
          return errorResult(error);
        }
      },
    );

    server.registerTool(
      "check-tracking-status",
      {
        title: "Check Tracking Status",
        description:
          "Check for an obvious mismatch between recent GSC clicks and GA4 organic traffic for one account.",
        inputSchema: z.object({
          accountId: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async ({ accountId }) => {
        try {
          return textResult(await checkTracking(resolveAccount(accountId)));
        } catch (error) {
          return errorResult(error);
        }
      },
    );
  },
  {
    serverInfo: {
      name: "gsc-ga4-mcp-server",
      version: "0.1.0",
    },
  },
  {
    basePath: "/",
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

function authorized(request: Request): boolean {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";
  const received = request.headers.get("authorization");
  return received === `Bearer ${expected}`;
}

async function protectedHandler(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer realm="gsc-ga4-mcp"' },
      },
    );
  }
  return handler(request);
}

export {
  protectedHandler as GET,
  protectedHandler as POST,
  protectedHandler as DELETE,
};
