import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import express from "express";
import {
  AI_CALLER,
  AI_TIMEOUT_S,
  DASHSCOPE_API_KEY,
  DASHSCOPE_BASE_URL,
  DASHSCOPE_MODEL,
  JIJINHAO_HEADERS,
  METALS_DEV_API_KEY,
  TOZ_GRAMS,
  UPLOAD_DIR,
  ZAI_API_KEY,
  ZAI_MODEL
} from "./config.js";
import { callAiViaPython } from "./ai.js";
import {
  decodeBase64Utf8,
  logEvent,
  normalizeAiModel,
  normalizeAiVendor,
  normalizePrompt,
  readState,
  writeState
} from "./state.js";
import {
  fetchJijinhaoQuotes,
  fetchJson,
  fetchText,
  formatYmdHmInTimeZone,
  formatYmdInTimeZone,
  formatYmdFromUtcMs,
  loadDailyMenuData,
  parseCngoldBars,
  parseCngoldRecycle,
  parseCngoldShops,
  parseYmdUtcStart,
  sleepMs
} from "./utils.js";
import {
  buildThinkingExtra,
  normalizeTextAiProvider,
  resolveTextAiModel,
  resolveTextAiProviderRuntime
} from "./aiProviders.js";

const AI_PRECIOUS_PRICE_CACHE_MS = 10 * 60_000;
const AI_PRECIOUS_PRICE_SECTION_TITLES = {
  bank: "银行金银",
  jewelry: "首饰金",
  recycle: "回收价格"
};

let aiPreciousPriceCache = { at: 0, key: "", payload: null };

function pickPreciousPriceModel(vendor, requestedModel, state) {
  return resolveTextAiModel(state, vendor, requestedModel);
}

function extractAiRequestId(aiRes) {
  return typeof aiRes?.request_id === "string" ? aiRes.request_id : typeof aiRes?.id === "string" ? aiRes.id : "";
}

async function requestTextAi({
  provider,
  model,
  system,
  userText,
  thinking,
  timeoutMs,
  temperature,
  topP,
  maxTokens,
  responseFormat,
  search
}) {
  const runtime = resolveTextAiProviderRuntime(provider);
  if (!runtime.apiKey) {
    throw new Error(`${runtime.label} 未配置 API Key`);
  }
  if (!runtime.baseUrl) {
    throw new Error(`${runtime.label} 未配置 Base URL`);
  }

  const endpointFamily = runtime.endpointFamily;
  if (endpointFamily === "responses") {
    const payload = {
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userText }
      ],
      temperature,
      max_output_tokens: maxTokens,
      ...buildThinkingExtra(provider, model, thinking)
    };
    if (responseFormat === "json_object") {
      payload.text = { format: { type: "json_object" } };
    }
    if (search) {
      payload.tools = [{ type: "web_search" }];
    }
    return await fetchJson(`${runtime.baseUrl}/responses`, {
      timeoutMs,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${runtime.apiKey}`
      },
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText }
    ],
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    stream: false,
    ...buildThinkingExtra(provider, model, thinking)
  };
  if (responseFormat === "json_object" && provider === "zhipu") {
    payload.response_format = { type: "json_object" };
  }
  if (search && provider === "zhipu") {
    payload.tools = [
      {
        type: "web_search",
        web_search: {
          enable: true,
          search_result: false,
          count: 6,
          content_size: "medium",
          search_recency_filter: "oneDay"
        }
      }
    ];
    payload.do_sample = false;
  }
  if (provider === "aliyun") {
    payload.enable_search = Boolean(search);
  }
  if (provider === "modelscope" && search) {
    payload.enable_search = true;
  }
  return await fetchJson(`${runtime.baseUrl}/chat/completions`, {
    timeoutMs,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${runtime.apiKey}`
    },
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function collectAiTextParts(value, out = []) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAiTextParts(item, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  if (typeof value.text === "string") collectAiTextParts(value.text, out);
  if (typeof value.output_text === "string") collectAiTextParts(value.output_text, out);
  if (typeof value.content === "string" || Array.isArray(value.content) || (value.content && typeof value.content === "object")) {
    collectAiTextParts(value.content, out);
  }
  if (typeof value.arguments === "string") collectAiTextParts(value.arguments, out);
  return out;
}

function extractAiText(aiRes) {
  const direct = aiRes?.choices?.[0]?.message?.content;
  const directTexts = collectAiTextParts(direct);
  if (directTexts.length) return directTexts.join("\n");
  if (typeof aiRes?.output_text === "string" && aiRes.output_text.trim()) return aiRes.output_text.trim();
  const outputTexts = collectAiTextParts(aiRes?.output);
  if (outputTexts.length) return outputTexts.join("\n");
  return "";
}

function repairJsonCandidate(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, "$1");
}

function tryParseJsonObject(candidate) {
  if (typeof candidate !== "string") return null;
  const trimmed = repairJsonCandidate(candidate.trim());
  if (!trimmed) return null;
  const attempts = [trimmed];
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) attempts.push(trimmed);
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (typeof parsed === "string") {
        const nested = tryParseJsonObject(parsed);
        if (nested) return nested;
        continue;
      }
      if (Array.isArray(parsed)) {
        const firstObject = parsed.find((item) => item && typeof item === "object");
        if (firstObject && !Array.isArray(firstObject)) return firstObject;
        continue;
      }
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.json === "string") {
          const nested = tryParseJsonObject(parsed.json);
          if (nested) return nested;
        }
        return parsed;
      }
    } catch {}
  }
  return null;
}

function extractBalancedJsonCandidates(text) {
  const out = [];
  if (typeof text !== "string") return out;
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          out.push(text.slice(start, i + 1));
          break;
        }
      }
    }
    if (out.length >= 8) break;
  }
  return out;
}

function parseLooseJsonObject(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(...extractBalancedJsonCandidates(trimmed));
  for (const candidate of candidates) {
    const parsed = tryParseJsonObject(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function parsePreciousPriceNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizeAiPreciousPriceItem(item) {
  const name = typeof item?.name === "string" ? item.name.trim().slice(0, 40) : "";
  const metalRaw = typeof item?.metal === "string" ? item.metal.trim().toLowerCase() : "";
  const metal = metalRaw === "silver" || /白银/.test(metalRaw) ? "silver" : "gold";
  const price = parsePreciousPriceNumber(item?.price);
  const source = typeof item?.source === "string" ? item.source.trim().slice(0, 48) : "";
  const note = typeof item?.note === "string" ? item.note.trim().slice(0, 80) : "";
  const unit = typeof item?.unit === "string" && item.unit.trim() ? item.unit.trim().slice(0, 12) : "元/克";
  if (!name || price == null) return null;
  return { name, metal, price, unit, source, note };
}

function normalizeAiPreciousPriceSection(sectionKey, rawSection) {
  const title = typeof rawSection?.title === "string" && rawSection.title.trim() ? rawSection.title.trim().slice(0, 20) : AI_PRECIOUS_PRICE_SECTION_TITLES[sectionKey];
  const rawItems = Array.isArray(rawSection?.items) ? rawSection.items : [];
  const items = rawItems
    .map((item) => normalizeAiPreciousPriceItem(item))
    .filter((item) => item && isPlausiblePreciousPrice(sectionKey, item))
    .slice(0, 6);
  return { title, items };
}

function normalizeAiPreciousPricePayload(raw) {
  const bank = normalizeAiPreciousPriceSection("bank", raw?.sections?.bank ?? raw?.bank ?? {});
  const jewelry = normalizeAiPreciousPriceSection("jewelry", raw?.sections?.jewelry ?? raw?.jewelry ?? {});
  const recycle = normalizeAiPreciousPriceSection("recycle", raw?.sections?.recycle ?? raw?.recycle ?? {});
  return {
    asOf: typeof raw?.asOf === "string" ? raw.asOf.trim().slice(0, 32) : "",
    disclaimer:
      typeof raw?.disclaimer === "string" && raw.disclaimer.trim()
        ? raw.disclaimer.trim().slice(0, 120)
        : "AI 联网整理，仅供参考，请以银行、门店和实际回收报价为准。",
    sections: { bank, jewelry, recycle }
  };
}

function countValidPreciousPrices(payload) {
  const sections = [payload?.sections?.bank, payload?.sections?.jewelry, payload?.sections?.recycle];
  return sections.reduce((count, section) => {
    const items = Array.isArray(section?.items) ? section.items : [];
    return count + items.filter((item) => typeof item?.price === "number" && Number.isFinite(item.price) && item.price > 0).length;
  }, 0);
}

function isPlausiblePreciousPrice(sectionKey, item) {
  const price = item?.price;
  const unit = typeof item?.unit === "string" ? item.unit : "";
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return false;
  if (!unit.includes("元/克")) return false;
  if (item?.metal === "silver") {
    if (sectionKey === "jewelry") return price >= 2 && price <= 30;
    return price >= 1 && price <= 20;
  }
  if (sectionKey === "jewelry") return price >= 500 && price <= 1500;
  if (sectionKey === "recycle") return price >= 350 && price <= 1000;
  return price >= 450 && price <= 1000;
}

function getPreciousPriceQualityIssues(payload, expectedDate) {
  const hard = [];
  const soft = [];
  const bankItems = Array.isArray(payload?.sections?.bank?.items) ? payload.sections.bank.items : [];
  const jewelryItems = Array.isArray(payload?.sections?.jewelry?.items) ? payload.sections.jewelry.items : [];
  const recycleItems = Array.isArray(payload?.sections?.recycle?.items) ? payload.sections.recycle.items : [];
  const total = countValidPreciousPrices(payload);

  if (!bankItems.length) hard.push("银行金银缺少有效报价");
  if (!jewelryItems.some((item) => item?.metal === "gold")) hard.push("首饰金缺少有效黄金报价");
  if (!recycleItems.some((item) => item?.metal === "gold")) hard.push("回收价格缺少有效黄金报价");
  if (total < 3) hard.push("有效报价少于 3 条");

  const asOf = typeof payload?.asOf === "string" ? payload.asOf.trim() : "";
  if (!asOf) {
    soft.push("缺少报价时间");
  } else if (expectedDate && !asOf.includes(expectedDate)) {
    soft.push(`报价时间不是今天(${expectedDate})`);
  }

  for (const [sectionKey, section] of Object.entries(payload?.sections ?? {})) {
    const items = Array.isArray(section?.items) ? section.items : [];
    const valid = items.filter((item) => isPlausiblePreciousPrice(sectionKey, item));
    if (items.length && valid.length !== items.length) {
      hard.push(`${section?.title ?? sectionKey}含异常价格`);
    }
    if (valid.length >= 2) {
      const uniquePrices = new Set(valid.map((item) => Number(item.price).toFixed(2)));
      if (uniquePrices.size === 1) soft.push(`${section?.title ?? sectionKey}价格完全相同`);
    }
    const missingSourceCount = valid.filter((item) => !item?.source).length;
    if (valid.length && missingSourceCount >= Math.ceil(valid.length / 2)) {
      soft.push(`${section?.title ?? sectionKey}来源信息不足`);
    }
  }

  return {
    hard: [...new Set(hard)],
    soft: [...new Set(soft)]
  };
}

function buildPreciousPriceUserText({ beijingNow, beijingToday, repairIssues = [] }) {
  const lines = [
    `当前北京时间：${beijingNow}`,
    `今天中国日期：${beijingToday}`,
    "任务：联网查询中国大陆今天的贵金属价格，只保留三类：银行金银、首饰金、回收价格。",
    "优先官方或品牌自有页面；如果没有官方当日报价，再使用主流行情站，但页面必须明确标注今天日期或今天更新时间。",
    "银行金银优先搜索：工商银行、中国银行、建设银行、农业银行、招商银行的黄金/白银克价。",
    "首饰金优先搜索：周大福、周生生、六福、老凤祥、老庙的足金挂牌价。",
    "回收价格优先搜索：黄金回收价，至少返回 1 条黄金回收，可补充白银回收。",
    "不要使用国际现货、美元/盎司、COMEX、沪金、期货、历史文章、昨日价格、工费或优惠后价格。",
    "每条记录必须来自你确认与今天日期一致的页面；如果页面没有今天日期或今天更新时间，不要采用。",
    "price 必须是真实数字，单位统一为元/克，不能写 0，不能估算；无法确认填 null。",
    "返回前请先自检：日期是今天；来源与分类匹配；价格不是 0；黄金与白银价格处于合理范围。",
    "必须输出标准 JSON：双引号 key、双引号字符串、不能带 ```、不能带说明文字、不能带注释、不能有尾逗号。",
    '只返回 JSON：{"asOf":"YYYY-MM-DD HH:mm","disclaimer":"简短提示","sections":{"bank":{"title":"银行金银","items":[{"name":"工商银行 如意金条","metal":"gold","price":768.5,"unit":"元/克","source":"工商银行","note":"官网/当日报价"}]},"jewelry":{"title":"首饰金","items":[{"name":"周大福 足金","metal":"gold","price":892,"unit":"元/克","source":"周大福","note":"官网/当日报价"}]},"recycle":{"title":"回收价格","items":[{"name":"黄金回收","metal":"gold","price":730,"unit":"元/克","source":"回收平台","note":"今日回收价"}]}}}',
    "source 只写简短来源名，每类最多 3 条。"
  ];
  if (repairIssues.length) {
    lines.splice(
      2,
      0,
      `上一次结果存在这些问题：${repairIssues.join("；")}。请重新联网搜索并修正后再返回。`
    );
  }
  return lines.join("\n");
}

export function registerApiRoutes(app, db) {
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

app.get("/api/widgets/daily-menu", (req, res) => {
  try {
    const wb = loadDailyMenuData();
    const dateRaw = typeof req.query.date === "string" ? req.query.date.trim() : "";
    const todayRaw = typeof req.query.today === "string" ? req.query.today.trim() : "";
    const anchorDate = todayRaw || formatYmdFromUtcMs(Date.now());
    const selectedDate = dateRaw || anchorDate;
    const anchorTs = parseYmdUtcStart(anchorDate);
    const selectedTs = parseYmdUtcStart(selectedDate);
    if (anchorTs == null) {
      res.status(400).json({ error: "today must be YYYY-MM-DD" });
      return;
    }
    if (selectedTs == null) {
      res.status(400).json({ error: "date must be YYYY-MM-DD" });
      return;
    }

    const weeks = wb.payload.weeks;
    const totalWeeks = weeks.length;
    const daysPerWeek = 7;
    const totalCycleDays = totalWeeks * daysPerWeek;
    if (totalCycleDays <= 0) {
      res.status(500).json({ error: "menu data is empty" });
      return;
    }

    const anchorIndex = 3; // Week1 周四
    const offsetDays = Math.round((selectedTs - anchorTs) / 86_400_000);
    const cycleIndex = ((anchorIndex + offsetDays) % totalCycleDays + totalCycleDays) % totalCycleDays;
    const weekIndex = Math.floor(cycleIndex / daysPerWeek);
    const dayIndex = cycleIndex % daysPerWeek;
    const week = weeks[weekIndex];
    const day = Array.isArray(week?.days) ? week.days.find((d) => d?.dayIndex === dayIndex) ?? week.days[dayIndex] : null;
    if (!week || !day) {
      res.status(500).json({ error: "menu data format invalid" });
      return;
    }

    res.json({
      selectedDate,
      anchorDate,
      offsetDays,
      weekNo: week.weekNo,
      weekTitle: week.title,
      weekday: day.weekday,
      dayIndex,
      cycleIndex,
      totalWeeks,
      totalCycleDays,
      items: Array.isArray(day.items) ? day.items : [],
      cachedWorkbook: wb.cached
    });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "load menu failed" });
  }
});

app.post("/api/widgets/ai-precious-prices", async (req, res) => {
  let localId = "";
  let vendorForLog = "";
  let modelForLog = "";
  let startedAt = 0;
  try {
    startedAt = Date.now();
    localId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString("hex");
    const body = req.body ?? {};
    const force = body?.force === true || body?.force === 1 || body?.force === "1";
    const state = readState(db);
    const vendor = normalizeTextAiProvider(typeof body?.provider === "string" ? body.provider : typeof body?.vendor === "string" ? body.vendor : state.aiTextProvider);
    const model = pickPreciousPriceModel(vendor, body?.model, state);
    const thinking = typeof body?.thinking === "boolean" ? body.thinking : Boolean(state.aiThinking);
    vendorForLog = vendor;
    modelForLog = model;
    const nowTs = Date.now();
    const beijingToday = formatYmdInTimeZone(nowTs, "Asia/Shanghai");
    const beijingNow = formatYmdHmInTimeZone(nowTs, "Asia/Shanghai");
    const cacheKey = `${vendor}:${model}:thinking:${thinking ? 1 : 0}:date:${beijingToday}`;
    if (!force && aiPreciousPriceCache.payload && aiPreciousPriceCache.key === cacheKey && Date.now() - aiPreciousPriceCache.at < AI_PRECIOUS_PRICE_CACHE_MS) {
      res.json({ ...aiPreciousPriceCache.payload, cached: true });
      return;
    }

    const system = normalizePrompt(
      body?.systemPrompt,
      {
        fallback:
          "你是中国贵金属价格助手。你必须联网搜索，只返回严格 JSON，不要输出 markdown、解释或额外文本。",
        maxLen: 600
      }
    );
    let payload = null;
    let finalRequestId = "";
    let finalIssues = [];
    let finalContentPreview = "";

    for (let contentAttempt = 0; contentAttempt < 2; contentAttempt++) {
      const userText = buildPreciousPriceUserText({
        beijingNow,
        beijingToday,
        repairIssues: contentAttempt > 0 ? finalIssues : []
      });

      let aiRes = null;
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          aiRes = await requestTextAi({
            provider: vendor,
            model,
            system,
            userText,
            thinking,
            timeoutMs: vendor === "zhipu" ? 40_000 : 25_000,
            temperature: 0.1,
            topP: 0.4,
            maxTokens: 800,
            responseFormat: "json_object",
            search: true
          });
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          const stCode = err?.cause?.status;
          const name = String(err?.name ?? "");
          const msg = String(err?.message ?? "").toLowerCase();
          const retryable = name === "AbortError" || msg.includes("timeout") || stCode === 429 || stCode === 500 || stCode === 502 || stCode === 503 || stCode === 504;
          if (retryable) {
            await sleepMs(500 * (attempt + 1));
            continue;
          }
          break;
        }
      }
      if (!aiRes) throw lastErr ?? new Error("upstream error");

      const requestId = extractAiRequestId(aiRes);
      finalRequestId = requestId;
      const content = extractAiText(aiRes);
      finalContentPreview = content.slice(0, 1200);
      if (!content) {
        logEvent(db, "error", "ai:precious_prices:empty", {
          localId,
          vendor,
          model,
          requestId,
          contentAttempt
        });
        if (contentAttempt === 0) {
          finalIssues = ["AI 返回为空"];
          continue;
        }
        res.status(502).json({ error: "AI 返回为空", requestId });
        return;
      }

      const parsed = parseLooseJsonObject(content);
      if (!parsed) {
        logEvent(db, "error", "ai:precious_prices:bad_json", {
          localId,
          vendor,
          model,
          requestId,
          contentAttempt,
          preview: finalContentPreview
        });
        if (contentAttempt === 0) {
          finalIssues = ["返回内容不是合法 JSON"];
          continue;
        }
        throw new Error("AI 返回格式异常，未解析到 JSON");
      }

      const normalized = normalizeAiPreciousPricePayload(parsed);
      const { hard, soft } = getPreciousPriceQualityIssues(normalized, beijingToday);
      finalIssues = [...hard, ...soft];
      if (!hard.length && (!soft.length || contentAttempt > 0)) {
        payload = {
          vendor,
          model,
          thinking,
          source: "AI 联网查询",
          asOf: normalized.asOf || null,
          updatedAt: Date.now(),
          cached: false,
          disclaimer: normalized.disclaimer,
          sections: normalized.sections,
          requestId
        };
        break;
      }

      logEvent(db, "warn", "ai:precious_prices:quality_retry", {
        localId,
        vendor,
        model,
        requestId,
        contentAttempt,
        hard,
        soft
      });

      if (contentAttempt === 0) continue;

      if (hard.length) {
        throw new Error("AI 返回价格可信度不足，请稍后重试");
      }

      payload = {
        vendor,
        model,
        thinking,
        source: "AI 联网查询",
        asOf: normalized.asOf || null,
        updatedAt: Date.now(),
        cached: false,
        disclaimer: normalized.disclaimer,
        sections: normalized.sections,
        requestId
      };
      break;
    }

    if (!payload) {
      logEvent(db, "error", "ai:precious_prices:no_valid_price", {
        localId,
        vendor,
        model,
        requestId: finalRequestId,
        issues: finalIssues,
        preview: finalContentPreview
      });
      throw new Error("AI 未返回足够可靠的价格，请稍后重试");
    }

    const responsePayload = payload;
    aiPreciousPriceCache = { at: Date.now(), key: cacheKey, payload: responsePayload };
    logEvent(db, "info", "ai:precious_prices:ok", { localId, vendor, model, requestId: finalRequestId, ms: Date.now() - startedAt });
    res.json(responsePayload);
  } catch (err) {
    const requestId = typeof err?.cause?.requestId === "string" ? err.cause.requestId : "";
    const status = typeof err?.cause?.status === "number" ? err.cause.status : undefined;
    const name = String(err?.name ?? "");
    const msgLower = String(err?.message ?? "").toLowerCase();
    const timeoutLike = name === "AbortError" || msgLower.includes("timeout");
    const friendlyError = timeoutLike ? "AI 查询超时，请稍后再试" : err?.message ?? "金价查询失败";
    logEvent(db, "error", "ai:precious_prices:error", {
      localId,
      vendor: vendorForLog || null,
      model: modelForLog || null,
      error: friendlyError,
      requestId,
      upstreamStatus: status,
      ms: startedAt ? Date.now() - startedAt : null
    });
    res.status(timeoutLike ? 504 : 502).json({ error: friendlyError, requestId, upstreamStatus: status });
  }
});

app.post("/api/widgets/menu-recipe", async (req, res) => {
  let localId = "";
  let vendorForLog = "";
  let modelForLog = "";
  let startedAt = 0;
  try {
    startedAt = Date.now();
    localId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString("hex");
    const body = req.body ?? {};
    const meal = typeof body?.meal === "string" ? body.meal.trim().slice(0, 32) : "";
    const food = typeof body?.food === "string" ? body.food.trim().slice(0, 200) : "";
    const date = typeof body?.date === "string" ? body.date.trim().slice(0, 16) : "";
    const weekday = typeof body?.weekday === "string" ? body.weekday.trim().slice(0, 8) : "";
    const weekNo = Number.isFinite(Number(body?.weekNo)) ? Math.max(1, Math.min(16, Number(body.weekNo))) : null;
    if (!meal && !food) {
      res.status(400).json({ error: "缺少餐次或食材信息" });
      return;
    }

    const st = readState(db);
    const requestedVendorRaw = typeof body?.provider === "string" ? body.provider : typeof body?.vendor === "string" ? body.vendor : st.aiTextProvider;
    const vendor = normalizeTextAiProvider(String(requestedVendorRaw));
    vendorForLog = vendor;
    const model = resolveTextAiModel(st, vendor, typeof body?.model === "string" ? body.model : "");
    modelForLog = model;
    const thinking = typeof body?.thinking === "boolean" ? body.thinking : false;
    const menuAiTimeoutMs = Math.min(120_000, Math.max(20_000, Number(process.env.MENU_AI_TIMEOUT_MS ?? 65_000) || 65_000));
    const menuAiMaxTokens = Math.min(800, Math.max(64, Number(process.env.MENU_AI_MAX_TOKENS ?? 220) || 220));
    const defaultSystem = "你是一个孕妇饮食助手，简短输出菜名与配菜。";
    const system = normalizePrompt(body?.systemPrompt ?? st.aiMenuRecipeSystemPrompt, { fallback: defaultSystem, maxLen: 600 });
    const defaultMenuPrompt = "根据当前食材为孕妇推荐1-3道菜，补充所需食材";
    const menuPrompt = normalizePrompt(body?.menuPrompt ?? st.aiMenuRecipePrompt, { fallback: defaultMenuPrompt, maxLen: 600 });
    const userText = [
      menuPrompt,
      meal ? `餐次：${meal}` : "",
      food ? `现有食材：${food}` : "",
      date ? `日期：${date}` : "",
      weekday ? `星期：${weekday}` : "",
      weekNo ? `食谱周次：Week${weekNo}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    let aiRes = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        aiRes = await requestTextAi({
          provider: vendor,
          model,
          system,
          userText,
          thinking,
          timeoutMs: menuAiTimeoutMs,
          temperature: 0.7,
          topP: 0.8,
          maxTokens: menuAiMaxTokens,
          search: false
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const stCode = e?.cause?.status;
        const name = String(e?.name ?? "");
        const msg = String(e?.message ?? "").toLowerCase();
        const abortedLike = name === "AbortError" || msg.includes("aborted") || msg.includes("timeout");
        if (abortedLike || stCode === 429 || stCode === 500 || stCode === 502 || stCode === 503 || stCode === 504) {
          await sleepMs(450 * (attempt + 1));
          continue;
        }
        break;
      }
    }
    if (!aiRes) throw lastErr ?? new Error("upstream error");

    const content = extractAiText(aiRes);
    if (typeof content !== "string" || !content.trim()) {
      res.status(502).json({ error: "AI 返回异常" });
      return;
    }
    const requestId = extractAiRequestId(aiRes);
    logEvent(db, "info", "ai:menu_recipe:ok", { localId, vendor, model, requestId, ms: Date.now() - startedAt });
    res.json({ vendor, model, content, requestId });
  } catch (err) {
    const requestId = typeof err?.cause?.requestId === "string" ? err.cause.requestId : "";
    const status = typeof err?.cause?.status === "number" ? err.cause.status : undefined;
    const name = String(err?.name ?? "");
    const msgLower = String(err?.message ?? "").toLowerCase();
    const timeoutLike = name === "AbortError" || msgLower.includes("aborted") || msgLower.includes("timeout");
    const friendlyError = timeoutLike ? "AI 响应超时，请稍后重试（可稍后再试，或在设置里关闭 Thinking）" : err?.message ?? "upstream error";
    logEvent(db, "error", "ai:menu_recipe:error", {
      localId,
      vendor: vendorForLog || null,
      model: modelForLog || null,
      error: friendlyError,
      requestId,
      upstreamStatus: status,
      ms: startedAt ? Date.now() - startedAt : null
    });
    res.status(timeoutLike ? 504 : 502).json({ error: friendlyError, requestId, upstreamStatus: status });
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
            enable_thinking: Boolean(thinking),
            enable_search: false,
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
              enable_thinking: Boolean(thinking),
              enable_search: false,
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
      const price =
        typeof it?.q1 === "number" && it.q1 !== 0
          ? it.q1
          : typeof it?.q2 === "number" && it.q2 !== 0
            ? it.q2
            : typeof it?.q63 === "number" && it.q63 !== 0
              ? it.q63
              : null;
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


}
