export type VisionAiVendor = "zhipu" | "aliyun";
export type TextAiProvider = "zhipu" | "aliyun" | "ark" | "modelscope";

export type TextAiProviderState = {
  models: string[];
  defaultTextModel: string;
};

export const TEXT_AI_PROVIDER_PRESETS: Record<
  TextAiProvider,
  { label: string; description: string; supportsSearch: boolean; referenceModels: string[] }
> = {
  zhipu: {
    label: "智谱",
    description: "适合联网搜索与常规文本生成。",
    supportsSearch: true,
    referenceModels: ["glm-4.6v", "glm-4v", "glm-4.5-air"]
  },
  aliyun: {
    label: "阿里云百炼",
    description: "适合联网搜索与 Qwen 文本任务。",
    supportsSearch: true,
    referenceModels: ["qwen3.5-plus", "qwen3.5-flash", "qwen-plus-latest", "qwen-max-latest"]
  },
  ark: {
    label: "火山方舟",
    description: "借鉴 excel_assist 的 Doubao / Ark 配置。",
    supportsSearch: true,
    referenceModels: ["doubao-2-0-lite", "doubao-seed-2-0-lite-260215", "doubao-seed-2-0-pro-260215", "doubao-seed-1-6-251015"]
  },
  modelscope: {
    label: "ModelScope",
    description: "借鉴 excel_assist 的 OpenAI 兼容文本配置。",
    supportsSearch: true,
    referenceModels: ["moonshotai/Kimi-K2.5", "deepseek-ai/DeepSeek-V3.2"]
  }
};

export const TEXT_AI_PROVIDER_CODES = Object.keys(TEXT_AI_PROVIDER_PRESETS) as TextAiProvider[];
export const DEFAULT_TEXT_AI_PROVIDER: TextAiProvider = "zhipu";

export function normalizeTextAiProvider(input: unknown): TextAiProvider {
  const provider = typeof input === "string" ? input.trim().toLowerCase() : "";
  return (TEXT_AI_PROVIDER_CODES as string[]).includes(provider) ? (provider as TextAiProvider) : DEFAULT_TEXT_AI_PROVIDER;
}

export function normalizeVisionAiVendor(input: unknown): VisionAiVendor {
  const vendor = typeof input === "string" ? input.trim().toLowerCase() : "";
  return vendor === "aliyun" || vendor === "dashscope" || vendor === "bailian" ? "aliyun" : "zhipu";
}

export function normalizeAiModelName(input: unknown, fallback = "") {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) return fallback;
  return value.length > 120 ? value.slice(0, 120) : value;
}

export function uniqueModels(values: unknown[]) {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const model = normalizeAiModelName(value);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    items.push(model);
  }
  return items;
}

function normalizeProviderState(provider: TextAiProvider, raw: unknown): TextAiProviderState {
  const state = raw && typeof raw === "object" ? (raw as Partial<TextAiProviderState>) : {};
  const preset = TEXT_AI_PROVIDER_PRESETS[provider];
  const models = uniqueModels([...(Array.isArray(state.models) ? state.models : []), ...preset.referenceModels]);
  const defaultTextModel = normalizeAiModelName(state.defaultTextModel, models[0] ?? preset.referenceModels[0] ?? "");
  return {
    models: uniqueModels([defaultTextModel, ...models]),
    defaultTextModel
  };
}

export function normalizeTextAiProviderStates(
  rawStates: unknown,
  selectedProvider?: unknown,
  legacy?: { provider?: unknown; model?: unknown }
): Record<TextAiProvider, TextAiProviderState> {
  const states = rawStates && typeof rawStates === "object" ? (rawStates as Record<string, unknown>) : {};
  const selected = normalizeTextAiProvider(selectedProvider);
  const out = {} as Record<TextAiProvider, TextAiProviderState>;
  for (const provider of TEXT_AI_PROVIDER_CODES) {
    const fallbackState =
      legacy && provider === selected && (legacy.model || legacy.provider)
        ? { models: legacy.model ? [legacy.model] : [], defaultTextModel: legacy.model ?? "" }
        : undefined;
    out[provider] = normalizeProviderState(provider, states[provider] ?? fallbackState);
  }
  return out;
}

export function getActiveTextModel(provider: TextAiProvider, states: Record<TextAiProvider, TextAiProviderState>) {
  return normalizeAiModelName(states?.[provider]?.defaultTextModel, TEXT_AI_PROVIDER_PRESETS[provider].referenceModels[0] ?? "");
}
