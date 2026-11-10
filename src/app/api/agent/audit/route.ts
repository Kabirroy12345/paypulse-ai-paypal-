import { NextRequest, NextResponse } from "next/server";
import {
  buildVerificationAuditTrail,
  runDeterministicFileChecks,
  runGeminiDeliverableSemanticReview,
} from "@/lib/verification-engine";
import { captureAndSplitPayoutPayPal } from "@/lib/paypal-server";
import { AgentTelemetryEvent, EscrowDeal, RuntimeCredentials } from "@/types/paypulse";

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  try {
    const body = await req.json();
    const {
      deal,
      submittedFileName,
      submittedFileContent,
      humanApprovalAction,
      humanApproverName,
      imageBase64,
      imageMimeType,
      runtime,
    } = body as {
      deal: EscrowDeal;
      submittedFileName?: string;
      submittedFileContent?: string;
      humanApprovalAction?: "APPROVE_AND_CAPTURE";
      humanApproverName?: string;
      imageBase64?: string;
      imageMimeType?: string;
      runtime?: RuntimeCredentials;
    };

    const nowTime = new Date().toTimeString().slice(0, 8);

    // Path A: Human Buyer explicitly approves capture after deterministic + Gemini checks already passed
    if (humanApprovalAction === "APPROVE_AND_CAPTURE") {
      if (!deal.deterministicAudit.allDeterministicPassed) {
        return NextResponse.json(
          {
            error:
              "Cannot capture: Deterministic verification checks failed on this deliverable.",
          },
          { status: 400 }
        );
      }

      const settlement = await captureAndSplitPayoutPayPal({
        orderId: deal.paypalOrderId,
        authorizationId: deal.paypalAuthorizationId,
        contractCode: deal.contractCode,
        totalAmountUsd: deal.aiNegotiatedUsd,
        splitRecipients: deal.splitRecipients,
        runtime,
      });

      const approver =
        humanApproverName?.trim() || `${deal.clientBusinessName} (Buyer Sign-Off)`;

      const updatedDeal: EscrowDeal = {
        ...deal,
        status: "CAPTURED_AND_SPLIT_PAID",
        humanApprovedBy: approver,
        paypalCaptureId: settlement.captureId,
        paypalPayoutBatchId: settlement.payoutBatchId,
        paypalMode: settlement.mode,
        splitRecipients: settlement.updatedRecipients,
        toolkitCallTraces: [
          ...settlement.toolkitTraces,
          ...deal.toolkitCallTraces,
        ],
        auditTrail: [
          {
            id: `at-hum-${Date.now()}`,
            timestamp: nowTime,
            actor: "HUMAN_BUYER",
            action: `${approver} approved final release of $${deal.aiNegotiatedUsd.toLocaleString()} USD. Captured Order ${deal.paypalOrderId} (${settlement.captureId}) & disbursed Split Payout Batch ${settlement.payoutBatchId}.`,
            cryptographicHash: `sha256:${deal.deterministicAudit.sha256Digest}`,
            status: "PASS",
          },
          ...deal.auditTrail,
        ],
        agentNegotiationLog: [
          ...deal.agentNegotiationLog,
          {
            id: `log-hum-${Date.now()}`,
            timestamp: nowTime,
            speaker: "PAYPAL_TOOLKIT",
            message: `Human Buyer (${approver}) signed off on capture. Executed PayPal Capture ${settlement.captureId} & Batch Payout ${settlement.payoutBatchId} ($${deal.aiNegotiatedUsd.toLocaleString()} USD).`,
            badge: `CAPTURED: ${settlement.captureId}`,
          },
        ],
        rawPayPalPayload: settlement.rawPayload,
        updatedAt: "Just now",
      };

      const telemetry: AgentTelemetryEvent = {
        id: `tel-${Date.now()}`,
        timestamp: nowTime,
        agentName: "PayPal-Agent-Toolkit",
        action: "Human Buyer Approved -> Captured PayPal Hold & Sent Split Payout",
        endpoint: "POST /v1/payments/payouts",
        contractCode: deal.contractCode,
        status: "SUCCESS",
        latencyMs: Date.now() - startMs,
        details: `${approver} approved release -> Capture ${settlement.captureId} & Batch Payout ${settlement.payoutBatchId} ($${deal.aiNegotiatedUsd.toLocaleString()} USD).`,
      };

      return NextResponse.json({ deal: updatedDeal, telemetry });
    }

    // Path B: Run 3-Stage Verification Pipeline on the actual submitted file
    const fileName =
      submittedFileName?.trim() ||
      deal.submittedFileName ||
      "deliverable-manifest.json";
    const rawContent =
      submittedFileContent ?? deal.submittedFileRawContent ?? "";

    // Stage 1: Deterministic Checks (SHA-256, byte size, unit tests, bundle cap, SARIF vulnerabilities)
    const deterministicReport = runDeterministicFileChecks(fileName, rawContent);

    // Stage 2: Gemini 3.8 Flash Semantic & Multimodal Inspection of actual file contents
    const geminiReview = await runGeminiDeliverableSemanticReview({
      deal,
      fileName,
      rawContent,
      deterministicReport,
      imageBase64,
      imageMimeType,
      runtime,
    });

    const bothPassed =
      deterministicReport.allDeterministicPassed && geminiReview.passed;
    const requiresHumanSignOff =
      deal.aiNegotiatedUsd > deal.autoCaptureThresholdUsd;

    const updatedTrail = buildVerificationAuditTrail({
      existingTrail: deal.auditTrail,
      deterministicReport,
      geminiReview,
      requiresHumanApproval: requiresHumanSignOff,
      dealAmountUsd: deal.aiNegotiatedUsd,
      thresholdUsd: deal.autoCaptureThresholdUsd,
    });

    // If deterministic or Gemini checks failed -> Hard-block capture!
    if (!bothPassed) {
      const failedCount = deterministicReport.checks.filter(
        (c) => !c.passed
      ).length;
      const updatedDeal: EscrowDeal = {
        ...deal,
        status: "HOLD_BLOCKED_FAILED_CHECKS",
        submittedFileName: fileName,
        submittedFileRawContent: rawContent,
        deterministicAudit: deterministicReport,
        geminiReview,
        deliverableSummary: geminiReview.summary,
        splitRecipients: deal.splitRecipients.map((r) => ({
          ...r,
          status: "BLOCKED",
        })),
        auditTrail: updatedTrail,
        agentNegotiationLog: [
          ...deal.agentNegotiationLog,
          {
            id: `log-fail-${Date.now()}`,
            timestamp: nowTime,
            speaker: "AUDIT_GATE",
            message: `DETERMINISTIC GATE BLOCKED CAPTURE on ${fileName} (sha256:${deterministicReport.sha256Digest.slice(
              0,
              10
            )}…): ${failedCount} rule(s) failed. ${geminiReview.summary}`,
            badge: "CAPTURE BLOCKED",
          },
        ],
        rawPayPalPayload: {
          order_id: deal.paypalOrderId,
          authorization_id: deal.paypalAuthorizationId,
          intent: "AUTHORIZE",
          capture_status: "BLOCKED_BY_DETERMINISTIC_VERIFICATION_GATE",
          submitted_file: fileName,
          sha256_digest: deterministicReport.sha256Digest,
          failed_checks: deterministicReport.checks.filter((c) => !c.passed),
        },
        updatedAt: "Just now",
      };

      const telemetry: AgentTelemetryEvent = {
        id: `tel-${Date.now()}`,
        timestamp: nowTime,
        agentName: "Deterministic-Gate",
        action: `Hard-Blocked Capture on ${fileName} (${failedCount} checks failed)`,
        endpoint: `BLOCK /v2/checkout/orders/${deal.paypalOrderId}/capture`,
        contractCode: deal.contractCode,
        status: "WARNING",
        latencyMs: Date.now() - startMs,
        details: `sha256:${deterministicReport.sha256Digest.slice(0, 12)}… failed deterministic validation. $${deal.aiNegotiatedUsd.toLocaleString()} USD hold remains uncaptured.`,
      };

      return NextResponse.json({ deal: updatedDeal, telemetry });
    }

    // Both deterministic and Gemini checks passed!
    // Check Policy Threshold: If amount > autoCaptureThresholdUsd, require Human Buyer Sign-Off!
    if (requiresHumanSignOff) {
      const updatedDeal: EscrowDeal = {
        ...deal,
        status: "AWAITING_BUYER_SIGN_OFF",
        submittedFileName: fileName,
        submittedFileRawContent: rawContent,
        deterministicAudit: deterministicReport,
        geminiReview,
        deliverableSummary: geminiReview.summary,
        splitRecipients: deal.splitRecipients.map((r) => ({
          ...r,
          status: "PENDING",
        })),
        auditTrail: updatedTrail,
        agentNegotiationLog: [
          ...deal.agentNegotiationLog,
          {
            id: `log-pass-gate-${Date.now()}`,
            timestamp: nowTime,
            speaker: "AUDIT_GATE",
            message: `All ${deterministicReport.checks.length} deterministic checks & Gemini 3.8 Flash review PASSED on ${fileName} (sha256:${deterministicReport.sha256Digest.slice(
              0,
              10
            )}…). Because $${deal.aiNegotiatedUsd.toLocaleString()} USD > $${deal.autoCaptureThresholdUsd.toLocaleString()} USD auto-capture limit, routed to Human Buyer for final 1-click capture approval.`,
            badge: "READY FOR BUYER SIGN-OFF",
          },
        ],
        updatedAt: "Just now",
      };

      const telemetry: AgentTelemetryEvent = {
        id: `tel-${Date.now()}`,
        timestamp: nowTime,
        agentName: "Deterministic-Gate",
        action: `Verified ${fileName} -> Routed to Human Buyer Sign-Off (> $${deal.autoCaptureThresholdUsd} limit)`,
        endpoint: "Human-in-the-Loop Policy Gate",
        contractCode: deal.contractCode,
        status: "INFO",
        latencyMs: Date.now() - startMs,
        details: `All deterministic & Gemini 3.8 Flash checks passed (sha256:${deterministicReport.sha256Digest.slice(
          0,
          12
        )}…). Waiting for Buyer Sign-Off to capture $${deal.aiNegotiatedUsd.toLocaleString()} USD.`,
      };

      return NextResponse.json({ deal: updatedDeal, telemetry });
    }

    // Micro-milestone (<= autoCaptureThresholdUsd): Auto-capture & split payout
    const settlement = await captureAndSplitPayoutPayPal({
      orderId: deal.paypalOrderId,
      authorizationId: deal.paypalAuthorizationId,
      contractCode: deal.contractCode,
      totalAmountUsd: deal.aiNegotiatedUsd,
      splitRecipients: deal.splitRecipients,
      runtime,
    });

    const updatedDeal: EscrowDeal = {
      ...deal,
      status: "CAPTURED_AND_SPLIT_PAID",
      humanApprovedBy: `Auto-Capture Policy (<= $${deal.autoCaptureThresholdUsd})`,
      submittedFileName: fileName,
      submittedFileRawContent: rawContent,
      deterministicAudit: deterministicReport,
      geminiReview,
      deliverableSummary: geminiReview.summary,
      paypalCaptureId: settlement.captureId,
      paypalPayoutBatchId: settlement.payoutBatchId,
      paypalMode: settlement.mode,
      splitRecipients: settlement.updatedRecipients,
      toolkitCallTraces: [
        ...settlement.toolkitTraces,
        ...deal.toolkitCallTraces,
      ],
      auditTrail: updatedTrail,
      agentNegotiationLog: [
        ...deal.agentNegotiationLog,
        {
          id: `log-autopay-${Date.now()}`,
          timestamp: nowTime,
          speaker: "PAYPAL_TOOLKIT",
          message: `Passed deterministic + Gemini checks & within $${deal.autoCaptureThresholdUsd} auto-capture threshold. Captured Order ${deal.paypalOrderId} & sent Batch Payout ${settlement.payoutBatchId}.`,
          badge: `BATCH: ${settlement.payoutBatchId}`,
        },
      ],
      rawPayPalPayload: settlement.rawPayload,
      updatedAt: "Just now",
    };

    const telemetry: AgentTelemetryEvent = {
      id: `tel-${Date.now()}`,
      timestamp: nowTime,
      agentName: "PayPal-Agent-Toolkit",
      action: "Micro-Milestone Verified -> Auto-Captured & Split Paid",
      endpoint: "POST /v1/payments/payouts",
      contractCode: deal.contractCode,
      status: "SUCCESS",
      latencyMs: Date.now() - startMs,
      details: `Captured Order ${deal.paypalOrderId} & sent Batch Payout ${settlement.payoutBatchId} ($${deal.aiNegotiatedUsd.toLocaleString()} USD).`,
    };

    return NextResponse.json({ deal: updatedDeal, telemetry });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to run milestone verification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
