"use client";

import React, { useState, useEffect } from "react";
import { AgentTelemetryEvent, EscrowDeal } from "@/types/paypulse";
import {
  Sparkles,
  PlusCircle,
  Activity,
  Zap,
  Terminal,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface AgentCommandPanelProps {
  onLaunchNegotiation: (payload: {
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
  }) => Promise<void>;
  isNegotiating: boolean;
  telemetry: AgentTelemetryEvent[];
}

const PRESET_SCENARIOS: Array<{
  label: string;
  clientBusinessName: string;
  vendorName: string;
  vendorEmail: string;
  category: EscrowDeal["category"];
  projectTitle: string;
  initialQuoteUsd: number;
  vendorPriceFloorUsd: number;
  buyerTargetBudgetUsd: number;
  autoCaptureThresholdUsd: number;
  buyerBrief: string;
}> = [
  {
    label: "🛍️ Headless PayPal Checkout ($3,800 Quote vs $3,250 Floor)",
    clientBusinessName: "Bramble & Twine Artisan Goods",
    vendorName: "Kestrel Commerce Engineering",
    vendorEmail: "billing-sandbox@kestrelcommerce.dev",
    category: "E-Commerce & Checkout Dev",
    projectTitle: "Next.js Storefront + PayPal Orders v2 Authorization Flow",
    initialQuoteUsd: 3800,
    vendorPriceFloorUsd: 3250,
    buyerTargetBudgetUsd: 3300,
    autoCaptureThresholdUsd: 500,
    buyerBrief:
      "Lock funds upfront via PayPal intent:AUTHORIZE; require 48/48 passing unit tests, bundle <=250KB, and human buyer sign-off above $500.",
  },
  {
    label: "🛡️ Tight-Floor Security Audit ($2,100 Quote vs $1,960 Floor)",
    clientBusinessName: "CivicHealth Telemedicine Clinic",
    vendorName: "Bastion AppSec Collective",
    vendorEmail: "settlements-sandbox@bastionsec.io",
    category: "Security & QA Audit",
    projectTitle: "OAuth2 & PayPal Payouts Webhook Penetration Test",
    initialQuoteUsd: 2100,
    vendorPriceFloorUsd: 1960,
    buyerTargetBudgetUsd: 1800,
    autoCaptureThresholdUsd: 500,
    buyerBrief:
      "Buyer wants $1,800, but vendor's hard labor floor is $1,960 — watch the Vendor Agent defend its floor and settle near $1,990.",
  },
  {
    label: "⚡ Micro-Milestone Bugfix ($480 Quote <= $500 Auto-Capture)",
    clientBusinessName: "nomadPod Podcast Studio",
    vendorName: "Alex Rivera (Independent Freelancer)",
    vendorEmail: "alex.rivera.sandbox@indiedev.io",
    category: "Full-Stack Web App",
    projectTitle: "PayPal Webhook Signature Verification Hotfix & Unit Tests",
    initialQuoteUsd: 480,
    vendorPriceFloorUsd: 410,
    buyerTargetBudgetUsd: 420,
    autoCaptureThresholdUsd: 500,
    buyerBrief:
      "Micro-milestone under $500 policy threshold: auto-capture PayPal authorization as soon as deterministic SHA-256 and unit test checks pass.",
  },
];

export default function AgentCommandPanel({
  onLaunchNegotiation,
  isNegotiating,
  telemetry,
}: AgentCommandPanelProps) {
  const [panelTab, setPanelTab] = useState<"procure" | "telemetry">("procure");
  const [negStepIndex, setNegStepIndex] = useState(0);

  const [clientBusinessName, setClientBusinessName] = useState(
    PRESET_SCENARIOS[0].clientBusinessName
  );
  const [vendorName, setVendorName] = useState(PRESET_SCENARIOS[0].vendorName);
  const [vendorEmail, setVendorEmail] = useState(
    PRESET_SCENARIOS[0].vendorEmail
  );
  const [category, setCategory] = useState<EscrowDeal["category"]>(
    PRESET_SCENARIOS[0].category
  );
  const [projectTitle, setProjectTitle] = useState(
    PRESET_SCENARIOS[0].projectTitle
  );
  const [initialQuoteUsd, setInitialQuoteUsd] = useState(
    PRESET_SCENARIOS[0].initialQuoteUsd
  );
  const [vendorPriceFloorUsd, setVendorPriceFloorUsd] = useState(
    PRESET_SCENARIOS[0].vendorPriceFloorUsd
  );
  const [buyerTargetBudgetUsd, setBuyerTargetBudgetUsd] = useState(
    PRESET_SCENARIOS[0].buyerTargetBudgetUsd
  );
  const [autoCaptureThresholdUsd, setAutoCaptureThresholdUsd] = useState(
    PRESET_SCENARIOS[0].autoCaptureThresholdUsd
  );
  const [buyerBrief, setBuyerBrief] = useState(PRESET_SCENARIOS[0].buyerBrief);

  // Step-by-step live feedback while Gemini + PayPal Sandbox execute
  useEffect(() => {
    if (!isNegotiating) {
      setNegStepIndex(0);
      return;
    }
    const t1 = setTimeout(() => setNegStepIndex(1), 650);
    const t2 = setTimeout(() => setNegStepIndex(2), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isNegotiating]);

  const applyPreset = (idx: number) => {
    const p = PRESET_SCENARIOS[idx];
    setClientBusinessName(p.clientBusinessName);
    setVendorName(p.vendorName);
    setVendorEmail(p.vendorEmail);
    setCategory(p.category);
    setProjectTitle(p.projectTitle);
    setInitialQuoteUsd(p.initialQuoteUsd);
    setVendorPriceFloorUsd(p.vendorPriceFloorUsd);
    setBuyerTargetBudgetUsd(p.buyerTargetBudgetUsd);
    setAutoCaptureThresholdUsd(p.autoCaptureThresholdUsd);
    setBuyerBrief(p.buyerBrief);
  };

  const handleSubmitProcure = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLaunchNegotiation({
      clientBusinessName,
      vendorName,
      vendorEmail,
      category,
      projectTitle,
      initialQuoteUsd: Number(initialQuoteUsd) || 2500,
      vendorPriceFloorUsd: Number(vendorPriceFloorUsd) || 2100,
      buyerTargetBudgetUsd: Number(buyerTargetBudgetUsd) || 2000,
      autoCaptureThresholdUsd: Number(autoCaptureThresholdUsd) || 500,
      buyerBrief,
    });
  };

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-[#0B1120]/95 shadow-2xl overflow-hidden flex flex-col h-full">
      {/* Top Switcher */}
      <div className="p-2 border-b border-slate-800 bg-slate-950/70 grid grid-cols-2 gap-1">
        <button
          onClick={() => setPanelTab("procure")}
          className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
            panelTab === "procure"
              ? "bg-gradient-to-r from-[#003087] to-[#0070BA] text-white shadow"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5 text-[#FFC439]" />
          New Milestone Contract
        </button>
        <button
          onClick={() => setPanelTab("telemetry")}
          className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
            panelTab === "telemetry"
              ? "bg-gradient-to-r from-[#003087] to-[#0070BA] text-white shadow"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          Live API & Gate Log ({telemetry.length})
        </button>
      </div>

      {/* Tab 1: Two-Sided Buyer vs Vendor Floor Contract Launcher */}
      {panelTab === "procure" && (
        <form
          onSubmit={handleSubmitProcure}
          className="p-4 space-y-3 flex-1 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#FFC439]" />
                Two-Agent Negotiation & PayPal Hold Launcher
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Buyer Agent negotiates against the Freelancer Agent&apos;s{" "}
                <strong className="text-amber-300">hard price floor</strong>,
                then calls <code className="text-slate-200">@paypal/agent-toolkit</code>{" "}
                to create the Invoice and <code className="text-sky-300">intent: AUTHORIZE</code> Hold.
              </p>
            </div>

            {/* Scenarios */}
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                1-Click Presets (Varying Vendor Floors & Thresholds):
              </span>
              <div className="flex flex-col gap-1.5">
                {PRESET_SCENARIOS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyPreset(idx)}
                    className="text-left px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 flex items-center justify-between transition"
                  >
                    <span className="truncate font-medium">{preset.label}</span>
                    <span className="text-[10px] text-sky-400 font-mono shrink-0 ml-2">
                      Load →
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Small Business Client (Buyer)
                </label>
                <input
                  type="text"
                  required
                  value={clientBusinessName}
                  onChange={(e) => setClientBusinessName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-[#009CDE]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Freelancer / Agency Name
                </label>
                <input
                  type="text"
                  required
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-[#009CDE]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Vendor Quote ($)
                </label>
                <input
                  type="number"
                  min={50}
                  required
                  value={initialQuoteUsd}
                  onChange={(e) => setInitialQuoteUsd(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-amber-300 mb-1 font-bold">
                  Vendor Floor ($)
                </label>
                <input
                  type="number"
                  min={50}
                  required
                  value={vendorPriceFloorUsd}
                  onChange={(e) =>
                    setVendorPriceFloorUsd(Number(e.target.value))
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-amber-500/40 text-xs text-amber-300 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] text-sky-300 mb-1">
                  Buyer Target ($)
                </label>
                <input
                  type="number"
                  min={50}
                  required
                  value={buyerTargetBudgetUsd}
                  onChange={(e) =>
                    setBuyerTargetBudgetUsd(Number(e.target.value))
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-sky-500/40 text-xs text-sky-300 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Freelancer PayPal Sandbox Email
                </label>
                <input
                  type="email"
                  required
                  value={vendorEmail}
                  onChange={(e) => setVendorEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Auto-Capture Limit ($)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={autoCaptureThresholdUsd}
                  onChange={(e) =>
                    setAutoCaptureThresholdUsd(Number(e.target.value))
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-emerald-300 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Milestone Deliverable Scope
              </label>
              <input
                type="text"
                required
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
              />
            </div>

            {/* Live Streaming Progress Card During Gemini + PayPal Calls */}
            {isNegotiating && (
              <div className="p-3 rounded-xl bg-blue-950/60 border border-sky-500/40 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-sky-200 font-semibold">
                  {negStepIndex > 0 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-[#FFC439] animate-spin shrink-0" />
                  )}
                  <span>
                    1. Gemini 3.8 Flash negotiating against ${vendorPriceFloorUsd.toLocaleString()} vendor floor...
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sky-200 font-semibold">
                  {negStepIndex > 1 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : negStepIndex === 1 ? (
                    <Loader2 className="w-3.5 h-3.5 text-[#FFC439] animate-spin shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />
                  )}
                  <span>
                    2. Calling @paypal/agent-toolkit create_invoice...
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sky-200 font-semibold">
                  {negStepIndex === 2 ? (
                    <Loader2 className="w-3.5 h-3.5 text-[#FFC439] animate-spin shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />
                  )}
                  <span>
                    3. Placing PayPal Order v2 Hold (intent: AUTHORIZE)...
                  </span>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isNegotiating}
            className="w-full py-3 px-4 rounded-xl font-extrabold text-xs bg-gradient-to-r from-[#FFC439] to-[#F5B000] hover:brightness-105 text-slate-950 shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {isNegotiating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#003087]" />
                Negotiating & Placing PayPal Hold...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-[#003087]" />
                Negotiate vs Vendor Floor & Place PayPal Hold
              </>
            )}
          </button>
        </form>
      )}

      {/* Tab 2: Live PayPal Agent Toolkit & Deterministic Gate Stream */}
      {panelTab === "telemetry" && (
        <div className="p-4 space-y-2.5 overflow-y-auto max-h-[480px]">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              Live @paypal/agent-toolkit & Verification Gate Log
            </span>
            <span className="font-mono text-[10px] text-emerald-400">
              ● LIVE
            </span>
          </div>

          {telemetry.map((ev) => (
            <div
              key={ev.id}
              className="p-3 rounded-xl border border-slate-800/90 bg-slate-950/90 space-y-1 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      ev.status === "SUCCESS"
                        ? "bg-emerald-400"
                        : ev.status === "WARNING"
                        ? "bg-rose-400"
                        : "bg-sky-400"
                    }`}
                  />
                  {ev.agentName}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {ev.timestamp} • {ev.latencyMs}ms
                </span>
              </div>

              <div className="text-sky-300 font-semibold">{ev.action}</div>

              {ev.endpoint && (
                <div className="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 border border-slate-800">
                  {ev.endpoint} ({ev.contractCode})
                </div>
              )}

              <p className="text-slate-400 text-[11px] leading-relaxed">
                {ev.details}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
