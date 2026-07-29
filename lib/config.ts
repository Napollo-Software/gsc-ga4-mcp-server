import { z } from "zod";
import type { AccountConfig } from "./types";

const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  gscSiteUrl: z.string().min(1),
  ga4PropertyId: z.string().regex(/^\d+$/, "GA4 property ID must be numeric"),
});

const accountMapSchema = z.array(accountSchema);

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function getAccounts(): AccountConfig[] {
  const raw = process.env.ACCOUNT_MAP_JSON;
  if (!raw) {
    throw new Error(
      "ACCOUNT_MAP_JSON is missing. Add at least one GSC/GA4 account pair.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ACCOUNT_MAP_JSON is not valid JSON.");
  }

  const result = accountMapSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`ACCOUNT_MAP_JSON is invalid: ${result.error.message}`);
  }

  const seen = new Set<string>();
  for (const account of result.data) {
    const normalized = account.id.toLowerCase();
    if (seen.has(normalized)) {
      throw new Error(`Duplicate account id: ${account.id}`);
    }
    seen.add(normalized);
  }

  return result.data;
}

export function resolveAccount(accountId: string): AccountConfig {
  const normalized = accountId.trim().toLowerCase();
  const account = getAccounts().find(
    (item) =>
      item.id.toLowerCase() === normalized ||
      item.name.toLowerCase() === normalized ||
      item.gscSiteUrl.toLowerCase() === normalized ||
      item.ga4PropertyId === normalized,
  );

  if (!account) {
    throw new Error(
      `Unknown account "${accountId}". Call list-accounts to see configured IDs.`,
    );
  }
  return account;
}

export function getLimits() {
  return {
    defaultDays: positiveInteger("DEFAULT_COMPARISON_DAYS", 28),
    maxAccounts: positiveInteger("MAX_ACCOUNTS_PER_SCAN", 25),
    minBaseline: positiveInteger("MIN_BASELINE", 20),
  };
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}
