import { MovementEvent } from "./domain/movement";
import { PregnancyInfo } from "./domain/pregnancy";

export type RemoteState = {
  pregnancyInfo: PregnancyInfo;
  events: MovementEvent[];
  updatedAt: number;
  bubbleSpeed: number;
  themeMode: "dark" | "light";
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
