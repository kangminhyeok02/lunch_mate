import { describe, expect, it } from "vitest";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  UPLOAD_ERROR_MESSAGE,
  validateImage,
} from "@/lib/storage";

function fakeFile(type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], "photo", { type });
}

describe("메뉴 사진 검증", () => {
  it("허용된 이미지 형식은 통과시킨다", () => {
    for (const type of ALLOWED_IMAGE_TYPES) {
      expect(validateImage(fakeFile(type, 1024))).toBeNull();
    }
  });

  it("파일이 없거나 비어 있으면 거부한다", () => {
    expect(validateImage(null)).toBe("FILE_REQUIRED");
    expect(validateImage(fakeFile("image/png", 0))).toBe("FILE_REQUIRED");
  });

  it("5MB를 넘으면 거부한다", () => {
    expect(validateImage(fakeFile("image/png", MAX_IMAGE_BYTES))).toBeNull();
    expect(validateImage(fakeFile("image/png", MAX_IMAGE_BYTES + 1))).toBe("FILE_TOO_LARGE");
  });

  it("이미지가 아닌 형식은 거부한다", () => {
    expect(validateImage(fakeFile("application/pdf", 1024))).toBe("UNSUPPORTED_TYPE");
    expect(validateImage(fakeFile("text/html", 1024))).toBe("UNSUPPORTED_TYPE");
    expect(validateImage(fakeFile("image/svg+xml", 1024))).toBe("UNSUPPORTED_TYPE");
  });

  it("크기보다 형식을 먼저 보지 않고, 빈 파일을 가장 먼저 걸러낸다", () => {
    // 순서가 뒤바뀌면 사용자가 엉뚱한 안내를 받는다.
    expect(validateImage(fakeFile("application/pdf", 0))).toBe("FILE_REQUIRED");
    expect(validateImage(fakeFile("application/pdf", MAX_IMAGE_BYTES + 1))).toBe("FILE_TOO_LARGE");
  });

  it("모든 실패 코드에 안내 문구가 있다", () => {
    const codes = [
      "STORAGE_NOT_CONFIGURED",
      "FILE_REQUIRED",
      "FILE_TOO_LARGE",
      "UNSUPPORTED_TYPE",
      "UPLOAD_FAILED",
    ] as const;
    for (const code of codes) {
      expect(UPLOAD_ERROR_MESSAGE[code]).toBeTruthy();
    }
  });
});
