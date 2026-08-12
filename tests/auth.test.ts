import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminToken, isAdminConfigured, isValidAdminToken, isValidPassword } from "@/lib/auth";

const ORIGINAL = process.env.ADMIN_PASSWORD;

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "s3cret-pass";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = ORIGINAL;
});

describe("admin auth", () => {
  it("accepts the configured password and rejects anything else", () => {
    expect(isValidPassword("s3cret-pass")).toBe(true);
    expect(isValidPassword("wrong")).toBe(false);
    expect(isValidPassword("")).toBe(false);
    expect(isValidPassword("s3cret-pas")).toBe(false);
  });

  it("issues a token that is not the password itself", () => {
    const token = adminToken();
    expect(token).not.toContain("s3cret-pass");
    expect(token).toHaveLength(64);
  });

  it("validates its own token and rejects forgeries", () => {
    expect(isValidAdminToken(adminToken())).toBe(true);
    expect(isValidAdminToken("deadbeef")).toBe(false);
    expect(isValidAdminToken(undefined)).toBe(false);
    expect(isValidAdminToken("")).toBe(false);
  });

  it("changes the token when the password changes", () => {
    const before = adminToken();
    process.env.ADMIN_PASSWORD = "different";
    expect(adminToken()).not.toBe(before);
    expect(isValidAdminToken(before)).toBe(false);
  });

  it("locks the admin area entirely when no password is configured", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(isAdminConfigured()).toBe(false);
    expect(isValidPassword("")).toBe(false);
    expect(isValidPassword("anything")).toBe(false);
    expect(isValidAdminToken("anything")).toBe(false);
  });
});
