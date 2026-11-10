import { EscrowDeal } from "@/types/paypulse";

export const MAX_DELIVERABLE_BYTES = 1_000_000; // 1 MB of text
export const MAX_IMAGE_BASE64_CHARS = 6_000_000; // ~4.5 MB image
export const MAX_CONTRACT_USD = 50_000;

export const ALLOWED_CATEGORIES: EscrowDeal["category"][] = [
  "E-Commerce & Checkout Dev",
  "UI/UX & Brand Design",
  "Security & QA Audit",
  "Full-Stack Web App",
  "Data & Automation",
];

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

/** Reserved / non-routable domains used by the demo placeholders. */
const PLACEHOLDER_EMAIL_RE = /(\.example|\.test|\.invalid|\.localhost|@example\.(com|org|net))$/i;

export function isValidEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    EMAIL_RE.test(value.trim())
  );
}

export function isPlaceholderEmail(email: string): boolean {
  return PLACEHOLDER_EMAIL_RE.test(email.trim());
}

export class ValidationError extends Error {
  fieldErrors: Record<string, string>;
  constructor(fieldErrors: Record<string, string>) {
    super(
      "Invalid request: " +
        Object.entries(fieldErrors)
          .map(([k, v]) => `${k} ${v}`)
          .join("; ")
    );
    this.fieldErrors = fieldErrors;
  }
}

export interface ValidatedNegotiationInput {
  clientBusinessName: string;
  vendorName: string;
  vendorEmail: string;
  buyerEmail?: string;
  category: EscrowDeal["category"];
  projectTitle: string;
  initialQuoteUsd: number;
  vendorPriceFloorUsd: number;
  buyerTargetBudgetUsd: number;
  autoCaptureThresholdUsd: number;
  buyerBrief?: string;
  collaborator?: { name: string; email: string; sharePct: number; role: string };
}

function cleanString(
  v: unknown,
  field: string,
  errors: Record<string, string>,
  opts: { required?: boolean; max: number }
): string {
  if (v === undefined || v === null || v === "") {
    if (opts.required) errors[field] = "is required";
    return "";
  }
  if (typeof v !== "string") {
    errors[field] = "must be a string";
    return "";
  }
  const s = v.trim();
  if (opts.required && !s) errors[field] = "is required";
  if (s.length > opts.max) errors[field] = `must be at most ${opts.max} characters`;
  return s;
}

function cleanMoney(
  v: unknown,
  field: string,
  errors: Record<string, string>,
  opts: { min: number; max: number; required?: boolean }
): number {
  if (v === undefined || v === null || v === "") {
    if (opts.required !== false) errors[field] = "is required";
    return 0;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    errors[field] = "must be a number";
    return 0;
  }
  if (n < opts.min || n > opts.max) {
    errors[field] = `must be between ${opts.min} and ${opts.max}`;
  }
  return Math.round(n * 100) / 100;
}

export function validateNegotiationInput(
  body: unknown
): ValidatedNegotiationInput {
  const errors: Record<string, string> = {};
  const b = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;

  const clientBusinessName = cleanString(b.clientBusinessName, "clientBusinessName", errors, { required: true, max: 120 });
  const vendorName = cleanString(b.vendorName, "vendorName", errors, { required: true, max: 120 });
  const projectTitle = cleanString(b.projectTitle, "projectTitle", errors, { required: true, max: 200 });
  const buyerBrief = cleanString(b.buyerBrief, "buyerBrief", errors, { max: 1000 });

  const vendorEmail = cleanString(b.vendorEmail, "vendorEmail", errors, { required: true, max: 254 });
  if (vendorEmail && !isValidEmail(vendorEmail)) errors.vendorEmail = "must be a valid email address";

  const buyerEmailRaw = cleanString(b.buyerEmail, "buyerEmail", errors, { max: 254 });
  if (buyerEmailRaw && !isValidEmail(buyerEmailRaw)) errors.buyerEmail = "must be a valid email address";

  const category = b.category as EscrowDeal["category"];
  if (!ALLOWED_CATEGORIES.includes(category)) {
    errors.category = `must be one of: ${ALLOWED_CATEGORIES.join(", ")}`;
  }

  const initialQuoteUsd = cleanMoney(b.initialQuoteUsd, "initialQuoteUsd", errors, { min: 1, max: MAX_CONTRACT_USD });
  const vendorPriceFloorUsd = cleanMoney(b.vendorPriceFloorUsd, "vendorPriceFloorUsd", errors, { min: 1, max: MAX_CONTRACT_USD });
  const buyerTargetBudgetUsd = cleanMoney(b.buyerTargetBudgetUsd, "buyerTargetBudgetUsd", errors, { min: 1, max: MAX_CONTRACT_USD });
  const autoCaptureThresholdUsd = cleanMoney(b.autoCaptureThresholdUsd ?? 500, "autoCaptureThresholdUsd", errors, { min: 0, max: MAX_CONTRACT_USD });

  if (!errors.initialQuoteUsd && !errors.vendorPriceFloorUsd && vendorPriceFloorUsd > initialQuoteUsd) {
    errors.vendorPriceFloorUsd = "cannot exceed the vendor quote";
  }

  // Optional collaborator split. Recipients are NEVER chosen by the AI model.
  let collaborator: ValidatedNegotiationInput["collaborator"];
  const c = b.collaborator as Record<string, unknown> | undefined;
  const hasCollab = Boolean(c && (c.email || c.name));
  if (hasCollab && c) {
    const name = cleanString(c.name, "collaborator.name", errors, { required: true, max: 120 });
    const email = cleanString(c.email, "collaborator.email", errors, { required: true, max: 254 });
    if (email && !isValidEmail(email)) errors["collaborator.email"] = "must be a valid email address";
    if (email && vendorEmail && email.toLowerCase() === vendorEmail.toLowerCase()) {
      errors["collaborator.email"] = "must differ from the freelancer email";
    }
    const sharePct = cleanMoney(c.sharePct, "collaborator.sharePct", errors, { min: 1, max: 99 });
    const role = cleanString(c.role, "collaborator.role", errors, { max: 80 }) || "Collaborator";
    collaborator = { name, email, sharePct, role };
  }

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  return {
    clientBusinessName,
    vendorName,
    vendorEmail,
    buyerEmail: buyerEmailRaw || undefined,
    category,
    projectTitle,
    initialQuoteUsd,
    vendorPriceFloorUsd,
    buyerTargetBudgetUsd,
    autoCaptureThresholdUsd,
    buyerBrief: buyerBrief || undefined,
    collaborator,
  };
}

export function validateDealId(v: unknown): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) {
    throw new ValidationError({ dealId: "is required and must be a valid deal id" });
  }
  return v;
}
