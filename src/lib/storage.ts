/**
 * 메뉴 사진 업로드. Supabase Storage의 공개 버킷에 올리고 공개 URL을 돌려준다.
 */

import { createClient } from "@supabase/supabase-js";

export const MENU_IMAGE_BUCKET = "menu-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type UploadFailure =
  | "STORAGE_NOT_CONFIGURED"
  | "FILE_REQUIRED"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_TYPE";

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; reason: UploadFailure | "UPLOAD_FAILED"; detail?: string };

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** 파일 자체를 먼저 검증한다. 스토리지에 닿기 전에 걸러내는 편이 오류 메시지가 명확하다. */
export function validateImage(file: File | null): UploadFailure | null {
  if (!file || file.size === 0) return "FILE_REQUIRED";
  if (file.size > MAX_IMAGE_BYTES) return "FILE_TOO_LARGE";
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return "UNSUPPORTED_TYPE";
  }
  return null;
}

export async function uploadMenuImage(menuId: string, file: File): Promise<UploadResult> {
  const invalid = validateImage(file);
  if (invalid) return { ok: false, reason: invalid };

  const client = storageClient();
  if (!client) return { ok: false, reason: "STORAGE_NOT_CONFIGURED" };

  // 파일명에 시각을 넣어 CDN 캐시가 옛 사진을 붙들지 않도록 한다.
  const extension = EXTENSION_BY_TYPE[file.type] ?? "jpg";
  const safeId = menuId.replace(/[^a-z0-9-]/gi, "") || "menu";
  const path = `${safeId}-${Date.now()}.${extension}`;

  const { error } = await client.storage
    .from(MENU_IMAGE_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    return { ok: false, reason: "UPLOAD_FAILED", detail: error.message };
  }

  const { data } = client.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

export const UPLOAD_ERROR_MESSAGE: Record<UploadFailure | "UPLOAD_FAILED", string> = {
  STORAGE_NOT_CONFIGURED: "이미지 저장소가 설정되지 않았어요. supabase/storage.sql 을 실행해주세요.",
  FILE_REQUIRED: "사진을 선택해주세요.",
  FILE_TOO_LARGE: "사진 용량은 5MB까지 올릴 수 있어요.",
  UNSUPPORTED_TYPE: "JPG, PNG, WEBP, GIF 형식만 올릴 수 있어요.",
  UPLOAD_FAILED: "사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요.",
};
