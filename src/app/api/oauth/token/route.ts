import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Grok code exchange karega, hum fixed access token de denge
  const accessToken = "gsc-ga4-access-token-static";

  return NextResponse.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600 * 24 * 30, // 30 days
    refresh_token: "gsc-ga4-refresh-token-static",
  });
}