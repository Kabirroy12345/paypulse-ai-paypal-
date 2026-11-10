import "server-only";
import fs from "fs";
import path from "path";
import {
  AgentTelemetryEvent,
  AuditTrailEntry,
  EscrowDeal,
  NegotiationLogEntry,
} from "@/types/paypulse";
import {
  buildVerificationAuditTrail,
  deterministicOnlyReview,
  emptyDeterministicReport,
  runDeterministicFileChecks,
} from "@/lib/verification-engine";
import { buildSplitRecipients } from "@/lib/gemini-agents";

/**
 * Built-in DEMO contracts. Everything here is fictional and clearly labelled:
 *  - Company, person and email values are made up (emails use the reserved ".example" TLD, which cannot receive mail).
 *  - PayPal identifiers are "DEMO-*" placeholders, not real PayPal ids. These contracts never call PayPal.
 *  - Hashes, byte sizes and rule results are COMPUTED from the real files in public/sample-deliverables/,
 *    exactly like a live submission would be.
 */

function readSample(fileName: string): string {
  const file = path.join(process.cwd(), "public", "sample-deliverables", fileName);
  return fs.readFileSync(file, "utf8");
}

interface SeedSpec {
  n: number;
  client: string;
  vendor: string;
  vendorEmail: string;
  category: EscrowDeal["category"];
  title: string;
  quote: number;
  floor: number;
  target: number;
  agreed: number;
  status: EscrowDeal["status"];
  file?: "shopify-checkout-audit-PASS.json" | "shopify-checkout-audit-DEFECTIVE.json";
  collaborator: { name: string; email: string; sharePct: number; role: string };
}

const SPECS: SeedSpec[] = [
  {
    n: 101,
    client: "Harbor & Oak Coffee (demo)",
    vendor: "Northstar Commerce Studio (demo)",
    vendorEmail: "billing@northstar-studio.example",
    category: "E-Commerce & Checkout Dev",
    title: "Headless storefront + PayPal Orders v2 checkout",
    quote: 3600,
    floor: 3050,
    target: 3100,
    agreed: 3200,
    status: "AUTHORIZED_HOLD",
    collaborator: { name: "Demo QA Specialist", email: "qa@northstar-studio.example", sharePct: 20, role: "Independent QA" },
  },
  {
    n: 102,
    client: "Verde Botanical (demo)",
    vendor: "Atelier Koto Agency (demo)",
    vendorEmail: "payouts@atelier-koto.example",
    category: "UI/UX & Brand Design",
    title: "Mobile product quiz and conversion funnel redesign",
    quote: 2400,
    floor: 2150,
    target: 2100,
    agreed: 2200,
    status: "CAPTURED_AND_SPLIT_PAID",
    file: "shopify-checkout-audit-PASS.json",
    collaborator: { name: "Demo UX Researcher", email: "ux@atelier-koto.example", sharePct: 25, role: "UX researcher" },
  },
  {
    n: 103,
    client: "Apex Dental Lab (demo)",
    vendor: "RedShield AppSec (demo)",
    vendorEmail: "treasury@redshield-sec.example",
    category: "Security & QA Audit",
    title: "Patient portal API penetration test and webhook hardening",
    quote: 1750,
    floor: 1450,
    target: 1480,
    agreed: 1500,
    status: "AWAITING_BUYER_SIGN_OFF",
    file: "shopify-checkout-audit-PASS.json",
    collaborator: { name: "Demo Fuzzing Engineer", email: "fuzz@redshield-sec.example", sharePct: 20, role: "Fuzzing engineer" },
  },
  {
    n: 104,
    client: "Lumina Games (demo)",
    vendor: "PixelForge WebGL Studio (demo)",
    vendorEmail: "finance@pixelforge.example",
    category: "Full-Stack Web App",
    title: "Merch store checkout and webhook retry worker",
    quote: 1600,
    floor: 1480,
    target: 1450,
    agreed: 1500,
    status: "HOLD_BLOCKED_FAILED_CHECKS",
    file: "shopify-checkout-audit-DEFECTIVE.json",
    collaborator: { name: "Demo Backend Freelancer", email: "backend@pixelforge.example", sharePct: 25, role: "Backend freelancer" },
  },
];

function buildSeedDeal(spec: SeedSpec): EscrowDeal {
  const now = new Date().toTimeString().slice(0, 8);
  const code = `MILES-2026-${spec.n}`;
  const savingsUsd = Number((spec.quote - spec.agreed).toFixed(2));
  const savingsPct = Number(((savingsUsd / spec.quote) * 100).toFixed(2));
  const orderId = `DEMO-ORDER-${spec.n}`;
  const authId = `DEMO-AUTH-${spec.n}`;
  const threshold = 500;

  const rawContent = spec.file ? readSample(spec.file) : "";
  const audit = spec.file
    ? runDeterministicFileChecks(spec.file, rawContent)
    : emptyDeterministicReport();
  const verificationRun = Boolean(spec.file);
  const review = spec.file
    ? deterministicOnlyReview(spec.file, audit, "Deterministic seed review (no live Gemini call)")
    : {
        passed: false,
        summary: "No deliverable has been submitted yet.",
        findings: [],
        modelUsed: "n/a",
      };

  const recipients = buildSplitRecipients(
    { vendorName: spec.vendor, vendorEmail: spec.vendorEmail, collaborator: spec.collaborator },
    spec.agreed
  ).map((r, i) => ({
    ...r,
    status:
      spec.status === "CAPTURED_AND_SPLIT_PAID"
        ? ("SIMULATED" as const)
        : spec.status === "HOLD_BLOCKED_FAILED_CHECKS"
        ? ("BLOCKED" as const)
        : ("PENDING" as const),
    payoutItemId:
      spec.status === "CAPTURED_AND_SPLIT_PAID" ? `DEMO-ITEM-${spec.n}-${i + 1}` : undefined,
  }));

  let auditTrail: AuditTrailEntry[] = [
    {
      id: `at-${spec.n}-0`,
      timestamp: now,
      actor: "PAYPAL_AGENT_TOOLKIT",
      action: `DEMO DATA: placeholder hold ${orderId} for $${spec.agreed.toFixed(2)}. No PayPal API call was made.`,
      status: "INFO",
    },
  ];
  if (spec.file) {
    auditTrail = buildVerificationAuditTrail({
      existingTrail: auditTrail,
      deterministicReport: audit,
      geminiReview: review,
      requiresHumanApproval: spec.agreed > threshold,
      dealAmountUsd: spec.agreed,
      thresholdUsd: threshold,
    });
  }
  if (spec.status === "CAPTURED_AND_SPLIT_PAID") {
    auditTrail = [
      {
        id: `at-${spec.n}-human`,
        timestamp: now,
        actor: "HUMAN_BUYER",
        action: `DEMO DATA: buyer sign-off recorded. Simulated capture DEMO-CAP-${spec.n} and simulated payout DEMO-PAYOUT-${spec.n}. No money moved.`,
        cryptographicHash: `sha256:${audit.sha256Digest}`,
        status: "PASS",
      },
      ...auditTrail,
    ];
  }

  const log: NegotiationLogEntry[] = [
    {
      id: `log-${spec.n}-1`,
      timestamp: now,
      speaker: "VENDOR_AGENT",
      message: `Demo vendor agent: quote $${spec.quote.toLocaleString()} (walk-away floor $${spec.floor.toLocaleString()}).`,
      badge: `QUOTE: $${spec.quote.toLocaleString()}`,
    },
    {
      id: `log-${spec.n}-2`,
      timestamp: now,
      speaker: "BUYER_AGENT",
      message: `Demo buyer agent: target $${spec.target.toLocaleString()}; settled at $${spec.agreed.toLocaleString()} (-${savingsPct}%). Scripted demo data, not a live negotiation.`,
      badge: `AGREED: $${spec.agreed.toLocaleString()}`,
    },
  ];
  if (spec.file) {
    log.push({
      id: `log-${spec.n}-3`,
      timestamp: now,
      speaker: "AUDIT_GATE",
      message: review.summary,
      badge: audit.allDeterministicPassed ? "CHECKS PASSED" : "CAPTURE BLOCKED",
    });
  }

  return {
    id: `deal-${spec.n}`,
    contractCode: code,
    clientBusinessName: spec.client,
    vendorName: spec.vendor,
    vendorPayPalEmail: spec.vendorEmail,
    category: spec.category,
    projectTitle: spec.title,
    initialQuoteUsd: spec.quote,
    vendorPriceFloorUsd: spec.floor,
    buyerTargetBudgetUsd: spec.target,
    aiNegotiatedUsd: spec.agreed,
    savingsUsd,
    savingsPct,
    autoCaptureThresholdUsd: threshold,
    requiresHumanApproval: spec.agreed > threshold,
    humanApprovedBy:
      spec.status === "CAPTURED_AND_SPLIT_PAID" ? "Demo buyer (sign-off)" : undefined,
    status: spec.status,
    paypalOrderId: orderId,
    paypalAuthorizationId: authId,
    paypalCaptureId:
      spec.status === "CAPTURED_AND_SPLIT_PAID" ? `DEMO-CAP-${spec.n}` : undefined,
    paypalInvoiceId: `DEMO-INV-ID-${spec.n}`,
    paypalInvoiceNumber: `DEMO-INV-${spec.n}`,
    paypalPayoutBatchId:
      spec.status === "CAPTURED_AND_SPLIT_PAID" ? `DEMO-PAYOUT-${spec.n}` : undefined,
    paypalMode: "UNCONFIGURED_SANDBOX_PREVIEW",
    isDemoSeed: true,
    verificationRun,
    milestoneTitle: `Milestone 1: ${spec.title}`,
    deliverableSummary: review.summary,
    submittedFileName: spec.file || "",
    submittedFileRawContent: rawContent,
    deterministicAudit: audit,
    geminiReview: review,
    splitRecipients: recipients,
    agentNegotiationLog: log,
    toolkitCallTraces: [
      {
        id: `tk-${spec.n}-1`,
        timestamp: now,
        toolName: "paypal_create_order",
        arguments: { intent: "AUTHORIZE", amount: spec.agreed.toFixed(2), reference_id: code },
        resultSummary: `DEMO placeholder order ${orderId}. Not a real PayPal order.`,
        liveSandbox: false,
      },
    ],
    auditTrail,
    rawPayPalPayload: {
      demo_data: true,
      notice: "DEMO DATA: identifiers are placeholders. No PayPal API call was made.",
      order_id: orderId,
      intent: "AUTHORIZE",
      amount: { currency_code: "USD", value: spec.agreed.toFixed(2) },
    },
    updatedAt: "Demo data",
  };
}

export function buildSeedDeals(): EscrowDeal[] {
  return SPECS.map(buildSeedDeal);
}

export function buildSeedTelemetry(): AgentTelemetryEvent[] {
  const now = new Date().toTimeString().slice(0, 8);
  return [
    {
      id: "tel-seed-1",
      timestamp: now,
      agentName: "Deterministic-Gate",
      action: "Demo contracts loaded (fictional data, simulated payments)",
      endpoint: "local seed",
      contractCode: "DEMO",
      status: "INFO",
      latencyMs: 0,
      details:
        "Hashes and rule results on the demo contracts are computed from the real files in public/sample-deliverables. Company names, emails and PayPal ids are placeholders.",
    },
  ];
}
