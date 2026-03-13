export type WeightRecord = {
  date: string;
  weightKg: number;
  updatedAt: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(input: unknown): input is string {
  if (typeof input !== "string" || !DATE_RE.test(input)) return false;
  const ts = new Date(`${input}T00:00:00`).getTime();
  return Number.isFinite(ts);
}

export function normalizeWeightKg(input: unknown): number | null {
  const raw = typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : NaN;
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw * 10) / 10;
  if (rounded < 20 || rounded > 300) return null;
  return rounded;
}

export function normalizeWeightRecords(input: unknown, maxRecords = 730): WeightRecord[] {
  if (!Array.isArray(input)) return [];
  const deduped = new Map<string, WeightRecord>();
  for (const item of input) {
    const date = isValidDateKey((item as any)?.date) ? (item as any).date : "";
    const weightKg = normalizeWeightKg((item as any)?.weightKg);
    if (!date || weightKg == null) continue;
    const updatedAt = typeof (item as any)?.updatedAt === "number" && Number.isFinite((item as any).updatedAt) ? (item as any).updatedAt : 0;
    const prev = deduped.get(date);
    if (!prev || updatedAt >= prev.updatedAt) {
      deduped.set(date, { date, weightKg, updatedAt });
    }
  }
  return [...deduped.values()]
    .sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : b.date.localeCompare(a.date)))
    .slice(0, maxRecords);
}

export function upsertWeightRecord(records: WeightRecord[], date: string, weightKg: number, updatedAt = Date.now()): WeightRecord[] {
  const normalizedWeight = normalizeWeightKg(weightKg);
  if (!isValidDateKey(date) || normalizedWeight == null) return normalizeWeightRecords(records);
  const filtered = records.filter((item) => item.date !== date);
  return normalizeWeightRecords([{ date, weightKg: normalizedWeight, updatedAt }, ...filtered]);
}

export function deleteWeightRecord(records: WeightRecord[], date: string): WeightRecord[] {
  if (!isValidDateKey(date)) return normalizeWeightRecords(records);
  return normalizeWeightRecords(records.filter((item) => item.date !== date));
}

export function getLatestWeightRecord(records: WeightRecord[]): WeightRecord | null {
  return normalizeWeightRecords(records, 1)[0] ?? null;
}

export function getPreviousWeightRecord(records: WeightRecord[], date: string): WeightRecord | null {
  const normalized = normalizeWeightRecords(records);
  const idx = normalized.findIndex((item) => item.date === date);
  if (idx < 0) return normalized[1] ?? null;
  return normalized[idx + 1] ?? null;
}

export function formatWeightKg(weightKg: number) {
  return `${weightKg.toFixed(1)} kg`;
}
