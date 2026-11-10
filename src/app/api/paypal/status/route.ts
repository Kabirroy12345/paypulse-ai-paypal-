import { NextRequest, NextResponse } from "next/server";
import { getPayPalAccessToken, resolvePayPalCredentials } from "@/lib/paypal-server";
import { resolveGeminiKey } from "@/lib/gemini-agents";
import { RuntimeCredentials } from "@/types/paypulse";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { runtime?: RuntimeCredentials };
    const runtime = body.runtime;

    const { clientId, hasLiveSandbox } = resolvePayPalCredentials(runtime);
    const geminiKey = resolveGeminiKey(runtime);

    let paypalTokenVerified = false;
    if (hasLiveSandbox) {
      const token = await getPayPalAccessToken(runtime);
      paypalTokenVerified = Boolean(token);
    }

    return NextResponse.json({
      paypalConfigured: hasLiveSandbox,
      paypalTokenVerified,
      paypalClientIdPreview: clientId ? `${clientId.slice(0, 8)}...` : null,
      geminiConfigured: Boolean(geminiKey),
      environment: "sandbox.paypal.com",
      geminiModel: "gemini-3.8-flash",
    });
  } catch {
    return NextResponse.json({
      paypalConfigured: false,
      paypalTokenVerified: false,
      geminiConfigured: false,
      environment: "sandbox.paypal.com",
      geminiModel: "gemini-3.8-flash",
    });
  }
}
