import { getVercelOidcToken } from "@vercel/oidc";
import {
  ExternalAccountClient,
  GoogleAuth,
  type AuthClient,
} from "google-auth-library";
import { requireEnv } from "./config";

const scopes = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

let cachedClient: AuthClient | null = null;

export async function getGoogleAuthClient(): Promise<AuthClient> {
  if (cachedClient) return cachedClient;

  if (process.env.VERCEL) {
    const projectNumber = requireEnv("GCP_PROJECT_NUMBER");
    const poolId = requireEnv("GCP_WORKLOAD_IDENTITY_POOL_ID");
    const providerId = requireEnv("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");
    const serviceAccountEmail = requireEnv("GCP_SERVICE_ACCOUNT_EMAIL");

    const client = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience:
        `//iam.googleapis.com/projects/${projectNumber}` +
        `/locations/global/workloadIdentityPools/${poolId}` +
        `/providers/${providerId}`,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url:
        "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
        `${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: getVercelOidcToken,
      },
      scopes,
    });

    if (!client) {
      throw new Error("Could not create the Google external account client.");
    }
    cachedClient = client;
    return cachedClient;
  }

  const auth = new GoogleAuth({ scopes });
  cachedClient = await auth.getClient();
  return cachedClient;
}
