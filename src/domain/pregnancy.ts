export type PregnancyInfo = {
  lmpDate: string;
  babyName?: string;
};

export type PregnancyComputed = {
  weeks: number;
  daysRemainder: number;
  totalDays: number;
  progressPct: number;
  stage: "孕早期" | "孕中期" | "孕晚期";
};

export function computePregnancy(info: PregnancyInfo, now = new Date()): PregnancyComputed {
  const lmp = new Date(`${info.lmpDate}T00:00:00`);
  const ms = Math.max(0, now.getTime() - lmp.getTime());
  const totalDays = Math.floor(ms / 86_400_000);
  const weeks = Math.floor(totalDays / 7);
  const daysRemainder = totalDays % 7;
  const progressPct = Math.max(0, Math.min(100, Math.round((totalDays / 280) * 100)));
  const stage = weeks < 14 ? "孕早期" : weeks < 28 ? "孕中期" : "孕晚期";
  return { weeks, daysRemainder, totalDays, progressPct, stage };
}

export function formatGestation(computed: PregnancyComputed) {
  return `孕${computed.weeks}周+${computed.daysRemainder}天`;
}

export function defaultPregnancyInfo(now = new Date()): PregnancyInfo {
  const totalDays = 24 * 7 + 3;
  const lmp = new Date(now.getTime() - totalDays * 86_400_000);
  const yyyy = lmp.getFullYear();
  const mm = String(lmp.getMonth() + 1).padStart(2, "0");
  const dd = String(lmp.getDate()).padStart(2, "0");
  return { lmpDate: `${yyyy}-${mm}-${dd}`, babyName: "" };
}
