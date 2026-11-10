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
  Hash,
  FileJson,
  Wrench,
} from "lucide-react";

interface PayPalEscrowWorkbenchProps {
  deal: EscrowDeal;
  activePerspective: "BUYER" | "VENDOR";
  paypalClientId?: string;
  isProcessing: boolean;
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
  paypalClientId,
  isProcessing,
  onRunFileVerification,
  onHumanBuyerApprove,
  onOpenPayloadModal,
}: PayPalEscrowWorkbenchProps) {
  const [fileName, setFileName] = useState(deal.submittedFileName);
  const [fileContent, setFileContent] = useState(deal.submittedFileRawContent);
  const [approverName, setApproverName] = useState(
    `${deal.clientBusinessName} (Authorized Buyer)`
  );
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
    "verification" | "splits" | "negotiation" | "audit_trail"
  >("verification");

  useEffect(() => {
    setFileName(deal.submittedFileName);
    setFileContent(deal.submittedFileRawContent);
    setApproverName(`${deal.clientBusinessName} (Authorized Buyer)`);
    setUploadedImagePreview(null);
    setUploadedBase64(undefined);
    setUploadedMime(undefined);
  }, [
    deal.id,
    deal.submittedFileName,
    deal.submittedFileRawContent,
    deal.clientBusinessName,
  ]);

  // Upload any real deliverable file (.json, .txt, .md, .sarif) from user's disk
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

  // Optional visual screenshot upload for Gemini 3.8 Flash multimodal check
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

  // Load real fixture file from /sample-deliverables/
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

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-[#0B1120]/95 shadow-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-[#003087]/40 via-[#0F172A] to-[#0B1120] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#FFC439] text-slate-950 font-mono font-bold text-xs">
              {deal.contractCode}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 font-medium">
              {activePerspective === "BUYER"
                ? `Client View: ${deal.clientBusinessName}`
                : `Freelancer Portal: ${deal.vendorName}`}
            </span>
            <h3 className="text-sm font-bold text-white truncate max-w-md">
              {deal.projectTitle}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
            <span>
              Freelancer/Agency:{" "}
              <strong className="text-slate-200">{deal.vendorName}</strong> (
              {deal.vendorPayPalEmail})
            </span>
            <span>•</span>
            <span>
              PayPal Order (intent: AUTHORIZE):{" "}
              <code className="text-sky-300 font-mono">
                {deal.paypalOrderId}
              </code>
            </span>
            {deal.paypalInvoiceNumber && (
              <>
                <span>•</span>
                <span>
                  Invoice:{" "}
                  <code className="text-amber-300 font-mono">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-sky-300 border border-slate-700 transition"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            PayPal API JSON
          </button>
          {deal.paypalApprovalUrl && (
            <a
              href={deal.paypalApprovalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#FFC439]/15 hover:bg-[#FFC439]/25 text-[#FFC439] border border-[#FFC439]/30 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Sandbox
            </a>
          )}
        </div>
      </div>

      {/* Pricing, Vendor Floor & Policy Gate Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-800/80 bg-slate-950/50 divide-x divide-slate-800/80">
        <div className="p-3">
          <div className="text-[11px] text-slate-400 uppercase font-semibold">
            Quote vs Vendor Floor
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-sm font-mono text-slate-400 line-through">
              ${deal.initialQuoteUsd.toLocaleString()}
            </span>
            <span className="text-xs font-mono text-amber-300">
              Floor: ${deal.vendorPriceFloorUsd.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="p-3">
          <div className="text-[11px] text-sky-400 uppercase font-semibold">
            Authorized Hold (v2 Order)
          </div>
          <div className="text-base font-mono font-bold text-white mt-0.5">
            ${deal.aiNegotiatedUsd.toLocaleString()} USD{" "}
            <span className="text-xs text-emerald-400 font-normal">
              (-{deal.savingsPct}%)
            </span>
          </div>
        </div>
        <div className="p-3">
          <div className="text-[11px] text-emerald-400 uppercase font-semibold">
            Deterministic File Gate
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`text-sm font-mono font-bold ${
                det.allDeterministicPassed
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {det.checks.filter((c) => c.passed).length}/{det.checks.length}{" "}
              Passed
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
              {det.unitTestsPassed}/{det.unitTestsTotal} Tests
            </span>
          </div>
        </div>
        <div className="p-3">
          <div className="text-[11px] text-amber-400 uppercase font-semibold">
            Release Policy Gate
          </div>
          <div className="text-xs font-mono text-slate-200 mt-1">
            {deal.aiNegotiatedUsd > deal.autoCaptureThresholdUsd ? (
              <span className="text-amber-300 font-semibold">
                &gt; ${deal.autoCaptureThresholdUsd}: Human Sign-Off Req.
              </span>
            ) : (
              <span className="text-emerald-300 font-semibold">
                &lt;= ${deal.autoCaptureThresholdUsd}: Auto-Capture Eligible
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap border-b border-slate-800 bg-slate-900/60 px-4 pt-2 gap-1.5">
        <button
          onClick={() => setActiveTab("verification")}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "verification"
              ? "border-[#009CDE] text-white bg-slate-800/70"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-[#009CDE]" />
          1. Deliverable File Gate & Human Sign-Off
        </button>
        <button
          onClick={() => setActiveTab("splits")}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "splits"
              ? "border-[#009CDE] text-white bg-slate-800/70"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          2. Split Payout Breakdown ({deal.splitRecipients.length})
        </button>
        <button
          onClick={() => setActiveTab("negotiation")}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "negotiation"
              ? "border-[#009CDE] text-white bg-slate-800/70"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-amber-400" />
          3. Buyer vs Vendor Floor Negotiation ({deal.agentNegotiationLog.length})
        </button>
        <button
          onClick={() => setActiveTab("audit_trail")}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "audit_trail"
              ? "border-[#009CDE] text-white bg-slate-800/70"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Wrench className="w-3.5 h-3.5 text-purple-400" />
          4. @paypal/agent-toolkit & SHA-256 Trail ({deal.toolkitCallTraces.length + deal.auditTrail.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4 flex-1">
        {activeTab === "verification" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 7 cols: Real Deliverable File Inspector & Deterministic Checks */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {deal.milestoneTitle}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5">
                    <Hash className="w-3 h-3 text-sky-400" />
                    <span>
                      File: <strong className="text-slate-200">{det.fileName}</strong> ({det.fileSizeBytes} bytes)
                    </span>
                    <span>•</span>
                    <span>SHA-256: {det.sha256Digest.slice(0, 16)}…</span>
                  </div>
                </div>
              </div>

              {/* Stage 1: Deterministic Programmatic Rules Table */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  Stage 1: Deterministic Programmatic Checks (Code-Enforced, Zero LLM Hallucination)
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {det.checks.map((chk, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                        chk.passed
                          ? "bg-emerald-950/20 border-emerald-500/25 text-emerald-200"
                          : "bg-rose-950/30 border-rose-500/35 text-rose-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {chk.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span className="font-medium">{chk.rule}</span>
                      </div>
                      <span className="text-[11px] font-mono opacity-90 ml-2">
                        {chk.actual}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deliverable File Switcher / Upload / Raw File Content */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-300">
                      Deliverable Artifact File:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        loadWorkspaceSampleFile(
                          "shopify-checkout-audit-PASS.json"
                        )
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition ${
                        fileName.includes("PASS")
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                      }`}
                    >
                      <FileJson className="w-3 h-3 inline mr-1" />
                      Load Passing File (48/48 Tests)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        loadWorkspaceSampleFile(
                          "shopify-checkout-audit-DEFECTIVE.json"
                        )
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition ${
                        fileName.includes("DEFECTIVE")
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                      }`}
                    >
                      <FileJson className="w-3 h-3 inline mr-1" />
                      Load Broken File (39/48 Tests, 612KB, 1 CVE)
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 cursor-pointer transition">
                      <Upload className="w-3 h-3" />
                      Upload JSON/Code File
                      <input
                        type="file"
                        accept=".json,.txt,.md,.sarif,.ts,.js"
                        onChange={handleDeliverableFileUpload}
                        className="hidden"
                      />
                    </label>
                    <label className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 cursor-pointer transition">
                      <Upload className="w-3 h-3" />
                      {uploadedImagePreview ? "Screenshot ✓" : "+ UI Screenshot"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl bg-slate-950/90 border border-slate-800 p-3 font-mono text-[11px] text-emerald-300 focus:outline-none focus:border-[#009CDE]"
                />
              </div>
            </div>

            {/* Right 5 cols: Stage 2 (Gemini 3.8 Flash) + Stage 3 (Human Sign-Off Policy Gate & PayPal Capture) */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                    Stage 2 & 3: Gemini 3.8 Review + Human Policy Gate
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                    {deal.paypalMode === "LIVE_SANDBOX"
                      ? "LIVE SANDBOX"
                      : "SANDBOX READY"}
                  </span>
                </div>

                {/* Gemini Semantic Review Box */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-200">
                      Gemini 3.8 Flash Semantic File Review:
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        deal.geminiReview.passed
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {deal.geminiReview.passed ? "PASSED" : "BLOCKED"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {deal.geminiReview.summary}
                  </p>
                </div>

                {/* Step 1 Button: Run Deterministic + Gemini Verification on File */}
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
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-[#0070BA] via-[#0085D1] to-[#009CDE] hover:brightness-110 text-white shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4 text-[#FFC439]" />
                  {isProcessing
                    ? "Running SHA-256, Test Suite & Gemini 3.8 Checks..."
                    : `1. Inspect "${fileName}" (Deterministic + Gemini 3.8)`}
                </button>

                {/* Step 2 Box: Human-in-the-Loop Sign-Off Gate (Required when contract > $500) */}
                {deal.status === "AWAITING_BUYER_SIGN_OFF" && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-2.5">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                      <UserCheck className="w-4 h-4 shrink-0" />
                      <span>
                        Human Buyer Sign-Off Required (&gt; $
                        {deal.autoCaptureThresholdUsd} Policy Cap)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      All deterministic checks and Gemini 3.8 Flash inspections passed. Because this contract is{" "}
                      <strong className="text-white">
                        ${deal.aiNegotiatedUsd.toLocaleString()} USD
                      </strong>
                      , PayPulse never auto-releases funds without explicit buyer approval:
                    </p>
                    <input
                      type="text"
                      value={approverName}
                      onChange={(e) => setApproverName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-amber-500/30 text-xs text-white font-medium"
                      placeholder="Approver Name / Role"
                    />
                    <button
                      onClick={() => onHumanBuyerApprove(deal, approverName)}
                      disabled={isProcessing}
                      className="w-full py-2.5 px-4 rounded-xl font-extrabold text-xs bg-gradient-to-r from-[#FFC439] to-[#F5B000] hover:brightness-105 text-slate-950 shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      <UserCheck className="w-4 h-4 text-[#003087]" />
                      {isProcessing
                        ? "Capturing PayPal Authorization & Splitting Payout..."
                        : `2. Approve & Capture $${deal.aiNegotiatedUsd.toLocaleString()} PayPal Hold`}
                    </button>
                  </div>
                )}

                {deal.status === "HOLD_BLOCKED_FAILED_CHECKS" && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200 space-y-1">
                    <div className="font-bold text-rose-300">
                      ⛔ Capture Hard-Blocked by Deterministic Gate
                    </div>
                    <p className="text-[11px] text-rose-200/90">
                      PayPal Order <code className="font-mono">{deal.paypalOrderId}</code> cannot be captured until all failing unit tests, bundle size limits, and security findings are resolved.
                    </p>
                  </div>
                )}
              </div>

              {/* Official PayPal Smart Checkout SDK (@paypal/react-paypal-js) */}
              <div className="pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-[#FFC439]" />
                    Buyer Authorization Checkout (@paypal/react-paypal-js)
                  </span>
                </div>

                {hasValidClientId ? (
                  <div className="bg-white p-2.5 rounded-xl">
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
                          height: 35,
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
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-[#FFC439]" />
                      <div className="leading-tight">
                        <div className="text-xs font-bold text-white">
                          PayPal Orders v2 (intent: AUTHORIZE)
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          Order {deal.paypalOrderId} • Add Client ID in API Keys to render live Smart Buttons
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "splits" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-300">
                Once captured,{" "}
                <strong className="text-emerald-400">
                  ${deal.aiNegotiatedUsd.toLocaleString()} USD
                </strong>{" "}
                is disbursed via{" "}
                <code className="text-sky-300">POST /v1/payments/payouts</code>{" "}
                across the freelance team:
              </div>
              {deal.paypalPayoutBatchId && (
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Batch ID: {deal.paypalPayoutBatchId}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {deal.splitRecipients.map((rec, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/70 flex flex-col justify-between space-y-2"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                        {rec.role}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                          rec.status === "SENT"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : rec.status === "BLOCKED"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {rec.status}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white mt-1">
                      {rec.name}
                    </div>
                    <div className="text-xs font-mono text-slate-400 truncate">
                      {rec.email}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Split: <strong className="text-slate-200">{rec.sharePct}%</strong>
                    </span>
                    <span className="text-sm font-mono font-bold text-emerald-400">
                      ${rec.amountUsd.toLocaleString()} USD
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "negotiation" && (
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
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
                          ? "🛡️ Deterministic + Gemini Verification Gate"
                          : "🧰 @paypal/agent-toolkit Execution"}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
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
                Cryptographic & Human Sign-Off Audit Trail
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
