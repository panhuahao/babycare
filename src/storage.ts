import { MovementEvent } from "./domain/movement";
import { PregnancyInfo } from "./domain/pregnancy";

const KEY_EVENTS = "bbcare:movementEvents:v1";
const KEY_PREG = "bbcare:pregnancyInfo:v1";
const KEY_STATE = "bbcare:state:v2";
const KEY_BUBBLE_SPEED = "bbcare:bubbleSpeed";
const KEY_THEME_MODE = "bbcare:themeMode";

export type AppState = {
  pregnancyInfo: PregnancyInfo;
  events: MovementEvent[];
  updatedAt: number;
  bubbleSpeed: number;
  themeMode: "dark" | "light";
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
      const bs0 =
        typeof parsed?.bubbleSpeed === "number" && Number.isFinite(parsed.bubbleSpeed)
          ? Math.min(1, Math.max(0.2, parsed.bubbleSpeed))
          : undefined;
      const tm0 = parsed?.themeMode === "light" || parsed?.themeMode === "dark" ? parsed.themeMode : undefined;
      return { pregnancyInfo, events, updatedAt, bubbleSpeed: bs0 ?? 0.35, themeMode: tm0 ?? "dark" };
    }
  } catch {}

  let events: MovementEvent[] = [];
  let pregnancyInfo: PregnancyInfo = fallbackPregnancyInfo;
  let bubbleSpeed = 0.35;
  let themeMode: "dark" | "light" = "dark";
  try {
    const rawEvents = localStorage.getItem(KEY_EVENTS);
    if (rawEvents) events = normalizeEvents(JSON.parse(rawEvents));
  } catch {}
  try {
    const rawPreg = localStorage.getItem(KEY_PREG);
    if (rawPreg) pregnancyInfo = normalizePregnancyInfo(JSON.parse(rawPreg), fallbackPregnancyInfo);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_BUBBLE_SPEED);
    const v = raw ? Number(raw) : NaN;
    if (Number.isFinite(v)) bubbleSpeed = Math.min(1, Math.max(0.2, v));
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_THEME_MODE);
    if (raw === "light" || raw === "dark") themeMode = raw;
  } catch {}

  return { pregnancyInfo, events, updatedAt: 0, bubbleSpeed, themeMode };
}

export function saveState(state: AppState) {
  localStorage.setItem(KEY_STATE, JSON.stringify(state));
  localStorage.setItem(KEY_EVENTS, JSON.stringify(state.events));
  localStorage.setItem(KEY_PREG, JSON.stringify(state.pregnancyInfo));
  localStorage.setItem(KEY_BUBBLE_SPEED, String(state.bubbleSpeed));
  localStorage.setItem(KEY_THEME_MODE, state.themeMode);
}

export function clearAll() {
  localStorage.removeItem(KEY_EVENTS);
  localStorage.removeItem(KEY_PREG);
  localStorage.removeItem(KEY_STATE);
  localStorage.removeItem(KEY_BUBBLE_SPEED);
  localStorage.removeItem(KEY_THEME_MODE);
}
