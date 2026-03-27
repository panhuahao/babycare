import {
  ARK_API_KEY,
  ARK_BASE_URL,
  ARK_TEXT_MODEL,
  ARK_TEXT_MODELS,
  DASHSCOPE_API_KEY,
  DASHSCOPE_BASE_URL,
  DASHSCOPE_MODEL,
  MOTA_API_KEY,
  MOTA_BASE_URL,
  MOTA_TEXT_MODEL,
  MOTA_TEXT_MODELS,
  ZAI_API_KEY,
  ZAI_MODEL
} from "./config.js";

export const TEXT_AI_PROVIDER_PRESETS = {
  zhipu: {
    label: "智谱",
    description: "适合联网搜索与常规文本生成。",
    endpointFamily: "chat.completions",
    supportsSearch: true,
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: ZAI_API_KEY,
    defaultModel: ZAI_MODEL || "glm-4.6v",
    modelList: "",
    referenceModels: ["glm-4.6v", "glm-4v", "glm-4.5-air"]
  },
  aliyun: {
    label: "阿里云百炼",
    description: "适合联网搜索与 Qwen 文本任务。",
    endpointFamily: "chat.completions",
    supportsSearch: true,
    baseUrl: DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: DASHSCOPE_API_KEY,
    defaultModel: DASHSCOPE_MODEL || "qwen3.5-plus",
    modelList: String(process.env.DASHSCOPE_TEXT_MODELS ?? "").trim(),
    referenceModels: ["qwen3.5-plus", "qwen3.5-flash", "qwen-plus-latest", "qwen-max-latest"]
  },
  ark: {
    label: "火山方舟",
    description: "借鉴 excel_assist 的 Doubao / Ark 配置。",
    endpointFamily: "responses",
    supportsSearch: true,
    baseUrl: ARK_BASE_URL,
    apiKey: ARK_API_KEY,
    defaultModel: ARK_TEXT_MODEL,
    modelList: ARK_TEXT_MODELS,
    referenceModels: ["doubao-2-0-lite", "doubao-seed-2-0-lite-260215", "doubao-seed-2-0-pro-260215", "doubao-seed-1-6-251015"]
  },
  modelscope: {
    label: "ModelScope",
    description: "借鉴 excel_assist 的 OpenAI 兼容文本配置。",
    endpointFamily: "chat.completions",
    supportsSearch: true,
    baseUrl: MOTA_BASE_URL || "https://api-inference.modelscope.cn/v1",
    apiKey: MOTA_API_KEY,
    defaultModel: MOTA_TEXT_MODEL,
    modelList: MOTA_TEXT_MODELS,
    referenceModels: ["moonshotai/Kimi-K2.5", "deepseek-ai/DeepSeek-V3.2"]
  }
};

export const DEFAULT_TEXT_AI_PROVIDER = "zhipu";
export const TEXT_AI_PROVIDER_CODES = Object.keys(TEXT_AI_PROVIDER_PRESETS);
const THINKING_MODEL_KEYWORDS = ["deepseek", "qwen", "reasoner", "r1"];

function normalizeModelName(value) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return "";
  return v.length > 120 ? v.slice(0, 120) : v;
}

function uniqueModels(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const model = normalizeModelName(value);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
}

function parseModelList(raw) {
  return uniqueModels(String(raw || "").replace(/\n/g, ",").split(","));
}

export function normalizeTextAiProvider(value) {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  return TEXT_AI_PROVIDER_CODES.includes(provider) ? provider : DEFAULT_TEXT_AI_PROVIDER;
}

export function listTextAiProviderOptions() {
  return TEXT_AI_PROVIDER_CODES.map((code) => ({
    code,
    label: TEXT_AI_PROVIDER_PRESETS[code].label,
    description: TEXT_AI_PROVIDER_PRESETS[code].description,
    supportsSearch: Boolean(TEXT_AI_PROVIDER_PRESETS[code].supportsSearch)
  }));
}

export function resolveTextAiProviderRuntime(provider) {
  const code = normalizeTextAiProvider(provider);
  const preset = TEXT_AI_PROVIDER_PRESETS[code];
  const models = uniqueModels(parseModelList(preset.modelList).concat([preset.defaultModel], preset.referenceModels));
  const defaultModel = normalizeModelName(preset.defaultModel) || models[0] || "";
  return {
    provider: code,
    label: preset.label,
    description: preset.description,
    endpointFamily: preset.endpointFamily,
    supportsSearch: Boolean(preset.supportsSearch),
    baseUrl: String(preset.baseUrl || "").trim().replace(/\/+$/, ""),
    apiKey: String(preset.apiKey || "").trim(),
    defaultModel,
    models: uniqueModels([defaultModel].concat(models))
  };
}

function normalizeProviderState(provider, rawState) {
  const runtime = resolveTextAiProviderRuntime(provider);
  const state = rawState && typeof rawState === "object" ? rawState : {};
  const storedModels = Array.isArray(state.models) ? state.models : [];
  const storedDefault = normalizeModelName(state.defaultTextModel);
  let models = uniqueModels(storedModels.concat(runtime.models));
  let defaultTextModel = storedDefault || runtime.defaultModel || models[0] || "";
  if (defaultTextModel) models = uniqueModels([defaultTextModel].concat(models));
  return { models, defaultTextModel };
}

export function normalizeTextAiProviderStates(rawStates, selectedProvider, legacy = {}) {
  const out = {};
  const states = rawStates && typeof rawStates === "object" ? rawStates : {};
  const activeProvider = normalizeTextAiProvider(selectedProvider);
  for (const provider of TEXT_AI_PROVIDER_CODES) {
    let state = states[provider];
    if ((!state || typeof state !== "object") && provider === activeProvider && (legacy.models?.length || legacy.defaultTextModel)) {
      state = legacy;
    }
    out[provider] = normalizeProviderState(provider, state);
  }
  return out;
}

export function resolveTextAiModel(state, provider, requestedModel) {
  const code = normalizeTextAiProvider(provider);
  const rawRequested = normalizeModelName(requestedModel);
  if (rawRequested) return rawRequested;
  const states = normalizeTextAiProviderStates(state?.aiTextProviderStates, state?.aiTextProvider);
  const current = states[code];
  return normalizeModelName(current?.defaultTextModel) || resolveTextAiProviderRuntime(code).defaultModel;
}

export function providerSupportsSearch(provider) {
  return Boolean(resolveTextAiProviderRuntime(provider).supportsSearch);
}

export function buildThinkingExtra(provider, model, enableThinking) {
  const code = normalizeTextAiProvider(provider);
  if (code === "zhipu") {
    return enableThinking ? { thinking: { type: "enabled", clear_thinking: true } } : {};
  }
  const normalized = normalizeModelName(model).toLowerCase();
  if (THINKING_MODEL_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { enable_thinking: Boolean(enableThinking) };
  }
  if (code === "aliyun") {
    return { enable_thinking: Boolean(enableThinking) };
  }
  return {};
}
