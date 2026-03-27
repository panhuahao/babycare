import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { DASHSCOPE_MODEL, DB_PATH, ZAI_MODEL } from "./config.js";
import { DEFAULT_TEXT_AI_PROVIDER, normalizeTextAiProvider, normalizeTextAiProviderStates } from "./aiProviders.js";

export function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

export function ensureDirPath(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function openDb() {
  ensureDir(DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      level TEXT NOT NULL,
      event TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);
  const row = db.prepare("SELECT id FROM state WHERE id = 1").get();
  if (!row) {
    const aiTextProvider = DEFAULT_TEXT_AI_PROVIDER;
    const aiTextProviderStates = normalizeTextAiProviderStates(
      {},
      aiTextProvider,
      { models: [ZAI_MODEL || "glm-4.6v"], defaultTextModel: ZAI_MODEL || "glm-4.6v" }
    );
    db.prepare("INSERT INTO state (id, json, updated_at) VALUES (1, ?, 0)").run(
      JSON.stringify({
        pregnancyInfo: null,
        events: [],
        weights: [],
        bubbleSpeed: 0.35,
        themeMode: "dark",
        aiTextProvider,
        aiTextProviderStates,
        aiVendor: "zhipu",
        aiModelZhipu: "glm-4.6v",
        aiModelAliyun: "qwen3.5-plus",
        aiSystemPrompt: "你是一个孕妇营养专家",
        aiUserPrompt:
          "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
        aiUserPromptDefault:
          "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
        aiMenuRecipeSystemPrompt: "你是一个孕妇饮食助手，简短输出菜名与配菜。",
        aiMenuRecipePrompt: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
        aiMenuRecipePromptDefault: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
        aiThinking: true,
        aiImageBaseUrl: "",
        aiImageMode: "url",
        aiImageTargetKb: 450
      })
    );
  }
  return db;
}

export function safeLogValue(v) {
  if (v == null) return null;
  if (typeof v === "string") return v.length > 800 ? v.slice(0, 800) : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => safeLogValue(x));
  if (typeof v === "object") {
    const out = {};
    const entries = Object.entries(v).slice(0, 50);
    for (const [k, vv] of entries) out[String(k).slice(0, 60)] = safeLogValue(vv);
    return out;
  }
  return String(v).slice(0, 800);
}

export function logEvent(db, level, event, data) {
  try {
    const ts = Date.now();
    const payload = JSON.stringify(safeLogValue(data ?? {}));
    db.prepare("INSERT INTO logs (ts, level, event, data) VALUES (?, ?, ?, ?)").run(ts, String(level), String(event), payload);
  } catch {}
}

export function normalizeEvents(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((e) => typeof e?.id === "string" && typeof e?.type === "string" && typeof e?.ts === "number")
    .map((e) => ({ id: e.id, type: e.type, ts: e.ts }))
    .slice(0, 2000);
}

export function normalizeWeightKg(input) {
  const raw = typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : NaN;
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw * 10) / 10;
  if (rounded < 20 || rounded > 300) return null;
  return rounded;
}

export function isValidDateKey(input) {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  return Number.isFinite(new Date(`${input}T00:00:00`).getTime());
}

export function normalizeWeightRecords(input) {
  if (!Array.isArray(input)) return [];
  const deduped = new Map();
  for (const item of input) {
    const date = isValidDateKey(item?.date) ? item.date : "";
    const weightKg = normalizeWeightKg(item?.weightKg);
    if (!date || weightKg == null) continue;
    const updatedAt = typeof item?.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : 0;
    const prev = deduped.get(date);
    if (!prev || updatedAt >= prev.updatedAt) {
      deduped.set(date, { date, weightKg, updatedAt });
    }
  }
  return [...deduped.values()]
    .sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : b.date.localeCompare(a.date)))
    .slice(0, 730);
}

export function normalizePregnancyInfo(input) {
  const pi = input ?? {};
  if (!pi || typeof pi !== "object") return { lmpDate: "", babyName: "" };
  return {
    lmpDate: typeof pi.lmpDate === "string" ? pi.lmpDate : "",
    babyName: typeof pi.babyName === "string" ? pi.babyName : ""
  };
}

export function normalizeBubbleSpeed(input) {
  const v = typeof input === "number" && Number.isFinite(input) ? input : 0.35;
  return Math.min(1, Math.max(0.2, v));
}

export function normalizeThemeMode(input) {
  return input === "light" || input === "dark" ? input : "dark";
}

export function normalizeAiModel(input) {
  const v = typeof input === "string" ? input.trim() : "";
  if (!v) return "glm-4.6v";
  if (v.length > 120) return v.slice(0, 120);
  return v;
}

export function normalizeAiVendor(input) {
  const v = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (v === "aliyun" || v === "dashscope" || v === "bailian") return "aliyun";
  if (v === "zhipu" || v === "zai" || v === "bigmodel") return "zhipu";
  return "zhipu";
}

export function normalizeAiThinking(input) {
  return typeof input === "boolean" ? input : true;
}

export function normalizePrompt(input, { fallback, maxLen }) {
  const v = typeof input === "string" ? input : "";
  const s = v.replace(/\r\n/g, "\n").trim();
  if (!s) return fallback;
  if (s.length > maxLen) return s.slice(0, maxLen);
  return s;
}

export function decodeBase64Utf8(input) {
  const s = typeof input === "string" ? input : "";
  if (!s) return "";
  try {
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function normalizeAiImageMode(input) {
  return input === "url" || input === "inline" ? input : "url";
}

export function normalizeAiImageBaseUrl(input) {
  const v = typeof input === "string" ? input.trim() : "";
  if (!v) return "";
  if (v.length > 200) return v.slice(0, 200);
  return v.replace(/\/+$/, "");
}

export function normalizeAiImageTargetKb(input) {
  const v = typeof input === "number" && Number.isFinite(input) ? Math.round(input) : 450;
  return Math.min(2000, Math.max(150, v));
}

export function readState(db) {
  const row = db.prepare("SELECT json, updated_at FROM state WHERE id = 1").get();
  let parsed = {};
  try {
    parsed = JSON.parse(row?.json ?? "{}");
  } catch {}
  const pregnancyInfo = normalizePregnancyInfo(parsed?.pregnancyInfo);
  const events = normalizeEvents(parsed?.events);
  const weights = normalizeWeightRecords(parsed?.weights);
  const bubbleSpeed = normalizeBubbleSpeed(parsed?.bubbleSpeed);
  const themeMode = normalizeThemeMode(parsed?.themeMode);
  const aiTextProvider = normalizeTextAiProvider(parsed?.aiTextProvider ?? parsed?.aiVendor);
  const legacyTextModel =
    aiTextProvider === "aliyun"
      ? normalizeAiModel(parsed?.aiModelAliyun ?? DASHSCOPE_MODEL)
      : aiTextProvider === "zhipu"
        ? normalizeAiModel(parsed?.aiModelZhipu ?? parsed?.aiModel ?? ZAI_MODEL)
        : "";
  const aiTextProviderStates = normalizeTextAiProviderStates(parsed?.aiTextProviderStates, aiTextProvider, {
    models: legacyTextModel ? [legacyTextModel] : [],
    defaultTextModel: legacyTextModel
  });
  const aiVendor = normalizeAiVendor(parsed?.aiVendor);
  const aiModelZhipu = normalizeAiModel(parsed?.aiModelZhipu ?? parsed?.aiModel ?? ZAI_MODEL);
  const aiModelAliyun = normalizeAiModel(parsed?.aiModelAliyun ?? DASHSCOPE_MODEL);
  const aiSystemPrompt = normalizePrompt(parsed?.aiSystemPrompt, { fallback: "你是一个孕妇营养专家", maxLen: 600 });
  const aiUserPrompt = normalizePrompt(parsed?.aiUserPrompt, {
    fallback:
      "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
    maxLen: 4000
  });
  const aiUserPromptDefault = normalizePrompt(parsed?.aiUserPromptDefault, {
    fallback:
      "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
    maxLen: 4000
  });
  const aiMenuRecipeSystemPrompt = normalizePrompt(parsed?.aiMenuRecipeSystemPrompt, {
    fallback: "你是一个孕妇饮食助手，简短输出菜名与配菜。",
    maxLen: 600
  });
  const aiMenuRecipePrompt = normalizePrompt(parsed?.aiMenuRecipePrompt, {
    fallback: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
    maxLen: 600
  });
  const aiMenuRecipePromptDefault = normalizePrompt(parsed?.aiMenuRecipePromptDefault, {
    fallback: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
    maxLen: 600
  });
  const aiThinking = normalizeAiThinking(parsed?.aiThinking);
  const aiImageBaseUrl = normalizeAiImageBaseUrl(parsed?.aiImageBaseUrl);
  const aiImageMode = normalizeAiImageMode(parsed?.aiImageMode);
  const aiImageTargetKb = normalizeAiImageTargetKb(parsed?.aiImageTargetKb);
  const updatedAt = typeof row?.updated_at === "number" ? row.updated_at : 0;
  return {
    pregnancyInfo,
    events,
    weights,
    bubbleSpeed,
    themeMode,
    aiTextProvider,
    aiTextProviderStates,
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
    aiImageTargetKb,
    updatedAt
  };
}

export function writeState(db, payload) {
  const pregnancyInfo = normalizePregnancyInfo(payload?.pregnancyInfo);
  const events = normalizeEvents(payload?.events);
  const weights = normalizeWeightRecords(payload?.weights);
  const bubbleSpeed = normalizeBubbleSpeed(payload?.bubbleSpeed);
  const themeMode = normalizeThemeMode(payload?.themeMode);
  const aiTextProvider = normalizeTextAiProvider(payload?.aiTextProvider ?? payload?.aiVendor);
  const legacyTextModel =
    aiTextProvider === "aliyun"
      ? normalizeAiModel(payload?.aiModelAliyun ?? DASHSCOPE_MODEL)
      : aiTextProvider === "zhipu"
        ? normalizeAiModel(payload?.aiModelZhipu ?? payload?.aiModel ?? ZAI_MODEL)
        : typeof payload?.aiTextModel === "string"
          ? normalizeAiModel(payload.aiTextModel)
          : "";
  const aiTextProviderStates = normalizeTextAiProviderStates(payload?.aiTextProviderStates, aiTextProvider, {
    models: legacyTextModel ? [legacyTextModel] : [],
    defaultTextModel: legacyTextModel
  });
  const aiVendor = normalizeAiVendor(payload?.aiVendor);
  const aiModelZhipu = normalizeAiModel(payload?.aiModelZhipu ?? payload?.aiModel ?? ZAI_MODEL);
  const aiModelAliyun = normalizeAiModel(payload?.aiModelAliyun ?? DASHSCOPE_MODEL);
  const aiSystemPrompt = normalizePrompt(payload?.aiSystemPrompt, { fallback: "你是一个孕妇营养专家", maxLen: 600 });
  const aiUserPrompt = normalizePrompt(payload?.aiUserPrompt, {
    fallback:
      "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
    maxLen: 4000
  });
  const aiUserPromptDefault = normalizePrompt(payload?.aiUserPromptDefault, {
    fallback:
      "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
    maxLen: 4000
  });
  const aiMenuRecipeSystemPrompt = normalizePrompt(payload?.aiMenuRecipeSystemPrompt, {
    fallback: "你是一个孕妇饮食助手，简短输出菜名与配菜。",
    maxLen: 600
  });
  const aiMenuRecipePrompt = normalizePrompt(payload?.aiMenuRecipePrompt, {
    fallback: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
    maxLen: 600
  });
  const aiMenuRecipePromptDefault = normalizePrompt(payload?.aiMenuRecipePromptDefault, {
    fallback: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
    maxLen: 600
  });
  const aiThinking = normalizeAiThinking(payload?.aiThinking);
  const aiImageBaseUrl = normalizeAiImageBaseUrl(payload?.aiImageBaseUrl);
  const aiImageMode = normalizeAiImageMode(payload?.aiImageMode);
  const aiImageTargetKb = normalizeAiImageTargetKb(payload?.aiImageTargetKb);
  const updatedAt = typeof payload?.updatedAt === "number" ? payload.updatedAt : Date.now();
  db.prepare("UPDATE state SET json = ?, updated_at = ? WHERE id = 1").run(
    JSON.stringify({
      pregnancyInfo,
      events,
      weights,
      bubbleSpeed,
      themeMode,
      aiTextProvider,
      aiTextProviderStates,
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
    }),
    updatedAt
  );
  return {
    pregnancyInfo,
    events,
    weights,
    bubbleSpeed,
    themeMode,
    aiTextProvider,
    aiTextProviderStates,
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
    aiImageTargetKb,
    updatedAt
  };
}
