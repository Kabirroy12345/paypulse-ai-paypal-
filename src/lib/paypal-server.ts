import { PayPalAgentToolkit, ALL_TOOLS_ENABLED } from "@paypal/agent-toolkit/openai";
import { randomUUID } from "crypto";
import {
  PayPalToolkitCallTrace,
  RuntimeCredentials,
  SplitRecipient,
} from "@/types/paypulse";
import { isPlaceholderEmail } from "@/lib/validation";

/**
 * Reads PAYPAL_ENVIRONMENT and enforces SANDBOX-ONLY mode.
 * Pointing this demo at live PayPal would require buyer authentication/authorization
 * that is outside the scope of a stateless demo, so any non-"sandbox" value fails loudly.
 */
export const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export function resolvePayPalEnvironment(): {
  environment: string;
  baseUrl: string;
  isSupportedSandbox: boolean;
} {
  const raw = (process.env.PAYPAL_ENVIRONMENT || "sandbox").trim().toLowerCase() || "sandbox";
  return {
    environment: raw,
    baseUrl: PAYPAL_SANDBOX_BASE,
    isSupportedSandbox: raw === "sandbox",
  };
}

function assertSandboxEnvironment(stage: PayPalApiError["stage"]): string {
  const env = resolvePayPalEnvironment();
  if (!env.isSupportedSandbox) {
    throw new PayPalApiError(
      stage,
      `PAYPAL_ENVIRONMENT is set to "${env.environment}". Only "sandbox" is permitted in this build because the demo has no buyer authentication.`,
      500
    );
  }
  return env.baseUrl;
}

/**
 * Credentials typed into the browser UI are only honoured when explicitly allowed.
 * Default: allowed in development, ignored in production unless ALLOW_RUNTIME_CREDENTIALS=true.
 */
export function allowRuntimeCredentials(): boolean {
  const flag = process.env.ALLOW_RUNTIME_CREDENTIALS?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function resolvePayPalCredentials(runtime?: RuntimeCredentials) {
  const rt = allowRuntimeCredentials() ? runtime : undefined;
  const clientId =
    rt?.paypalClientId?.trim() ||
    process.env.PAYPAL_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ||
    "";
  const clientSecret =
    rt?.paypalClientSecret?.trim() || process.env.PAYPAL_CLIENT_SECRET?.trim() || "";

  const hasLiveSandbox =
    Boolean(clientId && clientSecret) &&
    clientId !== "your_paypal_sandbox_client_id" &&
    clientSecret !== "your_paypal_sandbox_client_secret";

  return { clientId, clientSecret, hasLiveSandbox };
}

export class PayPalApiError extends Error {
  status: number;
  stage: "order" | "invoice" | "authorize" | "capture" | "payout" | "auth";
  /** Set when the capture already succeeded before a later stage failed, so retries don't double-capture. */
  captureId?: string;
  constructor(
    stage: PayPalApiError["stage"],
    message: string,
    status = 502,
    captureId?: string
  ) {
    super(message);
    this.stage = stage;
    this.status = status;
    this.captureId = captureId;
  }
}

async function describePayPalError(res: Response): Promise<string> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  const b = (body || {}) as {
    message?: string;
    name?: string;
    error_description?: string;
    debug_id?: string;
    details?: Array<{ issue?: string; description?: string }>;
  };
  const detail = b.details?.[0]
    ? ` (${b.details[0].issue || ""}${b.details[0].description ? `: ${b.details[0].description}` : ""})`
    : "";
  return `HTTP ${res.status} ${b.name || ""} ${b.message || b.error_description || res.statusText}${detail}${
    b.debug_id ? ` [debug_id ${b.debug_id}]` : ""
  }`.replace(/\s+/g, " ");
}

export function createPayPalAgentToolkitInstance(runtime?: RuntimeCredentials) {
  const { clientId, clientSecret, hasLiveSandbox } = resolvePayPalCredentials(runtime);
  const env = resolvePayPalEnvironment();
  if (!hasLiveSandbox || !env.isSupportedSandbox) return null;
  try {
    return new PayPalAgentToolkit({
      clientId,
      clientSecret,
      configuration: {
        actions: ALL_TOOLS_ENABLED,
        context: { sandbox: true },
      },
    });
  } catch {
    return null;
  }
}

export async function getPayPalAccessToken(
  runtime?: RuntimeCredentials
): Promise<string | null> {
  const { clientId, clientSecret, hasLiveSandbox } = resolvePayPalCredentials(runtime);
  const env = resolvePayPalEnvironment();
  if (!hasLiveSandbox || !env.isSupportedSandbox) return null;
  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch(`${env.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

/** Live-mode helper: a configured-but-rejected credential or invalid PAYPAL_ENVIRONMENT must fail loudly, never fall back to simulation. */
async function requireToken(
  stage: PayPalApiError["stage"],
  runtime?: RuntimeCredentials
): Promise<string> {
  assertSandboxEnvironment(stage);
  const token = await getPayPalAccessToken(runtime);
  if (!token) {
    throw new PayPalApiError(
      stage,
      "PayPal rejected the configured sandbox credentials (OAuth2 token request failed). Check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.",
      502
    );
  }
  return token;
}

function simId(prefix: string): string {
  return `SIM-${prefix}-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

const nowStr = () => new Date().toTimeString().slice(0, 8);

export interface CreateHoldOrderParams {
  contractCode: string;
  projectTitle: string;
  vendorName: string;
  vendorEmail: string;
  initialQuoteUsd: number;
  aiNegotiatedUsd: number;
  baseUrl: string;
  runtime?: RuntimeCredentials;
}

export async function createPayPalAuthorizationHoldOrder(params: CreateHoldOrderParams) {
  const {
    contractCode,
    projectTitle,
    vendorName,
    vendorEmail,
    initialQuoteUsd,
    aiNegotiatedUsd,
    baseUrl,
    runtime,
  } = params;

  const savingsUsd = Math.max(0, Number((initialQuoteUsd - aiNegotiatedUsd).toFixed(2)));
  assertSandboxEnvironment("order");
  const { hasLiveSandbox } = resolvePayPalCredentials(runtime);

  const orderRequestBody = {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: contractCode,
        description: `${projectTitle} (${vendorName})`.slice(0, 127),
        custom_id: contractCode,
        invoice_id: `${contractCode}-${Date.now().toString().slice(-6)}`,
        amount: {
          currency_code: "USD",
          value: aiNegotiatedUsd.toFixed(2),
          breakdown: {
            item_total: { currency_code: "USD", value: initialQuoteUsd.toFixed(2) },
            discount: { currency_code: "USD", value: savingsUsd.toFixed(2) },
          },
        },
        items: [
          {
            name: projectTitle.slice(0, 127),
            description: `Milestone hold-then-capture for ${vendorName}`.slice(0, 127),
            quantity: "1",
            unit_amount: { currency_code: "USD", value: initialQuoteUsd.toFixed(2) },
            category: "DIGITAL_GOODS",
          },
        ],
      },
    ],
    application_context: {
      brand_name: "PayPulse AI",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      return_url: `${baseUrl}/?paypal=return&contract=${encodeURIComponent(contractCode)}`,
      cancel_url: `${baseUrl}/?paypal=cancel&contract=${encodeURIComponent(contractCode)}`,
    },
  };

  const traceArgs = {
    intent: "AUTHORIZE",
    currency_code: "USD",
    amount: aiNegotiatedUsd.toFixed(2),
    reference_id: contractCode,
    freelancer_email: vendorEmail,
  };

  if (hasLiveSandbox) {
    const token = await requireToken("order", runtime);
    const response = await fetch(`${PAYPAL_SANDBOX_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `paypulse-order-${contractCode}`,
      },
      body: JSON.stringify(orderRequestBody),
    });
    if (!response.ok) {
      throw new PayPalApiError(
        "order",
        `PayPal Orders v2 create (intent: AUTHORIZE) failed: ${await describePayPalError(response)}`
      );
    }
    const data = (await response.json()) as {
      id: string;
      status?: string;
      links?: Array<{ rel?: string; href?: string }>;
    };
    const approveLink = data.links?.find(
      (l) => l.rel === "approve" || l.rel === "payer-action"
    )?.href;

    return {
      mode: "LIVE_SANDBOX" as const,
      orderId: data.id,
      // A real authorization id only exists after the buyer approves the order and the server calls /authorize.
      authorizationId: undefined as string | undefined,
      status: data.status || "CREATED",
      approvalUrl: approveLink,
      rawPayload: data as unknown as Record<string, unknown>,
      toolkitTrace: {
        id: `tk-ord-${Date.now()}`,
        timestamp: nowStr(),
        toolName: "paypal_create_order",
        arguments: traceArgs,
        resultSummary: `POST /v2/checkout/orders -> Sandbox Order ${data.id} (intent: AUTHORIZE, status ${data.status}) for $${aiNegotiatedUsd.toFixed(2)}. Awaiting buyer approval.`,
        liveSandbox: true,
      } as PayPalToolkitCallTrace,
    };
  }

  const simOrderId = simId("ORDER");
  return {
    mode: "UNCONFIGURED_SANDBOX_PREVIEW" as const,
    orderId: simOrderId,
    authorizationId: simId("AUTH") as string | undefined,
    status: "SIMULATED",
    approvalUrl: undefined as string | undefined,
    rawPayload: {
      simulated: true,
      notice:
        "SIMULATED: no PayPal API call was made. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to run against api-m.sandbox.paypal.com.",
      would_have_posted: "POST /v2/checkout/orders",
      request: orderRequestBody,
    } as Record<string, unknown>,
    toolkitTrace: {
      id: `tk-ord-${Date.now()}`,
      timestamp: nowStr(),
      toolName: "paypal_create_order",
      arguments: traceArgs,
      resultSummary: `SIMULATED order ${simOrderId} ($${aiNegotiatedUsd.toFixed(2)}). No PayPal API call was made.`,
      liveSandbox: false,
    } as PayPalToolkitCallTrace,
  };
}

/**
 * After the buyer approves the order in PayPal (Smart Buttons or the approval link),
 * exchange the approval for a real authorization id via POST /v2/checkout/orders/{id}/authorize.
 */
export async function ensureOrderAuthorization(params: {
  orderId: string;
  runtime?: RuntimeCredentials;
}): Promise<
  | { state: "AUTHORIZED"; authorizationId: string; raw: Record<string, unknown> }
  | { state: "NEEDS_BUYER_APPROVAL"; orderStatus: string; approvalUrl?: string }
> {
  const token = await requireToken("authorize", params.runtime);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const getRes = await fetch(`${PAYPAL_SANDBOX_BASE}/v2/checkout/orders/${encodeURIComponent(params.orderId)}`, { headers, cache: "no-store" });
  if (!getRes.ok) {
    throw new PayPalApiError("authorize", `Could not read PayPal order ${params.orderId}: ${await describePayPalError(getRes)}`);
  }
  let order = (await getRes.json()) as {
    status?: string;
    links?: Array<{ rel?: string; href?: string }>;
    purchase_units?: Array<{ payments?: { authorizations?: Array<{ id: string }> } }>;
  };

  const existing = order.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
  if (existing) {
    return { state: "AUTHORIZED", authorizationId: existing, raw: order as Record<string, unknown> };
  }

  if (order.status === "APPROVED") {
    const authRes = await fetch(
      `${PAYPAL_SANDBOX_BASE}/v2/checkout/orders/${encodeURIComponent(params.orderId)}/authorize`,
      { method: "POST", headers: { ...headers, "PayPal-Request-Id": `paypulse-authorize-${params.orderId}` }, body: "{}" }
    );
    if (!authRes.ok) {
      throw new PayPalApiError("authorize", `PayPal order authorize failed: ${await describePayPalError(authRes)}`);
    }
    order = await authRes.json();
    const authId = order.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
    if (!authId) {
      throw new PayPalApiError("authorize", "PayPal authorized the order but returned no authorization id.");
    }
    return { state: "AUTHORIZED", authorizationId: authId, raw: order as Record<string, unknown> };
  }

  return {
    state: "NEEDS_BUYER_APPROVAL",
    orderStatus: order.status || "UNKNOWN",
    approvalUrl: order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href,
  };
}

export async function createPayPalSmartInvoice(params: {
  contractCode: string;
  vendorName: string;
  vendorEmail: string;
  buyerEmail?: string;
  projectTitle: string;
  initialQuoteUsd: number;
  aiNegotiatedUsd: number;
  runtime?: RuntimeCredentials;
}) {
  const { contractCode, vendorName, vendorEmail, buyerEmail, projectTitle, initialQuoteUsd, aiNegotiatedUsd, runtime } = params;
  const savingsUsd = Math.max(0, Number((initialQuoteUsd - aiNegotiatedUsd).toFixed(2)));
  const invoiceNumber = `PP-${contractCode.replace(/^MILES-/, "")}`;
  assertSandboxEnvironment("invoice");
  const { hasLiveSandbox } = resolvePayPalCredentials(runtime);

  const note = `Milestone contract ${contractCode}. Initial quote: $${initialQuoteUsd.toFixed(2)}, negotiated discount: -$${savingsUsd.toFixed(2)}.`;
  const items = [
    {
      name: projectTitle.slice(0, 100),
      description: `Milestone hold-then-capture contract ${contractCode}`,
      quantity: "1",
      unit_amount: { currency_code: "USD", value: initialQuoteUsd.toFixed(2) },
      discount: { amount: { currency_code: "USD", value: savingsUsd.toFixed(2) } },
    },
  ];
  // Only include a recipient when the buyer actually supplied an email. No hardcoded address.
  const primaryRecipients = buyerEmail
    ? [{ billing_info: { email_address: buyerEmail } }]
    : undefined;

  const toolkitInvoiceArgs: Record<string, unknown> = {
    currency_code: "USD",
    invoice_number: invoiceNumber,
    reference: contractCode,
    invoicer_business_name: vendorName,
    invoicer_email_address: vendorEmail,
    note,
    items,
    ...(primaryRecipients ? { primary_recipients: primaryRecipients } : {}),
  };

  if (hasLiveSandbox) {
    const toolkit = createPayPalAgentToolkitInstance(runtime);
    let toolkitError = "";
    if (toolkit) {
      try {
        const res = await toolkit.handleToolCall({
          id: `call_inv_${Date.now()}`,
          type: "function",
          function: { name: "create_invoice", arguments: JSON.stringify(toolkitInvoiceArgs) },
        } as never);
        const parsed = typeof res.content === "string" ? JSON.parse(res.content) : res.content;
        if (parsed && (parsed.id || parsed.href)) {
          const invoiceId = (parsed.id || String(parsed.href).split("/").pop()) as string;
          return {
            mode: "LIVE_SANDBOX" as const,
            invoiceId,
            invoiceNumber,
            rawPayload: parsed as Record<string, unknown>,
            toolkitTrace: {
              id: `tk-inv-${Date.now()}`,
              timestamp: nowStr(),
              toolName: "paypal_create_invoice",
              arguments: toolkitInvoiceArgs,
              resultSummary: `@paypal/agent-toolkit create_invoice -> Sandbox draft invoice ${invoiceId} (#${invoiceNumber})`,
              liveSandbox: true,
            } as PayPalToolkitCallTrace,
          };
        }
        toolkitError = `toolkit returned no invoice id: ${JSON.stringify(parsed).slice(0, 160)}`;
      } catch (e) {
        toolkitError = e instanceof Error ? e.message : String(e);
      }
    }

    // Direct REST fallback
    const token = await getPayPalAccessToken(runtime);
    let restError = "no access token";
    if (token) {
      const invoicePayload = {
        detail: { invoice_number: invoiceNumber, reference: contractCode, currency_code: "USD", note },
        invoicer: { business_name: vendorName, email_address: vendorEmail },
        ...(primaryRecipients ? { primary_recipients: primaryRecipients } : {}),
        items,
      };
      const res = await fetch(`${PAYPAL_SANDBOX_BASE}/v2/invoicing/invoices`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(invoicePayload),
      });
      if (res.ok) {
        const data = await res.json();
        const invoiceId = (data.id || String(data.href || "").split("/").pop()) as string;
        return {
          mode: "LIVE_SANDBOX" as const,
          invoiceId,
          invoiceNumber,
          rawPayload: data as Record<string, unknown>,
          toolkitTrace: {
            id: `tk-inv-${Date.now()}`,
            timestamp: nowStr(),
            toolName: "paypal_create_invoice",
            arguments: toolkitInvoiceArgs,
            resultSummary: `POST /v2/invoicing/invoices -> Sandbox draft invoice ${invoiceId}`,
            liveSandbox: true,
          } as PayPalToolkitCallTrace,
        };
      }
      restError = await describePayPalError(res);
    }

    // Invoice is secondary to the hold. Don't kill the contract, but never pretend it worked.
    return {
      mode: "LIVE_SANDBOX" as const,
      invoiceId: undefined as string | undefined,
      invoiceNumber: undefined as string | undefined,
      rawPayload: { error: { toolkit: toolkitError, rest: restError } } as Record<string, unknown>,
      toolkitTrace: {
        id: `tk-inv-${Date.now()}`,
        timestamp: nowStr(),
        toolName: "paypal_create_invoice",
        arguments: toolkitInvoiceArgs,
        resultSummary: `Invoice NOT created (contract continues without it). toolkit: ${toolkitError || "n/a"}; REST: ${restError}`,
        liveSandbox: true,
      } as PayPalToolkitCallTrace,
    };
  }

  const simInvoiceId = simId("INV");
  return {
    mode: "UNCONFIGURED_SANDBOX_PREVIEW" as const,
    invoiceId: simInvoiceId as string | undefined,
    invoiceNumber: invoiceNumber as string | undefined,
    rawPayload: {
      simulated: true,
      notice: "SIMULATED: no PayPal API call was made.",
      would_have_posted: "POST /v2/invoicing/invoices",
      request: toolkitInvoiceArgs,
    } as Record<string, unknown>,
    toolkitTrace: {
      id: `tk-inv-${Date.now()}`,
      timestamp: nowStr(),
      toolName: "paypal_create_invoice",
      arguments: toolkitInvoiceArgs,
      resultSummary: `SIMULATED invoice ${simInvoiceId} (#${invoiceNumber}). No PayPal API call was made.`,
      liveSandbox: false,
    } as PayPalToolkitCallTrace,
  };
}

export interface SettlementResult {
  mode: "LIVE_SANDBOX" | "UNCONFIGURED_SANDBOX_PREVIEW";
  captureId: string;
  payoutBatchId: string;
  updatedRecipients: SplitRecipient[];
  rawPayload: Record<string, unknown>;
  toolkitTraces: PayPalToolkitCallTrace[];
}

/**
 * Capture the authorization and disburse the split via Payouts v1.
 *  - simulate=true: nothing is sent to PayPal. All ids are SIM- prefixed and recipients are marked SIMULATED.
 *  - simulate=false: every step must succeed against the real Sandbox API, otherwise a PayPalApiError is thrown.
 *    If the capture succeeded but the payout failed, the error carries captureId so a retry skips the capture.
 */
export async function captureAndSplitPayoutPayPal(params: {
  orderId: string;
  authorizationId?: string;
  existingCaptureId?: string;
  contractCode: string;
  totalAmountUsd: number;
  splitRecipients: SplitRecipient[];
  simulate: boolean;
  runtime?: RuntimeCredentials;
}): Promise<SettlementResult> {
  const { orderId, authorizationId, existingCaptureId, contractCode, totalAmountUsd, splitRecipients, simulate, runtime } = params;
  const traces: PayPalToolkitCallTrace[] = [];

  const payoutItems = splitRecipients.map((r, idx) => ({
    recipient_type: "EMAIL",
    amount: { value: r.amountUsd.toFixed(2), currency: "USD" },
    note: `PayPulse AI verified milestone split (${r.sharePct}%) for ${contractCode}`,
    sender_item_id: `${contractCode}-SPLIT-${idx + 1}`,
    receiver: r.email,
  }));
  const payoutRequestBody = {
    sender_batch_header: {
      // Deterministic: PayPal rejects a duplicate sender_batch_id, which protects against double payouts on retry.
      sender_batch_id: `PAYPULSE-${contractCode}`,
      email_subject: `PayPulse AI milestone released: ${contractCode}`,
      email_message: "Deliverable verification passed and the buyer approved release.",
    },
    items: payoutItems,
  };

  if (simulate) {
    const captureId = simId("CAP");
    const batchId = simId("PAYOUT");
    const updatedRecipients = splitRecipients.map((r, i) => ({
      ...r,
      status: "SIMULATED" as const,
      payoutItemId: simId(`ITEM${i + 1}`),
    }));
    traces.push(
      {
        id: `tk-cap-${Date.now()}`,
        timestamp: nowStr(),
        toolName: "paypal_capture_order",
        arguments: { order_id: orderId, authorization_id: authorizationId, final_capture: true },
        resultSummary: `SIMULATED capture ${captureId} of $${totalAmountUsd.toFixed(2)}. No PayPal API call was made, no money moved.`,
        liveSandbox: false,
      },
      {
        id: `tk-pyt-${Date.now() + 1}`,
        timestamp: nowStr(),
        toolName: "paypal_create_payout_batch",
        arguments: payoutRequestBody,
        resultSummary: `SIMULATED payout batch ${batchId} across ${splitRecipients.length} recipients. No PayPal API call was made, no money moved.`,
        liveSandbox: false,
      }
    );
    return {
      mode: "UNCONFIGURED_SANDBOX_PREVIEW",
      captureId,
      payoutBatchId: batchId,
      updatedRecipients,
      rawPayload: {
        simulated: true,
        notice: "SIMULATED: nothing below was sent to PayPal and no money moved.",
        would_have_posted: [
          `POST /v2/payments/authorizations/${authorizationId}/capture`,
          "POST /v1/payments/payouts",
        ],
        payout_request: payoutRequestBody,
      },
      toolkitTraces: traces,
    };
  }

  // ---------- LIVE SANDBOX ----------
  if (!authorizationId) {
    throw new PayPalApiError(
      "capture",
      "This order has no PayPal authorization yet. The buyer must approve the hold in PayPal first.",
      409
    );
  }
  const placeholder = splitRecipients.find((r) => isPlaceholderEmail(r.email));
  if (placeholder) {
    throw new PayPalApiError(
      "payout",
      `Recipient ${placeholder.email} is a placeholder address. Use real PayPal sandbox account emails before releasing funds.`,
      422
    );
  }

  const token = await requireToken("capture", runtime);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  let captureId = existingCaptureId;
  let captureRaw: Record<string, unknown> = {};
  if (!captureId) {
    const capRes = await fetch(
      `${PAYPAL_SANDBOX_BASE}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
      {
        method: "POST",
        headers: { ...headers, "PayPal-Request-Id": `paypulse-capture-${contractCode}` },
        body: JSON.stringify({
          amount: { currency_code: "USD", value: totalAmountUsd.toFixed(2) },
          final_capture: true,
          note_to_payer: `Milestone verified for ${contractCode}`,
        }),
      }
    );
    if (!capRes.ok) {
      throw new PayPalApiError("capture", `PayPal authorization capture failed: ${await describePayPalError(capRes)}`);
    }
    captureRaw = (await capRes.json()) as Record<string, unknown>;
    captureId = String(captureRaw.id || "");
    if (!captureId) throw new PayPalApiError("capture", "PayPal capture returned no capture id.");
    traces.push({
      id: `tk-cap-${Date.now()}`,
      timestamp: nowStr(),
      toolName: "paypal_capture_order",
      arguments: { order_id: orderId, authorization_id: authorizationId, final_capture: true },
      resultSummary: `POST /v2/payments/authorizations/${authorizationId}/capture -> Capture ${captureId} (${captureRaw.status}) $${totalAmountUsd.toFixed(2)}`,
      liveSandbox: true,
    });
  }

  const payoutRes = await fetch(`${PAYPAL_SANDBOX_BASE}/v1/payments/payouts`, {
    method: "POST",
    headers,
    body: JSON.stringify(payoutRequestBody),
  });
  if (!payoutRes.ok) {
    throw new PayPalApiError(
      "payout",
      `Funds were captured (${captureId}) but the payout batch failed: ${await describePayPalError(payoutRes)}. Retrying will skip the capture.`,
      502,
      captureId
    );
  }
  const payoutData = (await payoutRes.json()) as {
    batch_header?: { payout_batch_id?: string };
  };
  const batchId = payoutData.batch_header?.payout_batch_id;
  if (!batchId) {
    throw new PayPalApiError("payout", "PayPal accepted the payout but returned no batch id.", 502, captureId);
  }
  traces.push({
    id: `tk-pyt-${Date.now() + 1}`,
    timestamp: nowStr(),
    toolName: "paypal_create_payout_batch",
    arguments: payoutRequestBody,
    resultSummary: `POST /v1/payments/payouts -> Batch ${batchId} (${splitRecipients.length} recipients, $${totalAmountUsd.toFixed(2)})`,
    liveSandbox: true,
  });

  return {
    mode: "LIVE_SANDBOX",
    captureId,
    payoutBatchId: batchId,
    // Payouts are asynchronous; the batch is accepted here, per-item success is reported by PayPal afterwards.
    updatedRecipients: splitRecipients.map((r) => ({ ...r, status: "SENT" as const })),
    rawPayload: { authorization_capture: captureRaw, batch_payout: payoutData },
    toolkitTraces: traces,
  };
}
