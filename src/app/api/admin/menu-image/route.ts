import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-guard";
import { uploadMenuImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const menuId = form.get("menuId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    }

    const result = await uploadMenuImage(
      typeof menuId === "string" ? menuId : "menu",
      file,
    );

    if (!result.ok) {
      const status = result.reason === "STORAGE_NOT_CONFIGURED" ? 503 : 400;
      console.error("menu image upload rejected", result.reason, result.detail);
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({ ok: true, url: result.url });
  } catch (error) {
    console.error("menu image upload failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
