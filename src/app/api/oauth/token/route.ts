import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json({
    access_token: "gsc-ga4-access-token-static",
    token_type: "bearer",
    expires_in: 2592000, // 30 days
    refresh_token: "gsc-ga4-refresh-token-static",
  });
}