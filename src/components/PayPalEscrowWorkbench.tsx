"use client";

import React, { useState, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { EscrowDeal } from "@/types/paypulse";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Upload,
  FileCode2,
  ExternalLink,
  Bot,
  Users,
  UserCheck,
  FileJson,
  Wrench,
  Loader2,
  Building2,
  Briefcase,
  AlertTriangle,
  ArrowRight,
  Info,
} from "lucide-react";

interface PayPalEscrowWorkbenchProps {
  deal: EscrowDeal;
  activePerspective: "BUYER" | "VENDOR";
  onSwitchPerspective: (role: "BUYER" | "VENDOR") => void;
  paypalClientId?: string;
  isProcessing: boolean;
  processingStageText?: string | null;
  onRunFileVerification: (
    deal: EscrowDeal,
    fileName: string,
    fileContent: string,
    imageBase64?: string,
    imageMimeType?: string
  ) => void;
  onHumanBuyerApprove: (deal: EscrowDeal) => void;
  onAuthorizeHold: (deal: EscrowDeal) => void;
  onOpenPayloadModal: (deal: EscrowDeal) => void;
  onError: (message: string) => void;
}

export default function PayPalEscrowWorkbench({
  deal,
  activePerspective,
  onSwitchPerspective,
  paypalClientId,
  isProcessing,
  processingStageText,
  onRunFileVerification,
  onHumanBuyerApprove,
  onAuthorizeHold,
  onOpenPayloadModal,
  onError,
}: PayPalEscrowWorkbenchProps) {
  const [fileName, setFileName] = useState(deal.submittedFileName);
  const [fileContent, setFileContent] = useState(deal.submittedFileRawContent);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(
    null
  );
  const [uploadedBase64, setUploadedBase64] = useState<string | undefined>(
    undefined
  );
  const [uploadedMime, setUploadedMime] = useState<string | undefined>(
    undefined
  );
  const [activeTab, setActiveTab] = useState<
    "verification" | "negotiation" | "audit_trail"
  >("verification");

  useEffect(() => {
    setFileName(deal.submittedFileName);
    setFileContent(deal.submittedFileRawContent);
    setUploadedImagePreview(null);
    setUploadedBase64(undefined);
    setUploadedMime(undefined);
  }, [deal.id, deal.submittedFileName, deal.submittedFileRawContent]);

  const handleDeliverableFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFileContent(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadedImagePreview(result);
      const base64Clean = result.split(",")[1];
      setUploadedBase64(base64Clean);
      setUploadedMime(file.type || "image/png");
    };
    reader.readAsDataURL(file);
  };

  const loadWorkspaceSampleFile = async (
    targetFile:
      | "shopify-checkout-audit-PASS.json"
      | "shopify-checkout-audit-DEFECTIVE.json"
  ) => {
    try {
      const res = await fetch(`/sample-deliverables/${targetFile}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setFileName(targetFile);
      setFileContent(text);
    } catch (e) {
      onError(
        `Could not load ${targetFile}: ${
          e instanceof Error ? e.message : "network error"
        }`
      );
    }
  };

  const hasValidClientId =
    Boolean(paypalClientId) &&
    paypalClientId !== "your_paypal_sandbox_client_id" &&
    paypalClientId!.length > 12;

  const formatUsd = (amount: number) =>
    amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const det = deal.deterministicAudit;
  const isBlocked = deal.status === "HOLD_BLOCKED_FAILED_CHECKS";
  const isAwaitingBuyer = deal.status === "AWAITING_BUYER_SIGN_OFF";
  const isPaid = deal.status === "CAPTURED_AND_SPLIT_PAID";

  // Payments are simulated for demo contracts and for contracts created without PayPal credentials.
  const isSimulated = deal.isDemoSeed || deal.paypalMode !== "LIVE_SANDBOX";
  const needsPayPalApproval =
    !isSimulated && !deal.paypalAuthorizationId && !isPaid;
  const verified = deal.verificationRun;

  const hasContent = fileContent.trim().length > 0;
  const effectiveFileName =
    fileName.trim() || "custom-deliverable-manifest.json";
  const hasUnverifiedEdits =
    hasContent &&
    (effectiveFileName !== deal.submittedFileName ||
      fileContent !== deal.submittedFileRawContent);

  const failedChecks = det.checks.filter((c) => !c.passed);
  const paidTag = isSimulated ? "SIMULATED " : "";

  // 6-step stepper: Negotiated -> Hold placed -> Delivered -> Checks passed -> Buyer approved -> Paid
  const steps = [
    {
      label: "1. Negotiated",
      sub: `$${deal.aiNegotiatedUsd.toLocaleString()} (-${deal.savingsPct}%)`,
      state: "DONE" as const,
    },
    {
      label: "2. Hold placed",
      sub: isSimulated
        ? "Simulated hold"
        : needsPayPalApproval
        ? "Buyer must approve"
        : "Authorized",
      state: needsPayPalApproval ? ("ACTIVE" as const) : ("DONE" as const),
    },
    {
      label: "3. Delivered",
      sub: verified
        ? `${det.fileSizeBytes} B • sha256:${det.sha256Digest.slice(0, 6)}…`
        : "Not submitted",
      state: verified ? ("DONE" as const) : ("ACTIVE" as const),
    },
    {
      label: isBlocked ? "4. Checks failed" : "4. Checks passed",
      sub: !verified
        ? "Not run"
        : isBlocked
        ? `${failedChecks.length} rule(s) failed`
        : `${det.checks.filter((c) => c.passed).length}/${det.checks.length} passed`,
      state: isBlocked
        ? ("FAILED" as const)
        : isAwaitingBuyer || isPaid
        ? ("DONE" as const)
        : ("PENDING" as const),
    },
    {
      label: "5. Buyer approved",
      sub: isPaid
        ? "Signed off"
        : isAwaitingBuyer
        ? "Action needed"
        : `Over $${deal.autoCaptureThresholdUsd}`,
      state: isPaid
        ? ("DONE" as const)
        : isAwaitingBuyer
        ? ("ACTIVE" as const)
        : ("PENDING" as const),
    },
    {
      label: "6. Paid",
      sub: isPaid ? `${paidTag}split`.trim() : "Payouts v1",
      state: isPaid ? ("DONE" as const) : ("PENDING" as const),
    },
  ];

  // Plain-English gate reasons for Stages 1-3, derived from the stored rule results
  const stage1Passed = verified && det.allDeterministicPassed;
  const stage1Reason = !verified
    ? "Not run yet. Load a sample deliverable or upload your own file below and click Run Verification Gate."
    : stage1Passed
    ? `Passed all ${det.checks.length}/${det.checks.length} deterministic rules on ${det.fileName}: ${det.unitTestsPassed}/${det.unitTestsTotal} unit tests, bundle ${det.bundleSizeKb} KB (limit ${det.maxAllowedBundleKb} KB), 0 critical/high CVEs, SHA-256 ${det.sha256Digest.slice(0, 10)}… computed from the file.`
    : `Failed ${failedChecks.length} of ${det.checks.length} deterministic rule(s) on ${det.fileName}: ${failedChecks
        .map((c) => `${c.rule} [actual: ${c.actual}, required: ${c.expected}]`)
        .join("; ")}.`;

  const stage2Passed = verified && deal.geminiReview.passed && stage1Passed;
  const stage2Reason = verified
    ? `${deal.geminiReview.summary} (${deal.geminiReview.modelUsed})`
    : "Not run yet.";

  const stage3Passed = isPaid;
  const stage3Reason = isPaid
    ? `${isSimulated ? "SIMULATED: " : ""}Approved by ${
        deal.humanApprovedBy || deal.clientBusinessName
      }. ${paidTag}capture ${deal.paypalCaptureId} and ${paidTag}payout batch ${
        deal.paypalPayoutBatchId
      }.${isSimulated ? " No PayPal API call was made and no money moved." : ""}`
    : isBlocked
    ? `Blocked: the buyer cannot capture while Stage 1 (${failedChecks.length} failed rule${
        failedChecks.length === 1 ? "" : "s"
      }) or Stage 2 is failing.`
    : isAwaitingBuyer
    ? `Ready for buyer sign-off: $${deal.aiNegotiatedUsd.toLocaleString()} exceeds the $${deal.autoCaptureThresholdUsd} auto-capture limit, so the buyer must click "Approve & Capture" below.`
    : "Locked until the deliverable passes Stages 1 and 2.";

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0B1120] shadow-2xl overflow-hidden flex flex-col">
      {/* Unmistakable Role Switcher Banner */}
      <div
        className={`px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b ${
          activePerspective === "BUYER"
            ? "bg-blue-950/70 border-blue-500/40 text-blue-100"
            : "bg-amber-950/60 border-amber-500/40 text-amber-100"
        }`}
      >
        <div className="flex items-center gap-2 text-xs font-bold">
          {activePerspective === "BUYER" ? (
            <>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#0070BA] text-white uppercase tracking-wider text-[11px]">
                <Building2 className="w-3.5 h-3.5" />
                Viewing as Buyer
              </span>
              <span>
                {deal.clientBusinessName} — Review gate results &amp; approve PayPal hold capture
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFC439] text-slate-950 uppercase tracking-wider text-[11px]">
                <Briefcase className="w-3.5 h-3.5" />
                Viewing as Freelancer
              </span>
              <span>
                {deal.vendorName} — Upload deliverable file for verification &amp; track split payout
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            onSwitchPerspective(
              activePerspective === "BUYER" ? "VENDOR" : "BUYER"
            )
          }
          className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 transition"
        >
          Switch to {activePerspective === "BUYER" ? "Freelancer" : "Buyer"} View →
        </button>
      </div>

      {/* Preview / Demo Banner */}
      {isSimulated && (
        <div className="px-4 py-2 bg-amber-950/45 border-b border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-200 font-medium">
          <Info className="w-3.5 h-3.5 text-[#FFC439] shrink-0" />
          <span>
            {deal.isDemoSeed
              ? "Built-in Demo Contract: Fictional names, .example emails, and placeholder DEMO-* PayPal IDs. File hashes & rules are computed on real sample files, but payments are simulated (no PayPal API calls)."
              : "Preview Mode (Unconfigured PayPal Keys): PayPal Order, Capture, and Split Payout IDs are SIMULATED. Configure PayPal Sandbox credentials to execute live Sandbox calls."}
          </span>
        </div>
      )}

      {/* Contract Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#FFC439] text-slate-950 font-mono font-bold text-xs">
              {deal.contractCode}
            </span>
            {isSimulated ? (
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold text-[10px] uppercase">
                Simulated Preview
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-[10px] uppercase">
                Live Sandbox
              </span>
            )}
            <h3 className="text-base font-bold text-white">
              {deal.projectTitle}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
            <span>
              Buyer: <strong className="text-slate-200">{deal.clientBusinessName}</strong>
            </span>
            <span>•</span>
            <span>
              Freelancer: <strong className="text-slate-200">{deal.vendorName}</strong> (Floor: ${deal.vendorPriceFloorUsd.toLocaleString()})
            </span>
            <span>•</span>
            <span>
              PayPal Order:{" "}
              <code className="text-sky-300 font-mono font-bold">
                {deal.paypalOrderId}
              </code>
            </span>
            {deal.paypalInvoiceNumber && (
              <>
                <span>•</span>
                <span>
                  Invoice:{" "}
                  <code className="text-amber-300 font-mono font-bold">
                    #{deal.paypalInvoiceNumber}
                  </code>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenPayloadModal(deal)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            PayPal JSON
          </button>
          {deal.paypalApprovalUrl && !isSimulated && (
            <a
              href={deal.paypalApprovalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#FFC439]/15 hover:bg-[#FFC439]/25 text-[#FFC439] border border-[#FFC439]/30 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Approve in PayPal
            </a>
          )}
        </div>
      </div>

      {/* 6-Step Visual Status Stepper */}
      <div className="px-4 py-3 bg-[#080D1A] border-b border-slate-800">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          {steps.map((st, idx) => {
            const isDone = st.state === "DONE";
            const isFailed = st.state === "FAILED";
            const isActive = st.state === "ACTIVE";
            return (
              <div
                key={idx}
                className={`p-2 rounded-xl border text-left transition ${
                  isFailed
                    ? "bg-rose-950/40 border-rose-500 text-rose-200"
                    : isActive
                    ? "bg-amber-500/15 border-[#FFC439] text-white ring-1 ring-[#FFC439]/50"
                    : isDone
                    ? "bg-emerald-950/25 border-emerald-500/40 text-emerald-200"
                    : "bg-slate-900/60 border-slate-800 text-slate-500"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold tracking-tight">
                    {st.label}
                  </span>
                  {isDone && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  {isFailed && (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  {isActive && (
                    <span className="w-2 h-2 rounded-full bg-[#FFC439] animate-ping" />
                  )}
                </div>
                <div className="text-[11px] font-mono truncate mt-0.5 opacity-90">
                  {st.sub}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Loading Banner */}
      {isProcessing && (
        <div className="px-4 py-3 bg-blue-950/80 border-b border-sky-400/40 flex items-center gap-3 text-xs font-semibold text-sky-200">
          <Loader2 className="w-4 h-4 text-[#FFC439] animate-spin shrink-0" />
          <span>
            {processingStageText ||
              "Running Stage 1 deterministic checks & Stage 2 review..."}
          </span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap border-b border-slate-800 bg-slate-900/60 px-4 pt-2 gap-1.5">
        <button
          onClick={() => setActiveTab("verification")}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-lg border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "verification"
              ? "border-[#009CDE] text-white bg-slate-800/80"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-[#009CDE]" />
          Gate Results, Deliverable File &amp; Buyer Approval
        </button>
        <button
          onClick={() => setActiveTab("negotiation")}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-lg border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "negotiation"
              ? "border-[#009CDE] text-white bg-slate-800/80"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Bot className="w-4 h-4 text-amber-400" />
          Buyer vs. Vendor Floor Negotiation ({deal.agentNegotiationLog.length})
        </button>
        <button
          onClick={() => setActiveTab("audit_trail")}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-lg border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "audit_trail"
              ? "border-[#009CDE] text-white bg-slate-800/80"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Wrench className="w-4 h-4 text-purple-400" />
          @paypal/agent-toolkit &amp; SHA-256 Audit Trail
        </button>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4">
        {activeTab === "verification" && (
          <div className="space-y-4">
            {/* 3-STAGE GATE RESULT CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Stage 1 Card */}
              <div
                className={`p-3.5 rounded-xl border ${
                  !verified
                    ? "bg-slate-900/60 border-slate-700"
                    : stage1Passed
                    ? "bg-emerald-950/20 border-emerald-500/35"
                    : "bg-rose-950/35 border-rose-500/60"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                    Stage 1: Deterministic Checks
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                      !verified
                        ? "bg-slate-800 text-slate-300 border border-slate-600"
                        : stage1Passed
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {!verified ? "NOT RUN" : stage1Passed ? "PASS" : "FAIL"}
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {stage1Reason}
                </p>
              </div>

              {/* Stage 2 Card */}
              <div
                className={`p-3.5 rounded-xl border ${
                  !verified
                    ? "bg-slate-900/60 border-slate-700"
                    : stage2Passed
                    ? "bg-emerald-950/20 border-emerald-500/35"
                    : "bg-rose-950/35 border-rose-500/60"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                    Stage 2: Semantic File Review
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                      !verified
                        ? "bg-slate-800 text-slate-300 border border-slate-600"
                        : stage2Passed
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {!verified ? "NOT RUN" : stage2Passed ? "PASS" : "FAIL"}
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {stage2Reason}
                </p>
              </div>

              {/* Stage 3 Card */}
              <div
                className={`p-3.5 rounded-xl border ${
                  stage3Passed
                    ? isSimulated
                      ? "bg-sky-950/30 border-sky-500/40"
                      : "bg-emerald-950/20 border-emerald-500/35"
                    : isBlocked
                    ? "bg-rose-950/35 border-rose-500/60"
                    : "bg-amber-950/30 border-amber-500/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                    Stage 3: Buyer Approval Gate
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                      stage3Passed
                        ? isSimulated
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : isBlocked
                        ? "bg-rose-500 text-white"
                        : "bg-[#FFC439] text-slate-950"
                    }`}
                  >
                    {stage3Passed
                      ? isSimulated
                        ? "SIMULATED"
                        : "APPROVED & PAID"
                      : isBlocked
                      ? "BLOCKED"
                      : isAwaitingBuyer
                      ? "AWAITING BUYER"
                      : "LOCKED"}
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {stage3Reason}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left 6 cols: Freelancer Deliverable File Uploader & Inspector */}
              <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-sky-400">
                      Freelancer Deliverable File ({fileName || "No file loaded"})
                    </span>
                    <p className="text-xs text-slate-400">
                      Load a sample manifest or upload any JSON/code deliverable to run Stage 1 &amp; Stage 2 checks:
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      loadWorkspaceSampleFile("shopify-checkout-audit-PASS.json")
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                      fileName.includes("PASS")
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                        : "bg-slate-900 text-slate-300 border-slate-700 hover:text-white"
                    }`}
                  >
                    <FileJson className="w-3.5 h-3.5 inline mr-1" />
                    Load Passing File (48/48 Tests)
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      loadWorkspaceSampleFile(
                        "shopify-checkout-audit-DEFECTIVE.json"
                      )
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                      fileName.includes("DEFECTIVE")
                        ? "bg-rose-500/25 text-rose-200 border-rose-500/50"
                        : "bg-slate-900 text-slate-300 border-slate-700 hover:text-white"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-rose-400" />
                    Load Broken File (39/48 Tests, 612KB, 1 CVE)
                  </button>

                  <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 cursor-pointer transition">
                    <Upload className="w-3.5 h-3.5" />
                    Upload File
                    <input
                      type="file"
                      accept=".json,.txt,.md,.sarif,.ts,.js"
                      onChange={handleDeliverableFileUpload}
                      className="hidden"
                    />
                  </label>

                  <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 cursor-pointer transition">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadedImagePreview ? "Screenshot ✓" : "+ Screenshot"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  placeholder="Paste JSON manifest / code deliverable or click one of the sample buttons above..."
                  rows={6}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-[#009CDE]"
                />

                {hasUnverifiedEdits && (
                  <div className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-[11px] font-semibold flex items-center justify-between">
                    <span>
                      Deliverable content changed — click below to recompute SHA-256 &amp; gate checks on the server.
                    </span>
                    <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300">
                      Unverified Edits
                    </span>
                  </div>
                )}

                <button
                  onClick={() =>
                    onRunFileVerification(
                      deal,
                      effectiveFileName,
                      fileContent,
                      uploadedBase64,
                      uploadedMime
                    )
                  }
                  disabled={isProcessing || !hasContent}
                  className="w-full py-2.5 px-4 rounded-xl font-extrabold text-xs bg-gradient-to-r from-[#0070BA] to-[#009CDE] hover:brightness-110 text-white shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Inspecting File with Deterministic Gate &amp; Stage 2 Review...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-[#FFC439]" />
                      {hasContent
                        ? `Run Verification Gate on "${effectiveFileName}"`
                        : "Load or Paste a Deliverable First"}
                    </>
                  )}
                </button>
              </div>

              {/* Right 6 cols: BUYER APPROVAL & PAYOUT SPLIT CARD */}
              <div className="lg:col-span-6 rounded-xl border-2 border-[#FFC439]/50 bg-gradient-to-b from-slate-900 via-[#0F172A] to-slate-950 p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-[#FFC439] flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4" />
                        {isSimulated
                          ? "Simulated Capture & Split Preview"
                          : "Buyer Capture & Split Payout Approval"}
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isSimulated
                          ? "Demo/Preview mode: actions here compute real hashes but do not move money:"
                          : "Review the authorized hold amount, verified deliverable, and recipient split before releasing funds:"}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Hold to Capture</div>
                      <div className="text-xl font-mono font-extrabold text-white">
                        ${formatUsd(deal.aiNegotiatedUsd)}
                      </div>
                    </div>
                  </div>

                  {/* Summary box */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[11px]">
                        PayPal Authorization Order:
                      </span>
                      <code className="font-mono font-bold text-sky-300">
                        {deal.paypalOrderId}
                      </code>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">
                        Verified Deliverable File:
                      </span>
                      <code className="font-mono font-bold text-emerald-300 truncate block">
                        {verified
                          ? `${det.fileName} (sha256:${det.sha256Digest.slice(0, 6)}…)`
                          : "Pending submission"}
                      </code>
                    </div>
                  </div>

                  {/* Live Sandbox Step: Buyer Must Approve Hold First */}
                  {needsPayPalApproval && (
                    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2 text-xs">
                      <div className="font-bold text-amber-200 flex items-center justify-between gap-2">
                        <span>Live Sandbox Hold Not Authorized Yet</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                          BUYER ACTION NEEDED
                        </span>
                      </div>
                      <p className="text-amber-100/80 text-[11px]">
                        Approve Order <code className="font-mono">{deal.paypalOrderId}</code> in PayPal Sandbox, then click Verify Approval below so the server locks the authorization ID before capture.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {deal.paypalApprovalUrl && (
                          <a
                            href={deal.paypalApprovalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FFC439] text-slate-950 font-bold text-xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            1. Open PayPal Checkout
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => onAuthorizeHold(deal)}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-bold text-xs disabled:opacity-50"
                        >
                          2. Verify Approval &amp; Authorize Hold
                        </button>
                      </div>
                      {hasValidClientId && (
                        <div className="bg-white p-2 rounded-xl mt-2">
                          <PayPalScriptProvider
                            options={{
                              clientId: paypalClientId!,
                              currency: "USD",
                              intent: "authorize",
                            }}
                          >
                            <PayPalButtons
                              style={{
                                layout: "horizontal",
                                height: 32,
                                tagline: false,
                              }}
                              createOrder={() => Promise.resolve(deal.paypalOrderId)}
                              onApprove={async () => {
                                onAuthorizeHold(deal);
                              }}
                            />
                          </PayPalScriptProvider>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payout Split Breakdown */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-emerald-400" />
                      {isSimulated
                        ? "Simulated Split Preview (No PayPal Payout Sent):"
                        : "Automatic Split Payout Upon Capture (POST /v1/payments/payouts):"}
                    </div>
                    {deal.splitRecipients.map((rec, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/90 border border-slate-800 text-xs"
                      >
                        <div>
                          <div className="font-bold text-white">
                            {rec.name}{" "}
                            <span className="text-sky-400 font-mono">
                              ({rec.sharePct}%)
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {rec.email}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-extrabold text-emerald-400 text-sm">
                            ${formatUsd(rec.amountUsd)}
                          </div>
                          <span
                            className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                              rec.status === "SENT"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : rec.status === "SIMULATED"
                                ? "bg-sky-500/20 text-sky-300"
                                : rec.status === "BLOCKED"
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {rec.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* THE SINGLE CLEAR APPROVAL BUTTON */}
                <div className="space-y-2.5 pt-2 border-t border-slate-800">
                  {isPaid ? (
                    <div
                      className={`w-full py-3 px-4 rounded-xl border font-extrabold text-xs flex items-center justify-center gap-2 text-center ${
                        isSimulated
                          ? "bg-sky-500/15 border-sky-500/40 text-sky-200"
                          : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                      }`}
                    >
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${
                          isSimulated ? "text-sky-400" : "text-emerald-400"
                        }`}
                      />
                      <span>
                        {isSimulated
                          ? `SIMULATED Settlement ($${formatUsd(
                              deal.aiNegotiatedUsd
                            )}) — Placeholder ${deal.paypalPayoutBatchId} (No PayPal call, no money moved)`
                          : `Captured ($${formatUsd(
                              deal.aiNegotiatedUsd
                            )}) & Split Paid (Sandbox Batch ${
                              deal.paypalPayoutBatchId
                            })`}
                      </span>
                    </div>
                  ) : !verified ? (
                    <div className="w-full py-3 px-4 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2">
                      <Info className="w-4 h-4 text-sky-400 shrink-0" />
                      Waiting for Verification — Submit deliverable on the left to unlock approval
                    </div>
                  ) : hasUnverifiedEdits ? (
                    <button
                      onClick={() =>
                        onRunFileVerification(
                          deal,
                          effectiveFileName,
                          fileContent,
                          uploadedBase64,
                          uploadedMime
                        )
                      }
                      disabled={isProcessing}
                      className="w-full py-3.5 px-5 rounded-xl font-extrabold text-xs bg-gradient-to-r from-[#0070BA] to-[#009CDE] hover:brightness-110 text-white shadow-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4 text-[#FFC439]" />
                      Verify Modified File (&ldquo;{effectiveFileName}&rdquo;) Before Capture
                    </button>
                  ) : isBlocked ? (
                    <div className="w-full py-3 px-4 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-200 font-bold text-xs flex items-center justify-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      Approval Disabled — Deliverable Failed {failedChecks.length} Deterministic Rule(s)
                    </div>
                  ) : (
                    <button
                      onClick={() => onHumanBuyerApprove(deal)}
                      disabled={isProcessing || needsPayPalApproval}
                      className="w-full py-3.5 px-5 rounded-xl font-extrabold text-sm bg-gradient-to-r from-[#FFC439] to-[#F5B000] hover:brightness-105 text-slate-950 shadow-xl shadow-amber-950/40 flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#003087]" />
                          {isSimulated
                            ? "Simulating Capture & Payout..."
                            : "Capturing PayPal Hold & Sending Split Payouts..."}
                        </>
                      ) : needsPayPalApproval ? (
                        <>
                          <UserCheck className="w-5 h-5 text-[#003087]" />
                          Authorize PayPal Hold Above First
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-5 h-5 text-[#003087]" />
                          {isSimulated
                            ? `Simulate Capture & Split Payout ($${formatUsd(
                                deal.aiNegotiatedUsd
                              )})`
                            : `Approve & Capture $${formatUsd(
                                deal.aiNegotiatedUsd
                              )} PayPal Hold`}
                          <ArrowRight className="w-4 h-4 text-[#003087]" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "negotiation" && (
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {deal.agentNegotiationLog.map((entry) => {
              const isBuyer = entry.speaker === "BUYER_AGENT";
              const isPaypal = entry.speaker === "PAYPAL_TOOLKIT";
              const isGate = entry.speaker === "AUDIT_GATE";

              return (
                <div
                  key={entry.id}
                  className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                    isPaypal
                      ? "bg-blue-950/30 border-blue-500/30"
                      : isGate
                      ? "bg-emerald-950/25 border-emerald-500/30"
                      : isBuyer
                      ? "bg-slate-900/90 border-sky-500/30"
                      : "bg-slate-950/80 border-slate-800"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">
                        {entry.speaker === "BUYER_AGENT"
                          ? `🤖 Buyer-Advocate (${deal.clientBusinessName})`
                          : entry.speaker === "VENDOR_AGENT"
                          ? `💼 Agency Pricing Agent (${deal.vendorName} • Floor: $${deal.vendorPriceFloorUsd.toLocaleString()})`
                          : entry.speaker === "AUDIT_GATE"
                          ? "🛡️ Verification Gate"
                          : "🧰 @paypal/agent-toolkit"}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {entry.timestamp}
                      </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      {entry.message}
                    </p>
                  </div>
                  {entry.badge && (
                    <span className="shrink-0 text-[10px] font-mono font-bold px-2 py-1 rounded bg-slate-800 text-[#FFC439] border border-slate-700">
                      {entry.badge}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "audit_trail" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
            <div className="space-y-2">
              <div className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                @paypal/agent-toolkit Tool-Call Traces
              </div>
              {deal.toolkitCallTraces.map((tr) => (
                <div
                  key={tr.id}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <code className="font-mono font-bold text-[#FFC439]">
                      {tr.toolName}()
                    </code>
                    <span className="text-[10px] font-mono text-slate-400">
                      {tr.timestamp} {tr.liveSandbox ? "• LIVE" : "• SIMULATED"}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    {tr.resultSummary}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Cryptographic SHA-256 &amp; Buyer Sign-Off Trail
              </div>
              {deal.auditTrail.map((at) => (
                <div
                  key={at.id}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{at.actor}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {at.timestamp}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{at.action}</p>
                  {at.cryptographicHash && (
                    <div className="text-[10px] font-mono text-sky-400 truncate">
                      {at.cryptographicHash}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
