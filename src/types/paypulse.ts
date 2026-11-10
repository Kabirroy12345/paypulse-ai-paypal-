export type DealStatus =
  | "NEGOTIATING"
  | "INVOICED"
  | "AUTHORIZED_HOLD"
  | "AWAITING_BUYER_SIGN_OFF"
  | "CAPTURED_AND_SPLIT_PAID"
  | "HOLD_BLOCKED_FAILED_CHECKS";

export interface DeterministicRuleResult {
  rule: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface DeterministicAuditReport {
  fileName: string;
  fileSizeBytes: number;
  sha256Digest: string;
  schemaValid: boolean;
  unitTestsPassed: number;
  unitTestsTotal: number;
  criticalVulnerabilities: number;
  bundleSizeKb: number;
  maxAllowedBundleKb: number;
  allDeterministicPassed: boolean;
  checks: DeterministicRuleResult[];
}

export interface GeminiSemanticFinding {
  requirement: string;
  status: "PASS" | "FAIL";
  evidence: string;
}

export interface GeminiSemanticReview {
  passed: boolean;
  summary: string;
  findings: GeminiSemanticFinding[];
  modelUsed: string;
}

export interface AuditTrailEntry {
  id: string;
  timestamp: string;
  actor:
    | "DETERMINISTIC_ENGINE"
    | "GEMINI_3_8_FLASH"
    | "PAYPAL_AGENT_TOOLKIT"
    | "HUMAN_BUYER"
    | "FREELANCER_VENDOR";
  action: string;
  cryptographicHash?: string;
  status: "PASS" | "BLOCK" | "INFO";
}

export interface PayPalToolkitCallTrace {
  id: string;
  timestamp: string;
  toolName:
    | "paypal_create_order"
    | "paypal_create_invoice"
    | "paypal_capture_order"
    | "paypal_create_payout_batch";
  arguments: Record<string, unknown>;
  resultSummary: string;
  liveSandbox: boolean;
}

export interface SplitRecipient {
  role: string;
  name: string;
  email: string;
  sharePct: number;
  amountUsd: number;
  status: "PENDING" | "SENT" | "BLOCKED";
  payoutItemId?: string;
}

export interface NegotiationLogEntry {
  id: string;
  timestamp: string;
  speaker: "BUYER_AGENT" | "VENDOR_AGENT" | "PAYPAL_TOOLKIT" | "AUDIT_GATE";
  message: string;
  badge?: string;
}

export interface EscrowDeal {
  id: string;
  contractCode: string;
  clientBusinessName: string;
  vendorName: string;
  vendorPayPalEmail: string;
  category:
    | "E-Commerce & Checkout Dev"
    | "UI/UX & Brand Design"
    | "Security & QA Audit"
    | "Full-Stack Web App"
    | "Data & Automation";
  projectTitle: string;
  initialQuoteUsd: number;
  vendorPriceFloorUsd: number;
  buyerTargetBudgetUsd: number;
  aiNegotiatedUsd: number;
  savingsUsd: number;
  savingsPct: number;
  autoCaptureThresholdUsd: number;
  requiresHumanApproval: boolean;
  humanApprovedBy?: string;
  status: DealStatus;
  paypalOrderId: string;
  paypalAuthorizationId?: string;
  paypalCaptureId?: string;
  paypalInvoiceId?: string;
  paypalInvoiceNumber?: string;
  paypalPayoutBatchId?: string;
  paypalApprovalUrl?: string;
  paypalMode: "LIVE_SANDBOX" | "UNCONFIGURED_SANDBOX_PREVIEW";
  milestoneTitle: string;
  deliverableSummary: string;
  submittedFileName: string;
  submittedFileRawContent: string;
  deterministicAudit: DeterministicAuditReport;
  geminiReview: GeminiSemanticReview;
  splitRecipients: SplitRecipient[];
  agentNegotiationLog: NegotiationLogEntry[];
  toolkitCallTraces: PayPalToolkitCallTrace[];
  auditTrail: AuditTrailEntry[];
  rawPayPalPayload: Record<string, unknown>;
  updatedAt: string;
}

export interface AgentTelemetryEvent {
  id: string;
  timestamp: string;
  agentName:
    | "Buyer-Advocate"
    | "Vendor-Floor-Agent"
    | "Deterministic-Gate"
    | "PayPal-Agent-Toolkit";
  action: string;
  endpoint?: string;
  contractCode: string;
  status: "SUCCESS" | "WARNING" | "INFO";
  latencyMs: number;
  details: string;
}

export interface RuntimeCredentials {
  paypalClientId?: string;
  paypalClientSecret?: string;
  geminiApiKey?: string;
}
