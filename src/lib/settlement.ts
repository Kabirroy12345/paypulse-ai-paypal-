import "server-only";
import {
  AgentTelemetryEvent,
  EscrowDeal,
  RuntimeCredentials,
} from "@/types/paypulse";
import {
  PayPalApiError,
  captureAndSplitPayoutPayPal,
  ensureOrderAuthorization,
} from "@/lib/paypal-server";

/**
 * Capture the authorization and release the split payout for a deal.
 * Callers must have already checked the stored deal's status and gate results.
 * Demo contracts and contracts created without PayPal credentials are SIMULATED and never call PayPal.
 */
export async function settleDeal(params: {
  deal: EscrowDeal;
  via: "HUMAN" | "AUTO";
  runtime?: RuntimeCredentials;
  startMs: number;
  /** Persist partial progress (authorization id, capture id) so a retry never double-captures. */
  persist: (partial: EscrowDeal) => void;
}): Promise<{ deal: EscrowDeal; telemetry: AgentTelemetryEvent }> {
  const { via, runtime, startMs, persist } = params;
  let deal = params.deal;
  const now = new Date().toTimeString().slice(0, 8);
  const simulate = deal.isDemoSeed || deal.paypalMode !== "LIVE_SANDBOX";

  if (!simulate && !deal.paypalAuthorizationId) {
    const auth = await ensureOrderAuthorization({ orderId: deal.paypalOrderId, runtime });
    if (auth.state === "NEEDS_BUYER_APPROVAL") {
      throw new PayPalApiError(
        "authorize",
        `The buyer has not approved the PayPal hold yet (order status ${auth.orderStatus}). Open the Sandbox approval link, approve the payment, then try again.`,
        409
      );
    }
    deal = { ...deal, paypalAuthorizationId: auth.authorizationId };
    persist(deal);
  }

  let settlement;
  try {
    settlement = await captureAndSplitPayoutPayPal({
      orderId: deal.paypalOrderId,
      authorizationId: deal.paypalAuthorizationId,
      existingCaptureId: deal.paypalCaptureId,
      contractCode: deal.contractCode,
      totalAmountUsd: deal.aiNegotiatedUsd,
      splitRecipients: deal.splitRecipients,
      simulate,
      runtime,
    });
  } catch (e) {
    if (e instanceof PayPalApiError && e.captureId) {
      persist({ ...deal, paypalCaptureId: e.captureId });
    }
    throw e;
  }

  const approver =
    via === "HUMAN"
      ? `${deal.clientBusinessName} (buyer sign-off)`
      : `Auto-capture policy (<= $${deal.autoCaptureThresholdUsd})`;
  const tag = simulate ? "SIMULATED " : "";
  const amount = `$${deal.aiNegotiatedUsd.toFixed(2)}`;

  const updated: EscrowDeal = {
    ...deal,
    status: "CAPTURED_AND_SPLIT_PAID",
    humanApprovedBy: approver,
    paypalCaptureId: settlement.captureId,
    paypalPayoutBatchId: settlement.payoutBatchId,
    paypalMode: simulate ? "UNCONFIGURED_SANDBOX_PREVIEW" : settlement.mode,
    splitRecipients: settlement.updatedRecipients,
    toolkitCallTraces: [...settlement.toolkitTraces, ...deal.toolkitCallTraces],
    auditTrail: [
      {
        id: `at-settle-${Date.now()}`,
        timestamp: now,
        actor: via === "HUMAN" ? "HUMAN_BUYER" : "DETERMINISTIC_ENGINE",
        action: `${approver}: ${tag}capture ${settlement.captureId} of ${amount} and ${tag}payout batch ${settlement.payoutBatchId}.${
          simulate ? " No PayPal API call was made and no money moved." : ""
        }`,
        cryptographicHash: `sha256:${deal.deterministicAudit.sha256Digest}`,
        status: "PASS",
      },
      ...deal.auditTrail,
    ],
    agentNegotiationLog: [
      ...deal.agentNegotiationLog,
      {
        id: `log-settle-${Date.now()}`,
        timestamp: now,
        speaker: "PAYPAL_TOOLKIT",
        message: `${approver}: ${tag}capture ${settlement.captureId} and ${tag}payout batch ${settlement.payoutBatchId} (${amount}).${
          simulate ? " Simulated only, no PayPal API call." : ""
        }`,
        badge: simulate ? "SIMULATED" : `CAPTURED: ${settlement.captureId}`,
      },
    ],
    rawPayPalPayload: settlement.rawPayload,
    updatedAt: "Just now",
  };

  const telemetry: AgentTelemetryEvent = {
    id: `tel-${Date.now()}`,
    timestamp: now,
    agentName: "PayPal-Agent-Toolkit",
    action: simulate
      ? "SIMULATED capture and payout (no PayPal API call, no money moved)"
      : "Captured PayPal authorization and submitted payout batch",
    endpoint: simulate ? "simulated" : "POST /v1/payments/payouts",
    contractCode: deal.contractCode,
    status: simulate ? "SIMULATED" : "SUCCESS",
    latencyMs: Date.now() - startMs,
    details: `${approver}: ${tag}capture ${settlement.captureId}, ${tag}payout batch ${settlement.payoutBatchId}, ${amount}.`,
  };

  return { deal: updated, telemetry };
}
