"use client";

import React, { useState, useEffect, useMemo } from "react";
import { INITIAL_DEALS, INITIAL_TELEMETRY } from "@/lib/initial-data";
import {
  AgentTelemetryEvent,
  EscrowDeal,
  RuntimeCredentials,
} from "@/types/paypulse";
import PayPulseAgGrid from "@/components/PayPulseAgGrid";
import PayPalEscrowWorkbench from "@/components/PayPalEscrowWorkbench";
import AgentCommandPanel from "@/components/AgentCommandPanel";
import {
  ShieldCheck,
  Sparkles,
  Wallet,
  TrendingDown,
  Settings,
  CheckCircle2,
  X,
  Copy,
  Check,
  Code2,
  KeyRound,
  Cpu,
  Layers,
  Building2,
  Briefcase,
} from "lucide-react";

export default function PayPulseHomePage() {
  const [deals, setDeals] = useState<EscrowDeal[]>(INITIAL_DEALS);
  const [selectedDealId, setSelectedDealId] = useState<string>(
    INITIAL_DEALS[0].id
  );
  const [telemetry, setTelemetry] =
    useState<AgentTelemetryEvent[]>(INITIAL_TELEMETRY);

  // Two-sided perspective switcher: Small Business Buyer vs Freelancer/Agency Vendor
  const [activePerspective, setActivePerspective] = useState<
    "BUYER" | "VENDOR"
  >("BUYER");

  const [isNegotiating, setIsNegotiating] = useState(false);
  const [processingDealId, setProcessingDealId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Payload Inspector Modal
  const [payloadModalDeal, setPayloadModalDeal] = useState<EscrowDeal | null>(
    null
  );
  const [copiedJson, setCopiedJson] = useState(false);

  // Runtime Credentials Modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [runtimeCreds, setRuntimeCreds] = useState<RuntimeCredentials>({
    paypalClientId: "",
    paypalClientSecret: "",
    geminiApiKey: "",
  });
  const [apiStatus, setApiStatus] = useState<{
    paypalConfigured: boolean;
    paypalTokenVerified: boolean;
    geminiConfigured: boolean;
  }>({
    paypalConfigured: false,
    paypalTokenVerified: false,
    geminiConfigured: false,
  });

  const selectedDeal = useMemo(
    () => deals.find((d) => d.id === selectedDealId) || deals[0],
    [deals, selectedDealId]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem("paypulse_runtime_creds");
      if (saved) {
        const parsed = JSON.parse(saved) as RuntimeCredentials;
        setRuntimeCreds(parsed);
        checkBackendStatus(parsed);
      } else {
        checkBackendStatus({});
      }
    } catch {
      checkBackendStatus({});
    }
  }, []);

  const checkBackendStatus = async (creds: RuntimeCredentials) => {
    try {
      const res = await fetch("/api/paypal/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtime: creds }),
      });
      if (res.ok) {
        const data = await res.json();
        setApiStatus(data);
      }
    } catch {
      // Ignore check error
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 6000);
  };

  const kpis = useMemo(() => {
    const totalInitial = deals.reduce((s, d) => s + d.initialQuoteUsd, 0);
    const totalNegotiated = deals.reduce((s, d) => s + d.aiNegotiatedUsd, 0);
    const totalSavings = deals.reduce((s, d) => s + d.savingsUsd, 0);
    const savingsPct =
      totalInitial > 0
        ? ((totalSavings / totalInitial) * 100).toFixed(1)
        : "0.0";
    const settledAmount = deals
      .filter((d) => d.status === "CAPTURED_AND_SPLIT_PAID")
      .reduce((s, d) => s + d.aiNegotiatedUsd, 0);
    const activeHolds = deals
      .filter(
        (d) =>
          d.status === "AUTHORIZED_HOLD" ||
          d.status === "AWAITING_BUYER_SIGN_OFF" ||
          d.status === "INVOICED"
      )
      .reduce((s, d) => s + d.aiNegotiatedUsd, 0);
    const blockedAmount = deals
      .filter((d) => d.status === "HOLD_BLOCKED_FAILED_CHECKS")
      .reduce((s, d) => s + d.aiNegotiatedUsd, 0);

    return {
      totalInitial,
      totalNegotiated,
      totalSavings,
      savingsPct,
      settledAmount,
      activeHolds,
      blockedAmount,
    };
  }, [deals]);

  // Handler 1: Two-Agent Negotiation (Buyer Target vs Vendor Floor) + @paypal/agent-toolkit Order & Invoice
  const handleLaunchNegotiation = async (payload: {
    clientBusinessName: string;
    vendorName: string;
    vendorEmail: string;
    category: EscrowDeal["category"];
    projectTitle: string;
    initialQuoteUsd: number;
    vendorPriceFloorUsd: number;
    buyerTargetBudgetUsd: number;
    autoCaptureThresholdUsd: number;
    buyerBrief?: string;
  }) => {
    setIsNegotiating(true);
    try {
      const res = await fetch("/api/agent/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          runtime: runtimeCreds,
        }),
      });
      const data = await res.json();
      if (data.deal) {
        setDeals((prev) => [data.deal, ...prev]);
        setSelectedDealId(data.deal.id);
        if (data.telemetry) {
          setTelemetry((prev) => [data.telemetry, ...prev]);
        }
        showToast(
          `Agreed at $${data.deal.aiNegotiatedUsd.toLocaleString()} (-${data.deal.savingsPct}% vs $${data.deal.vendorPriceFloorUsd.toLocaleString()} vendor floor) -> Created PayPal Hold Order ${data.deal.paypalOrderId}!`
        );
      }
    } finally {
      setIsNegotiating(false);
    }
  };

  // Handler 2: Inspect Actual Deliverable File (Stage 1 Deterministic + Stage 2 Gemini 3.8 Flash + Stage 3 Policy Gate)
  const handleRunFileVerification = async (
    deal: EscrowDeal,
    fileName?: string,
    fileContent?: string,
    imageBase64?: string,
    imageMimeType?: string
  ) => {
    setProcessingDealId(deal.id);
    try {
      const res = await fetch("/api/agent/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal,
          submittedFileName: fileName || deal.submittedFileName,
          submittedFileContent: fileContent ?? deal.submittedFileRawContent,
          imageBase64,
          imageMimeType,
          runtime: runtimeCreds,
        }),
      });
      const data = await res.json();
      if (data.deal) {
        setDeals((prev) =>
          prev.map((d) => (d.id === data.deal.id ? data.deal : d))
        );
        setSelectedDealId(data.deal.id);
        if (data.telemetry) {
          setTelemetry((prev) => [data.telemetry, ...prev]);
        }

        if (data.deal.status === "AWAITING_BUYER_SIGN_OFF") {
          showToast(
            `All deterministic & Gemini 3.8 checks PASSED on ${data.deal.submittedFileName}! Routed to Human Buyer Sign-Off ($${data.deal.aiNegotiatedUsd.toLocaleString()} > $${data.deal.autoCaptureThresholdUsd} policy cap).`
          );
        } else if (data.deal.status === "CAPTURED_AND_SPLIT_PAID") {
          showToast(
            `Micro-milestone (<= $${data.deal.autoCaptureThresholdUsd}) verified -> Auto-captured Order ${data.deal.paypalOrderId} & sent Split Payout ${data.deal.paypalPayoutBatchId}!`
          );
        } else {
          showToast(
            `CAPTURE BLOCKED: ${data.deal.submittedFileName} failed deterministic checks. $${data.deal.aiNegotiatedUsd.toLocaleString()} USD hold remains uncaptured.`
          );
        }
      }
    } finally {
      setProcessingDealId(null);
    }
  };

  // Handler 3: Explicit Human Buyer Sign-Off (Captures PayPal Authorization & Releases Split Payout)
  const handleHumanBuyerApprove = async (
    deal: EscrowDeal,
    approverName?: string
  ) => {
    setProcessingDealId(deal.id);
    try {
      const res = await fetch("/api/agent/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal,
          humanApprovalAction: "APPROVE_AND_CAPTURE",
          humanApproverName:
            approverName || `${deal.clientBusinessName} (Authorized Buyer)`,
          runtime: runtimeCreds,
        }),
      });
      const data = await res.json();
      if (data.deal) {
        setDeals((prev) =>
          prev.map((d) => (d.id === data.deal.id ? data.deal : d))
        );
        setSelectedDealId(data.deal.id);
        if (data.telemetry) {
          setTelemetry((prev) => [data.telemetry, ...prev]);
        }
        showToast(
          `Human Buyer Sign-Off recorded! Captured PayPal Order ${data.deal.paypalOrderId} (${data.deal.paypalCaptureId}) & disbursed Split Payout Batch ${data.deal.paypalPayoutBatchId}!`
        );
      }
    } finally {
      setProcessingDealId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(
      "paypulse_runtime_creds",
      JSON.stringify(runtimeCreds)
    );
    await checkBackendStatus(runtimeCreds);
    setShowSettingsModal(false);
    showToast("PayPal Sandbox & Gemini 3.8 Flash credentials saved!");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050914] text-slate-100">
      {/* Top Executive Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070C1B]/90 backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#003087] via-[#0070BA] to-[#009CDE] flex items-center justify-center shadow-lg shadow-blue-950/60 border border-sky-400/30">
              <Wallet className="w-5 h-5 text-[#FFC439]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-white">
                  PayPulse <span className="text-[#009CDE]">AI</span>
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FFC439]/15 text-[#FFC439] border border-[#FFC439]/30">
                  Hold-Then-Capture Milestone Payments
                </span>
              </div>
              <p className="text-xs text-slate-400">
                For Small Businesses Hiring Freelancers & Agencies • Powered by @paypal/agent-toolkit, Gemini 3.8 Flash & AG Grid
              </p>
            </div>
          </div>

          {/* Two-Sided Perspective Switcher + Live Sandbox Status */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Two-Sided Role Toggle */}
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActivePerspective("BUYER")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  activePerspective === "BUYER"
                    ? "bg-[#0070BA] text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Small Business Client (Buyer)
              </button>
              <button
                onClick={() => setActivePerspective("VENDOR")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  activePerspective === "VENDOR"
                    ? "bg-[#FFC439] text-slate-950 shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                Freelancer / Agency (Vendor)
              </button>
            </div>

            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>Gemini 3.8 Flash</span>
              <span
                className={`font-mono ${
                  apiStatus.geminiConfigured
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                ●
              </span>
            </div>

            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300">
              <Layers className="w-3.5 h-3.5 text-[#FFC439]" />
              <span>
                {apiStatus.paypalTokenVerified
                  ? "PayPal Sandbox: Live Connected"
                  : "PayPal Sandbox: Add Keys for Live API"}
              </span>
            </div>

            {/* Credentials & Sandbox Settings Button */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition"
            >
              <Settings className="w-3.5 h-3.5 text-sky-400" />
              API Keys
            </button>
          </div>
        </div>
      </header>

      {/* Live Toast Banner */}
      {toastMessage && (
        <div className="bg-gradient-to-r from-[#003087] via-[#0070BA] to-[#003087] border-b border-sky-400/30 px-4 py-2 text-center text-xs font-semibold text-white flex items-center justify-center gap-2 shadow-lg">
          <Sparkles className="w-4 h-4 text-[#FFC439] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5 flex-1">
        {/* 4 Executive Financial KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl border border-slate-800/90 bg-gradient-to-br from-[#0B1120] to-[#0F172A] shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Authorized Milestone Volume
              </span>
              <div className="p-2 rounded-lg bg-blue-500/15 text-sky-400">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-extrabold text-white">
                ${kpis.totalNegotiated.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-slate-400 line-through">
                ${kpis.totalInitial.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Across {deals.length} PayPal Orders v2 (intent: AUTHORIZE) & Invoices
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[#0B1120] via-[#09191F] to-[#0B1120] shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Negotiated Client Savings
              </span>
              <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-extrabold text-emerald-400">
                ${kpis.totalSavings.toLocaleString()}
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                -{kpis.savingsPct}% Avg
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Bounded by each freelancer/agency&apos;s walk-away price floor
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-sky-500/25 bg-gradient-to-br from-[#0B1120] via-[#0A1529] to-[#0B1120] shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                Active Holds & Captured Payouts
              </span>
              <div className="p-2 rounded-lg bg-sky-500/15 text-sky-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-extrabold text-white">
                ${kpis.activeHolds.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-emerald-400">
                + ${kpis.settledAmount.toLocaleString()} Captured
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Requires Human Buyer Sign-Off above $500 policy threshold
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-amber-500/25 bg-gradient-to-br from-[#0B1120] via-[#19130D] to-[#0B1120] shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#FFC439]">
                Blocked by Deterministic Gate
              </span>
              <div className="p-2 rounded-lg bg-amber-500/15 text-[#FFC439]">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-extrabold text-[#FFC439]">
                ${kpis.blockedAmount.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-rose-300">
                Uncaptured Hold
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Hard-blocked by unit test, bundle size & SARIF CVE checks
            </p>
          </div>
        </section>

        {/* Top Full-Width AG Grid Community v33 Command Center */}
        <section>
          <PayPulseAgGrid
            deals={deals}
            selectedDealId={selectedDeal.id}
            activePerspective={activePerspective}
            onSelectDeal={(deal) => setSelectedDealId(deal.id)}
            onInspectDeliverableFile={(deal) =>
              handleRunFileVerification(
                deal,
                deal.submittedFileName,
                deal.submittedFileRawContent
              )
            }
            onHumanApproveCapture={(deal) => handleHumanBuyerApprove(deal)}
            onOpenPayloadModal={(deal) => setPayloadModalDeal(deal)}
            isProcessingId={processingDealId}
          />
        </section>

        {/* Bottom Split Workspace */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7">
            <PayPalEscrowWorkbench
              deal={selectedDeal}
              activePerspective={activePerspective}
              paypalClientId={
                runtimeCreds.paypalClientId ||
                process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
              }
              isProcessing={processingDealId === selectedDeal.id}
              onRunFileVerification={(
                deal,
                fileName,
                fileContent,
                imgBase64,
                imgMime
              ) =>
                handleRunFileVerification(
                  deal,
                  fileName,
                  fileContent,
                  imgBase64,
                  imgMime
                )
              }
              onHumanBuyerApprove={(deal, approver) =>
                handleHumanBuyerApprove(deal, approver)
              }
              onOpenPayloadModal={(deal) => setPayloadModalDeal(deal)}
            />
          </div>

          <div className="lg:col-span-5">
            <AgentCommandPanel
              onLaunchNegotiation={handleLaunchNegotiation}
              isNegotiating={isNegotiating}
              telemetry={telemetry}
            />
          </div>
        </section>
      </main>

      {/* Modal 1: PayPal REST v2 Raw JSON Payload Inspector */}
      {payloadModalDeal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#0B1120] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#009CDE]" />
                <h3 className="text-sm font-bold text-white">
                  PayPal REST API & @paypal/agent-toolkit Payload —{" "}
                  <span className="text-[#FFC439] font-mono">
                    {payloadModalDeal.contractCode}
                  </span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      JSON.stringify(payloadModalDeal.rawPayPalPayload, null, 2)
                    );
                    setCopiedJson(true);
                    setTimeout(() => setCopiedJson(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-sky-400" />
                      Copy JSON
                    </>
                  )}
                </button>
                <button
                  onClick={() => setPayloadModalDeal(null)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto bg-slate-950">
              <pre className="text-xs font-mono text-emerald-300 whitespace-pre-wrap">
                {JSON.stringify(payloadModalDeal.rawPayPalPayload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Live PayPal Sandbox & Gemini 3.8 Flash Credentials */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0B1120] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#FFC439]" />
                <h3 className="text-sm font-bold text-white">
                  Live PayPal Sandbox & Gemini 3.8 Flash Credentials
                </h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-5 space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter your PayPal Developer Sandbox credentials and Google
                Gemini API Key below (or in{" "}
                <code className="text-slate-200">.env.local</code>) so{" "}
                <code className="text-sky-300">@paypal/agent-toolkit</code> and{" "}
                <code className="text-sky-300">gemini-3.8-flash</code> execute
                live calls against{" "}
                <code className="text-sky-300">api-m.sandbox.paypal.com</code>:
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  PayPal Sandbox Client ID
                </label>
                <input
                  type="text"
                  value={runtimeCreds.paypalClientId || ""}
                  onChange={(e) =>
                    setRuntimeCreds((p) => ({
                      ...p,
                      paypalClientId: e.target.value,
                    }))
                  }
                  placeholder="AeA1QIZXiflr1_-r0..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-[#009CDE]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  PayPal Sandbox Client Secret
                </label>
                <input
                  type="password"
                  value={runtimeCreds.paypalClientSecret || ""}
                  onChange={(e) =>
                    setRuntimeCreds((p) => ({
                      ...p,
                      paypalClientSecret: e.target.value,
                    }))
                  }
                  placeholder="ECYYrrSHdK..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-[#009CDE]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Google Gemini API Key (gemini-3.8-flash)
                </label>
                <input
                  type="password"
                  value={runtimeCreds.geminiApiKey || ""}
                  onChange={(e) =>
                    setRuntimeCreds((p) => ({
                      ...p,
                      geminiApiKey: e.target.value,
                    }))
                  }
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-[#009CDE]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#0070BA] to-[#009CDE] text-xs font-bold text-white shadow"
                >
                  Verify & Save Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
