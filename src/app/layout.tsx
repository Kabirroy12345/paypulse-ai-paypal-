import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayPulse AI — Agentic Milestone Hold-Then-Capture for Freelancers & Small Businesses",
  description:
    "Two-sided AI milestone payments powered by @paypal/agent-toolkit, PayPal Orders v2 (intent: AUTHORIZE), Payouts v1, Gemini 3.8 Flash, and AG Grid Community v33.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#050914] text-slate-100 antialiased selection:bg-[#0070BA] selection:text-white">
        {children}
      </body>
    </html>
  );
}
