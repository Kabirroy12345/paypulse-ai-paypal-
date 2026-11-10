"use client";

import React, { useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import { EscrowDeal, DealStatus } from "@/types/paypulse";
import {
  CheckCircle2,
  ShieldAlert,
  Clock,
  Sparkles,
  Download,
  Search,
  ExternalLink,
  Code2,
  Play,
  UserCheck,
} from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

const payPulseGridTheme = themeQuartz.withParams({
  backgroundColor: "#090E1F",
  foregroundColor: "#E2E8F0",
  headerBackgroundColor: "#0F172A",
  headerTextColor: "#94A3B8",
  borderColor: "#1E293B",
  rowHoverColor: "#131D38",
  selectedRowBackgroundColor: "#172554",
  accentColor: "#0070BA",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 700,
});

interface PayPulseAgGridProps {
  deals: EscrowDeal[];
  selectedDealId: string;
  activePerspective: "BUYER" | "VENDOR";
  onSelectDeal: (deal: EscrowDeal) => void;
  onInspectDeliverableFile: (deal: EscrowDeal) => void;
  onHumanApproveCapture: (deal: EscrowDeal) => void;
  onOpenPayloadModal: (deal: EscrowDeal) => void;
  isProcessingId: string | null;
}

const STATUS_CONFIG: Record<
  DealStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  NEGOTIATING: {
    label: "AGENTS NEGOTIATING",
    bg: "bg-purple-500/15",
    text: "text-purple-300",
    border: "border-purple-500/30",
  },
  INVOICED: {
    label: "INVOICE CREATED",
    bg: "bg-sky-500/15",
    text: "text-sky-300",
    border: "border-sky-500/30",
  },
  AUTHORIZED_HOLD: {
    label: "AUTHORIZATION HOLD",
    bg: "bg-blue-500/20",
    text: "text-blue-300",
    border: "border-blue-500/40",
  },
  AWAITING_BUYER_SIGN_OFF: {
    label: "AWAITING BUYER SIGN-OFF",
    bg: "bg-amber-500/20",
    text: "text-amber-300",
    border: "border-amber-500/40",
  },
  CAPTURED_AND_SPLIT_PAID: {
    label: "CAPTURED & SPLIT PAID",
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/35",
  },
  HOLD_BLOCKED_FAILED_CHECKS: {
    label: "CAPTURE BLOCKED (FAILED CHECKS)",
    bg: "bg-rose-500/15",
    text: "text-rose-300",
    border: "border-rose-500/35",
  },
};

export default function PayPulseAgGrid({
  deals,
  selectedDealId,
  activePerspective,
  onSelectDeal,
  onInspectDeliverableFile,
  onHumanApproveCapture,
  onOpenPayloadModal,
  isProcessingId,
}: PayPulseAgGridProps) {
  const gridRef = useRef<AgGridReact<EscrowDeal>>(null);
  const [quickFilterText, setQuickFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filteredDeals = useMemo(() => {
    if (statusFilter === "ALL") return deals;
    return deals.filter((d) => d.status === statusFilter);
  }, [deals, statusFilter]);

  const pinnedBottomRowData = useMemo(() => {
    const totalQuote = filteredDeals.reduce((acc, d) => acc + d.initialQuoteUsd, 0);
    const totalFloor = filteredDeals.reduce(
      (acc, d) => acc + d.vendorPriceFloorUsd,
      0
    );
    const totalNegotiated = filteredDeals.reduce(
      (acc, d) => acc + d.aiNegotiatedUsd,
      0
    );
    const totalSavings = filteredDeals.reduce((acc, d) => acc + d.savingsUsd, 0);
    const avgSavingsPct =
      totalQuote > 0 ? Number(((totalSavings / totalQuote) * 100).toFixed(2)) : 0;

    return [
      {
        id: "SUMMARY_ROW",
        contractCode: `TOTAL (${filteredDeals.length} CONTRACTS)`,
        clientBusinessName: "Small Business Clients",
        vendorName: "Freelancers & Agencies",
        vendorPayPalEmail: "",
        category: "E-Commerce & Checkout Dev" as const,
        projectTitle: "Aggregated Hold-Then-Capture Milestone Ledger",
        initialQuoteUsd: totalQuote,
        vendorPriceFloorUsd: totalFloor,
        buyerTargetBudgetUsd: totalFloor,
        aiNegotiatedUsd: totalNegotiated,
        savingsUsd: totalSavings,
        savingsPct: avgSavingsPct,
        autoCaptureThresholdUsd: 500,
        requiresHumanApproval: true,
        status: "CAPTURED_AND_SPLIT_PAID" as DealStatus,
        paypalOrderId: "SUMMARY",
        paypalMode: "UNCONFIGURED_SANDBOX_PREVIEW" as const,
        isDemoSeed: false,
        verificationRun: false,
        milestoneTitle: "",
        deliverableSummary: "",
        submittedFileName: "",
        submittedFileRawContent: "",
        deterministicAudit: {
          fileName: "",
          fileSizeBytes: 0,
          sha256Digest: "",
          schemaValid: true,
          unitTestsPassed: 0,
          unitTestsTotal: 0,
          criticalVulnerabilities: 0,
          bundleSizeKb: 0,
          maxAllowedBundleKb: 250,
          allDeterministicPassed: true,
          checks: [],
        },
        geminiReview: {
          passed: true,
          summary: "",
          findings: [],
          modelUsed: "gemini-3.8-flash",
        },
        splitRecipients: [],
        agentNegotiationLog: [],
        toolkitCallTraces: [],
        auditTrail: [],
        rawPayPalPayload: {},
        updatedAt: "Live",
      },
    ];
  }, [filteredDeals]);

  const columnDefs = useMemo<ColDef<EscrowDeal>[]>(
    () => [
      {
        headerName: "CONTRACT / ORDER ID",
        field: "contractCode",
        minWidth: 190,
        pinned: "left",
        cellRenderer: (params: ICellRendererParams<EscrowDeal>) => {
          const deal = params.data;
          if (!deal) return null;
          if (deal.id === "SUMMARY_ROW") {
            return (
              <div className="font-bold text-amber-400 tracking-wide">
                {deal.contractCode}
              </div>
            );
          }
          const isSelected = deal.id === selectedDealId;
          return (
            <div className="flex flex-col justify-center py-1 leading-tight">
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-mono font-bold text-xs ${
                    isSelected ? "text-[#FFC439]" : "text-white"
                  }`}
                >
                  {deal.contractCode}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 font-mono">
                  {deal.paypalOrderId.slice(0, 8)}…
                </span>
              </div>
              <span className="text-[11px] text-slate-400 truncate">
                Client: {deal.clientBusinessName}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "FREELANCER / AGENCY & DELIVERABLE",
        field: "vendorName",
        minWidth: 250,
        flex: 1.4,
        cellRenderer: (params: ICellRendererParams<EscrowDeal>) => {
          const deal = params.data;
          if (!deal) return null;
          if (deal.id === "SUMMARY_ROW") {
            return (
              <span className="font-semibold text-slate-300">
                {deal.projectTitle}
              </span>
            );
          }
          return (
            <div className="flex flex-col justify-center py-1 leading-tight">
              <span className="font-semibold text-slate-100 truncate">
                {deal.vendorName}
              </span>
              <span className="text-[11px] text-slate-400 truncate">
                {deal.projectTitle}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "QUOTE vs FLOOR",
        field: "initialQuoteUsd",
        width: 145,
        type: "rightAligned",
        enableCellChangeFlash: true,
        cellRenderer: (params: ICellRendererParams<EscrowDeal>) => {
          const deal = params.data;
          if (!deal) return null;
          if (deal.id === "SUMMARY_ROW") {
            return (
              <span className="font-mono font-bold text-slate-300">
                ${deal.initialQuoteUsd.toLocaleString()}
              </span>
            );
          }
          return (
            <div className="flex flex-col items-end justify-center py-1 leading-tight">
              <span className="font-mono text-xs text-slate-400 line-through">
                Quote: ${deal.initialQuoteUsd.toLocaleString()}
              </span>
              <span className="font-mono text-[11px] text-amber-300/90">
                Floor: ${deal.vendorPriceFloorUsd.toLocaleString()}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "AUTHORIZED HOLD",
        field: "aiNegotiatedUsd",
        width: 145,
        type: "rightAligned",
        enableCellChangeFlash: true,
        cellRenderer: (params: ICellRendererParams<EscrowDeal>) => {
          const deal = params.data;
          if (!deal) return null;
          return (
            <span className="font-mono font-bold text-white">
              ${deal.aiNegotiatedUsd.toLocaleString()}
            </span>
          );
        },
      },
      {
        headerName: "NEGOTIATED DELTA",
        field: "savingsUsd",
        width: 155,
        type: "rightAligned",
        enableCellChangeFlash: true,
        cellRenderer: (params: ICellRendererParams<EscrowDeal>) => {
          const deal = params.data;
          if (!deal) return null;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <span className="font-mono font-bold text-emerald-400">
                -${deal.savingsUsd.toLocaleString()}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                {deal.savingsPct}%
              </span>
            </div>
          );
        },
      },
      {
        headerName: "PAYPAL HOLD-THEN-CAPTURE STATUS",
        field: "status",
        minWidth: 225,
        cellRenderer: (params: ICellRendererParams<EscrowDeal>) => {
          const deal = params.data;
          if (!deal) return null;
          if (deal.id === "SUMMARY_ROW") {
            return (
              <span className="text-xs font-semibold text-sky-400">
                INTENT: AUTHORIZE → CAPTURE
              </span>
            );
          }
          const cfg = STATUS_CONFIG[deal.status];
          const isSim = deal.isDemoSeed || deal.paypalMode !== "LIVE_SANDBOX";
          const pillLabel =
            deal.status === "CAPTURED_AND_SPLIT_PAID" && isSim
              ? "SIMULATED CAPTURE & SPLIT"
              : isSim
              ? `${cfg.label} (PREVIEW)`
              : cfg.label;
          return (
            <div className="flex items-center h-full">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
              >
                {deal.status === "CAPTURED_AND_SPLIT_PAID" && (
                  <CheckCircle2
                    className={`w-3.5 h-3.5 ${
                      isSim ? "text-sky-400" : "text-emerald-400"
                    }`}
                  />
                )}
                {deal.status === "HOLD_BLOCKED_FAILED_CHECKS" && (
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                )}
                {deal.status === "AWAITING_BUYER_SIGN_OFF" && (
                  <UserCheck className="w-3.5 h-3.5 text-amber-300" />
                )}
                {deal.status !== "CAPTURED_AND_SPLIT_PAID" &&
                  deal.status !== "HOLD_BLOCKED_FAILED_CHECKS" &&
                  deal.status !== "AWAITING_BUYER_SIGN_OFF" && (
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                  )}
                {pillLabel}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "DETERMINISTIC + AI CHECKS",
        minWidth: 215,
        cellRenderer: (params: ICellRendererParams<EscrowDeal>) => {
          const deal = params.data;
          if (!deal || deal.id === "SUMMARY_ROW") return null;
          if (!deal.verificationRun) {
            return (
              <div className="flex flex-col justify-center py-1 leading-tight">
                <span className="text-xs font-semibold text-amber-300">
                  Awaiting Deliverable
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Stage 1 &amp; Stage 2 not run
                </span>
              </div>
            );
          }
          const det = deal.deterministicAudit;
          const passedRules = det.checks.filter((c) => c.passed).length;
          const totalRules = det.checks.length;
          const allOk = det.allDeterministicPassed && deal.geminiReview.passed;

          return (
            <div className="flex flex-col justify-center py-1 leading-tight">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-xs font-mono font-bold ${
                    allOk ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {passedRules}/{totalRules} Rules
                </span>
                <span className="text-[11px] text-slate-400">•</span>
                <span className="text-[11px] font-mono text-slate-300">
                  {det.unitTestsPassed}/{det.unitTestsTotal} Tests
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 truncate">
                {det.bundleSizeKb}KB • {det.criticalVulnerabilities} Crit CVE
              </span>
            </div>
          );
        },
      },
      {
        headerName: "WORKFLOW ACTIONS",
        minWidth: 245,
        pinned: "right",
        cellRenderer: (params: ICellRendererParams<EscrowDeal>) => {
          const deal = params.data;
          if (!deal || deal.id === "SUMMARY_ROW") return null;
          const isBusy = isProcessingId === deal.id;
          const isSim = deal.isDemoSeed || deal.paypalMode !== "LIVE_SANDBOX";

          return (
            <div className="flex items-center gap-1.5 h-full">
              {deal.status === "AWAITING_BUYER_SIGN_OFF" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onHumanApproveCapture(deal);
                  }}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-[#FFC439] hover:bg-[#f5b82e] text-slate-950 shadow-sm transition disabled:opacity-50"
                  title="Human Buyer Sign-Off: Capture PayPal Authorization & Split Payout"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  {isBusy
                    ? "Working..."
                    : isSim
                    ? "Simulate Sign-Off"
                    : "Buyer Sign-Off"}
                </button>
              ) : deal.status !== "CAPTURED_AND_SPLIT_PAID" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspectDeliverableFile(deal);
                  }}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-gradient-to-r from-[#0070BA] to-[#009CDE] hover:brightness-110 text-white shadow-sm transition disabled:opacity-50"
                  title="Open this contract in the workbench above to upload or verify deliverable"
                >
                  <Play className="w-3 h-3" />
                  Open Workbench
                </button>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border ${
                    isSim
                      ? "bg-sky-500/10 text-sky-300 border-sky-500/25"
                      : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {isSim ? "Simulated" : "Captured"}
                </span>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPayloadModal(deal);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                title="Inspect PayPal JSON Payload"
              >
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                JSON
              </button>

              {deal.paypalApprovalUrl && !isSim && (
                <a
                  href={deal.paypalApprovalUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-[#FFC439] border border-slate-700 transition"
                  title="Open PayPal Sandbox Order URL"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          );
        },
      },
    ],
    [
      selectedDealId,
      isProcessingId,
      onInspectDeliverableFile,
      onHumanApproveCapture,
      onOpenPayloadModal,
    ]
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
    }),
    []
  );

  const handleExportCsv = () => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `paypulse-ai-milestone-ledger-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`,
    });
  };

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-[#0B1120]/95 shadow-2xl overflow-hidden">
      {/* AG Grid Command Bar */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#0B1120] via-[#0F172A] to-[#0B1120]">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#009CDE]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">
                {activePerspective === "BUYER"
                  ? "Client Milestone Hold-Then-Capture Ledger"
                  : "Freelancer & Agency Receivables Ledger"}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0070BA]/25 text-sky-300 border border-sky-500/30 font-semibold">
                AG Grid Community v33
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Select any contract to inspect real deliverable files, SHA-256 deterministic checks, human sign-off gates, and PayPal split payouts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              placeholder="Search agency, client, Order ID..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#009CDE] w-56"
            />
          </div>

          <div className="flex items-center bg-slate-900/90 p-0.5 rounded-lg border border-slate-800 text-xs">
            {[
              { id: "ALL", label: "All" },
              { id: "AUTHORIZED_HOLD", label: "Hold Active" },
              { id: "AWAITING_BUYER_SIGN_OFF", label: "Needs Sign-Off" },
              { id: "CAPTURED_AND_SPLIT_PAID", label: "Captured" },
              { id: "HOLD_BLOCKED_FAILED_CHECKS", label: "Blocked" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  statusFilter === tab.id
                    ? "bg-[#0070BA] text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            Export CSV
          </button>
        </div>
      </div>

      {/* AG Grid Viewport */}
      <div className="w-full h-[365px]">
        <AgGridReact<EscrowDeal>
          ref={gridRef}
          theme={payPulseGridTheme}
          rowData={filteredDeals}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          pinnedBottomRowData={pinnedBottomRowData}
          quickFilterText={quickFilterText}
          rowHeight={54}
          headerHeight={38}
          onRowClicked={(event) => {
            if (event.data && event.data.id !== "SUMMARY_ROW") {
              onSelectDeal(event.data);
            }
          }}
          getRowId={(params) => params.data.id}
          animateRows={true}
        />
      </div>
    </div>
  );
}
