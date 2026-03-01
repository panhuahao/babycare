export type MovementType = "hiccup" | "hand" | "kick";

export type MovementEvent = {
  id: string;
  type: MovementType;
  ts: number;
};

export type HourRecord = {
  hourStart: number;
  effectiveCount: number;
  rawClicks: number;
};

export function hourStartMs(ts: number) {
  return Math.floor(ts / 3_600_000) * 3_600_000;
}

export function formatHourLabel(hourStart: number) {
  const d = new Date(hourStart);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:00`;
}

export function effectiveCount(events: MovementEvent[], windowMs = 5 * 60_000): number {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  let count = 0;
  let lastEffectiveTs: number | null = null;
  for (const e of sorted) {
    if (lastEffectiveTs === null || e.ts - lastEffectiveTs >= windowMs) {
      count += 1;
      lastEffectiveTs = e.ts;
    }
  }
  return count;
}

export function groupByHour(events: MovementEvent[]): HourRecord[] {
  const byHour = new Map<number, MovementEvent[]>();
  for (const e of events) {
    const h = hourStartMs(e.ts);
    const list = byHour.get(h) ?? [];
    list.push(e);
    byHour.set(h, list);
  }
  const hours = [...byHour.entries()]
    .map(([hourStart, evs]) => ({
      hourStart,
      rawClicks: evs.length,
      effectiveCount: effectiveCount(evs)
    }))
    .sort((a, b) => b.hourStart - a.hourStart);
  return hours;
}

export function statusForHour(effectiveCountInHour: number): "正常" | "偏少" {
  return effectiveCountInHour >= 3 ? "正常" : "偏少";
}

export function statusTone(status: "正常" | "偏少"): "good" | "warn" {
  return status === "正常" ? "good" : "warn";
}

export function last12HoursEffectiveTotal(events: MovementEvent[], now = Date.now()) {
  const start = now - 12 * 3_600_000;
  const windowed = events.filter((e) => e.ts >= start && e.ts <= now);
  return effectiveCount(windowed);
}

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

