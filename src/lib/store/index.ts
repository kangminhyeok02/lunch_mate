import type { LunchStore } from "./types";
import { FileLunchStore } from "./file-store";
import { SupabaseLunchStore } from "./supabase-store";

let cached: LunchStore | null = null;

/**
 * Supabase when it is configured, local JSON file otherwise. This is the only
 * place the app decides where data lives.
 */
export function getStore(): LunchStore {
  if (cached) return cached;
  // Read at runtime (not a NEXT_PUBLIC_ var, so it isn't inlined at build time),
  // which lets the smoke test exercise the file adapter against a real server.
  cached =
    process.env.LUNCH_MATE_FORCE_FILE_STORE === "1"
      ? new FileLunchStore()
      : SupabaseLunchStore.fromEnv() ?? new FileLunchStore();
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export * from "./types";
export { FileLunchStore } from "./file-store";
export { SupabaseLunchStore } from "./supabase-store";
