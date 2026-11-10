import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { runAutonomousNegotiationAgent } from "@/lib/gemini-agents";
import {
  createPayPalAuthorizationHoldOrder,
  createPayPalSmartInvoice,
} from "@/lib/paypal-server";
import { emptyDeterministicReport } from "@/lib/verification-engine";
import { validateNegotiationInput } from "@/lib/validation";
import {
  MAX_DEALS_PER_SESSION,
  addTelemetry,
  getSession,
  jsonWithSession,
  saveDeal,
} from "@/lib/deal-store";
import {
  HttpError,
  errorResponse,
  getBaseUrl,
  readJson,
  readRuntimeCredentials,
} from "@/lib/http";
import { AgentTelemetryEvent, EscrowDeal } from "@/types/paypulse";

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  try {
    const body = await readJson(req, 64_000);
    const input = validateNegotiationInput(body);
    const runtime = readRuntimeCredentials(body);
    const { sid, session } = getSession(req);

    if (session.deals.length >= MAX_DEALS_PER_SESSION) {
      throw new HttpError(429, `Limit of ${MAX_DEALS_PER_SESSION} contracts per session reached. Use Reset Demo.`);
    }

    let contractCode = "";
    do {
      contractCode = `MILES-2026-${Math.floor(105 + Math.random() * 890)}`;
    } while (session.deals.some((d) => d.contractCode === contractCode));

    // Step 1: two-agent negotiation (buyer target vs the vendor's hard floor)
    const negotiated = await runAutonomousNegotiationAgent({ ...input, runtime });

    // Step 2: draft invoice via @paypal/agent-toolkit create_invoice (non-fatal if PayPal rejects it)
    const invoiceResult = await createPayPalSmartInvoice({
      contractCode,
      vendorName: input.vendorName,
      vendorEmail: input.vendorEmail,
      buyerEmail: input.buyerEmail,
      projectTitle: input.projectTitle,
      initialQuoteUsd: input.initialQuoteUsd,
      aiNegotiatedUsd: negotiated.aiNegotiatedUsd,
      runtime,
    });

    // Step 3: authorization hold (POST /v2/checkout/orders, intent: AUTHORIZE). Throws on live PayPal errors.
    const orderResult = await createPayPalAuthorizationHoldOrder({
      contractCode,
      projectTitle: input.projectTitle,
      vendorName: input.vendorName,
      vendorEmail: input.vendorEmail,
      initialQuoteUsd: input.initialQuoteUsd,
      aiNegotiatedUsd: negotiated.aiNegotiatedUsd,
      baseUrl: getBaseUrl(req),
      runtime,
    });

    const simulated = orderResult.mode !== "LIVE_SANDBOX";
    const nowTime = new Date().toTimeString().slice(0, 8);
    const threshold = input.autoCaptureThresholdUsd;

    const deal: EscrowDeal = {
      id: `deal-${randomUUID().slice(0, 8)}`,
      contractCode,
      clientBusinessName: input.clientBusinessName,
      vendorName: input.vendorName,
      vendorPayPalEmail: input.vendorEmail,
      buyerEmail: input.buyerEmail,
      category: input.category,
      projectTitle: input.projectTitle,
      initialQuoteUsd: input.initialQuoteUsd,
      vendorPriceFloorUsd: input.vendorPriceFloorUsd,
      buyerTargetBudgetUsd: input.buyerTargetBudgetUsd,
      aiNegotiatedUsd: negotiated.aiNegotiatedUsd,
      savingsUsd: negotiated.savingsUsd,
      savingsPct: negotiated.savingsPct,
      autoCaptureThresholdUsd: threshold,
      requiresHumanApproval: negotiated.aiNegotiatedUsd > threshold,
      status: "AUTHORIZED_HOLD",
      paypalOrderId: orderResult.orderId,
      paypalAuthorizationId: orderResult.authorizationId,
      paypalInvoiceId: invoiceResult.invoiceId,
      paypalInvoiceNumber: invoiceResult.invoiceNumber,
      paypalApprovalUrl: orderResult.approvalUrl,
      paypalMode: orderResult.mode,
      isDemoSeed: false,
      verificationRun: false,
      milestoneTitle: negotiated.milestoneTitle,
      deliverableSummary: negotiated.deliverableSummary,
      submittedFileName: "",
      submittedFileRawContent: "",
      deterministicAudit: emptyDeterministicReport(),
      geminiReview: {
        passed: false,
        summary: "Waiting for the freelancer to submit a deliverable.",
        findings: [],
        modelUsed: "n/a",
      },
      splitRecipients: negotiated.splitRecipients,
      agentNegotiationLog: [
        ...negotiated.agentNegotiationLog,
        {
          id: `log-pp-${Date.now()}`,
          timestamp: nowTime,
          speaker: "PAYPAL_TOOLKIT",
          message: simulated
            ? `SIMULATED hold ${orderResult.orderId} for $${negotiated.aiNegotiatedUsd.toFixed(2)}. No PayPal API call was made (no credentials configured).`
            : `Created Sandbox order ${orderResult.orderId} (intent: AUTHORIZE, $${negotiated.aiNegotiatedUsd.toFixed(2)}). The buyer must approve it in PayPal before funds can be captured.`,
          badge: simulated ? "SIMULATED" : `ORDER: ${orderResult.orderId}`,
        },
      ],
      toolkitCallTraces: [invoiceResult.toolkitTrace, orderResult.toolkitTrace],
      auditTrail: [
        {
          id: `at-init-${Date.now()}`,
          timestamp: nowTime,
          actor: "PAYPAL_AGENT_TOOLKIT",
          action: simulated
            ? `SIMULATED authorization hold ${orderResult.orderId} for $${negotiated.aiNegotiatedUsd.toFixed(2)} (floor $${input.vendorPriceFloorUsd.toFixed(2)}). No PayPal API call was made.`
            : `Created PayPal order ${orderResult.orderId} (intent: AUTHORIZE) for $${negotiated.aiNegotiatedUsd.toFixed(2)} (floor $${input.vendorPriceFloorUsd.toFixed(2)}). Awaiting buyer approval in PayPal.`,
          status: "INFO",
        },
      ],
      rawPayPalPayload: {
        paypal_order_v2_authorize: orderResult.rawPayload,
        paypal_invoice_v2: invoiceResult.rawPayload,
      },
      updatedAt: "Just now",
    };

    saveDeal(session, deal, true);

    const telemetry: AgentTelemetryEvent = {
      id: `tel-${Date.now()}`,
      timestamp: nowTime,
      agentName: "Buyer-Advocate",
      action: simulated
        ? `Negotiated $${input.initialQuoteUsd.toLocaleString()} to $${negotiated.aiNegotiatedUsd.toLocaleString()} and SIMULATED the PayPal hold`
        : `Negotiated $${input.initialQuoteUsd.toLocaleString()} to $${negotiated.aiNegotiatedUsd.toLocaleString()} and created the PayPal hold`,
      endpoint: simulated ? "simulated" : "POST /v2/checkout/orders (intent: AUTHORIZE)",
      contractCode,
      status: simulated ? "SIMULATED" : "SUCCESS",
      latencyMs: Date.now() - startMs,
      details: `${negotiated.usedLiveGemini ? "Gemini 3.8 Flash" : "Rule-based model"}. Order ${orderResult.orderId}${
        invoiceResult.invoiceId ? `, invoice ${invoiceResult.invoiceId}` : ", no invoice created"
      }.`,
    };
    addTelemetry(session, telemetry);

    return jsonWithSession(req, sid, {
      deal,
      telemetry,
      usedLiveGemini: negotiated.usedLiveGemini,
      paypalMode: orderResult.mode,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
