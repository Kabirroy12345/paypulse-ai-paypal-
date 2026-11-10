import { NextRequest } from "next/server";
import { getSession, jsonWithSession, resetSession } from "@/lib/deal-store";
import { errorResponse } from "@/lib/http";

/** Reset THIS session's contracts back to the built-in demo data. */
export async function POST(req: NextRequest) {
  try {
    const { sid } = getSession(req);
    const session = resetSession(sid);
    return jsonWithSession(req, sid, {
      deals: session.deals,
      telemetry: session.telemetry,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
