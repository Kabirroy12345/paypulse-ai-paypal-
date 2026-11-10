import { NextRequest } from "next/server";
import {
  buildVerificationAuditTrail,
  runDeterministicFileChecks,
  runGeminiDeliverableSemanticReview,
} from "@/lib/verification-engine";
import { settleDeal } from "@/lib/settlement";
import {
  MAX_DELIVERABLE_BYTES,
  MAX_IMAGE_BASE64_CHARS,
  ValidationError,
  validateDealId,
} from "@/lib/validation";
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
import { AgentTelemetryEvent, EscrowDeal } from "@/types/paypulse";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * The client sends only a dealId (plus the file to verify, or an approval action).
 * The deal itself, its amount, recipients, gate results and status are always read from the server-side store.
 */
export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const { sid, session } = getSession(req);
  let lockedId: string | null = null;

  try {
    const body = (await readJson(req, 8_000_000)) as Record<string, unknown>;
    const dealId = validateDealId(body.dealId);
    const stored = findDeal(session, dealId);
    if (!stored) throw new HttpError(404, "Contract not found in this session");
    if (!tryLock(session, dealId)) {
      throw new HttpError(409, "Another action is already running for this contract");
    }
    lockedId = dealId;

    const runtime = readRuntimeCredentials(body);
    const nowTime = new Date().toTimeString().slice(0, 8);
    const persist = (d: EscrowDeal) => saveDeal(session, d);

    if (stored.status === "CAPTURED_AND_SPLIT_PAID") {
      throw new HttpError(409, "This contract has already been captured");
    }

    // ---------- Path A: buyer approves capture ----------
    if (body.humanApprovalAction === "APPROVE_AND_CAPTURE") {
      if (
        stored.status !== "AWAITING_BUYER_SIGN_OFF" ||
        !stored.verificationRun ||
        !stored.deterministicAudit.allDeterministicPassed ||
        !stored.geminiReview.passed
      ) {
        throw new HttpError(
          409,
          "Cannot capture: this contract has not passed verification and is not awaiting buyer sign-off"
        );
      }
      const { deal, telemetry } = await settleDeal({
        deal: stored,
        via: "HUMAN",
        runtime,
        startMs,
        persist,
      });
      saveDeal(session, deal);
      addTelemetry(session, telemetry);
      return jsonWithSession(req, sid, { deal, telemetry });
    }

    // ---------- Path B: verify a submitted deliverable ----------
    const fileName =
      typeof body.submittedFileName === "string" ? body.submittedFileName.trim() : "";
    const rawContent =
      typeof body.submittedFileContent === "string" ? body.submittedFileContent : "";
    if (!fileName || fileName.length > 200) {
      throw new ValidationError({ submittedFileName: "is required (max 200 characters)" });
    }
    if (!rawContent.trim()) {
      throw new ValidationError({ submittedFileContent: "is required. Load or upload a deliverable first" });
    }
    if (Buffer.byteLength(rawContent, "utf8") > MAX_DELIVERABLE_BYTES) {
      throw new HttpError(413, `Deliverable exceeds ${MAX_DELIVERABLE_BYTES} bytes`);
    }

    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    if (body.imageBase64 !== undefined && body.imageBase64 !== null && body.imageBase64 !== "") {
      if (
        typeof body.imageBase64 !== "string" ||
        body.imageBase64.length > MAX_IMAGE_BASE64_CHARS ||
        !/^[A-Za-z0-9+/=]+$/.test(body.imageBase64)
      ) {
        throw new ValidationError({ imageBase64: "must be a base64 image under ~4.5 MB" });
      }
      if (typeof body.imageMimeType !== "string" || !IMAGE_TYPES.includes(body.imageMimeType)) {
        throw new ValidationError({ imageMimeType: `must be one of ${IMAGE_TYPES.join(", ")}` });
      }
      imageBase64 = body.imageBase64;
      imageMimeType = body.imageMimeType;
    }

    // Stage 1: deterministic checks on the real bytes
    const deterministicReport = runDeterministicFileChecks(fileName, rawContent);

    // Stage 2: Gemini semantic review (cannot override a Stage 1 failure)
    const geminiReview = await runGeminiDeliverableSemanticReview({
      deal: stored,
      fileName,
      rawContent,
      deterministicReport,
      imageBase64,
      imageMimeType,
      runtime,
    });

    const bothPassed = deterministicReport.allDeterministicPassed && geminiReview.passed;
    const requiresHumanSignOff = stored.aiNegotiatedUsd > stored.autoCaptureThresholdUsd;
    const auditTrail = buildVerificationAuditTrail({
      existingTrail: stored.auditTrail,
      deterministicReport,
      geminiReview,
      requiresHumanApproval: requiresHumanSignOff,
      dealAmountUsd: stored.aiNegotiatedUsd,
      thresholdUsd: stored.autoCaptureThresholdUsd,
    });

    const verifiedBase: EscrowDeal = {
      ...stored,
      submittedFileName: fileName,
      submittedFileRawContent: rawContent,
      verificationRun: true,
      deterministicAudit: deterministicReport,
      geminiReview,
      deliverableSummary: geminiReview.summary,
      auditTrail,
      updatedAt: "Just now",
    };

    // Failed: hard-block capture
    if (!bothPassed) {
      const failedCount = deterministicReport.checks.filter((c) => !c.passed).length;
      const deal: EscrowDeal = {
        ...verifiedBase,
        status: "HOLD_BLOCKED_FAILED_CHECKS",
        splitRecipients: stored.splitRecipients.map((r) => ({ ...r, status: "BLOCKED" })),
        agentNegotiationLog: [
          ...stored.agentNegotiationLog,
          {
            id: `log-fail-${Date.now()}`,
            timestamp: nowTime,
            speaker: "AUDIT_GATE",
            message: `Capture blocked on ${fileName} (sha256:${deterministicReport.sha256Digest.slice(0, 10)}…): ${failedCount} deterministic rule(s) failed. ${geminiReview.summary}`,
            badge: "CAPTURE BLOCKED",
          },
        ],
        rawPayPalPayload: {
          order_id: stored.paypalOrderId,
          intent: "AUTHORIZE",
          capture_status: "BLOCKED_BY_VERIFICATION_GATE",
          submitted_file: fileName,
          sha256_digest: deterministicReport.sha256Digest,
          failed_checks: deterministicReport.checks.filter((c) => !c.passed),
        },
      };
      saveDeal(session, deal);
      const telemetry: AgentTelemetryEvent = {
        id: `tel-${Date.now()}`,
        timestamp: nowTime,
        agentName: "Deterministic-Gate",
        action: `Blocked capture on ${fileName} (${failedCount} rule(s) failed)`,
        endpoint: "capture blocked in code",
        contractCode: stored.contractCode,
        status: "WARNING",
        latencyMs: Date.now() - startMs,
        details: `sha256:${deterministicReport.sha256Digest.slice(0, 12)}… failed validation. The $${stored.aiNegotiatedUsd.toFixed(2)} hold stays uncaptured.`,
      };
      addTelemetry(session, telemetry);
      return jsonWithSession(req, sid, { deal, telemetry });
    }

    // Passed, above the auto-capture limit: wait for the human buyer
    const awaiting: EscrowDeal = {
      ...verifiedBase,
      status: "AWAITING_BUYER_SIGN_OFF",
      splitRecipients: stored.splitRecipients.map((r) => ({ ...r, status: "PENDING" })),
      agentNegotiationLog: [
        ...stored.agentNegotiationLog,
        {
          id: `log-pass-${Date.now()}`,
          timestamp: nowTime,
          speaker: "AUDIT_GATE",
          message: requiresHumanSignOff
            ? `All ${deterministicReport.checks.length} deterministic rules and the Stage 2 review passed on ${fileName} (sha256:${deterministicReport.sha256Digest.slice(0, 10)}…). $${stored.aiNegotiatedUsd.toLocaleString()} exceeds the $${stored.autoCaptureThresholdUsd.toLocaleString()} auto-capture limit, so the buyer must sign off.`
            : `All ${deterministicReport.checks.length} deterministic rules and the Stage 2 review passed on ${fileName}. Within the $${stored.autoCaptureThresholdUsd.toLocaleString()} auto-capture limit.`,
          badge: requiresHumanSignOff ? "READY FOR BUYER SIGN-OFF" : "CHECKS PASSED",
        },
      ],
    };

    if (requiresHumanSignOff) {
      saveDeal(session, awaiting);
      const telemetry: AgentTelemetryEvent = {
        id: `tel-${Date.now()}`,
        timestamp: nowTime,
        agentName: "Deterministic-Gate",
        action: `Verified ${fileName}, routed to buyer sign-off (over $${stored.autoCaptureThresholdUsd} limit)`,
        endpoint: "human-in-the-loop policy gate",
        contractCode: stored.contractCode,
        status: "INFO",
        latencyMs: Date.now() - startMs,
        details: `Checks passed (sha256:${deterministicReport.sha256Digest.slice(0, 12)}…). Waiting for buyer approval to capture $${stored.aiNegotiatedUsd.toFixed(2)}.`,
      };
      addTelemetry(session, telemetry);
      return jsonWithSession(req, sid, { deal: awaiting, telemetry });
    }

    // Micro-milestone within the auto-capture limit: settle automatically
    try {
      const { deal, telemetry } = await settleDeal({
        deal: awaiting,
        via: "AUTO",
        runtime,
        startMs,
        persist,
      });
      saveDeal(session, deal);
      addTelemetry(session, telemetry);
      return jsonWithSession(req, sid, { deal, telemetry });
    } catch (e) {
      // Verification passed but PayPal could not settle (e.g. the buyer has not approved the hold). Keep it recoverable.
      const message = e instanceof Error ? e.message : "Settlement failed";
      const recoverable = findDeal(session, dealId) ?? awaiting;
      const deal: EscrowDeal = {
        ...recoverable,
        ...awaiting,
        paypalAuthorizationId: recoverable.paypalAuthorizationId,
        paypalCaptureId: recoverable.paypalCaptureId,
        agentNegotiationLog: [
          ...awaiting.agentNegotiationLog,
          {
            id: `log-defer-${Date.now()}`,
            timestamp: nowTime,
            speaker: "PAYPAL_TOOLKIT",
            message: `Auto-capture deferred: ${message}`,
            badge: "AUTO-CAPTURE DEFERRED",
          },
        ],
      };
      saveDeal(session, deal);
      const telemetry: AgentTelemetryEvent = {
        id: `tel-${Date.now()}`,
        timestamp: nowTime,
        agentName: "PayPal-Agent-Toolkit",
        action: "Auto-capture deferred",
        endpoint: "capture",
        contractCode: stored.contractCode,
        status: "WARNING",
        latencyMs: Date.now() - startMs,
        details: message,
      };
      addTelemetry(session, telemetry);
      return jsonWithSession(req, sid, { deal, telemetry, settlementError: message });
    }
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (lockedId) unlock(session, lockedId);
  }
}
