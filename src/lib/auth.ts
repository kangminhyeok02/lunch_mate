/**
 * Admin gate. The password never reaches the browser; the client only ever
 * holds an HMAC token derived from it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "lm_admin";

function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD;
  return value && value.length > 0 ? value : null;
}

/** Token proving the holder knew the password. */
export function adminToken(): string {
  const password = adminPassword();
  if (!password) return "";
  return createHmac("sha256", password).update("lunch-mate-admin").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isValidPassword(candidate: string): boolean {
  const password = adminPassword();
  if (!password) return false;
  return safeEqual(candidate, password);
}

export function isValidAdminToken(candidate: string | undefined): boolean {
  if (!candidate) return false;
  const expected = adminToken();
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

/** True when no ADMIN_PASSWORD is configured, which locks the admin page. */
export function isAdminConfigured(): boolean {
  return adminPassword() !== null;
}
