"use client";

/**
 * Who this browser says they are. Deliberately not authentication — the event
 * has no logins — just enough to survive a refresh mid-flow.
 */

const KEY = "lunch-mate-session";

export interface ClientSession {
  userId: string;
  name: string;
  menuChoice?: string;
  eatingSpeed?: string;
}

export function readSession(): ClientSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ClientSession) : null;
  } catch {
    return null;
  }
}

export function writeSession(patch: Partial<ClientSession>): ClientSession | null {
  if (typeof window === "undefined") return null;
  const next = { ...(readSession() ?? {}), ...patch } as ClientSession;
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

