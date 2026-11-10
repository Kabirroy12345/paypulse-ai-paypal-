"use client";

import React, { useState, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { EscrowDeal } from "@/types/paypulse";
import {
  VALID_DELIVERABLE_SAMPLE_JSON,
  DEFECTIVE_DELIVERABLE_SAMPLE_JSON,
} from "@/lib/initial-data";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Upload,
  FileCode2,
  ExternalLink,
  Bot,
  Lock,
  Users,
  Receipt,
  UserCheck,
  FileJson,
  Wrench,
  Loader2,
  Building2,
  Briefcase,
  AlertTriangle,
  ArrowRight,
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
  onHumanBuyerApprove: (deal: EscrowDeal, approverName: string) => void;
  onOpenPayloadModal: (deal: EscrowDeal) => void;
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
  onOpenPayloadModal,
}: PayPalEscrowWorkbenchProps) {
  const [fileName, setFileName] = useState(deal.submittedFileName);
  const [fileContent, setFileContent] = useState(deal.submittedFileRawContent);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<
    string | null
  >(null);
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
    setFileName(targetFile);
    try {
      const res = await fetch(`/sample-deliverables/${targetFile}`);
      if (res.ok) {
        const text = await res.text();
        setFileContent(text);
        return;
      }
    } catch {
      // Fallback to embedded constant
    }
    setFileContent(
      targetFile === "shopify-checkout-audit-PASS.json"
        ? VALID_DELIVERABLE_SAMPLE_JSON
        : DEFECTIVE_DELIVERABLE_SAMPLE_JSON
    );
  };

  const hasValidClientId =
    Boolean(paypalClientId) &&
    paypalClientId !== "your_paypal_sandbox_client_id" &&
    paypalClientId!.length > 12;

  const det = deal.deterministicAudit;
  const isBlocked = deal.status === "HOLD_BLOCKED_FAILED_CHECKS";
  const isAwaitingBuyer = deal.status === "AWAITING_BUYER_SIGN_OFF";
  const isPaid = deal.status === "CAPTURED_AND_SPLIT_PAID";

  // Compute 6-step contract stepper state:
  // 1. Negotiated -> 2. Hold placed -> 3. Delivered -> 4. Checks passed -> 5. Buyer approved -> 6. Paid
  const steps = [
    {
      label: "1. Negotiated",
      sub: `$${deal.aiNegotiatedUsd.toLocaleString()} (-${deal.savingsPct}%)`,
      state: "DONE" as const,
    },
    {
      label: "2. Hold placed",
      sub: `Order ${deal.paypalOrderId.slice(0, 7)}…`,
      state: "DONE" as const,
    },
    {
      label: "3. Delivered",
      sub: deal.submittedFileName.includes("DEFECTIVE")
        ? "Defective File"
        : "Manifest Uploaded",
      state:
        deal.status === "AUTHORIZED_HOLD"
          ? ("ACTIVE" as const)
          : ("DONE" as const),
    },
    {
      label: isBlocked ? "4. Checks failed" : "4. Checks passed",
      sub: isBlocked
        ? `${det.checks.filter((c) => !c.passed).length} Rules Failed`
        : `${det.checks.filter((c) => c.passed).length}/${det.checks.length} Passed`,
      state: isBlocked
        ? ("FAILED" as const)
        : isAwaitingBuyer || isPaid
        ? ("DONE" as const)
        : ("PENDING" as const),
    },
    {
      label: "5. Buyer approved",
      sub: isPaid
        ? "Signed Off"
        : isAwaitingBuyer
        ? "Action Needed"
        : `>${deal.autoCaptureThresholdUsd} Gate`,
      state: isPaid
        ? ("DONE" as const)
        : isAwaitingBuyer
        ? ("ACTIVE" as const)
        : ("PENDING" as const),
    },
    {
      label: "6. Paid",
      sub: isPaid ? "Split Sent" : "Payouts v1",
      state: isPaid ? ("DONE" as const) : ("PENDING" as const),
    },
  ];

  // Plain-English Gate Reasons for Stages 1, 2, 3
  const stage1Passed = det.allDeterministicPassed;
  const stage1Reason = stage1Passed
    ? `Passed: ${det.unitTestsPassed}/${det.unitTestsTotal} unit tests pass, bundle is ${det.bundleSizeKb} KB (limit ${det.maxAllowedBundleKb} KB), 0 security vulnerabilities found, and SHA-256 (${det.sha256Digest.slice(0, 10)}…) verified.`
    : `Failed: Only ${det.unitTestsPassed}/${det.unitTestsTotal} unit tests passed, bundle size is ${det.bundleSizeKb} KB (exceeds ${det.maxAllowedBundleKb} KB limit), and ${det.criticalVulnerabilities} critical vulnerability was found in ${det.fileName}.`;

  const stage2Passed = deal.geminiReview.passed && stage1Passed;
  const stage2Reason = deal.geminiReview.summary;

  const stage3Passed = isPaid;
  const stage3Reason = isPaid
    ? `Approved by ${deal.humanApprovedBy || deal.clientBusinessName}. Captured Order ${deal.paypalOrderId} and disbursed split payout batch ${deal.paypalPayoutBatchId}.`
    : isBlocked
    ? `Blocked: Buyer cannot capture payment while Stage 1 or Stage 2 checks are failing.`
    : isAwaitingBuyer
    ? `Ready for Buyer Sign-Off: Because $${deal.aiNegotiatedUsd.toLocaleString()} exceeds the $${deal.autoCaptureThresholdUsd} auto-capture limit, the buyer must click "Approve & Capture" below.`
    : `Waiting for freelancer deliverable inspection to complete.`;

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
                {deal.clientBusinessName} — Review gate results & approve PayPal hold capture
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFC439] text-slate-950 uppercase tracking-wider text-[11px]">
                <Briefcase className="w-3.5 h-3.5" />
                Viewing as Freelancer
              </span>
              <span>
                {deal.vendorName} — Upload deliverable file for verification & track split payout
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

      {/* Contract Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#FFC439] text-slate-950 font-mono font-bold text-xs">
              {deal.contractCode}
            </span>
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
          {deal.paypalApprovalUrl && (
            <a
              href={deal.paypalApprovalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#FFC439]/15 hover:bg-[#FFC439]/25 text-[#FFC439] border border-[#FFC439]/30 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Sandbox Link
            </a>
          )}
        </div>
      </div>

      {/* 6-Step Visual Status Stepper (Shown in Both Buyer & Freelancer Views) */}
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

      {/* Live Loading Banner for Gemini / PayPal Calls */}
      {isProcessing && (
        <div className="px-4 py-3 bg-blue-950/80 border-b border-sky-400/40 flex items-center gap-3 text-xs font-semibold text-sky-200">
          <Loader2 className="w-4 h-4 text-[#FFC439] animate-spin shrink-0" />
          <span>
            {processingStageText ||
              "Running Stage 1 SHA-256 & unit test checks + Stage 2 Gemini 3.8 Flash file inspection..."}
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
          Gate Results, Deliverable File & Buyer Approval
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
          @paypal/agent-toolkit & SHA-256 Audit Trail
        </button>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4">
        {activeTab === "verification" && (
          <div className="space-y-4">
            {/* CLEAR 3-STAGE GATE RESULT CARDS (Plain-English Pass/Fail + Reason) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Stage 1 Card */}
              <div
                className={`p-3.5 rounded-xl border ${
                  stage1Passed
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
                      stage1Passed
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {stage1Passed ? "PASS" : "FAIL"}
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {stage1Reason}
                </p>
              </div>

              {/* Stage 2 Card */}
              <div
                className={`p-3.5 rounded-xl border ${
                  stage2Passed
                    ? "bg-emerald-950/20 border-emerald-500/35"
                    : "bg-rose-950/35 border-rose-500/60"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                    Stage 2: Gemini 3.8 File Review
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                      stage2Passed
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {stage2Passed ? "PASS" : "FAIL"}
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
                    ? "bg-emerald-950/20 border-emerald-500/35"
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
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : isBlocked
                        ? "bg-rose-500 text-white"
                        : "bg-[#FFC439] text-slate-950"
                    }`}
                  >
                    {stage3Passed
                      ? "APPROVED & PAID"
                      : isBlocked
                      ? "BLOCKED"
                      : "AWAITING BUYER"}
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {stage3Reason}
                </p>
              </div>
            </div>

            {/* ONE OBVIOUS BUYER APPROVAL MOMENT (Shown when checks pass or in Buyer View) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left 6 cols: Freelancer Deliverable File Uploader & Inspector */}
              <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-sky-400">
                      Freelancer Deliverable File ({fileName})
                    </span>
                    <p className="text-xs text-slate-400">
                      Load a sample manifest or upload any JSON/code deliverable to run Stage 1 & Stage 2 checks:
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
                  rows={6}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-[#009CDE]"
                />

                <button
                  onClick={() =>
                    onRunFileVerification(
                      deal,
                      fileName,
                      fileContent,
                      uploadedBase64,
                      uploadedMime
                    )
                  }
                  disabled={isProcessing}
                  className="w-full py-2.5 px-4 rounded-xl font-extrabold text-xs bg-gradient-to-r from-[#0070BA] to-[#009CDE] hover:brightness-110 text-white shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Inspecting File with Deterministic Gate & Gemini 3.8...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-[#FFC439]" />
                      Run Verification Gate on &ldquo;{fileName}&rdquo;
                    </>
                  )}
                </button>
              </div>

              {/* Right 6 cols: ONE OBVIOUS BUYER APPROVAL & PAYOUT SPLIT CARD */}
              <div className="lg:col-span-6 rounded-xl border-2 border-[#FFC439]/50 bg-gradient-to-b from-slate-900 via-[#0F172A] to-slate-950 p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-[#FFC439] flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4" />
                        Buyer Capture & Split Payout Approval
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Review the authorized hold amount, verified deliverable, and recipient split before releasing funds:
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Hold to Capture</div>
                      <div className="text-xl font-mono font-extrabold text-white">
                        ${deal.aiNegotiatedUsd.toLocaleString()}.00
                      </div>
                    </div>
                  </div>

                  {/* What is being captured summary */}
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
                        {det.fileName}
                      </code>
                    </div>
                  </div>

                  {/* Payout Split Breakdown right inside the Approval Box */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-emerald-400" />
                      Automatic Split Payout Upon Capture (POST /v1/payments/payouts):
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
                            ${rec.amountUsd.toLocaleString()}.00
                          </div>
                          <span
                            className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                              rec.status === "SENT"
                                ? "bg-emerald-500/20 text-emerald-300"
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
                    <div className="w-full py-3 px-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-extrabold text-sm flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      Captured (${deal.aiNegotiatedUsd.toLocaleString()}) & Split Paid (Batch {deal.paypalPayoutBatchId})
                    </div>
                  ) : isBlocked ? (
                    <div className="w-full py-3 px-4 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-200 font-bold text-xs flex items-center justify-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      Approval Disabled — Deliverable Failed Stage 1 Deterministic Checks
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        onHumanBuyerApprove(
                          deal,
                          `${deal.clientBusinessName} (Buyer Approved)`
                        )
                      }
                      disabled={isProcessing}
                      className="w-full py-3.5 px-5 rounded-xl font-extrabold text-sm bg-gradient-to-r from-[#FFC439] to-[#F5B000] hover:brightness-105 text-slate-950 shadow-xl shadow-amber-950/40 flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#003087]" />
                          Capturing PayPal Hold & Sending Split Payouts...
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-5 h-5 text-[#003087]" />
                          Approve & Capture ${deal.aiNegotiatedUsd.toLocaleString()}.00 PayPal Hold
                          <ArrowRight className="w-4 h-4 text-[#003087]" />
                        </>
                      )}
                    </button>
                  )}

                  {/* Optional Live Smart Checkout Button when Client ID is configured */}
                  {hasValidClientId && !isPaid && (
                    <div className="bg-white p-2 rounded-xl">
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
                          createOrder={(_data, actions) => {
                            return actions.order.create({
                              intent: "AUTHORIZE",
                              purchase_units: [
                                {
                                  reference_id: deal.contractCode,
                                  description: deal.projectTitle.slice(0, 120),
                                  amount: {
                                    currency_code: "USD",
                                    value: deal.aiNegotiatedUsd.toFixed(2),
                                  },
                                },
                              ],
                            });
                          }}
                          onApprove={async (_data, actions) => {
                            if (actions.order) {
                              await actions.order.authorize();
                            }
                            onRunFileVerification(deal, fileName, fileContent);
                          }}
                        />
                      </PayPalScriptProvider>
                    </div>
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
                      {tr.timestamp}
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
                Cryptographic SHA-256 & Buyer Sign-Off Trail
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
