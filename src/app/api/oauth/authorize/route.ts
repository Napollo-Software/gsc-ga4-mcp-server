import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state") || "";

    if (!redirectUri) {
      return NextResponse.json(
        { error: "missing_redirect_uri" },
        { status: 400 }
      );
    }

    // Simple code generate karo (PKCE ignore for now)
    const code = "gscga4-" + Date.now() + "-" + Math.random().toString(36).slice(2);

    const redirect = new URL(redirectUri);
    redirect.searchParams.set("code", code);
    if (state) {
      redirect.searchParams.set("state", state);
    }

    return NextResponse.redirect(redirect.toString());
  } catch (error) {
    console.error("Authorize error:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}