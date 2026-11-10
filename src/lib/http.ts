import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { PayPalApiError } from "@/lib/paypal-server";
import { ValidationError } from "@/lib/validation";

/** Parse a JSON POST body. Rejects non-JSON content types (blocks cross-site form posts) and oversized bodies. */
export async function readJson(req: NextRequest, maxBytes: number): Promise<unknown> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ValidationError({ body: "must be valid JSON" });
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: 400 });
  }
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof PayPalApiError) {
    return NextResponse.json(
      { error: e.message, stage: e.stage, captureId: e.captureId },
      { status: e.status }
    );
  }
  console.error("[paypulse] unhandled error", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** Public base URL used for PayPal return/cancel links. Prefer APP_BASE_URL; fall back to the request's own origin. */
export function getBaseUrl(req: NextRequest): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}`;
}

/** Pull optional browser-supplied credentials out of a request body (only honoured when allowed server-side). */
export function readRuntimeCredentials(body: unknown): {
  paypalClientId?: string;
  paypalClientSecret?: string;
  geminiApiKey?: string;
} | undefined {
  const rt = (body as { runtime?: Record<string, unknown> } | null)?.runtime;
  if (!rt || typeof rt !== "object") return undefined;
  const pick = (v: unknown) => (typeof v === "string" && v.length <= 300 ? v : undefined);
  return {
    paypalClientId: pick(rt.paypalClientId),
    paypalClientSecret: pick(rt.paypalClientSecret),
    geminiApiKey: pick(rt.geminiApiKey),
  };
}
