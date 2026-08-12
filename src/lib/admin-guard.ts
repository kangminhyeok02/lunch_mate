import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdminConfigured, isValidAdminToken } from "./auth";

/** True when the current request carries a valid admin cookie. */
export async function isAdminRequest(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const jar = await cookies();
  return isValidAdminToken(jar.get(ADMIN_COOKIE)?.value);
}
