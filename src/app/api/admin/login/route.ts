import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, isAdminConfigured, isValidPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!isAdminConfigured()) {
      return NextResponse.json({ error: "ADMIN_NOT_CONFIGURED" }, { status: 503 });
    }

    const body = (await request.json()) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";

    if (!isValidPassword(password)) {
      return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, adminToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (error) {
    console.error("admin login failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
