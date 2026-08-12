/** The event runs in Korea, so "today" is always the Seoul calendar date. */

const SEOUL_TIME_ZONE = "Asia/Seoul";

export function todayInSeoul(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}
