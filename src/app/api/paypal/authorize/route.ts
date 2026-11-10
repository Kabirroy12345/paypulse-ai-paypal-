import { NextRequest } from "next/server";
import { ensureOrderAuthorization, resolvePayPalCredentials } from "@/lib/paypal-server";
import { validateDealId } from "@/lib/validation";
import {
  addTelemetry,
  findDeal,
  getSession,
  jsonWithSession,
  saveDeal,
  tryLock,
  unlock,
} from "@/lib/deal-store";
import { HttpError, errorResponse, readJson, readRuntimeCredentials } from "@/lib/http";
import { AgentTelemetryEvent } from "@/types/paypulse";

/**
 * After the buyer approves the hold in PayPal (Smart Buttons or the approval link), exchange it for a real
 * authorization id. Only meaningful for live-sandbox contracts; simulated contracts have no PayPal order.
 */
export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const { sid, session } = getSession(req);
  let lockedId: string | null = null;
  try {
    const body = (await readJson(req, 8_000)) as Record<string, unknown>;
    const dealId = validateDealId(body.dealId);
    const stored = findDeal(session, dealId);
    if (!stored) throw new HttpError(404, "Contract not found in this session");
    if (stored.isDemoSeed || stored.paypalMode !== "LIVE_SANDBOX") {
      throw new HttpError(409, "This contract is simulated and has no PayPal order to authorize");
    }
    if (stored.status === "CAPTURED_AND_SPLIT_PAID") {
      throw new HttpError(409, "This contract has already been captured");
    }
    if (!tryLock(session, dealId)) {
      throw new HttpError(409, "Another action is already running for this contract");
    }
    lockedId = dealId;

    const runtime = readRuntimeCredentials(body);
    if (!resolvePayPalCredentials(runtime).hasLiveSandbox) {
      throw new HttpError(409, "PayPal sandbox credentials are not configured on the server");
    }

    const result = await ensureOrderAuthorization({ orderId: stored.paypalOrderId, runtime });
    const now = new Date().toTimeString().slice(0, 8);

    if (result.state === "NEEDS_BUYER_APPROVAL") {
      throw new HttpError(
        409,
        `The PayPal order is ${result.orderStatus}. The buyer must approve it first${
          result.approvalUrl ? ` (open ${result.approvalUrl})` : ""
        }.`
      );
    }

    const deal = {
      ...stored,
      paypalAuthorizationId: result.authorizationId,
      auditTrail: [
        {
          id: `at-auth-${Date.now()}`,
          timestamp: now,
          actor: "PAYPAL_AGENT_TOOLKIT" as const,
          action: `Buyer approved the hold. PayPal authorization ${result.authorizationId} is active for $${stored.aiNegotiatedUsd.toFixed(2)}.`,
          status: "PASS" as const,
        },
        ...stored.auditTrail,
      ],
      updatedAt: "Just now",
    };
    saveDeal(session, deal);
    const telemetry: AgentTelemetryEvent = {
      id: `tel-${Date.now()}`,
      timestamp: now,
      agentName: "PayPal-Agent-Toolkit",
      action: "Hold approved and authorized",
      endpoint: "POST /v2/checkout/orders/{id}/authorize",
      contractCode: stored.contractCode,
      status: "SUCCESS",
      latencyMs: Date.now() - startMs,
      details: `Authorization ${result.authorizationId} on order ${stored.paypalOrderId}.`,
    };
    addTelemetry(session, telemetry);
    return jsonWithSession(req, sid, { deal, telemetry });
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (lockedId) unlock(session, lockedId);
  }
}
