import { MovementEvent } from "./domain/movement";
import { PregnancyInfo } from "./domain/pregnancy";

export type RemoteState = {
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
  aiThinking: boolean;
  aiImageBaseUrl: string;
  aiImageMode: "url" | "inline";
  aiImageTargetKb: number;
};

export async function fetchState(signal?: AbortSignal): Promise<RemoteState> {
  const res = await fetch("/api/state", { method: "GET", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as RemoteState;
  if (!data || typeof data !== "object") throw new Error("bad state");
  return data;
}

export async function pushState(state: RemoteState, signal?: AbortSignal): Promise<void> {
  const res = await fetch("/api/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
    signal
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export type MetalPriceItem = {
  code: "gold" | "silver" | "platinum" | "palladium";
  name: string;
  pricePerGram: number;
  pricePerToz: number;
};

export type MetalPricesResponse = {
  source: string;
  currency: string;
  unit: "g";
  timestamp: string | null;
  cached: boolean;
  items: MetalPriceItem[];
};

export async function fetchMetalPrices(opts?: { currency?: string; force?: boolean; signal?: AbortSignal }): Promise<MetalPricesResponse> {
  const currency = (opts?.currency ?? "CNY").trim();
  const qs = new URLSearchParams();
  if (currency) qs.set("currency", currency);
  if (opts?.force) qs.set("force", "1");
  const res = await fetch(`/api/widgets/metal-prices?${qs.toString()}`, { method: "GET", signal: opts?.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as MetalPricesResponse;
  if (!data || typeof data !== "object") throw new Error("bad response");
  return data;
}

export type ShopPriceItem = {
  code: string;
  name: string;
  price: number;
  unit: string;
};

export type ChowTaiFookPricesResponse = {
  source: string;
  brand: string;
  updatedDate: string | null;
  cached: boolean;
  items: ShopPriceItem[];
};

export async function fetchChowTaiFookPrices(opts?: { force?: boolean; signal?: AbortSignal }): Promise<ChowTaiFookPricesResponse> {
  const qs = new URLSearchParams();
  if (opts?.force) qs.set("force", "1");
  const res = await fetch(`/api/widgets/chowtaifook-prices?${qs.toString()}`, { method: "GET", signal: opts?.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as ChowTaiFookPricesResponse;
  if (!data || typeof data !== "object") throw new Error("bad response");
  return data;
}

export type CngoldPriceItem = {
  code: string;
  label: string;
  price: number;
  unit: string;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePercent: number | null;
  digits: number | null;
  updatedAt: number | null;
};

export type CngoldSection = {
  title: string;
  items: CngoldPriceItem[];
};

export type CngoldPricesResponse = {
  source: string;
  updatedAt: number | null;
  cached: boolean;
  sections: {
    shops: CngoldSection;
    bars: CngoldSection;
    recycle: CngoldSection;
  };
};

export async function fetchCngoldPrices(opts?: { force?: boolean; signal?: AbortSignal }): Promise<CngoldPricesResponse> {
  const qs = new URLSearchParams();
  if (opts?.force) qs.set("force", "1");
  const res = await fetch(`/api/widgets/cngold-prices?${qs.toString()}`, { method: "GET", signal: opts?.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as CngoldPricesResponse;
  if (!data || typeof data !== "object") throw new Error("bad response");
  return data;
}

export type FoodCheckResponse = {
  vendor?: "zhipu" | "aliyun";
  model: string;
  content: string;
  requestId?: string;
};

export async function checkFoodByPhoto(
  payload: {
    imageBase64: string;
    mimeType: string;
    vendor?: "zhipu" | "aliyun";
    model?: string;
    thinking?: boolean;
    systemPrompt?: string;
    userPrompt?: string;
  },
  opts?: { signal?: AbortSignal }
): Promise<FoodCheckResponse> {
  const res = await fetch(`/api/widgets/food-check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: opts?.signal
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    const rid = typeof data?.requestId === "string" && data.requestId ? ` (request_id: ${data.requestId})` : "";
    throw new Error(typeof data?.error === "string" ? `${data.error}${rid}` : `HTTP ${res.status}${rid}`);
  }
  if (!data || typeof data !== "object") throw new Error("bad response");
  return data as FoodCheckResponse;
}

export async function checkFoodByPhotoBinary(
  payload: {
    blob: Blob;
    vendor?: "zhipu" | "aliyun";
    model?: string;
    thinking?: boolean;
    systemPrompt?: string;
    userPrompt?: string;
  },
  opts?: { signal?: AbortSignal }
): Promise<FoodCheckResponse> {
  const toBase64 = (s: string) => {
    const enc = new TextEncoder().encode(s);
    let bin = "";
    for (let i = 0; i < enc.length; i++) bin += String.fromCharCode(enc[i]);
    return btoa(bin);
  };
  const headers: Record<string, string> = {};
  if (payload.vendor) headers["x-ai-vendor"] = payload.vendor;
  if (payload.model) headers["x-ai-model"] = payload.model;
  if (typeof payload.thinking === "boolean") headers["x-ai-thinking"] = payload.thinking ? "1" : "0";
  if (payload.systemPrompt) headers["x-ai-system-prompt-b64"] = toBase64(payload.systemPrompt);
  if (payload.userPrompt) headers["x-ai-user-prompt-b64"] = toBase64(payload.userPrompt);
  const res = await fetch(`/api/widgets/food-check`, {
    method: "POST",
    headers,
    body: payload.blob,
    signal: opts?.signal
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    const rid = typeof data?.requestId === "string" && data.requestId ? ` (request_id: ${data.requestId})` : "";
    throw new Error(typeof data?.error === "string" ? `${data.error}${rid}` : `HTTP ${res.status}${rid}`);
  }
  if (!data || typeof data !== "object") throw new Error("bad response");
  return data as FoodCheckResponse;
}

export async function uploadFoodImage(payload: { blob: Blob }, opts?: { signal?: AbortSignal }): Promise<{ id: string; urlPath: string }> {
  const res = await fetch(`/api/uploads/image`, {
    method: "POST",
    headers: { "content-type": payload.blob.type || "image/jpeg" },
    body: payload.blob,
    signal: opts?.signal
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
  if (!data || typeof data !== "object") throw new Error("bad response");
  return { id: String(data.id ?? ""), urlPath: String(data.urlPath ?? "") };
}

export async function checkFoodByImageUrl(
  payload: { imageUrl: string; vendor?: "zhipu" | "aliyun"; model?: string; thinking?: boolean; systemPrompt?: string; userPrompt?: string },
  opts?: { signal?: AbortSignal }
): Promise<FoodCheckResponse> {
  const res = await fetch(`/api/widgets/food-check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: opts?.signal
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    const rid = typeof data?.requestId === "string" && data.requestId ? ` (request_id: ${data.requestId})` : "";
    throw new Error(typeof data?.error === "string" ? `${data.error}${rid}` : `HTTP ${res.status}${rid}`);
  }
  if (!data || typeof data !== "object") throw new Error("bad response");
  return data as FoodCheckResponse;
}

export async function postClientLog(payload: { event: string; level?: "info" | "warn" | "error"; data?: any }): Promise<void> {
  try {
    await fetch("/api/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch {}
}
