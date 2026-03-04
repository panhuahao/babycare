import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import express from "express";
import Database from "better-sqlite3";

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "bbcare.sqlite");
const DIST_DIR = process.env.DIST_DIR ?? path.resolve(process.cwd(), "dist");
const METALS_DEV_API_KEY = String(process.env.METALS_DEV_API_KEY ?? "");
const ZAI_API_KEY = String(process.env.ZAI_API_KEY ?? process.env.BIGMODEL_API_KEY ?? "").trim();
const ZAI_MODEL = String(process.env.ZAI_MODEL ?? process.env.BIGMODEL_MODEL ?? "glm-4.6v").trim();
const DASHSCOPE_API_KEY = String(process.env.DASHSCOPE_API_KEY ?? process.env.BAILIAN_API_KEY ?? "").trim();
const DASHSCOPE_MODEL = String(process.env.DASHSCOPE_MODEL ?? "qwen3.5-plus").trim();
const DASHSCOPE_BASE_URL = String(process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1")
  .trim()
  .replace(/\/+$/, "");
const AI_CALLER = String(process.env.AI_CALLER ?? "python").trim().toLowerCase();
const AI_TIMEOUT_S = Math.min(120, Math.max(5, Number(process.env.AI_TIMEOUT_S ?? 40) || 40));
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(path.dirname(DB_PATH), "uploads");
const TOZ_GRAMS = 31.1034768;
const JIJINHAO_HEADERS = {
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function ensureDirPath(p) {
  fs.mkdirSync(p, { recursive: true });
}

function openDb() {
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
    db.prepare("INSERT INTO state (id, json, updated_at) VALUES (1, ?, 0)").run(
      JSON.stringify({
        pregnancyInfo: null,
        events: [],
        bubbleSpeed: 0.35,
        themeMode: "dark",
        aiVendor: "zhipu",
        aiModelZhipu: "glm-4.6v",
        aiModelAliyun: "qwen3.5-plus",
        aiSystemPrompt: "你是一个孕妇营养专家",
        aiUserPrompt:
          "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
        aiThinking: true,
        aiImageBaseUrl: "",
        aiImageMode: "url",
        aiImageTargetKb: 450
      })
    );
  }
  return db;
}

function safeLogValue(v) {
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

function logEvent(db, level, event, data) {
  try {
    const ts = Date.now();
    const payload = JSON.stringify(safeLogValue(data ?? {}));
    db.prepare("INSERT INTO logs (ts, level, event, data) VALUES (?, ?, ?, ?)").run(ts, String(level), String(event), payload);
  } catch {}
}

async function callAiViaPython(input) {
  const scriptPath = path.join(process.cwd(), "server", "ai_caller.py");
  return await new Promise((resolve, reject) => {
    const child = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`python caller failed (code ${code}): ${stderr.slice(0, 800)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        resolve(parsed);
      } catch {
        reject(new Error(`python caller bad output: ${stdout.slice(0, 800)}`));
      }
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

function normalizeEvents(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((e) => typeof e?.id === "string" && typeof e?.type === "string" && typeof e?.ts === "number")
    .map((e) => ({ id: e.id, type: e.type, ts: e.ts }))
    .slice(0, 2000);
}

function normalizePregnancyInfo(input) {
  const pi = input ?? {};
  if (!pi || typeof pi !== "object") return { lmpDate: "", babyName: "" };
  return {
    lmpDate: typeof pi.lmpDate === "string" ? pi.lmpDate : "",
    babyName: typeof pi.babyName === "string" ? pi.babyName : ""
  };
}

function normalizeBubbleSpeed(input) {
  const v = typeof input === "number" && Number.isFinite(input) ? input : 0.35;
  return Math.min(1, Math.max(0.2, v));
}

function normalizeThemeMode(input) {
  return input === "light" || input === "dark" ? input : "dark";
}

function normalizeAiModel(input) {
  const v = typeof input === "string" ? input.trim() : "";
  if (!v) return "glm-4.6v";
  if (v.length > 64) return v.slice(0, 64);
  return v;
}

function normalizeAiVendor(input) {
  const v = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (v === "aliyun" || v === "dashscope" || v === "bailian") return "aliyun";
  if (v === "zhipu" || v === "zai" || v === "bigmodel") return "zhipu";
  return "zhipu";
}

function normalizeAiThinking(input) {
  return typeof input === "boolean" ? input : true;
}

function normalizePrompt(input, { fallback, maxLen }) {
  const v = typeof input === "string" ? input : "";
  const s = v.replace(/\r\n/g, "\n").trim();
  if (!s) return fallback;
  if (s.length > maxLen) return s.slice(0, maxLen);
  return s;
}

function decodeBase64Utf8(input) {
  const s = typeof input === "string" ? input : "";
  if (!s) return "";
  try {
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function normalizeAiImageMode(input) {
  return input === "url" || input === "inline" ? input : "url";
}

function normalizeAiImageBaseUrl(input) {
  const v = typeof input === "string" ? input.trim() : "";
  if (!v) return "";
  if (v.length > 200) return v.slice(0, 200);
  return v.replace(/\/+$/, "");
}

function normalizeAiImageTargetKb(input) {
  const v = typeof input === "number" && Number.isFinite(input) ? Math.round(input) : 450;
  return Math.min(2000, Math.max(150, v));
}

function readState(db) {
  const row = db.prepare("SELECT json, updated_at FROM state WHERE id = 1").get();
  let parsed = {};
  try {
    parsed = JSON.parse(row?.json ?? "{}");
  } catch {}
  const pregnancyInfo = normalizePregnancyInfo(parsed?.pregnancyInfo);
  const events = normalizeEvents(parsed?.events);
  const bubbleSpeed = normalizeBubbleSpeed(parsed?.bubbleSpeed);
  const themeMode = normalizeThemeMode(parsed?.themeMode);
  const aiVendor = normalizeAiVendor(parsed?.aiVendor);
  const aiModelZhipu = normalizeAiModel(parsed?.aiModelZhipu ?? parsed?.aiModel ?? ZAI_MODEL);
  const aiModelAliyun = normalizeAiModel(parsed?.aiModelAliyun ?? DASHSCOPE_MODEL);
  const aiSystemPrompt = normalizePrompt(parsed?.aiSystemPrompt, { fallback: "你是一个孕妇营养专家", maxLen: 600 });
  const aiUserPrompt = normalizePrompt(parsed?.aiUserPrompt, {
    fallback:
      "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
    maxLen: 4000
  });
  const aiThinking = normalizeAiThinking(parsed?.aiThinking);
  const aiImageBaseUrl = normalizeAiImageBaseUrl(parsed?.aiImageBaseUrl);
  const aiImageMode = normalizeAiImageMode(parsed?.aiImageMode);
  const aiImageTargetKb = normalizeAiImageTargetKb(parsed?.aiImageTargetKb);
  const updatedAt = typeof row?.updated_at === "number" ? row.updated_at : 0;
  return {
    pregnancyInfo,
    events,
    bubbleSpeed,
    themeMode,
    aiVendor,
    aiModelZhipu,
    aiModelAliyun,
    aiSystemPrompt,
    aiUserPrompt,
    aiThinking,
    aiImageBaseUrl,
    aiImageMode,
    aiImageTargetKb,
    updatedAt
  };
}

function writeState(db, payload) {
  const pregnancyInfo = normalizePregnancyInfo(payload?.pregnancyInfo);
  const events = normalizeEvents(payload?.events);
  const bubbleSpeed = normalizeBubbleSpeed(payload?.bubbleSpeed);
  const themeMode = normalizeThemeMode(payload?.themeMode);
  const aiVendor = normalizeAiVendor(payload?.aiVendor);
  const aiModelZhipu = normalizeAiModel(payload?.aiModelZhipu ?? payload?.aiModel ?? ZAI_MODEL);
  const aiModelAliyun = normalizeAiModel(payload?.aiModelAliyun ?? DASHSCOPE_MODEL);
  const aiSystemPrompt = normalizePrompt(payload?.aiSystemPrompt, { fallback: "你是一个孕妇营养专家", maxLen: 600 });
  const aiUserPrompt = normalizePrompt(payload?.aiUserPrompt, {
    fallback:
      "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
    maxLen: 4000
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
      bubbleSpeed,
      themeMode,
      aiVendor,
      aiModelZhipu,
      aiModelAliyun,
      aiSystemPrompt,
      aiUserPrompt,
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
    bubbleSpeed,
    themeMode,
    aiVendor,
    aiModelZhipu,
    aiModelAliyun,
    aiSystemPrompt,
    aiUserPrompt,
    aiThinking,
    aiImageBaseUrl,
    aiImageMode,
    aiImageTargetKb,
    updatedAt
  };
}

const db = openDb();
const app = express();

app.use(express.json({ limit: "8mb" }));
ensureDirPath(UPLOAD_DIR);
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "3600s" }));

async function fetchText(url, { timeoutMs, headers } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url, { timeoutMs, headers, method, body } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { method: method ?? "GET", headers, body, signal: ac.signal });
    if (!res.ok) {
      const ct = String(res.headers.get("content-type") ?? "");
      let parsed = null;
      let text = "";
      try {
        if (ct.includes("application/json")) parsed = await res.json();
        else text = await res.text();
      } catch {}
      const requestId =
        typeof parsed?.request_id === "string"
          ? parsed.request_id
          : typeof parsed?.requestId === "string"
            ? parsed.requestId
            : typeof parsed?.error?.request_id === "string"
              ? parsed.error.request_id
              : "";
      const detail = parsed ? `: ${JSON.stringify(parsed).slice(0, 800)}` : text ? `: ${text.slice(0, 800)}` : "";
      const err = new Error(`HTTP ${res.status}${detail}`, { cause: { status: res.status, requestId, body: parsed ?? text } });
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripTags(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQuoteJson(raw) {
  const eq = raw.indexOf("=");
  const start = raw.indexOf("{", eq >= 0 ? eq : 0);
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) throw new Error("bad upstream response");
  return JSON.parse(raw.slice(start, end + 1));
}

function parseCngoldTableRows(html) {
  const out = [];
  const rows = html.split(/<\/tr>/gi);
  for (const row of rows) {
    const mCode = row.match(/id\s*=\s*['"](JO_\d+)_price['"]/i);
    if (!mCode) continue;
    const code = mCode[1];
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (tds.length < 2) continue;
    const group = tds[0];
    const name = tds[1];
    if (!group || !name) continue;
    out.push({ code, group, name });
  }
  return out;
}

function parseCngoldSpot(html) {
  const out = [];
  for (const m of html.matchAll(/<dl[^>]*id\s*=\s*['"](JO_\d+)_hqData['"][\s\S]*?<dt[^>]*>([\s\S]*?)<\/dt>/gi)) {
    const code = m[1];
    const label = stripTags(m[2]);
    if (!code || !label) continue;
    out.push({ code, label });
  }
  return out;
}

function parseCngoldShops(html) {
  const out = [];
  for (const m of html.matchAll(/brand_[^"']+_logo\.png[^>]*(?:title|alt)\s*=\s*['"]([^'"]+)['"][\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const brand = stripTags(m[1]);
    const table = m[2] ?? "";
    if (!brand) continue;
    const rows = table.split(/<\/tr>/gi);
    for (const row of rows) {
      const mCode = row.match(/id\s*=\s*['"](JO_\d+)_price['"]/i);
      if (!mCode) continue;
      const code = mCode[1];
      const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((mm) => stripTags(mm[1]));
      const item = tds[0] ?? "";
      if (!item) continue;
      out.push({ code, label: `${brand} ${item}` });
    }
  }
  return out;
}

function parseCngoldBars(html) {
  const out = [];
  const rows = html.split(/<\/tr>/gi);
  for (const row of rows) {
    const mCode = row.match(/id\s*=\s*['"](JO_\d+)_jt['"]/i);
    if (!mCode) continue;
    const code = mCode[1];
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((mm) => stripTags(mm[1]));
    const bank = tds[0] ?? "";
    const name = tds[1] ?? "";
    const label = stripTags(`${bank} ${name}`);
    if (!label) continue;
    out.push({ code, label });
  }
  return out;
}

function parseCngoldRecycle(html) {
  const out = [];
  let category = "";
  const rows = html.split(/<\/tr>/gi);
  for (const row of rows) {
    const mCode = row.match(/id\s*=\s*['"](JO_\d+)_jb['"]/i);
    if (!mCode) continue;
    const code = mCode[1];
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((mm) => stripTags(mm[1]));
    if (!tds.length) continue;
    const hasRowspan = /rowspan\s*=\s*['"]?\d+['"]?/i.test(row);
    if (hasRowspan) category = tds[0] ?? category;
    const item = hasRowspan ? (tds[1] ?? "") : (tds[0] ?? "");
    const label = stripTags(`${category ? `${category} ` : ""}${item}`);
    if (!label) continue;
    out.push({ code, label });
  }
  return out;
}

async function fetchJijinhaoQuotes(codes, { referer, origin, timeoutMs } = {}) {
  const chunks = [];
  for (let i = 0; i < codes.length; i += 60) chunks.push(codes.slice(i, i + 60));

  const merged = {};
  let updatedAt = 0;
  for (const chunk of chunks) {
    const url = `https://api.jijinhao.com/quoteCenter/realTime.htm?codes=${chunk.join(",")},`;
    const raw = await fetchText(url, {
      timeoutMs: timeoutMs ?? 9000,
      headers: {
        ...JIJINHAO_HEADERS,
        ...(referer ? { referer } : null),
        ...(origin ? { origin } : null)
      }
    });
    const parsed = parseQuoteJson(raw);
    for (const code of chunk) {
      const it = parsed?.[code];
      if (!it || typeof it !== "object") continue;
      merged[code] = it;
      const t = typeof it.time === "number" ? it.time : 0;
      if (t > updatedAt) updatedAt = t;
    }
  }
  return { quotes: merged, updatedAt: updatedAt || null };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/state", (_req, res) => {
  res.json(readState(db));
});

app.put("/api/state", (req, res) => {
  const next = writeState(db, req.body);
  res.json(next);
});

app.post("/api/logs/client", (req, res) => {
  try {
    const body = req.body ?? {};
    const event = typeof body?.event === "string" ? body.event.trim().slice(0, 80) : "";
    if (!event) {
      res.status(400).json({ error: "missing event" });
      return;
    }
    const level = typeof body?.level === "string" ? body.level.trim().slice(0, 16) : "info";
    const data = typeof body?.data === "object" && body.data ? body.data : {};
    logEvent(db, level, `client:${event}`, data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "log failed" });
  }
});

app.get("/api/logs", (req, res) => {
  try {
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 100;
    const sinceRaw = typeof req.query.since === "string" ? Number(req.query.since) : 0;
    const since = Number.isFinite(sinceRaw) ? Math.max(0, Math.floor(sinceRaw)) : 0;
    const rows = db
      .prepare("SELECT id, ts, level, event, data FROM logs WHERE ts >= ? ORDER BY id DESC LIMIT ?")
      .all(since, limit);
    const out = rows.map((r) => {
      let parsed = null;
      try {
        parsed = JSON.parse(r.data ?? "{}");
      } catch {}
      return { id: r.id, ts: r.ts, level: r.level, event: r.event, data: parsed };
    });
    res.json({ items: out });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "query failed" });
  }
});

let metalsCache = { at: 0, currency: "", payload: null };
app.get("/api/widgets/metal-prices", async (req, res) => {
  const currency = typeof req.query.currency === "string" && req.query.currency.trim() ? req.query.currency.trim().toUpperCase() : "CNY";
  const force = req.query.force === "1" || req.query.force === "true";
  const freshMs = 60_000;

  if (!force && metalsCache.payload && metalsCache.currency === currency && Date.now() - metalsCache.at < freshMs) {
    res.json({ ...metalsCache.payload, cached: true });
    return;
  }

  try {
    if (METALS_DEV_API_KEY) {
      const url = `https://api.metals.dev/v1/latest?api_key=${encodeURIComponent(METALS_DEV_API_KEY)}&currency=${encodeURIComponent(currency)}`;
      const data = await fetchJson(url, { timeoutMs: 9000 });
      if (!data || typeof data !== "object" || data.status !== "success") {
        throw new Error(typeof data?.error_message === "string" ? data.error_message : "bad upstream response");
      }
      const metals = data.metals ?? {};

      const pick = (k) => (typeof metals?.[k] === "number" ? metals[k] : null);
      const goldToz = pick("gold");
      const silverToz = pick("silver");
      const platinumToz = pick("platinum");
      const palladiumToz = pick("palladium");

      const items = [];
      if (goldToz != null) items.push({ code: "gold", name: "黄金", pricePerToz: goldToz, pricePerGram: goldToz / TOZ_GRAMS });
      if (silverToz != null) items.push({ code: "silver", name: "白银", pricePerToz: silverToz, pricePerGram: silverToz / TOZ_GRAMS });
      if (platinumToz != null) items.push({ code: "platinum", name: "铂金", pricePerToz: platinumToz, pricePerGram: platinumToz / TOZ_GRAMS });
      if (palladiumToz != null) items.push({ code: "palladium", name: "钯金", pricePerToz: palladiumToz, pricePerGram: palladiumToz / TOZ_GRAMS });

      const payload = {
        source: "metals.dev",
        currency,
        unit: "g",
        timestamp: typeof data.timestamp === "string" ? data.timestamp : null,
        items
      };

      metalsCache = { at: Date.now(), currency, payload };
      res.json({ ...payload, cached: false });
      return;
    }

    const spotCodes = ["JO_92233", "JO_92232", "JO_92229", "JO_92230"];
    const { quotes, updatedAt } = await fetchJijinhaoQuotes(spotCodes, {
      referer: "https://quote.cngold.org/gjs/",
      origin: "https://quote.cngold.org"
    });
    const map = {
      JO_92233: { code: "gold", name: "现货黄金" },
      JO_92232: { code: "silver", name: "现货白银" },
      JO_92229: { code: "platinum", name: "现货铂金" },
      JO_92230: { code: "palladium", name: "现货钯金" }
    };
    const items = [];
    for (const c of spotCodes) {
      const it = quotes?.[c];
      if (!it) continue;
      const pricePerToz = typeof it.q1 === "number" ? it.q1 : null;
      if (pricePerToz == null) continue;
      items.push({ code: map[c].code, name: map[c].name, pricePerToz, pricePerGram: pricePerToz / TOZ_GRAMS });
    }
    const payload = {
      source: "api.jijinhao.com",
      currency: "USD",
      unit: "g",
      timestamp: updatedAt ? new Date(updatedAt).toISOString() : null,
      items
    };

    metalsCache = { at: Date.now(), currency, payload };
    res.json({ ...payload, cached: false });
  } catch (err) {
    res.status(502).json({ error: err?.message ?? "upstream error" });
  }
});

let cngoldCache = { at: 0, payload: null };
app.get("/api/widgets/cngold-prices", async (req, res) => {
  const force = req.query.force === "1" || req.query.force === "true";
  const freshMs = 60_000;

  if (!force && cngoldCache.payload && Date.now() - cngoldCache.at < freshMs) {
    res.json({ ...cngoldCache.payload, cached: true });
    return;
  }

  try {
    const pages = {
      shops: { url: "https://quote.cngold.org/gjs/swhj.html" },
      bars: { url: "https://quote.cngold.org/gjs/jtjg.html" },
      recycle: { url: "https://quote.cngold.org/gjs/hjhs.html" }
    };

    const [shopsHtml, barsHtml, recycleHtml] = await Promise.all([
      fetchText(pages.shops.url, { timeoutMs: 9000, headers: JIJINHAO_HEADERS }),
      fetchText(pages.bars.url, { timeoutMs: 9000, headers: JIJINHAO_HEADERS }),
      fetchText(pages.recycle.url, { timeoutMs: 9000, headers: JIJINHAO_HEADERS })
    ]);

    const shopsRows = parseCngoldShops(shopsHtml);
    const barsRows = parseCngoldBars(barsHtml);
    const recycleRows = parseCngoldRecycle(recycleHtml);

    const allCodes = new Set();
    for (const r of [...shopsRows, ...barsRows, ...recycleRows]) allCodes.add(r.code);

    const { quotes, updatedAt } = await fetchJijinhaoQuotes([...allCodes], {
      referer: pages.shops.url,
      origin: "https://quote.cngold.org",
      timeoutMs: 9000
    });

    const build = (rows) =>
      rows
        .map((r) => {
          const q = quotes?.[r.code];
          const price = typeof q?.q1 === "number" && q.q1 !== 0 ? q.q1 : (typeof q?.q2 === "number" ? q.q2 : null);
          const unit = typeof q?.unit === "string" ? q.unit : null;
          const t = typeof q?.time === "number" ? q.time : null;
          const prevClose = typeof q?.q2 === "number" ? q.q2 : null;
          const open = typeof q?.q3 === "number" ? q.q3 : null;
          const high = typeof q?.q4 === "number" ? q.q4 : null;
          const low = typeof q?.q63 === "number" ? q.q63 : null;
          const change = typeof q?.q70 === "number" ? q.q70 : null;
          const changePercent = typeof q?.q80 === "number" ? q.q80 : null;
          const digits = typeof q?.digits === "number" ? q.digits : null;
          if (price == null || !unit) return null;
          return { code: r.code, label: r.label, price, unit, prevClose, open, high, low, change, changePercent, digits, updatedAt: t };
        })
        .filter(Boolean);

    const payload = {
      source: "quote.cngold.org / api.jijinhao.com",
      updatedAt,
      sections: {
        shops: { title: "实物黄金", items: build(shopsRows) },
        bars: { title: "金条", items: build(barsRows) },
        recycle: { title: "贵金属回收", items: build(recycleRows) }
      }
    };

    cngoldCache = { at: Date.now(), payload };
    res.json({ ...payload, cached: false });
  } catch (err) {
    res.status(502).json({ error: err?.message ?? "upstream error" });
  }
});

app.get("/api/widgets/ai-config", (req, res) => {
  res.json({
    vendors: {
      zhipu: { configured: Boolean(ZAI_API_KEY), model: ZAI_MODEL },
      aliyun: { configured: Boolean(DASHSCOPE_API_KEY), model: DASHSCOPE_MODEL, baseUrl: DASHSCOPE_BASE_URL }
    }
  });
});

app.post("/api/uploads/image", express.raw({ type: ["image/*"], limit: "5mb" }), (req, res) => {
  const startedAt = Date.now();
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length <= 0) {
      res.status(400).json({ error: "缺少图片数据" });
      return;
    }
    if (req.body.length > 5_000_000) {
      res.status(413).json({ error: "图片过大，请压缩到 5MB 以内" });
      return;
    }
    const ct = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (ct !== "image/jpeg" && ct !== "image/png") {
      res.status(400).json({ error: "不支持的图片格式，请使用 jpg/png/jpeg" });
      return;
    }
    const ext = ct === "image/png" ? "png" : "jpg";
    const id = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, id);
    fs.writeFileSync(filePath, req.body);
    logEvent(db, "info", "upload:image", { id, ct, bytes: req.body.length, ms: Date.now() - startedAt });
    res.json({ id, urlPath: `/uploads/${id}` });
  } catch (err) {
    logEvent(db, "error", "upload:image:error", { error: err?.message ?? String(err), ms: Date.now() - startedAt });
    res.status(500).json({ error: err?.message ?? "write failed" });
  }
});

app.post(
  "/api/widgets/food-check",
  express.raw({ type: ["image/*", "application/octet-stream"], limit: "6mb" }),
  async (req, res) => {
  let localId = "";
  let vendorForLog = "";
  let modelForLog = "";
  let startedAt = 0;
  try {
    startedAt = Date.now();
    localId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString("hex");
    let imageBase64 = "";
    let mimeType = "";
    let imageUrl = "";

    const ct = String(req.headers["content-type"] ?? "").split(";")[0].trim();
    const mode = Buffer.isBuffer(req.body) && req.body.length > 0 ? "binary" : "json";
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      mimeType = ct || "application/octet-stream";
      if (!/^image\/(png|jpeg|jpg)$/i.test(mimeType)) {
        res.status(400).json({ error: "不支持的图片格式，请使用 jpg/png/jpeg" });
        return;
      }
      if (req.body.length > 5_000_000) {
        res.status(413).json({ error: "图片过大，请压缩到 5MB 以内" });
        return;
      }
      imageBase64 = req.body.toString("base64");
    } else {
      imageBase64 = typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
      mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";
      imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl : "";
      if (imageUrl) {
        if (!/^https?:\/\/\S+$/i.test(imageUrl) || imageUrl.length > 2000) {
          res.status(400).json({ error: "图片 URL 不合法" });
          return;
        }
      }
      if (!imageBase64 || !mimeType) {
        if (!imageUrl) {
          res.status(400).json({ error: "缺少图片数据" });
          return;
        }
      }
      if (imageBase64 && mimeType) {
        if (!/^image\/(png|jpeg|jpg)$/i.test(mimeType)) {
          res.status(400).json({ error: "不支持的图片格式，请使用 jpg/png/jpeg" });
          return;
        }
        if (imageBase64.length > 6_500_000) {
          res.status(413).json({ error: "图片过大，请压缩到 5MB 以内" });
          return;
        }
      }
    }

    const imageRef = imageUrl ? imageUrl : `data:${mimeType};base64,${imageBase64}`;
    const sysB64 = decodeBase64Utf8(req.headers["x-ai-system-prompt-b64"]);
    const userB64 = decodeBase64Utf8(req.headers["x-ai-user-prompt-b64"]);
    const requestedSystemPromptRaw =
      typeof req.body?.systemPrompt === "string"
        ? req.body.systemPrompt
        : sysB64
          ? sysB64
          : typeof req.headers["x-ai-system-prompt"] === "string"
            ? req.headers["x-ai-system-prompt"]
            : "";
    const requestedUserPromptRaw =
      typeof req.body?.userPrompt === "string"
        ? req.body.userPrompt
        : userB64
          ? userB64
          : typeof req.headers["x-ai-user-prompt"] === "string"
            ? req.headers["x-ai-user-prompt"]
            : "";
    const system = normalizePrompt(requestedSystemPromptRaw, { fallback: "你是一个孕妇营养专家", maxLen: 600 });
    const userText = normalizePrompt(requestedUserPromptRaw, {
      fallback:
        "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
      maxLen: 4000
    });

    const requestedVendorRaw =
      typeof req.body?.vendor === "string"
        ? req.body.vendor
        : typeof req.headers["x-ai-vendor"] === "string"
          ? req.headers["x-ai-vendor"]
          : "";
    const vendor = normalizeAiVendor(String(requestedVendorRaw));
    vendorForLog = vendor;

    const requestedModelRaw =
      typeof req.body?.model === "string"
        ? req.body.model
        : typeof req.headers["x-ai-model"] === "string"
          ? req.headers["x-ai-model"]
          : "";
    const requestedModel = String(requestedModelRaw).trim();
    const model = requestedModel ? normalizeAiModel(requestedModel) : vendor === "aliyun" ? DASHSCOPE_MODEL : ZAI_MODEL;
    modelForLog = model;
    const requestedThinkingRaw =
      typeof req.body?.thinking === "boolean"
        ? req.body.thinking
        : typeof req.headers["x-ai-thinking"] === "string"
          ? req.headers["x-ai-thinking"]
          : undefined;
    const thinking = typeof requestedThinkingRaw === "boolean" ? requestedThinkingRaw : String(requestedThinkingRaw ?? "") !== "0";

    let imageHost = "";
    if (imageUrl) {
      try {
        imageHost = new URL(imageUrl).host;
      } catch {}
    }
    logEvent(db, "info", "ai:food:start", {
      localId,
      vendor,
      model,
      thinking,
      mode,
      imageBytes: Buffer.isBuffer(req.body) ? req.body.length : null,
      imageHost
    });

    const callZhipu = async () => {
      if (!ZAI_API_KEY) {
        res.status(503).json({ error: "智谱 AI 未配置，请在服务端配置 ZAI_API_KEY。" });
        return null;
      }
      const payload = {
        model,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: imageRef } }
            ]
          }
        ],
        do_sample: true,
        temperature: 0.8,
        top_p: 0.6,
        stream: false
      };
      if (thinking) payload.thinking = { type: "enabled", clear_thinking: true };
      return await fetchJson("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        timeoutMs: 25_000,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ZAI_API_KEY}`
        },
        method: "POST",
        body: JSON.stringify(payload)
      });
    };

    const callAliyun = async (payload) => {
      if (!DASHSCOPE_API_KEY) {
        res.status(503).json({ error: "阿里云百炼未配置，请在服务端配置 DASHSCOPE_API_KEY。" });
        return null;
      }
      const url = `${DASHSCOPE_BASE_URL}/chat/completions`;
      return await fetchJson(url, {
        timeoutMs: 25_000,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${DASHSCOPE_API_KEY}`
        },
        method: "POST",
        body: JSON.stringify(payload)
      });
    };

    if (AI_CALLER === "python") {
      const py = await callAiViaPython({
        vendor,
        model,
        thinking,
        system,
        userText,
        imageRef,
        imageUrl,
        timeout_s: AI_TIMEOUT_S
      });
      if (!py || typeof py !== "object" || py.ok !== true) {
        const st = typeof py?.status == "number" ? py.status : 502;
        const body = py?.response ?? py?.text ?? py?.error ?? "upstream error";
        const requestId =
          typeof py?.response?.request_id === "string"
            ? py.response.request_id
            : typeof py?.response?.id === "string"
              ? py.response.id
              : "";
        const detail = typeof body === "string" ? body : JSON.stringify(body).slice(0, 800);
        throw new Error(`HTTP ${st}: ${detail}`, { cause: { status: st, requestId, body } });
      }
      const aiRes = py.response ?? {};
      const content = aiRes?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        res.status(502).json({ error: "AI 返回异常" });
        return;
      }
      const requestId =
        typeof aiRes?.request_id === "string"
          ? aiRes.request_id
          : typeof aiRes?.id === "string"
            ? aiRes.id
            : "";
      logEvent(db, "info", "ai:food:ok", { localId, vendor, model, requestId, ms: Date.now() - startedAt });
      res.json({ vendor, model, content, requestId });
      return;
    }

    let aiRes = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (vendor === "aliyun") {
          const payload1 = {
            model,
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: [
                  { type: "text", text: userText },
                  { type: "image_url", image_url: { url: imageRef } }
                ]
              }
            ],
            temperature: 0.8,
            top_p: 0.6,
            stream: false
          };
          aiRes = await callAliyun(payload1);
          if (!aiRes) return;
        } else {
          aiRes = await callZhipu();
          if (!aiRes) return;
        }
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const st = e?.cause?.status;
        if (vendor === "aliyun" && st === 400 && imageUrl) {
          try {
            const payload2 = {
              model,
              messages: [
                { role: "system", content: system },
                { role: "user", content: `${userText}\n\n图片地址：${imageUrl}\n（如果你无法直接查看图片，请明确说明，并给出你需要我补充的描述要点。）` }
              ],
              temperature: 0.8,
              top_p: 0.6,
              stream: false
            };
            aiRes = await callAliyun(payload2);
            lastErr = null;
            break;
          } catch (e2) {
            lastErr = e2;
          }
        }
        if (st === 429 || st === 500 || st === 502 || st === 503 || st === 504) {
          await sleepMs(450 * (attempt + 1));
          continue;
        }
        break;
      }
    }
    if (!aiRes) throw lastErr ?? new Error("upstream error");

    const content = aiRes?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      res.status(502).json({ error: "AI 返回异常" });
      return;
    }
    const requestId =
      typeof aiRes?.request_id === "string"
        ? aiRes.request_id
        : typeof aiRes?.id === "string"
          ? aiRes.id
          : "";
    logEvent(db, "info", "ai:food:ok", { localId, vendor, model, requestId, ms: Date.now() - startedAt });
    res.json({ vendor, model, content, requestId });
  } catch (err) {
    const requestId = typeof err?.cause?.requestId === "string" ? err.cause.requestId : "";
    const status = typeof err?.cause?.status === "number" ? err.cause.status : undefined;
    logEvent(db, "error", "ai:food:error", {
      localId,
      vendor: vendorForLog || null,
      model: modelForLog || null,
      error: err?.message ?? String(err),
      requestId,
      upstreamStatus: status,
      ms: startedAt ? Date.now() - startedAt : null
    });
    res.status(502).json({ error: err?.message ?? "upstream error", requestId, upstreamStatus: status });
  }
  }
);

let chowTaiFookCache = { at: 0, payload: null };
app.get("/api/widgets/chowtaifook-prices", async (req, res) => {
  const force = req.query.force === "1" || req.query.force === "true";
  const freshMs = 5 * 60_000;

  if (!force && chowTaiFookCache.payload && Date.now() - chowTaiFookCache.at < freshMs) {
    res.json({ ...chowTaiFookCache.payload, cached: true });
    return;
  }

  try {
    const codes = ["JO_42660", "JO_42661", "JO_56037", "JO_56040", "JO_56038", "JO_56039", "JO_61909"];
    const url = `https://api.jijinhao.com/quoteCenter/realTime.htm?codes=${codes.join(",")},`;
    const raw = await fetchText(url, {
      timeoutMs: 9000,
      headers: {
        ...JIJINHAO_HEADERS,
        referer: "https://m.cngold.org/quote/gjs/swhj_zdf.html",
        origin: "https://m.cngold.org"
      }
    });
    const parsed = parseQuoteJson(raw);

    const items = [];
    let updatedAt = 0;
    for (const code of codes) {
      const it = parsed?.[code];
      const price = typeof it?.q1 === "number" ? it.q1 : null;
      const name = typeof it?.showName === "string" ? it.showName : null;
      const unit = typeof it?.unit === "string" ? it.unit : null;
      const t = typeof it?.time === "number" ? it.time : 0;
      if (t > updatedAt) updatedAt = t;
      if (price == null || !name || !unit) continue;
      items.push({ code, name, price, unit });
    }

    const updatedDate = updatedAt ? new Date(updatedAt).toISOString().slice(0, 10) : null;

    const payload = {
      source: "api.jijinhao.com",
      brand: "周大福",
      updatedDate,
      updatedAt: updatedAt || null,
      items
    };

    chowTaiFookCache = { at: Date.now(), payload };
    res.json({ ...payload, cached: false });
  } catch (err) {
    res.status(502).json({ error: err?.message ?? "upstream error" });
  }
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: "index.html" }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`bbcare server listening on ${PORT}\n`);
});
