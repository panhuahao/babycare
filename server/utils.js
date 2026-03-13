import fs from "node:fs";
import {
  DAILY_MENU_JSON,
  JIJINHAO_HEADERS
} from "./config.js";

export async function fetchText(url, { timeoutMs, headers } = {}) {
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

export async function fetchJson(url, { timeoutMs, headers, method, body } = {}) {
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

export function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stripTags(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseQuoteJson(raw) {
  const eq = raw.indexOf("=");
  const start = raw.indexOf("{", eq >= 0 ? eq : 0);
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) throw new Error("bad upstream response");
  return JSON.parse(raw.slice(start, end + 1));
}

export function parseCngoldTableRows(html) {
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

export function parseCngoldSpot(html) {
  const out = [];
  for (const m of html.matchAll(/<dl[^>]*id\s*=\s*['"](JO_\d+)_hqData['"][\s\S]*?<dt[^>]*>([\s\S]*?)<\/dt>/gi)) {
    const code = m[1];
    const label = stripTags(m[2]);
    if (!code || !label) continue;
    out.push({ code, label });
  }
  return out;
}

export function parseCngoldShops(html) {
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

export function parseCngoldBars(html) {
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

export function parseCngoldRecycle(html) {
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

export async function fetchJijinhaoQuotes(codes, { referer, origin, timeoutMs } = {}) {
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

let dailyMenuDataCache = { mtimeMs: 0, payload: null };

export function parseYmdUtcStart(ymd) {
  const m = String(ymd ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mm) || !Number.isInteger(d)) return null;
  if (mm < 1 || mm > 12 || d < 1 || d > 31) return null;
  const ts = Date.UTC(y, mm - 1, d);
  const dt = new Date(ts);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== d) return null;
  return ts;
}

export function formatYmdFromUtcMs(ts) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export function loadDailyMenuData() {
  if (!fs.existsSync(DAILY_MENU_JSON)) {
    throw new Error(`menu data file not found: ${DAILY_MENU_JSON}`);
  }
  const stat = fs.statSync(DAILY_MENU_JSON);
  const mtimeMs = Number(stat.mtimeMs || 0);
  if (dailyMenuDataCache.payload && dailyMenuDataCache.mtimeMs === mtimeMs) {
    return { payload: dailyMenuDataCache.payload, cached: true };
  }
  let payload = null;
  try {
    payload = JSON.parse(fs.readFileSync(DAILY_MENU_JSON, "utf8"));
  } catch {
    throw new Error(`menu data bad json: ${DAILY_MENU_JSON}`);
  }
  if (!payload || !Array.isArray(payload.weeks) || payload.weeks.length <= 0) {
    throw new Error("menu data is empty");
  }
  dailyMenuDataCache = { mtimeMs, payload };
  return { payload, cached: false };
}

