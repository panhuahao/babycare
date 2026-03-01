import path from "node:path";
import fs from "node:fs";
import express from "express";
import Database from "better-sqlite3";

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "bbcare.sqlite");
const DIST_DIR = process.env.DIST_DIR ?? path.resolve(process.cwd(), "dist");
const METALS_DEV_API_KEY = String(process.env.METALS_DEV_API_KEY ?? "");
const TOZ_GRAMS = 31.1034768;
const JIJINHAO_HEADERS = {
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
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
  `);
  const row = db.prepare("SELECT id FROM state WHERE id = 1").get();
  if (!row) {
    db.prepare("INSERT INTO state (id, json, updated_at) VALUES (1, ?, 0)").run(
      JSON.stringify({ pregnancyInfo: null, events: [], bubbleSpeed: 0.35, themeMode: "dark" })
    );
  }
  return db;
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
  const updatedAt = typeof row?.updated_at === "number" ? row.updated_at : 0;
  return { pregnancyInfo, events, bubbleSpeed, themeMode, updatedAt };
}

function writeState(db, payload) {
  const pregnancyInfo = normalizePregnancyInfo(payload?.pregnancyInfo);
  const events = normalizeEvents(payload?.events);
  const bubbleSpeed = normalizeBubbleSpeed(payload?.bubbleSpeed);
  const themeMode = normalizeThemeMode(payload?.themeMode);
  const updatedAt = typeof payload?.updatedAt === "number" ? payload.updatedAt : Date.now();
  db.prepare("UPDATE state SET json = ?, updated_at = ? WHERE id = 1").run(
    JSON.stringify({ pregnancyInfo, events, bubbleSpeed, themeMode }),
    updatedAt
  );
  return { pregnancyInfo, events, bubbleSpeed, themeMode, updatedAt };
}

const db = openDb();
const app = express();

app.use(express.json({ limit: "1mb" }));

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

async function fetchJson(url, { timeoutMs, headers } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
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
