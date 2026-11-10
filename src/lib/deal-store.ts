import "server-only";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { AgentTelemetryEvent, EscrowDeal } from "@/types/paypulse";
import { buildSeedDeals, buildSeedTelemetry } from "@/lib/seed-deals";

/**
 * Server-side deal store.
 *
 * The browser only ever sends a deal ID. Every fact that decides whether money moves
 * (amount, recipients, audit result, status) is read from this store, never from the request body.
 *
 * Deals are scoped to an anonymous, httpOnly session cookie, so one visitor cannot read or act on another
 * visitor's contracts. Storage is in-memory: it resets when the server restarts or redeploys and is not shared
 * across instances. Swap this module for a database before running more than one instance.
 *
 * NOTE: there are no user accounts. The Buyer/Freelancer switch is a UI view only and is not an access control.
 */

const COOKIE_NAME = "paypulse_sid";
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
export const MAX_DEALS_PER_SESSION = 40;

export interface SessionData {
  deals: EscrowDeal[];
  telemetry: AgentTelemetryEvent[];
  touchedAt: number;
  locks: Set<string>;
}

const g = globalThis as unknown as {
  __paypulseSessions?: Map<string, SessionData>;
};
const sessions: Map<string, SessionData> = (g.__paypulseSessions ??= new Map());

function purge() {
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (now - s.touchedAt > SESSION_TTL_MS) sessions.delete(sid);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
    if (!oldest) break;
    sessions.delete(oldest[0]);
  }
}

function freshSession(): SessionData {
  return {
    deals: buildSeedDeals(),
    telemetry: buildSeedTelemetry(),
    touchedAt: Date.now(),
    locks: new Set(),
  };
}

export function getSession(req: NextRequest): { sid: string; session: SessionData } {
  purge();
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) {
    const s = sessions.get(existing);
    if (s) {
      s.touchedAt = Date.now();
      return { sid: existing, session: s };
    }
  }
  const sid = randomUUID();
  const session = freshSession();
  sessions.set(sid, session);
  return { sid, session };
}

export function resetSession(sid: string): SessionData {
  const session = freshSession();
  sessions.set(sid, session);
  return session;
}

export function findDeal(session: SessionData, id: string): EscrowDeal | undefined {
  return session.deals.find((d) => d.id === id);
}

export function saveDeal(session: SessionData, deal: EscrowDeal, prepend = false) {
  const idx = session.deals.findIndex((d) => d.id === deal.id);
  if (idx >= 0) session.deals[idx] = deal;
  else if (prepend) session.deals.unshift(deal);
  else session.deals.push(deal);
}

export function addTelemetry(session: SessionData, ev: AgentTelemetryEvent) {
  session.telemetry.unshift(ev);
  if (session.telemetry.length > 100) session.telemetry.length = 100;
}

/** Per-deal mutex so a double-click or parallel request cannot capture or pay out twice. */
export function tryLock(session: SessionData, dealId: string): boolean {
  if (session.locks.has(dealId)) return false;
  session.locks.add(dealId);
  return true;
}
export function unlock(session: SessionData, dealId: string) {
  session.locks.delete(dealId);
}

export function jsonWithSession(
  req: NextRequest,
  sid: string,
  body: unknown,
  init?: { status?: number }
): NextResponse {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  res.cookies.set(COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
