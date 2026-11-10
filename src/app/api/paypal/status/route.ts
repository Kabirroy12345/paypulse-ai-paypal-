import { NextRequest, NextResponse } from "next/server";
import {
  allowRuntimeCredentials,
  getPayPalAccessToken,
  resolvePayPalCredentials,
  resolvePayPalEnvironment,
} from "@/lib/paypal-server";
import { resolveGeminiKey } from "@/lib/gemini-agents";
import { readJson, readRuntimeCredentials } from "@/lib/http";

export async function POST(req: NextRequest) {
  const env = resolvePayPalEnvironment();
  try {
    const body = await readJson(req, 4_000).catch(() => ({}));
    const runtime = readRuntimeCredentials(body);

    const { clientId, hasLiveSandbox } = resolvePayPalCredentials(runtime);
    const geminiKey = resolveGeminiKey(runtime);

    let paypalTokenVerified = false;
    if (hasLiveSandbox && env.isSupportedSandbox) {
      paypalTokenVerified = Boolean(await getPayPalAccessToken(runtime));
    }

    return NextResponse.json({
      paypalConfigured: hasLiveSandbox,
      paypalTokenVerified,
      paypalClientIdPreview: clientId ? `${clientId.slice(0, 8)}...` : null,
      geminiConfigured: Boolean(geminiKey),
      allowRuntimeCredentials: allowRuntimeCredentials(),
      environment: env.isSupportedSandbox ? "sandbox.paypal.com" : `unsupported (${env.environment})`,
      paypalEnvironmentValid: env.isSupportedSandbox,
      geminiModel: "gemini-3.8-flash",
    });
  } catch {
    return NextResponse.json({
      paypalConfigured: false,
      paypalTokenVerified: false,
      geminiConfigured: false,
      allowRuntimeCredentials: allowRuntimeCredentials(),
      environment: env.isSupportedSandbox ? "sandbox.paypal.com" : `unsupported (${env.environment})`,
      paypalEnvironmentValid: env.isSupportedSandbox,
      geminiModel: "gemini-3.8-flash",
    });
  }
}
