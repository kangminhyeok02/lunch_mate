"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "./supabase-client";
import type { AssignmentStatus } from "./types";

export interface WatchState {
  status: AssignmentStatus;
  submittedCount: number;
  totalCount: number;
  assigned: boolean;
  mine: { submitted: boolean; grouped: boolean } | null;
}

const POLL_INTERVAL_MS = 3000;

/**
 * Watches the day's assignment state. Uses Supabase Realtime when the project
 * is configured, and falls back to polling otherwise — both drive the same
 * state so the waiting screen advances either way.
 */
export function useAssignmentWatch(userId: string | null): WatchState | null {
  const [state, setState] = useState<WatchState | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const response = await fetch(`/api/status${query}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as WatchState;
      if (alive.current) setState(data);
    } catch {
      // Transient network failure — the next tick will retry.
    }
  }, [userId]);

  useEffect(() => {
    alive.current = true;
    void refresh();

    const supabase = getBrowserSupabase();

    if (supabase) {
      const channel = supabase
        .channel("lunch-mate-status")
        .on("postgres_changes", { event: "*", schema: "public", table: "lunch_days" }, () => {
          void refresh();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "lunch_groups" }, () => {
          void refresh();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "lunch_preferences" }, () => {
          void refresh();
        })
        .subscribe();

      // A slow heartbeat still covers dropped websockets.
      const heartbeat = setInterval(() => void refresh(), POLL_INTERVAL_MS * 5);

      return () => {
        alive.current = false;
        clearInterval(heartbeat);
        void supabase.removeChannel(channel);
      };
    }

    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  return state;
}
