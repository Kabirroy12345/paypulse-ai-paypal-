import { NextRequest, NextResponse } from "next/server";
import { runAutonomousNegotiationAgent } from "@/lib/gemini-agents";
import {
  createPayPalAuthorizationHoldOrder,
  createPayPalSmartInvoice,
} from "@/lib/paypal-server";
import { VALID_DELIVERABLE_SAMPLE_JSON } from "@/lib/initial-data";
import { runDeterministicFileChecks } from "@/lib/verification-engine";
import { AgentTelemetryEvent, EscrowDeal, RuntimeCredentials } from "@/types/paypulse";

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  try {
    const body = await req.json();
    const {
      clientBusinessName,
      vendorName,
      vendorEmail,
      category,
      projectTitle,
      initialQuoteUsd,
      vendorPriceFloorUsd,
      buyerTargetBudgetUsd,
      autoCaptureThresholdUsd,
      buyerBrief,
      runtime,
    } = body as {
      clientBusinessName?: string;
      vendorName: string;
      vendorEmail: string;
      category: EscrowDeal["category"];
      projectTitle: string;
      initialQuoteUsd: number;
      vendorPriceFloorUsd: number;
      buyerTargetBudgetUsd: number;
      autoCaptureThresholdUsd?: number;
      buyerBrief?: string;
      runtime?: RuntimeCredentials;
    };

    const contractCode = `MILES-2026-${Math.floor(105 + Math.random() * 890)}`;
    const quote = Number(initialQuoteUsd) || 3200;
    const floor = Number(vendorPriceFloorUsd) || Math.round(quote * 0.85);
    const target = Number(buyerTargetBudgetUsd) || Math.round(quote * 0.82);
    const threshold = Number(autoCaptureThresholdUsd ?? 500);

    // Step 1: Two-Agent Negotiation (Buyer-Advocate vs Vendor-Floor-Agent with hard walk-away floor)
    const negotiated = await runAutonomousNegotiationAgent({
      clientBusinessName: clientBusinessName || "Harbor & Oak Specialty Coffee Co.",
      vendorName,
      vendorEmail,
      category,
      projectTitle,
      initialQuoteUsd: quote,
      vendorPriceFloorUsd: floor,
      buyerTargetBudgetUsd: target,
      autoCaptureThresholdUsd: threshold,
      buyerBrief,
      runtime,
    });

    // Step 2: Create PayPal Smart Invoice via @paypal/agent-toolkit (create_invoice)
    const invoiceResult = await createPayPalSmartInvoice({
      contractCode,
      vendorName,
      vendorEmail,
      projectTitle,
      initialQuoteUsd: quote,
      aiNegotiatedUsd: negotiated.aiNegotiatedUsd,
      runtime,
    });

    // Step 3: Create PayPal Authorization Hold Order (POST /v2/checkout/orders with intent: AUTHORIZE)
    const orderResult = await createPayPalAuthorizationHoldOrder({
      contractCode,
      projectTitle,
      vendorName,
      vendorEmail,
      initialQuoteUsd: quote,
      aiNegotiatedUsd: negotiated.aiNegotiatedUsd,
      runtime,
    });

    const initialDetCheck = runDeterministicFileChecks(
      "shopify-checkout-audit-PASS.json",
      VALID_DELIVERABLE_SAMPLE_JSON
    );

    const nowTime = new Date().toTimeString().slice(0, 8);
    const requiresHumanApproval = negotiated.aiNegotiatedUsd > threshold;

    const deal: EscrowDeal = {
      id: `deal-${Date.now()}`,
      contractCode,
      clientBusinessName: clientBusinessName || "Harbor & Oak Specialty Coffee Co.",
      vendorName,
      vendorPayPalEmail: vendorEmail,
      category,
      projectTitle,
      initialQuoteUsd: quote,
      vendorPriceFloorUsd: floor,
      buyerTargetBudgetUsd: target,
      aiNegotiatedUsd: negotiated.aiNegotiatedUsd,
      savingsUsd: negotiated.savingsUsd,
      savingsPct: negotiated.savingsPct,
      autoCaptureThresholdUsd: threshold,
      requiresHumanApproval,
      status: "AUTHORIZED_HOLD",
      paypalOrderId: orderResult.orderId,
      paypalAuthorizationId: orderResult.authorizationId,
      paypalInvoiceId: invoiceResult.invoiceId,
      paypalInvoiceNumber: invoiceResult.invoiceNumber,
      paypalApprovalUrl: orderResult.approvalUrl,
      paypalMode: orderResult.mode,
      milestoneTitle: negotiated.milestoneTitle,
      deliverableSummary: negotiated.deliverableSummary,
      submittedFileName: "shopify-checkout-audit-PASS.json",
      submittedFileRawContent: VALID_DELIVERABLE_SAMPLE_JSON,
      deterministicAudit: initialDetCheck,
      geminiReview: {
        passed: true,
        summary: "Awaiting freelancer deliverable submission & verification run.",
        modelUsed: "gemini-3.8-flash",
        findings: [],
      },
      splitRecipients: negotiated.splitRecipients,
      agentNegotiationLog: [
        ...negotiated.agentNegotiationLog,
        {
          id: `log-pp-${Date.now()}`,
          timestamp: nowTime,
          speaker: "PAYPAL_TOOLKIT",
          message: `@paypal/agent-toolkit created Invoice #${invoiceResult.invoiceNumber} & PayPal Order ${orderResult.orderId} (intent: AUTHORIZE, $${negotiated.aiNegotiatedUsd.toLocaleString()} USD hold).`,
          badge: `ORDER: ${orderResult.orderId}`,
        },
      ],
      toolkitCallTraces: [
        invoiceResult.toolkitTrace,
        orderResult.toolkitTrace,
      ],
      auditTrail: [
        {
          id: `at-init-${Date.now()}`,
          timestamp: nowTime,
          actor: "PAYPAL_AGENT_TOOLKIT",
          action: `Created PayPal Authorization Hold Order ${orderResult.orderId} (intent: AUTHORIZE) for $${negotiated.aiNegotiatedUsd.toLocaleString()} USD against vendor floor of $${floor.toLocaleString()} USD.`,
          status: "INFO",
        },
      ],
      rawPayPalPayload: {
        paypal_order_v2_authorize: orderResult.rawPayload,
        paypal_invoice_v2: invoiceResult.rawPayload,
      },
      updatedAt: "Just now",
    };

    const latencyMs = Date.now() - startMs;
    const telemetry: AgentTelemetryEvent = {
      id: `tel-${Date.now()}`,
      timestamp: nowTime,
      agentName: "Buyer-Advocate",
      action: `Negotiated $${quote.toLocaleString()} -> $${negotiated.aiNegotiatedUsd.toLocaleString()} (-${negotiated.savingsPct}% vs $${floor.toLocaleString()} floor) & Authorized PayPal Hold`,
      endpoint: "POST /v2/checkout/orders (intent: AUTHORIZE)",
      contractCode,
      status: "SUCCESS",
      latencyMs,
      details: `Created Order ${orderResult.orderId} & Invoice #${invoiceResult.invoiceNumber} via @paypal/agent-toolkit.`,
    };

    return NextResponse.json({
      deal,
      telemetry,
      usedLiveGemini: negotiated.usedLiveGemini,
      paypalMode: orderResult.mode,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to negotiate and create authorization hold order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
