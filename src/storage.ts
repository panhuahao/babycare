import { MovementEvent } from "./domain/movement";
import { PregnancyInfo } from "./domain/pregnancy";

const KEY_EVENTS = "bbcare:movementEvents:v1";
const KEY_PREG = "bbcare:pregnancyInfo:v1";
const KEY_STATE = "bbcare:state:v2";

export type AppState = {
  pregnancyInfo: PregnancyInfo;
  events: MovementEvent[];
  updatedAt: number;
};

function normalizeEvents(input: unknown): MovementEvent[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((e) => typeof e?.id === "string" && typeof e?.type === "string" && typeof e?.ts === "number")
    .map((e) => ({ id: (e as any).id, type: (e as any).type, ts: (e as any).ts }))
    .slice(0, 2000);
}

function normalizePregnancyInfo(input: unknown, fallback: PregnancyInfo): PregnancyInfo {
  const pi = input as any;
  if (!pi || typeof pi !== "object") return fallback;
  if (!pi?.lmpDate || typeof pi.lmpDate !== "string") return fallback;
  return { lmpDate: pi.lmpDate, babyName: typeof pi.babyName === "string" ? pi.babyName : fallback.babyName ?? "" };
}

export function loadState(fallbackPregnancyInfo: PregnancyInfo): AppState {
  try {
    const raw = localStorage.getItem(KEY_STATE);
    if (raw) {
      const parsed = JSON.parse(raw) as any;
      const pregnancyInfo = normalizePregnancyInfo(parsed?.pregnancyInfo, fallbackPregnancyInfo);
      const events = normalizeEvents(parsed?.events);
      const updatedAt = typeof parsed?.updatedAt === "number" ? parsed.updatedAt : 0;
      return { pregnancyInfo, events, updatedAt };
    }
  } catch {}

  let events: MovementEvent[] = [];
  let pregnancyInfo: PregnancyInfo = fallbackPregnancyInfo;
  try {
    const rawEvents = localStorage.getItem(KEY_EVENTS);
    if (rawEvents) events = normalizeEvents(JSON.parse(rawEvents));
  } catch {}
  try {
    const rawPreg = localStorage.getItem(KEY_PREG);
    if (rawPreg) pregnancyInfo = normalizePregnancyInfo(JSON.parse(rawPreg), fallbackPregnancyInfo);
  } catch {}

  return { pregnancyInfo, events, updatedAt: 0 };
}

export function saveState(state: AppState) {
  localStorage.setItem(KEY_STATE, JSON.stringify(state));
  localStorage.setItem(KEY_EVENTS, JSON.stringify(state.events));
  localStorage.setItem(KEY_PREG, JSON.stringify(state.pregnancyInfo));
}

export function clearAll() {
  localStorage.removeItem(KEY_EVENTS);
  localStorage.removeItem(KEY_PREG);
  localStorage.removeItem(KEY_STATE);
}
