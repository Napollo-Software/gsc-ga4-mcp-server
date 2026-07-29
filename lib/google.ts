import type { AuthClient } from "google-auth-library";
import { getGoogleAuthClient } from "./auth";
import type {
  AccountConfig,
  DateRange,
  LosingPage,
} from "./types";

type GscSitesResponse = {
  siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
};

type GscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type GscQueryResponse = {
  rows?: GscRow[];
};

type GaAccountSummariesResponse = {
  accountSummaries?: Array<{
    account?: string;
    displayName?: string;
    propertySummaries?: Array<{
      property?: string;
      displayName?: string;
      propertyType?: string;
    }>;
  }>;
  nextPageToken?: string;
};

type GaRunReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

async function request<T>(
  client: AuthClient,
  options: {
    url: string;
    method?: "GET" | "POST";
    data?: unknown;
  },
): Promise<T> {
  const response = await client.request<T>({
    url: options.url,
    method: options.method ?? "GET",
    data: options.data,
  });
  return response.data;
}

export async function listGoogleProperties() {
  const client = await getGoogleAuthClient();
  const gsc = await request<GscSitesResponse>(client, {
    url: "https://searchconsole.googleapis.com/webmasters/v3/sites",
  });

  const ga4Properties: Array<{
    propertyId: string;
    propertyName: string;
    accountName: string;
  }> = [];

  let pageToken: string | undefined;
  do {
    const url = new URL(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    );
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const page = await request<GaAccountSummariesResponse>(client, {
      url: url.toString(),
    });

    for (const account of page.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        const propertyId = property.property?.replace("properties/", "");
        if (!propertyId) continue;
        ga4Properties.push({
          propertyId,
          propertyName: property.displayName ?? propertyId,
          accountName: account.displayName ?? account.account ?? "Unknown",
        });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return {
    searchConsole: (gsc.siteEntry ?? []).map((site) => ({
      siteUrl: site.siteUrl ?? "",
      permissionLevel: site.permissionLevel ?? "unknown",
    })),
    ga4: ga4Properties,
  };
}

export async function getGscTotals(
  siteUrl: string,
  range: DateRange,
): Promise<{ clicks: number; impressions: number; ctr: number; position: number }> {
  const client = await getGoogleAuthClient();
  const data = await request<GscQueryResponse>(client, {
    url:
      "https://searchconsole.googleapis.com/webmasters/v3/sites/" +
      `${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    method: "POST",
    data: {
      startDate: range.startDate,
      endDate: range.endDate,
      type: "web",
      dataState: "final",
      rowLimit: 1,
    },
  });
  const row = data.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

export async function getGa4OrganicTotals(
  propertyId: string,
  range: DateRange,
): Promise<{ activeUsers: number; sessions: number; keyEvents: number }> {
  const client = await getGoogleAuthClient();
  const data = await request<GaRunReportResponse>(client, {
    url:
      `https://analyticsdata.googleapis.com/v1beta/properties/` +
      `${encodeURIComponent(propertyId)}:runReport`,
    method: "POST",
    data: {
      dateRanges: [range],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "keyEvents" },
      ],
      dimensionFilter: {
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: {
            matchType: "EXACT",
            value: "Organic Search",
            caseSensitive: false,
          },
        },
      },
      limit: "1",
    },
  });
  const values = data.rows?.[0]?.metricValues ?? [];
  return {
    activeUsers: Number(values[0]?.value ?? 0),
    sessions: Number(values[1]?.value ?? 0),
    keyEvents: Number(values[2]?.value ?? 0),
  };
}

async function getGscPages(
  siteUrl: string,
  range: DateRange,
  rowLimit = 250,
): Promise<Map<string, number>> {
  const client = await getGoogleAuthClient();
  const data = await request<GscQueryResponse>(client, {
    url:
      "https://searchconsole.googleapis.com/webmasters/v3/sites/" +
      `${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    method: "POST",
    data: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ["page"],
      type: "web",
      dataState: "final",
      rowLimit,
    },
  });

  return new Map(
    (data.rows ?? [])
      .filter((row) => row.keys?.[0])
      .map((row) => [row.keys?.[0] ?? "", row.clicks ?? 0]),
  );
}

export async function getLosingPages(
  account: AccountConfig,
  current: DateRange,
  previous: DateRange,
  limit: number,
): Promise<LosingPage[]> {
  const [currentPages, previousPages] = await Promise.all([
    getGscPages(account.gscSiteUrl, current),
    getGscPages(account.gscSiteUrl, previous),
  ]);

  const pages = new Set([...currentPages.keys(), ...previousPages.keys()]);
  return [...pages]
    .map((page) => {
      const currentClicks = currentPages.get(page) ?? 0;
      const previousClicks = previousPages.get(page) ?? 0;
      const clickLoss = previousClicks - currentClicks;
      const percentChange =
        previousClicks > 0
          ? Number(
              (((currentClicks - previousClicks) / previousClicks) * 100).toFixed(
                1,
              ),
            )
          : null;
      return {
        page,
        currentClicks,
        previousClicks,
        clickLoss,
        percentChange,
      };
    })
    .filter((page) => page.clickLoss > 0)
    .sort((a, b) => b.clickLoss - a.clickLoss)
    .slice(0, limit);
}
