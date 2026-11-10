import { GoogleGenAI } from "@google/genai";
import {
  EscrowDeal,
  NegotiationLogEntry,
  RuntimeCredentials,
  SplitRecipient,
} from "@/types/paypulse";

export function resolveGeminiKey(runtime?: RuntimeCredentials): string | null {
  const key =
    runtime?.geminiApiKey?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    "";
  if (!key || key === "your_gemini_api_key") return null;
  return key;
}

export interface NegotiateDealInput {
  clientBusinessName?: string;
  vendorName: string;
  vendorEmail: string;
  category: EscrowDeal["category"];
  projectTitle: string;
  initialQuoteUsd: number;
  vendorPriceFloorUsd: number;
  buyerTargetBudgetUsd: number;
  autoCaptureThresholdUsd?: number;
  buyerBrief?: string;
  runtime?: RuntimeCredentials;
}

export interface NegotiatedDealOutput {
  aiNegotiatedUsd: number;
  savingsUsd: number;
  savingsPct: number;
  milestoneTitle: string;
  deliverableSummary: string;
  splitRecipients: SplitRecipient[];
  agentNegotiationLog: NegotiationLogEntry[];
  usedLiveGemini: boolean;
}

function normalizeSplitRecipients(
  rawRecipients: Array<{
    role: string;
    name: string;
    email: string;
    sharePct: number;
  }>,
  totalAmountUsd: number
): SplitRecipient[] {
  const totalShare =
    rawRecipients.reduce((acc, r) => acc + (Number(r.sharePct) || 0), 0) || 100;
  const normalizedShares = rawRecipients.map((r, idx) => {
    if (idx === rawRecipients.length - 1) {
      const prevSum = rawRecipients
        .slice(0, -1)
        .reduce(
          (acc, item) =>
            acc + Math.round(((Number(item.sharePct) || 0) / totalShare) * 100),
          0
        );
      return Math.max(1, 100 - prevSum);
    }
    return Math.max(1, Math.round(((Number(r.sharePct) || 0) / totalShare) * 100));
  });

  let allocatedUsd = 0;
  return rawRecipients.map((r, idx) => {
    const sharePct = normalizedShares[idx];
    const isLast = idx === rawRecipients.length - 1;
    const amountUsd = isLast
      ? Number((totalAmountUsd - allocatedUsd).toFixed(2))
      : Number(((totalAmountUsd * sharePct) / 100).toFixed(2));
    allocatedUsd = Number((allocatedUsd + amountUsd).toFixed(2));
    return {
      role: r.role,
      name: r.name,
      email: r.email,
      sharePct,
      amountUsd,
      status: "PENDING" as const,
    };
  });
}

export async function runAutonomousNegotiationAgent(
  input: NegotiateDealInput
): Promise<NegotiatedDealOutput> {
  const apiKey = resolveGeminiKey(input.runtime);
  const nowStr = new Date().toTimeString().slice(0, 8);

  const quote = Math.max(50, Number(input.initialQuoteUsd) || 3200);
  // Ensure vendor floor is realistic (cannot exceed initial quote)
  const floor = Math.min(
    quote,
    Math.max(50, Number(input.vendorPriceFloorUsd) || Math.round(quote * 0.86))
  );
  const buyerTarget = Math.max(
    50,
    Number(input.buyerTargetBudgetUsd) || Math.round(quote * 0.82)
  );

  // Economic clearing zone between vendor's hard floor and initial quote
  const minClearing = floor;
  const maxClearing = quote;

  if (apiKey) {
    try {
      const client = new GoogleGenAI({ apiKey });
      const prompt = `Simulate a realistic 4-turn negotiation between two autonomous agents for a small business hiring a freelance studio/agency:
1. BUYER_AGENT (representing "${input.clientBusinessName || "Harbor & Oak Roasters"}"):
   - Wants to hire "${input.vendorName}" for: "${input.projectTitle}" (${input.category})
   - Buyer's target budget: $${buyerTarget} USD
   - Context: ${input.buyerBrief || "Wants guaranteed test coverage, bundle size cap <=250KB, and zero security vulnerabilities, backed by an immediate PayPal Orders v2 (intent: AUTHORIZE) hold."}

2. VENDOR_AGENT (representing freelancer/agency "${input.vendorName}"):
   - Initial Quote: $${quote} USD
   - Hard Minimum Price Floor (walk-away cost floor): $${floor} USD
   - Will NEVER accept below $${floor} USD, and only concedes price toward $${floor} if the buyer locks funds immediately via PayPal intent:AUTHORIZE and agrees to clear, objective milestone acceptance criteria.

Determine a realistic final agreed price (aiNegotiatedUsd) strictly between $${minClearing} and $${maxClearing} USD (never a fixed percentage; base it on where $${buyerTarget} sits relative to the vendor's $${floor} floor and $${quote} quote).

Return JSON matching the schema.`;

      const interaction = await client.interactions.create({
        model: "gemini-3.8-flash",
        input: prompt,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              aiNegotiatedUsd: { type: "number" },
              milestoneTitle: { type: "string" },
              deliverableSummary: { type: "string" },
              splitRecipients: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    role: { type: "string" },
                    name: { type: "string" },
                    email: { type: "string" },
                    sharePct: { type: "number" },
                  },
                  required: ["role", "name", "email", "sharePct"],
                },
              },
              negotiationTurns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    speaker: { type: "string", enum: ["VENDOR_AGENT", "BUYER_AGENT"] },
                    message: { type: "string" },
                    badge: { type: "string" },
                  },
                  required: ["speaker", "message", "badge"],
                },
              },
            },
            required: [
              "aiNegotiatedUsd",
              "milestoneTitle",
              "deliverableSummary",
              "splitRecipients",
              "negotiationTurns",
            ],
          },
        },
      });

      if (interaction.output_text) {
        const parsed = JSON.parse(interaction.output_text);
        const clampedAgreed = Math.min(
          maxClearing,
          Math.max(minClearing, Math.round(Number(parsed.aiNegotiatedUsd) || floor))
        );
        const savingsUsd = Number((quote - clampedAgreed).toFixed(2));
        const savingsPct = Number(((savingsUsd / quote) * 100).toFixed(2));

        const rawRecipients: Array<{
          role: string;
          name: string;
          email: string;
          sharePct: number;
        }> =
          Array.isArray(parsed.splitRecipients) &&
          parsed.splitRecipients.length > 0
            ? parsed.splitRecipients
            : [
                {
                  role: "Lead Freelance Developer (80%)",
                  name: input.vendorName,
                  email: input.vendorEmail,
                  sharePct: 80,
                },
                {
                  role: "UI/QA Collaborator (20%)",
                  name: "Maya Lin (QA & Accessibility)",
                  email: "maya.qa.sandbox@freelanceguild.dev",
                  sharePct: 20,
                },
              ];

        const splitRecipients = normalizeSplitRecipients(
          rawRecipients,
          clampedAgreed
        );

        const logEntries: NegotiationLogEntry[] = (
          parsed.negotiationTurns || []
        ).map(
          (
            t: { speaker?: string; message?: string; badge?: string },
            idx: number
          ) => ({
            id: `neg-${Date.now()}-${idx}`,
            timestamp: nowStr,
            speaker:
              t.speaker === "VENDOR_AGENT" || t.speaker === "BUYER_AGENT"
                ? t.speaker
                : idx % 2 === 0
                ? "VENDOR_AGENT"
                : "BUYER_AGENT",
            message: t.message || "",
            badge: t.badge || "GEMINI 3.8 FLASH",
          })
        );

        return {
          aiNegotiatedUsd: clampedAgreed,
          savingsUsd,
          savingsPct,
          milestoneTitle:
            parsed.milestoneTitle ||
            `Milestone 1: ${input.projectTitle.slice(0, 52)} — Verified Delivery`,
          deliverableSummary:
            parsed.deliverableSummary ||
            "Requires valid v2.1.0 delivery manifest, 100% unit test pass rate, bundle <= 250KB, and 0 critical/high CVEs.",
          splitRecipients,
          agentNegotiationLog: logEntries,
          usedLiveGemini: true,
        };
      }
    } catch {
      // Fallback to dynamic floor-aware calculation below
    }
  }

  // Deterministic context-derived bargaining weight so different contracts have organic, non-scripted clearing prices
  const seedText = `${input.projectTitle}:${input.vendorName}:${quote}:${floor}:${buyerTarget}`;
  let hashAcc = 0;
  for (let i = 0; i < seedText.length; i++) {
    hashAcc = (hashAcc * 31 + seedText.charCodeAt(i)) % 1000;
  }
  const bargainingFactor = 0.16 + (hashAcc % 19) / 100; // Ranges dynamically between 0.16 and 0.34

  let clearingPrice: number;
  if (buyerTarget <= floor) {
    // Buyer wants less than vendor's hard floor; vendor defends floor + dynamic spread share
    clearingPrice = Math.round(floor + (quote - floor) * bargainingFactor);
  } else if (buyerTarget >= quote) {
    clearingPrice = quote;
  } else {
    // Asymmetric Nash bargaining solution between buyerTarget and floor/quote
    const buyerWeight = 0.55 + (hashAcc % 15) / 100;
    clearingPrice = Math.min(
      quote,
      Math.max(
        floor,
        Math.round(buyerTarget * buyerWeight + floor * (1 - buyerWeight))
      )
    );
  }

  const savingsUsd = Number((quote - clearingPrice).toFixed(2));
  const savingsPct = Number(((savingsUsd / quote) * 100).toFixed(2));
  const counterOffer1 = Math.max(
    Math.round(floor * 0.96),
    Math.min(buyerTarget, Math.round(quote * 0.81))
  );

  const splitRecipients = normalizeSplitRecipients(
    [
      {
        role: "Lead Agency / Freelancer (80%)",
        name: input.vendorName,
        email: input.vendorEmail,
        sharePct: 80,
      },
      {
        role: "Subcontracted QA & Security Reviewer (20%)",
        name: "Maya Lin (Independent QA)",
        email: "maya.qa.sandbox@freelanceguild.dev",
        sharePct: 20,
      },
    ],
    clearingPrice
  );

  return {
    aiNegotiatedUsd: clearingPrice,
    savingsUsd,
    savingsPct,
    milestoneTitle: `Milestone 1: ${input.projectTitle.slice(0, 52)} — Verified Delivery`,
    deliverableSummary: `Deterministic verification of unit tests, bundle size cap (<= 250 KB), and zero-CVE SARIF scan + Gemini 3.8 Flash review.`,
    splitRecipients,
    agentNegotiationLog: [
      {
        id: `neg-${Date.now()}-1`,
        timestamp: nowStr,
        speaker: "VENDOR_AGENT",
        message: `${input.vendorName} Agent: Submitted initial quote of $${quote.toLocaleString()} USD for "${input.projectTitle}" (internal cost floor: $${floor.toLocaleString()} USD).`,
        badge: `QUOTE: $${quote.toLocaleString()}`,
      },
      {
        id: `neg-${Date.now()}-2`,
        timestamp: nowStr,
        speaker: "BUYER_AGENT",
        message: `Buyer-Advocate Agent: Client target budget is $${buyerTarget.toLocaleString()} USD. Proposing $${counterOffer1.toLocaleString()} USD with funds authorized upfront via PayPal Orders v2 (intent: AUTHORIZE) and released upon automated test/SARIF verification.`,
        badge: `OFFER: $${counterOffer1.toLocaleString()}`,
      },
      {
        id: `neg-${Date.now()}-3`,
        timestamp: nowStr,
        speaker: "VENDOR_AGENT",
        message: `${input.vendorName} Agent: Cannot go below our $${floor.toLocaleString()} USD labor floor. Countering at $${clearingPrice.toLocaleString()} USD (-${savingsPct}%) if payment is locked in a PayPal Authorization Hold today and limited to 1 revision round.`,
        badge: `FLOOR GUARD: $${clearingPrice.toLocaleString()}`,
      },
      {
        id: `neg-${Date.now()}-4`,
        timestamp: nowStr,
        speaker: "BUYER_AGENT",
        message: `Buyer-Advocate Agent: Agreed at $${clearingPrice.toLocaleString()} USD (saving $${savingsUsd.toLocaleString()} / ${savingsPct}%). Invoking @paypal/agent-toolkit to generate Invoice and authorize Order.`,
        badge: `AGREED: $${clearingPrice.toLocaleString()}`,
      },
    ],
    usedLiveGemini: false,
  };
}
