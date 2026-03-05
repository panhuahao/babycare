import { MovementEvent } from "./domain/movement";
import { PregnancyInfo } from "./domain/pregnancy";

const KEY_EVENTS = "bbcare:movementEvents:v1";
const KEY_PREG = "bbcare:pregnancyInfo:v1";
const KEY_STATE = "bbcare:state:v2";
const KEY_BUBBLE_SPEED = "bbcare:bubbleSpeed";
const KEY_THEME_MODE = "bbcare:themeMode";
const KEY_AI_VENDOR = "bbcare:aiVendor";
const KEY_AI_MODEL_ZHIPU = "bbcare:aiModelZhipu";
const KEY_AI_MODEL_ALIYUN = "bbcare:aiModelAliyun";
const KEY_AI_SYSTEM_PROMPT = "bbcare:aiSystemPrompt";
const KEY_AI_USER_PROMPT = "bbcare:aiUserPrompt";
const KEY_AI_USER_PROMPT_DEFAULT = "bbcare:aiUserPromptDefault";
const KEY_AI_MENU_RECIPE_SYSTEM_PROMPT = "bbcare:aiMenuRecipeSystemPrompt";
const KEY_AI_MENU_RECIPE_PROMPT = "bbcare:aiMenuRecipePrompt";
const KEY_AI_MENU_RECIPE_PROMPT_DEFAULT = "bbcare:aiMenuRecipePromptDefault";
const KEY_AI_THINKING = "bbcare:aiThinking";
const KEY_AI_IMAGE_BASE_URL = "bbcare:aiImageBaseUrl";
const KEY_AI_IMAGE_MODE = "bbcare:aiImageMode";
const KEY_AI_IMAGE_TARGET_KB = "bbcare:aiImageTargetKb";

const DEFAULT_SYSTEM_PROMPT = "你是一个孕妇营养专家";
const DEFAULT_USER_PROMPT =
  "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。";
const DEFAULT_MENU_RECIPE_SYSTEM_PROMPT = "你是一个孕妇饮食助手，简短输出菜名与配菜。";
const DEFAULT_MENU_RECIPE_PROMPT = "根据当前食材为孕妇推荐1-3道菜，补充所需食材";

export type AppState = {
  pregnancyInfo: PregnancyInfo;
  events: MovementEvent[];
  updatedAt: number;
  bubbleSpeed: number;
  themeMode: "dark" | "light";
  aiVendor: "zhipu" | "aliyun";
  aiModelZhipu: string;
  aiModelAliyun: string;
  aiSystemPrompt: string;
  aiUserPrompt: string;
  aiUserPromptDefault: string;
  aiMenuRecipeSystemPrompt: string;
  aiMenuRecipePrompt: string;
  aiMenuRecipePromptDefault: string;
  aiThinking: boolean;
  aiImageBaseUrl: string;
  aiImageMode: "url" | "inline";
  aiImageTargetKb: number;
};

function normalizeAiVendor(input: unknown): "zhipu" | "aliyun" {
  const v = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (v === "aliyun" || v === "dashscope" || v === "bailian") return "aliyun";
  return "zhipu";
}

function normalizeAiModel(input: unknown, fallback: string) {
  const v = typeof input === "string" ? input.trim() : "";
  if (!v) return fallback;
  return v.length > 64 ? v.slice(0, 64) : v;
}

function normalizePrompt(input: unknown, fallback: string, maxLen: number) {
  const v = typeof input === "string" ? input : "";
  const s = v.replace(/\r\n/g, "\n").trim();
  if (!s) return fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

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
      const aiVendor = normalizeAiVendor(parsed?.aiVendor);
      const aiModelZhipu = normalizeAiModel(parsed?.aiModelZhipu ?? parsed?.aiModel, "glm-4.6v");
      const aiModelAliyun = normalizeAiModel(parsed?.aiModelAliyun, "qwen3.5-plus");
      const aiSystemPrompt = normalizePrompt(parsed?.aiSystemPrompt, DEFAULT_SYSTEM_PROMPT, 600);
      const aiUserPrompt = normalizePrompt(parsed?.aiUserPrompt, DEFAULT_USER_PROMPT, 4000);
      const aiUserPromptDefault = normalizePrompt(parsed?.aiUserPromptDefault, DEFAULT_USER_PROMPT, 4000);
      const aiMenuRecipeSystemPrompt = normalizePrompt(parsed?.aiMenuRecipeSystemPrompt, DEFAULT_MENU_RECIPE_SYSTEM_PROMPT, 600);
      const aiMenuRecipePrompt = normalizePrompt(parsed?.aiMenuRecipePrompt, DEFAULT_MENU_RECIPE_PROMPT, 600);
      const aiMenuRecipePromptDefault = normalizePrompt(parsed?.aiMenuRecipePromptDefault, DEFAULT_MENU_RECIPE_PROMPT, 600);
      const at0 = typeof parsed?.aiThinking === "boolean" ? parsed.aiThinking : undefined;
      const aiThinking = at0 ?? true;
      const bu0 = typeof parsed?.aiImageBaseUrl === "string" ? parsed.aiImageBaseUrl.trim().replace(/\/+$/, "") : "";
      const bm0 = parsed?.aiImageMode === "url" || parsed?.aiImageMode === "inline" ? parsed.aiImageMode : undefined;
      const origin =
        typeof window !== "undefined" && window?.location?.origin ? String(window.location.origin).replace(/\/+$/, "") : "";
      const aiImageBaseUrl = bu0 || origin;
      const aiImageMode = (bm0 ?? "url") as "url" | "inline";
      const tk0 = typeof parsed?.aiImageTargetKb === "number" && Number.isFinite(parsed.aiImageTargetKb) ? parsed.aiImageTargetKb : undefined;
      const aiImageTargetKb = tk0 != null ? Math.min(2000, Math.max(150, Math.round(tk0))) : 450;
      return {
        pregnancyInfo,
        events,
        updatedAt,
        bubbleSpeed: bs0 ?? 0.35,
        themeMode: tm0 ?? "dark",
        aiVendor,
        aiModelZhipu,
        aiModelAliyun,
        aiSystemPrompt,
        aiUserPrompt,
        aiUserPromptDefault,
        aiMenuRecipeSystemPrompt,
        aiMenuRecipePrompt,
        aiMenuRecipePromptDefault,
        aiThinking,
        aiImageBaseUrl,
        aiImageMode,
        aiImageTargetKb
      };
    }
  } catch {}

  let events: MovementEvent[] = [];
  let pregnancyInfo: PregnancyInfo = fallbackPregnancyInfo;
  let bubbleSpeed = 0.35;
  let themeMode: "dark" | "light" = "dark";
  let aiVendor: "zhipu" | "aliyun" = "zhipu";
  let aiModelZhipu = "glm-4.6v";
  let aiModelAliyun = "qwen3.5-plus";
  let aiSystemPrompt = DEFAULT_SYSTEM_PROMPT;
  let aiUserPrompt = DEFAULT_USER_PROMPT;
  let aiUserPromptDefault = DEFAULT_USER_PROMPT;
  let aiMenuRecipeSystemPrompt = DEFAULT_MENU_RECIPE_SYSTEM_PROMPT;
  let aiMenuRecipePrompt = DEFAULT_MENU_RECIPE_PROMPT;
  let aiMenuRecipePromptDefault = DEFAULT_MENU_RECIPE_PROMPT;
  let aiThinking = true;
  const origin = typeof window !== "undefined" && window?.location?.origin ? String(window.location.origin).replace(/\/+$/, "") : "";
  let aiImageBaseUrl = origin;
  let aiImageMode: "url" | "inline" = "url";
  let aiImageTargetKb = 450;
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
  try {
    const raw = localStorage.getItem(KEY_AI_VENDOR);
    if (raw) aiVendor = normalizeAiVendor(raw);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_MODEL_ZHIPU);
    if (typeof raw === "string" && raw.trim()) aiModelZhipu = raw.trim().slice(0, 64);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_MODEL_ALIYUN);
    if (typeof raw === "string" && raw.trim()) aiModelAliyun = raw.trim().slice(0, 64);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_SYSTEM_PROMPT);
    if (typeof raw === "string") aiSystemPrompt = normalizePrompt(raw, DEFAULT_SYSTEM_PROMPT, 600);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_USER_PROMPT);
    if (typeof raw === "string") aiUserPrompt = normalizePrompt(raw, DEFAULT_USER_PROMPT, 4000);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_USER_PROMPT_DEFAULT);
    if (typeof raw === "string") aiUserPromptDefault = normalizePrompt(raw, DEFAULT_USER_PROMPT, 4000);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_MENU_RECIPE_SYSTEM_PROMPT);
    if (typeof raw === "string") aiMenuRecipeSystemPrompt = normalizePrompt(raw, DEFAULT_MENU_RECIPE_SYSTEM_PROMPT, 600);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_MENU_RECIPE_PROMPT);
    if (typeof raw === "string") aiMenuRecipePrompt = normalizePrompt(raw, DEFAULT_MENU_RECIPE_PROMPT, 600);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_MENU_RECIPE_PROMPT_DEFAULT);
    if (typeof raw === "string") aiMenuRecipePromptDefault = normalizePrompt(raw, DEFAULT_MENU_RECIPE_PROMPT, 600);
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_THINKING);
    if (raw === "0") aiThinking = false;
    else if (raw === "1") aiThinking = true;
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_IMAGE_BASE_URL);
    if (typeof raw === "string" && raw.trim()) aiImageBaseUrl = raw.trim().replace(/\/+$/, "");
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_IMAGE_MODE);
    if (raw === "url" || raw === "inline") aiImageMode = raw;
  } catch {}
  try {
    const raw = localStorage.getItem(KEY_AI_IMAGE_TARGET_KB);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) aiImageTargetKb = Math.min(2000, Math.max(150, Math.round(n)));
  } catch {}

  return {
    pregnancyInfo,
    events,
    updatedAt: 0,
    bubbleSpeed,
    themeMode,
    aiVendor,
    aiModelZhipu,
    aiModelAliyun,
    aiSystemPrompt,
    aiUserPrompt,
    aiUserPromptDefault,
    aiMenuRecipeSystemPrompt,
    aiMenuRecipePrompt,
    aiMenuRecipePromptDefault,
    aiThinking,
    aiImageBaseUrl,
    aiImageMode,
    aiImageTargetKb
  };
}

export function saveState(state: AppState) {
  localStorage.setItem(KEY_STATE, JSON.stringify(state));
  localStorage.setItem(KEY_EVENTS, JSON.stringify(state.events));
  localStorage.setItem(KEY_PREG, JSON.stringify(state.pregnancyInfo));
  localStorage.setItem(KEY_BUBBLE_SPEED, String(state.bubbleSpeed));
  localStorage.setItem(KEY_THEME_MODE, state.themeMode);
  localStorage.setItem(KEY_AI_VENDOR, state.aiVendor);
  localStorage.setItem(KEY_AI_MODEL_ZHIPU, state.aiModelZhipu);
  localStorage.setItem(KEY_AI_MODEL_ALIYUN, state.aiModelAliyun);
  localStorage.setItem(KEY_AI_SYSTEM_PROMPT, state.aiSystemPrompt);
  localStorage.setItem(KEY_AI_USER_PROMPT, state.aiUserPrompt);
  localStorage.setItem(KEY_AI_USER_PROMPT_DEFAULT, state.aiUserPromptDefault);
  localStorage.setItem(KEY_AI_MENU_RECIPE_SYSTEM_PROMPT, state.aiMenuRecipeSystemPrompt);
  localStorage.setItem(KEY_AI_MENU_RECIPE_PROMPT, state.aiMenuRecipePrompt);
  localStorage.setItem(KEY_AI_MENU_RECIPE_PROMPT_DEFAULT, state.aiMenuRecipePromptDefault);
  localStorage.setItem(KEY_AI_THINKING, state.aiThinking ? "1" : "0");
  localStorage.setItem(KEY_AI_IMAGE_BASE_URL, state.aiImageBaseUrl);
  localStorage.setItem(KEY_AI_IMAGE_MODE, state.aiImageMode);
  localStorage.setItem(KEY_AI_IMAGE_TARGET_KB, String(state.aiImageTargetKb));
}

export function clearAll() {
  localStorage.removeItem(KEY_EVENTS);
  localStorage.removeItem(KEY_PREG);
  localStorage.removeItem(KEY_STATE);
  localStorage.removeItem(KEY_BUBBLE_SPEED);
  localStorage.removeItem(KEY_THEME_MODE);
  localStorage.removeItem(KEY_AI_VENDOR);
  localStorage.removeItem(KEY_AI_MODEL_ZHIPU);
  localStorage.removeItem(KEY_AI_MODEL_ALIYUN);
  localStorage.removeItem(KEY_AI_SYSTEM_PROMPT);
  localStorage.removeItem(KEY_AI_USER_PROMPT);
  localStorage.removeItem(KEY_AI_USER_PROMPT_DEFAULT);
  localStorage.removeItem(KEY_AI_MENU_RECIPE_SYSTEM_PROMPT);
  localStorage.removeItem(KEY_AI_MENU_RECIPE_PROMPT);
  localStorage.removeItem(KEY_AI_MENU_RECIPE_PROMPT_DEFAULT);
  localStorage.removeItem(KEY_AI_THINKING);
  localStorage.removeItem(KEY_AI_IMAGE_BASE_URL);
  localStorage.removeItem(KEY_AI_IMAGE_MODE);
  localStorage.removeItem(KEY_AI_IMAGE_TARGET_KB);
}
