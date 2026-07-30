import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state") || "";
  const clientId = url.searchParams.get("client_id");

  if (!redirectUri) {
    return NextResponse.json({ error: "missing redirect_uri" }, { status: 400 });
  }

  // Simple auto-approve (kyunki real Google auth pehle se server pe hai)
  const code = "gsc-ga4-auth-code-" + Date.now();

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return NextResponse.redirect(redirect.toString());
}