import { NextRequest } from "next/server";
import { getSession, jsonWithSession } from "@/lib/deal-store";
import { errorResponse } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const { sid, session } = getSession(req);
    return jsonWithSession(req, sid, {
      deals: session.deals,
      telemetry: session.telemetry,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
