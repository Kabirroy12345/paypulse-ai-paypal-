# PayPulse AI — Hold-Then-Capture Milestone Payments for Small Businesses & Freelancers

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PayPal Agent Toolkit](https://img.shields.io/badge/PayPal-@paypal%2Fagent--toolkit_%7C_Orders_v2_%7C_Payouts_v1-003087?logo=paypal)](https://developer.paypal.com)
[![Gemini 3.8 Flash](https://img.shields.io/badge/Google_AI-Gemini_3.8_Flash-4285F4?logo=google)](https://aistudio.google.com)
[![AG Grid Community v33](https://img.shields.io/badge/AG_Grid-Community_v33-009CDE)](https://www.ag-grid.com)

> **PayPulse AI** helps small businesses hire freelance developers and agencies without the risk of blind upfront payments or late invoices. Powered by **`@paypal/agent-toolkit`**, **PayPal Orders v2 (`intent: AUTHORIZE`)**, **PayPal Invoicing v2**, **PayPal Payouts v1**, **Google Gemini 3.8 Flash (`@google/genai`)**, and **AG Grid Community v33**.

---

## 🎯 Target Audience & Problem Solved

When a small business (e.g., an indie e-commerce shop or clinic) hires a freelance developer or boutique agency for a $500–$5,000 milestone:
1. **Upfront vs. Net-30 Friction:** Clients hesitate to pay 100% upfront before code/assets are tested, while freelancers hate starting work without payment certainty.
2. **Ad-Hoc Scope & Price Negotiation:** Small business owners and freelancers waste days going back and forth over rates, scope, and revision limits.
3. **Manual Subcontractor Splits:** When a lead freelancer works with an independent QA tester or designer, splitting the final payment requires manual secondary transfers.

### How PayPulse AI Fixes This (Hold-Then-Capture Workflow)
1. **Two-Agent Negotiation with a Real Vendor Price Floor:** The client's `Buyer-Advocate` agent negotiates with the freelancer's `Vendor-Floor-Agent`, which enforces the freelancer's hard minimum walk-away floor. Discounts vary naturally based on the spread between the quote, the buyer's target budget, and the vendor's floor.
2. **PayPal Authorization Hold (`intent: AUTHORIZE`) via `@paypal/agent-toolkit`:** Once terms are agreed, PayPulse AI creates an itemized PayPal Invoice (`create_invoice`) and a PayPal Order with `intent: "AUTHORIZE"` (`create_order` / `POST /v2/checkout/orders`), placing an authorization hold on the funds so the freelancer knows the money is reserved before writing a line of code.
3. **Deterministic Gatekeeper + Gemini 3.8 Flash File Review (Never Auto-Pays on LLM Confidence):**
   - **Stage 1 (Deterministic Code Gate):** Computes the deliverable file's `SHA-256` digest, checks byte size, verifies `unit_tests_passed === unit_tests_total`, enforces `bundle_size_kb <= 250 KB`, and checks SARIF security scan counts (`0` Critical/High CVEs). If any deterministic check fails, order capture is hard-blocked in code.
   - **Stage 2 (Gemini 3.8 Flash Semantic Review):** Inspects the actual submitted file (and optional UI screenshots) against the milestone requirements.
   - **Stage 3 (Human-in-the-Loop Policy Threshold):** Micro-milestones (`<= $500`) can auto-capture once all deterministic and AI checks pass. Any milestone **`> $500` requires explicit Human Buyer Sign-Off** before capturing the PayPal authorization (`pay_order` / `/capture`) and disbursing multi-party split payouts (`POST /v1/payments/payouts`).

---

## 🏗️ Architecture

```
+-----------------------------------------------------------------------------------+
|          PAYPULSE AI — TWO-SIDED WORKSPACE (Buyer View <-> Freelancer View)       |
|  +-----------------------------------------------------------------------------+  |
|  | AG Grid Community v33 Milestone Ledger                                      |  |
|  | • Custom Status & Deterministic Rule Renderers  • Pinned Bottom Totals      |  |
|  | • Cell Change Flash (enableCellChangeFlash)     • Quick Filter & CSV Export |  |
|  +-----------------------------------------------------------------------------+  |
+-------------------+-------------------------------+-------------------------------+
                    |                               |
                    v                               v
+-----------------------------------+   +-------------------------------------------+
| 1. TWO-AGENT FLOOR NEGOTIATION    |   | 2. 3-STAGE DELIVERABLE VERIFICATION GATE  |
| • Buyer Agent vs Vendor Agent     |   | • Stage 1: Deterministic SHA-256, byte    |
|   with hard walk-away floor       |   |   size, unit tests, bundle cap & SARIF    |
| • Invokes @paypal/agent-toolkit:  |   | • Stage 2: Gemini 3.8 Flash file review   |
|   - create_invoice (v2 Invoicing) |   | • Stage 3: Human Buyer Sign-Off (> $500)  |
|   - create_order (intent:         |   | • Executes Capture + Split Payouts        |
|     AUTHORIZE)                    |   |   (POST /v1/payments/payouts)             |
+-----------------------------------+   +-------------------------------------------+
```

---

## ⚡ Quick Start (Run Locally)

### Prerequisites
- **Node.js** `>= 18.18.0`
- **npm** `>= 9.0.0`

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure PayPal Sandbox & Gemini API Keys
Copy `.env.example` to `.env.local` (or enter your keys live in the **API Keys** modal in the top-right header):
```bash
cp .env.example .env.local
```
Set your keys in `.env.local`:
- `PAYPAL_CLIENT_ID` & `PAYPAL_CLIENT_SECRET`: From [PayPal Developer Dashboard (Sandbox)](https://developer.paypal.com/dashboard/applications/sandbox)
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID`: Your PayPal Sandbox Client ID (renders live `@paypal/react-paypal-js` Smart Buttons with `intent: "authorize"`)
- `GEMINI_API_KEY`: From [Google AI Studio](https://aistudio.google.com/apikey)

### 3. Start the Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)**.

---

## 🧪 Testing Real Deliverable Files

We include two real deliverable manifest files in [`public/sample-deliverables/`](./public/sample-deliverables/) (and you can also upload any `.json`, `.txt`, `.sarif`, or code file from your computer):
1. **`shopify-checkout-audit-PASS.json`**: Passes all 5 deterministic checks (`48/48` unit tests, `184 KB` bundle `<= 250 KB`, `0` critical/high CVEs) and Gemini 3.8 Flash review -> Routes to **Human Buyer Sign-Off** (for contracts `> $500`) or auto-captures (`<= $500`).
2. **`shopify-checkout-audit-DEFECTIVE.json`**: Contains `39/48` passing unit tests, an uncompressed `612 KB` bundle, and `1` Critical CVE (`PAYPAL-TRANSMISSION-SIG` bypass) -> **Hard-blocked by Stage 1 Deterministic Gate** so the PayPal Authorization Hold cannot be captured.

---

## 📄 License
Open-source under the [MIT License](./LICENSE).
