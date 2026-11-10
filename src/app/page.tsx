"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  AgentTelemetryEvent,
  EscrowDeal,
  RuntimeCredentials,
} from "@/types/paypulse";
import PayPulseAgGrid from "@/components/PayPulseAgGrid";
import PayPalEscrowWorkbench from "@/components/PayPalEscrowWorkbench";
import AgentCommandPanel, { NegotiationPayload } from "@/components/AgentCommandPanel";
import {
  Sparkles,
  Wallet,
  Settings,
  X,
  Copy,
  Check,
  Code2,
  KeyRound,
  Layers,
  Building2,
  Briefcase,
  RotateCcw,
  AlertTriangle,
  Loader2,
} from "lucide-react";

interface ApiStatus {
  paypalConfigured: boolean;
  paypalTokenVerified: boolean;
  geminiConfigured: boolean;
  allowRuntimeCredentials: boolean;
  paypalEnvironmentValid?: boolean;
  environment?: string;
}

const CREDS_KEY = "paypulse_runtime_creds";

export default function PayPulseHomePage() {
  const [deals, setDeals] = useState<EscrowDeal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [telemetry, setTelemetry] = useState<AgentTelemetryEvent[]>([]);

  // Role view only. This is a UI perspective, not an access control (the demo has no accounts).
  const [activePerspective, setActivePerspective] = useState<"BUYER" | "VENDOR">("BUYER");

  const [isNegotiating, setIsNegotiating] = useState(false);
  const [processingDealId, setProcessingDealId] = useState<string | null>(null);
  const [processingStageText, setProcessingStageText] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "error" } | null>(null);

  const [payloadModalDeal, setPayloadModalDeal] = useState<EscrowDeal | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [runtimeCreds, setRuntimeCreds] = useState<RuntimeCredentials>({
    paypalClientId: "",
    paypalClientSecret: "",
    geminiApiKey: "",
  });
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    paypalConfigured: false,
    paypalTokenVerified: false,
    geminiConfigured: false,
    allowRuntimeCredentials: false,
  });

  const selectedDeal = useMemo(
    () => deals.find((d) => d.id === selectedDealId) || deals[0],
    [deals, selectedDealId]
  );

  const showToast = useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast((prev) => (prev?.msg === msg ? null : prev)), kind === "error" ? 12000 : 7000);
  }, []);

  const checkBackendStatus = useCallback(async (creds: RuntimeCredentials) => {
    try {
      const res = await fetch("/api/paypal/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtime: creds }),
      });
      if (res.ok) setApiStatus(await res.json());
    } catch {
      // status badge simply stays on its last value
    }
  }, []);

  const loadDeals = useCallback(async () => {
    setLoadingDeals(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/deals", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDeals(data.deals);
      setTelemetry(data.telemetry);
      setSelectedDealId((prev) =>
        data.deals.some((d: EscrowDeal) => d.id === prev) ? prev : data.deals[0]?.id || ""
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load contracts");
    } finally {
      setLoadingDeals(false);
    }
  }, []);

  useEffect(() => {
    loadDeals();
    // Session storage (cleared when the tab closes) rather than localStorage.
    let saved: RuntimeCredentials = {};
    try {
      const raw = sessionStorage.getItem(CREDS_KEY);
      if (raw) saved = JSON.parse(raw) as RuntimeCredentials;
      localStorage.removeItem(CREDS_KEY); // clean up keys stored by earlier versions
    } catch {
      saved = {};
    }
    setRuntimeCreds((p) => ({ ...p, ...saved }));
    checkBackendStatus(saved);

    const params = new URLSearchParams(window.location.search);
    if (params.get("paypal")) {
      const returned = params.get("paypal") === "return";
      showToast(
        returned
          ? `Returned from PayPal for ${params.get("contract") || "your contract"}. Click "Approve & Capture" to continue.`
          : "PayPal approval was cancelled. The hold is not active.",
        returned ? "ok" : "error"
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadDeals, checkBackendStatus, showToast]);

  const applyDeal = (deal: EscrowDeal, tel?: AgentTelemetryEvent, prepend = false) => {
    setDeals((prev) =>
      prev.some((d) => d.id === deal.id)
        ? prev.map((d) => (d.id === deal.id ? deal : d))
        : prepend
        ? [deal, ...prev]
        : [...prev, deal]
    );
    setSelectedDealId(deal.id);
    if (tel) setTelemetry((prev) => [tel, ...prev]);
  };

  async function postJson(url: string, payload: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  const handleResetDemo = async () => {
    const { ok, data } = await postJson("/api/deals/reset", {});
    if (!ok) return showToast(data.error || "Reset failed", "error");
    setDeals(data.deals);
    setTelemetry(data.telemetry);
    setSelectedDealId(data.deals[0]?.id || "");
    setActivePerspective("BUYER");
    showToast("Reset to the demo contracts. Your own contracts were cleared.");
  };

  const handleLaunchNegotiation = async (payload: NegotiationPayload) => {
    setIsNegotiating(true);
    try {
      const { ok, data } = await postJson("/api/agent/negotiate", { ...payload, runtime: runtimeCreds });
      if (!ok) {
        const fields = data.fieldErrors
          ? Object.entries(data.fieldErrors).map(([k, v]) => `${k} ${v}`).join("; ")
          : "";
        return showToast(`Could not create contract: ${fields || data.error}`, "error");
      }
      applyDeal(data.deal, data.telemetry, true);
      const d: EscrowDeal = data.deal;
      showToast(
        `Negotiated $${d.initialQuoteUsd.toLocaleString()} to $${d.aiNegotiatedUsd.toLocaleString()} (-${d.savingsPct}%, floor $${d.vendorPriceFloorUsd.toLocaleString()}). ${
          d.paypalMode === "LIVE_SANDBOX"
            ? `PayPal Sandbox order ${d.paypalOrderId} created. Buyer must approve the hold.`
            : "Hold SIMULATED: no PayPal API call was made."
        }`
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Network error", "error");
    } finally {
      setIsNegotiating(false);
    }
  };

  const handleRunFileVerification = async (
    deal: EscrowDeal,
    fileName: string,
    fileContent: string,
    imageBase64?: string,
    imageMimeType?: string
  ) => {
    setProcessingDealId(deal.id);
    setProcessingStageText(`[Stage 1/2] Computing SHA-256 and checking rules on "${fileName}"...`);
    const stageTimer = setTimeout(
      () => setProcessingStageText("[Stage 2/2] Running the Stage 2 review and checking the buyer approval gate..."),
      600
    );
    try {
      const { ok, data } = await postJson("/api/agent/audit", {
        dealId: deal.id,
        submittedFileName: fileName,
        submittedFileContent: fileContent,
        imageBase64,
        imageMimeType,
        runtime: runtimeCreds,
      });
      if (!ok) return showToast(data.error || "Verification failed", "error");
      applyDeal(data.deal, data.telemetry);
      const d: EscrowDeal = data.deal;
      if (data.settlementError) {
        showToast(`Checks passed but auto-capture was deferred: ${data.settlementError}`, "error");
      } else if (d.status === "AWAITING_BUYER_SIGN_OFF") {
        showToast(`Checks passed on ${d.submittedFileName}. Waiting for buyer approval of $${d.aiNegotiatedUsd.toLocaleString()}.`);
      } else if (d.status === "CAPTURED_AND_SPLIT_PAID") {
        showToast(
          d.paypalMode === "LIVE_SANDBOX"
            ? `Verified and auto-captured (within the $${d.autoCaptureThresholdUsd} limit). Payout batch ${d.paypalPayoutBatchId} submitted.`
            : `Verified. SIMULATED auto-capture (no PayPal API call, no money moved).`
        );
      } else {
        showToast(`Blocked: ${d.submittedFileName} failed ${d.deterministicAudit.checks.filter((c) => !c.passed).length} deterministic rule(s). Capture is blocked.`, "error");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Network error", "error");
    } finally {
      clearTimeout(stageTimer);
      setProcessingDealId(null);
      setProcessingStageText(null);
    }
  };

  const handleHumanBuyerApprove = async (deal: EscrowDeal) => {
    const simulated = deal.isDemoSeed || deal.paypalMode !== "LIVE_SANDBOX";
    setProcessingDealId(deal.id);
    setProcessingStageText(
      simulated
        ? "[1/2] Simulating capture (no PayPal API call)..."
        : `[1/2] Capturing PayPal authorization for order ${deal.paypalOrderId}...`
    );
    const t = setTimeout(
      () =>
        setProcessingStageText(
          simulated
            ? `[2/2] Simulating payout across ${deal.splitRecipients.length} recipient(s)...`
            : `[2/2] Submitting payout batch to ${deal.splitRecipients.length} recipient(s)...`
        ),
      550
    );
    try {
      const { ok, data } = await postJson("/api/agent/audit", {
        dealId: deal.id,
        humanApprovalAction: "APPROVE_AND_CAPTURE",
        runtime: runtimeCreds,
      });
      if (!ok) {
        await loadDeals(); // pick up any partial progress the server saved (e.g. capture succeeded, payout failed)
        return showToast(data.error || "Approval failed", "error");
      }
      applyDeal(data.deal, data.telemetry);
      showToast(
        data.deal.paypalMode === "LIVE_SANDBOX"
          ? `Approved. Captured on PayPal Sandbox and submitted payout batch ${data.deal.paypalPayoutBatchId}.`
          : `Approved. SIMULATED capture and payout: no PayPal API call was made and no money moved.`
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Network error", "error");
    } finally {
      clearTimeout(t);
      setProcessingDealId(null);
      setProcessingStageText(null);
    }
  };

  const handleAuthorizeHold = async (deal: EscrowDeal) => {
    setProcessingDealId(deal.id);
    setProcessingStageText("Checking PayPal for the buyer's approval and authorizing the hold...");
    try {
      const { ok, data } = await postJson("/api/paypal/authorize", { dealId: deal.id, runtime: runtimeCreds });
      if (!ok) return showToast(data.error || "Could not authorize the hold", "error");
      applyDeal(data.deal, data.telemetry);
      showToast(`Hold authorized: ${data.deal.paypalAuthorizationId}.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Network error", "error");
    } finally {
      setProcessingDealId(null);
      setProcessingStageText(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem(CREDS_KEY, JSON.stringify(runtimeCreds));
    await checkBackendStatus(runtimeCreds);
    setShowSettingsModal(false);
    showToast("Credentials saved for this browser tab only.");
  };

  const sandboxLabel =
    apiStatus.paypalEnvironmentValid === false
      ? `Unsupported PAYPAL_ENVIRONMENT (${apiStatus.environment})`
      : apiStatus.paypalTokenVerified
      ? "PayPal Sandbox: connected"
      : apiStatus.paypalConfigured
      ? "PayPal Sandbox: credentials rejected"
      : "Preview mode: PayPal calls simulated";

  return (
    <div className="min-h-screen flex flex-col bg-[#050914] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#070C1B]/95 backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#003087] via-[#0070BA] to-[#009CDE] flex items-center justify-center shadow border border-sky-400/30">
              <Wallet className="w-5 h-5 text-[#FFC439]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white">
                  PayPulse <span className="text-[#009CDE]">AI</span>
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700">
                  Hold-Then-Capture Milestones
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Small Businesses Hiring Freelancers • @paypal/agent-toolkit + Gemini 3.8 Flash
              </p>
            </div>
          </div>

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border-2 border-slate-700 shadow-inner" title="View only: this demo has no accounts, so the switch is not an access control">
            <button
              onClick={() => setActivePerspective("BUYER")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition ${
                activePerspective === "BUYER" ? "bg-[#0070BA] text-white shadow-md" : "text-slate-400 hover:text-white"
              }`}
            >
              <Building2 className="w-4 h-4" />
              Buyer View (Small Business)
            </button>
            <button
              onClick={() => setActivePerspective("VENDOR")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition ${
                activePerspective === "VENDOR" ? "bg-[#FFC439] text-slate-950 shadow-md" : "text-slate-400 hover:text-white"
              }`}
            >
              <Briefcase className="w-4 h-4" />
              Freelancer View (Vendor)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                apiStatus.paypalTokenVerified
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                  : "bg-amber-950/40 border-amber-500/40 text-amber-300"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{sandboxLabel}</span>
            </div>

            <button
              onClick={handleResetDemo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition"
              title="Clear your contracts and reload the demo data"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              Reset Demo
            </button>

            <button
              onClick={() => setShowSettingsModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition"
            >
              <Settings className="w-3.5 h-3.5 text-sky-400" />
              API Keys
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div
          role="status"
          className={`border-b px-4 py-2 text-center text-xs font-bold text-white flex items-center justify-center gap-2 shadow-lg ${
            toast.kind === "error"
              ? "bg-gradient-to-r from-rose-900 via-rose-700 to-rose-900 border-rose-400/40"
              : "bg-gradient-to-r from-[#003087] via-[#0070BA] to-[#003087] border-sky-400/30"
          }`}
        >
          {toast.kind === "error" ? (
            <AlertTriangle className="w-4 h-4 text-[#FFC439] shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-[#FFC439] shrink-0" />
          )}
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <main className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-4 space-y-5 flex-1">
        {loadingDeals && (
          <div className="flex items-center justify-center gap-2 py-24 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-[#FFC439]" />
            Loading contracts...
          </div>
        )}

        {!loadingDeals && loadError && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-6 text-sm text-rose-200 flex items-center justify-between gap-3">
            <span>Could not load contracts: {loadError}</span>
            <button onClick={loadDeals} className="px-3 py-1.5 rounded-lg bg-rose-500 text-white font-bold text-xs">
              Retry
            </button>
          </div>
        )}

        {!loadingDeals && !loadError && selectedDeal && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-8">
                <PayPalEscrowWorkbench
                  deal={selectedDeal}
                  activePerspective={activePerspective}
                  onSwitchPerspective={(role) => setActivePerspective(role)}
                  paypalClientId={
                    (apiStatus.allowRuntimeCredentials ? runtimeCreds.paypalClientId : "") ||
                    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
                  }
                  isProcessing={processingDealId === selectedDeal.id}
                  processingStageText={processingStageText}
                  onRunFileVerification={handleRunFileVerification}
                  onHumanBuyerApprove={(deal) => handleHumanBuyerApprove(deal)}
                  onAuthorizeHold={(deal) => handleAuthorizeHold(deal)}
                  onOpenPayloadModal={(deal) => setPayloadModalDeal(deal)}
                  onError={(msg) => showToast(msg, "error")}
                />
              </div>

              <div className="lg:col-span-4">
                <AgentCommandPanel
                  onLaunchNegotiation={handleLaunchNegotiation}
                  isNegotiating={isNegotiating}
                  telemetry={telemetry}
                  liveMode={apiStatus.paypalTokenVerified}
                />
              </div>
            </section>

            <section>
              <PayPulseAgGrid
                deals={deals}
                selectedDealId={selectedDeal.id}
                activePerspective={activePerspective}
                onSelectDeal={(deal) => setSelectedDealId(deal.id)}
                onInspectDeliverableFile={(deal) => setSelectedDealId(deal.id)}
                onHumanApproveCapture={(deal) => handleHumanBuyerApprove(deal)}
                onOpenPayloadModal={(deal) => setPayloadModalDeal(deal)}
                isProcessingId={processingDealId}
              />
            </section>
          </>
        )}
      </main>

      {payloadModalDeal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#0B1120] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#009CDE]" />
                <h3 className="text-sm font-bold text-white">
                  PayPal payload{" "}
                  <span className="text-[#FFC439] font-mono">{payloadModalDeal.contractCode}</span>
                  {(payloadModalDeal.isDemoSeed || payloadModalDeal.paypalMode !== "LIVE_SANDBOX") && (
                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      SIMULATED, NOT SENT TO PAYPAL
                    </span>
                  )}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(payloadModalDeal.rawPayPalPayload, null, 2));
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
                  aria-label="Close"
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

      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0B1120] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#FFC439]" />
                <h3 className="text-sm font-bold text-white">PayPal Sandbox &amp; Gemini credentials</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!apiStatus.allowRuntimeCredentials ? (
              <div className="p-5 space-y-3 text-xs text-slate-300 leading-relaxed">
                <p className="flex items-start gap-2 text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  Entering keys in the browser is disabled on this server.
                </p>
                <p>
                  Set <code className="text-sky-300">PAYPAL_CLIENT_ID</code>,{" "}
                  <code className="text-sky-300">PAYPAL_CLIENT_SECRET</code> and{" "}
                  <code className="text-sky-300">GEMINI_API_KEY</code> as server environment variables. To allow browser entry
                  on a private demo, set <code className="text-sky-300">ALLOW_RUNTIME_CREDENTIALS=true</code>.
                </p>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveSettings} className="p-5 space-y-4">
                <p className="text-xs text-amber-200 flex items-start gap-2 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  Demo convenience only. Keys are kept in this tab&apos;s session storage and sent to this server on each
                  request. Use server environment variables for anything beyond a private demo, and sandbox keys only.
                </p>
                {[
                  { k: "paypalClientId", label: "PayPal Sandbox Client ID", type: "text", ph: "Sandbox client id" },
                  { k: "paypalClientSecret", label: "PayPal Sandbox Client Secret", type: "password", ph: "Sandbox secret" },
                  { k: "geminiApiKey", label: "Google Gemini API Key (gemini-3.8-flash)", type: "password", ph: "Gemini API key" },
                ].map((f) => (
                  <div key={f.k}>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">{f.label}</label>
                    <input
                      type={f.type}
                      autoComplete="off"
                      value={(runtimeCreds as Record<string, string | undefined>)[f.k] || ""}
                      onChange={(e) => setRuntimeCreds((p) => ({ ...p, [f.k]: e.target.value }))}
                      placeholder={f.ph}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-[#009CDE]"
                    />
                  </div>
                ))}
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
                    Save &amp; Check Credentials
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
