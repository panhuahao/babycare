import { useEffect, useId, useMemo, useRef, useState, type TouchEvent } from "react";
import {
  effectiveCount,
  formatHourLabel,
  groupByHour,
  HourRecord,
  hourStartMs,
  last12HoursEffectiveTotal,
  MovementEvent,
  MovementType,
  newId,
  statusForHour,
  statusTone
} from "./domain/movement";
import { computePregnancy, defaultPregnancyInfo, formatGestation, PregnancyInfo } from "./domain/pregnancy";
import {
  deleteWeightRecord,
  formatWeightKg,
  getLatestWeightRecord,
  getPreviousWeightRecord,
  normalizeWeightKg,
  normalizeWeightRecords,
  upsertWeightRecord,
  WeightRecord
} from "./domain/weight";
import { clearAll, loadState, saveState } from "./storage";
import { navTo, Route, toHash } from "./routes";
import { useHashRoute } from "./useHashRoute";
import { checkFoodByImageUrl, checkFoodByPhotoBinary, uploadFoodImage, DailyMenuMeal, DailyMenuResponse, fetchCngoldPrices, fetchDailyMenu, postClientLog, suggestMenuRecipe } from "./api";
import type { CngoldPriceItem, CngoldPricesResponse } from "./api";
import { getActiveTextModel, TEXT_AI_PROVIDER_CODES, TEXT_AI_PROVIDER_PRESETS } from "./aiProviders";
import type { TextAiProvider, TextAiProviderState } from "./aiProviders";

function Icon({ name }: { name: "calendar" | "bell" | "home" | "chart" | "grid" | "user" | "chev" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (name) {
    case "calendar":
      return (
        <svg {...common}>
          <path
            d="M7 2v3M17 2v3M3.5 9.5h17M6.8 6h10.4c1.6 0 2.4 0 3 .3.6.3 1.1.8 1.4 1.4.4.6.4 1.4.4 3v6.8c0 1.6 0 2.4-.4 3-.3.6-.8 1.1-1.4 1.4-.6.4-1.4.4-3 .4H6.8c-1.6 0-2.4 0-3-.4-.6-.3-1.1-.8-1.4-1.4C2 22.9 2 22.1 2 20.5V13.7c0-1.6 0-2.4.4-3 .3-.6.8-1.1 1.4-1.4C4.4 9 5.2 9 6.8 9Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path
            d="M15 18.5a3 3 0 0 1-6 0M18.5 8.8c0-3.3-2.5-6-5.8-6s-5.8 2.7-5.8 6c0 6-2.2 6.7-2.2 8.3 0 1.1 1 1.9 2.2 1.9h11.6c1.2 0 2.2-.8 2.2-1.9 0-1.6-2.2-2.3-2.2-8.3Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path
            d="M3 10.8 12 3l9 7.8v9.2c0 .9-.7 1.6-1.6 1.6H4.6c-.9 0-1.6-.7-1.6-1.6v-9.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M9 21v-7.2c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6V21" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path
            d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "grid":
      return (
        <svg {...common}>
          <path
            d="M5 5h6v6H5V5Zm8 0h6v6h-6V5ZM5 13h6v6H5v-6Zm8 0h6v6h-6v-6Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <path
            d="M12 12.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M4.8 20.2c1.7-3.1 4.2-4.7 7.2-4.7s5.5 1.6 7.2 4.7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "chev":
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function TopNav({
  title,
  rightActionLabel,
  onRightAction,
  rightActionDisabled = false
}: {
  title: string;
  rightActionLabel?: string;
  onRightAction?: () => void;
  rightActionDisabled?: boolean;
}) {
  const showRightAction = typeof onRightAction === "function" && !!rightActionLabel;
  return (
    <div className="topNav">
      <div className="topNavRow">
        <div className="topTitle">{title}</div>
        <div className="topActions">
          {showRightAction ? (
            <button className="topNavActionBtn" type="button" onClick={onRightAction} disabled={rightActionDisabled}>
              {rightActionLabel}
            </button>
          ) : (
            <div className="topNavActionPlaceholder" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}

export function BottomNav({ route }: { route: Route }) {
  const items: { label: string; icon: any; to: Route }[] = [
    { label: "首页", icon: "home", to: { name: "home" } },
    { label: "统计", icon: "chart", to: { name: "stats" } },
    { label: "小工具", icon: "grid", to: { name: "widgets" } },
    { label: "我的", icon: "user", to: { name: "mine" } }
  ];

  return (
    <div className="bottomNav">
      <div className="bottomNavBar">
        {items.map((it) => {
          const active = route.name === it.to.name;
          return (
            <button
              key={it.label}
              className={`tabBtn ${active ? "tabBtnActive" : ""}`}
              onClick={() => navTo(it.to)}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={it.icon} />
              <div className="tabLabel">{it.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Badge({ status }: { status: "正常" | "偏少" }) {
  const tone = statusTone(status);
  return <div className={`badge ${tone === "good" ? "badgeGood" : "badgeWarn"}`}>{status}</div>;
}

function movementTypeLabel(t: MovementType) {
  switch (t) {
    case "hiccup":
      return "打嗝";
    case "hand":
      return "伸伸手";
    case "kick":
      return "踢踢脚";
  }
}

function formatClock(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function HourRecordRow({
  rec,
  events,
  onOpenDetail
}: {
  rec: HourRecord;
  events: MovementEvent[];
  onOpenDetail?: () => void;
}) {
  const status = statusForHour(rec.effectiveCount);
  const show = events.length > 6 ? events.slice(events.length - 6) : events;
  const more = Math.max(0, events.length - show.length);
  return (
    <div className="card">
      <div className="cardInner">
        <div className="recordRow">
          <div className="recordLeft">
            <div className="recordTitle">胎动 {rec.effectiveCount} 次</div>
            <div className="recordSub">
              {formatHourLabel(rec.hourStart)} · 点击 {rec.rawClicks} 次
            </div>
          </div>
          <Badge status={status} />
        </div>
        {events.length ? (
          <div className="eventChips" aria-label="点击明细">
            {show.map((e) => (
              <div key={e.id} className="eventChip">
                <span className="eventTime">{formatClock(e.ts)}</span>
                <span className="eventType">{movementTypeLabel(e.type)}</span>
              </div>
            ))}
            {more ? (
              <button className="eventChip eventMore eventMoreBtn" onClick={onOpenDetail} type="button">
                +{more}
              </button>
            ) : null}
          </div>
        ) : null}
        {events.length && onOpenDetail ? (
          <button className="linkBtn" onClick={onOpenDetail} type="button">
            查看明细 <strong>›</strong>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function DetailSheet({
  open,
  title,
  events,
  onClose
}: {
  open: boolean;
  title: string;
  events: MovementEvent[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="sheetOverlay" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheetHeader">
          <div className="sheetHeaderTitle">{title} 明细</div>
          <button className="iconBtn" onClick={onClose} aria-label="关闭">
            <Icon name="chev" />
          </button>
        </div>
        <div className="detailList">
          {events.length ? (
            events.map((e) => (
              <div key={e.id} className="detailRow">
                <div className="detailTime">{formatClock(e.ts)}</div>
                <div className="detailType">{movementTypeLabel(e.type)}</div>
              </div>
            ))
          ) : (
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.6, padding: 14 }}>
              暂无明细。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DayDrawer({
  open,
  tall,
  dayKey,
  totalEffective,
  totalClicks,
  ok,
  events,
  onClose,
  onToggleTall,
  onAdd,
  onOpenHour
}: {
  open: boolean;
  tall: boolean;
  dayKey: string;
  totalEffective: number;
  totalClicks: number;
  ok: boolean;
  events: MovementEvent[];
  onClose: () => void;
  onToggleTall: () => void;
  onAdd: (t: MovementType) => void;
  onOpenHour: (hourStart: number) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const eventsByHour = useMemo(() => {
    const map = new Map<number, MovementEvent[]>();
    for (const e of events) {
      const h = hourStartMs(e.ts);
      const list = map.get(h) ?? [];
      list.push(e);
      map.set(h, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => a.ts - b.ts);
      map.set(k, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [events]);
  if (!open) return null;
  return (
    <div className="sheetOverlay" onClick={onClose} role="presentation">
      <div className={`drawer${tall ? " drawerTall" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="drawerHandle" onClick={onToggleTall} role="button" tabIndex={0} />
        <div className="drawerHeader">
          <div>
            <div className="drawerTitle">{dayKey}</div>
            <div className="drawerSub">
              总胎动 {totalEffective} 次 · 点击 {totalClicks} 次 · {ok ? "达标" : "未达标"}
            </div>
          </div>
          <button className="iconBtn" onClick={onClose} aria-label="关闭">
            <Icon name="chev" />
          </button>
        </div>

        <div className="drawerBody">
          {events.length ? (
            <div className="list">
              {eventsByHour.map(([h, list]) => (
                <HourRecordRow
                  key={h}
                  rec={{ hourStart: h, rawClicks: list.length, effectiveCount: effectiveCount(list) }}
                  events={list}
                  onOpenDetail={() => onOpenHour(h)}
                />
              ))}
            </div>
          ) : (
            <div className="emptyBox">
              <div className="emptyIcon">📅</div>
              <div className="emptyTitle">当天暂无记录</div>
              <div className="emptySub">点击右下角“新增记录”即可录入。</div>
            </div>
          )}
        </div>

        <button type="button" className="fab" onClick={() => setAddOpen(true)} aria-label="新增记录">
          新增记录
        </button>

        {addOpen ? (
          <div className="sheetOverlay" onClick={() => setAddOpen(false)} role="presentation">
            <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="sheetHeader">
                <div className="sheetHeaderTitle">快速录入</div>
                <button className="iconBtn" onClick={() => setAddOpen(false)} aria-label="关闭">
                  <Icon name="chev" />
                </button>
              </div>
              <div className="sheetActions">
                <button
                  className="pickBtn pickBtnPrimary"
                  type="button"
                  onClick={() => {
                    onAdd("hiccup");
                    setAddOpen(false);
                  }}
                >
                  <div>
                    <div className="actionTitle">打嗝</div>
                    <div className="actionSub">轻微、规律的小颤动</div>
                  </div>
                </button>
                <button
                  className="pickBtn"
                  type="button"
                  onClick={() => {
                    onAdd("hand");
                    setAddOpen(false);
                  }}
                >
                  <div>
                    <div className="actionTitle">伸伸手</div>
                    <div className="actionSub">轻柔的推顶或滑动感</div>
                  </div>
                </button>
                <button
                  className="pickBtn"
                  type="button"
                  onClick={() => {
                    onAdd("kick");
                    setAddOpen(false);
                  }}
                >
                  <div>
                    <div className="actionTitle">踢踢脚</div>
                    <div className="actionSub">较明显的踢动或翻滚</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HomePage({
  pregnancy,
  weights,
  records,
  eventsByHour,
  currentHourEffective,
  currentHourClicks,
  bubbleSpeed,
  onQuickAdd,
  onOpenDetail,
  onUpsertWeight,
  onRefresh
}: {
  pregnancy: ReturnType<typeof computePregnancy>;
  weights: WeightRecord[];
  records: HourRecord[];
  eventsByHour: Map<number, MovementEvent[]>;
  currentHourEffective: number;
  currentHourClicks: number;
  bubbleSpeed: number;
  onQuickAdd: (t: MovementType) => void;
  onOpenDetail: (hourStart: number) => void;
  onUpsertWeight: (date: string, weightKg: number) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const top3 = records.filter((r) => r.effectiveCount > 0).slice(0, 3);
  const latestWeight = useMemo(() => getLatestWeightRecord(weights), [weights]);
  const todayKey = formatDateKey(new Date());
  const todayWeight = useMemo(() => weights.find((item) => item.date === todayKey) ?? null, [weights, todayKey]);
  const weightTrendSeries = useMemo(() => [...normalizeWeightRecords(weights)].reverse().slice(-7), [weights]);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const bubbleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const animRef = useRef<number | null>(null);
  const seedRef = useRef(20260301);
  const speedRef = useRef(bubbleSpeed);
  const speedPrevRef = useRef(bubbleSpeed);
  const [refreshing, setRefreshing] = useState(false);
  const [weightInput, setWeightInput] = useState(() =>
    todayWeight ? String(todayWeight.weightKg) : latestWeight ? String(latestWeight.weightKg) : ""
  );
  const [activeWeightDate, setActiveWeightDate] = useState<string | null>(null);
  const refreshBusyRef = useRef(false);
  const pullStartYRef = useRef<number | null>(null);
  const pullEnabledRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const simRef = useRef<{
    w: number;
    h: number;
    lastTs: number;
    items: Array<{ x: number; y: number; vx: number; vy: number; r: number }>;
  } | null>(null);

  const bubbles: Array<{ type: MovementType; title: string; sub: string; size: number; accent: number; glow: number }> = [
    { type: "hiccup", title: "打嗝", sub: "轻微规律", size: 92, accent: 0.1, glow: 0.52 },
    { type: "hand", title: "伸伸手", sub: "轻柔推顶", size: 84, accent: 0.16, glow: 0.62 },
    { type: "kick", title: "踢踢脚", sub: "明显翻滚", size: 98, accent: 0.24, glow: 0.78 }
  ];

  function rand() {
    seedRef.current = (seedRef.current * 1664525 + 1013904223) >>> 0;
    return seedRef.current / 0xffffffff;
  }

  const pullThreshold = 46;
  const pullMax = 92;

  function onPageTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (refreshing) return;
    const y = e.touches?.[0]?.clientY;
    if (typeof y !== "number") return;
    pullStartYRef.current = y;
    pullEnabledRef.current = (pageRef.current?.scrollTop ?? 0) <= 0;
    pullDistanceRef.current = 0;
  }

  function onPageTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (refreshing) return;
    if (!pullEnabledRef.current) return;
    const startY = pullStartYRef.current;
    const currentY = e.touches?.[0]?.clientY;
    if (typeof startY !== "number" || typeof currentY !== "number") return;
    if ((pageRef.current?.scrollTop ?? 0) > 0) {
      pullEnabledRef.current = false;
      return;
    }
    const dy = currentY - startY;
    if (dy <= 0) {
      pullDistanceRef.current = 0;
      return;
    }
    pullDistanceRef.current = Math.min(pullMax, dy * 0.55);
  }

  async function triggerRefresh() {
    if (refreshBusyRef.current) return;
    refreshBusyRef.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      refreshBusyRef.current = false;
      pullDistanceRef.current = 0;
      setRefreshing(false);
    }
  }

  function onPageTouchEnd() {
    if (refreshBusyRef.current) return;
    const canPull = pullEnabledRef.current;
    pullEnabledRef.current = false;
    pullStartYRef.current = null;
    if (!canPull) return;
    const currentPull = pullDistanceRef.current;
    if (currentPull >= pullThreshold) {
      void triggerRefresh();
      return;
    }
    pullDistanceRef.current = 0;
  }

  useEffect(() => {
    const prev = speedPrevRef.current;
    speedPrevRef.current = bubbleSpeed;
    speedRef.current = bubbleSpeed;
    const sim = simRef.current;
    if (sim && Number.isFinite(prev) && prev > 0) {
      const ratio = bubbleSpeed / prev;
      if (Number.isFinite(ratio) && ratio > 0) {
        for (const it of sim.items) {
          it.vx *= ratio;
          it.vy *= ratio;
        }
      }
    }
  }, [bubbleSpeed]);

  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;

    const init = () => {
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const items = bubbles.map((b, i) => {
        const r = b.size / 2;
        const pad = 6;
        const x = pad + rand() * Math.max(1, w - pad * 2 - b.size);
        const y = pad + rand() * Math.max(1, h - pad * 2 - b.size);
        const base = 0.03 + rand() * 0.02;
        const ang = rand() * Math.PI * 2;
        const vx = Math.cos(ang) * base * (1 + i * 0.08);
        const vy = Math.sin(ang) * base * (1 + i * 0.08);
        return { x, y, vx, vy, r };
      });
      simRef.current = { w, h, lastTs: performance.now(), items };
    };

    init();

    const tick = (ts: number) => {
      const sim = simRef.current;
      if (!sim) return;
      const dt = Math.min(40, Math.max(8, ts - sim.lastTs));
      sim.lastTs = ts;
      const speed = speedRef.current;

      for (let i = 0; i < sim.items.length; i++) {
        const it = sim.items[i];
        const jitter = 0.0003 * speed;
        it.vx += (rand() - 0.5) * jitter * dt;
        it.vy += (rand() - 0.5) * jitter * dt;

        const maxV = 0.08;
        it.vx = Math.max(-maxV, Math.min(maxV, it.vx));
        it.vy = Math.max(-maxV, Math.min(maxV, it.vy));

        it.x += it.vx * dt * speed;
        it.y += it.vy * dt * speed;

        const minX = 6;
        const minY = 6;
        const maxX = Math.max(minX, sim.w - 6 - it.r * 2);
        const maxY = Math.max(minY, sim.h - 6 - it.r * 2);
        if (it.x <= minX) {
          it.x = minX;
          it.vx = Math.abs(it.vx) * 0.92;
        } else if (it.x >= maxX) {
          it.x = maxX;
          it.vx = -Math.abs(it.vx) * 0.92;
        }
        if (it.y <= minY) {
          it.y = minY;
          it.vy = Math.abs(it.vy) * 0.92;
        } else if (it.y >= maxY) {
          it.y = maxY;
          it.vy = -Math.abs(it.vy) * 0.92;
        }
      }

      for (let i = 0; i < sim.items.length; i++) {
        for (let j = i + 1; j < sim.items.length; j++) {
          const a = sim.items[i];
          const b = sim.items[j];
          const ax = a.x + a.r;
          const ay = a.y + a.r;
          const bx = b.x + b.r;
          const by = b.y + b.r;
          const dx = bx - ax;
          const dy = by - ay;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.r + b.r + 6;
          if (dist < minDist) {
            const push = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            const kick = 0.0012 * speed;
            a.vx -= nx * kick;
            a.vy -= ny * kick;
            b.vx += nx * kick;
            b.vy += ny * kick;
          }
        }
      }

      for (let i = 0; i < sim.items.length; i++) {
        const node = bubbleRefs.current[i];
        if (!node) continue;
        const it = sim.items[i];
        node.style.transform = `translate3d(${it.x}px, ${it.y}px, 0)`;
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);

    let ro: ResizeObserver | null = null;
    const RO = (window as any).ResizeObserver as typeof ResizeObserver | undefined;
    if (RO) {
      ro = new RO(() => init());
      ro.observe(el);
    } else {
      const onResize = () => init();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    setWeightInput(todayWeight ? String(todayWeight.weightKg) : latestWeight ? String(latestWeight.weightKg) : "");
  }, [todayWeight?.date, todayWeight?.weightKg, latestWeight?.date, latestWeight?.weightKg]);

  useEffect(() => {
    setActiveWeightDate((prev) => (prev && weightTrendSeries.some((item) => item.date === prev) ? prev : weightTrendSeries[weightTrendSeries.length - 1]?.date ?? null));
  }, [weightTrendSeries]);

  const weightValue = normalizeWeightKg(weightInput);
  const activeWeight = useMemo(
    () => weightTrendSeries.find((item) => item.date === activeWeightDate) ?? latestWeight,
    [activeWeightDate, latestWeight, weightTrendSeries]
  );
  const activePreviousWeight = useMemo(
    () => (activeWeight ? getPreviousWeightRecord(weights, activeWeight.date) : null),
    [activeWeight, weights]
  );
  const activeWeightDelta =
    activeWeight && activePreviousWeight ? Math.round((activeWeight.weightKg - activePreviousWeight.weightKg) * 10) / 10 : null;
  const activeWeightDeltaText =
    activeWeightDelta == null
      ? "暂无对比数据"
      : activeWeightDelta === 0
        ? "较上次持平"
        : `较上次${activeWeightDelta > 0 ? "+" : ""}${activeWeightDelta.toFixed(1)} kg`;
  const weightHeroLabel = activeWeight && latestWeight && activeWeight.date !== latestWeight.date ? "选中体重" : "最近体重";

  function commitTodayWeight() {
    if (weightValue == null) {
      setWeightInput(todayWeight ? String(todayWeight.weightKg) : latestWeight ? String(latestWeight.weightKg) : "");
      return;
    }
    if (todayWeight && todayWeight.weightKg === weightValue) return;
    onUpsertWeight(todayKey, weightValue);
  }

  return (
    <div className="page" ref={pageRef} onTouchStart={onPageTouchStart} onTouchMove={onPageTouchMove} onTouchEnd={onPageTouchEnd} onTouchCancel={onPageTouchEnd}>
      <div className="card weightCard">
        <div className="cardInner">
          <div className="weightCardEdge" aria-hidden="true">
            <div className="weightCardEdgeFill" style={{ width: `${pregnancy.progressPct}%` }} />
          </div>

          <div className="weightHeroRow">
            <div className="weightHeroMain">
              <div className="recordSub">{weightHeroLabel}</div>
              <div className="weightHeroInline">
                <div className="weightHeroValue">
                  {activeWeight ? activeWeight.weightKg.toFixed(1) : "--"}
                  <span>kg</span>
                </div>
                <div className="weightHeroActions">
                  <label className="weightQuickInline">
                    <span className="weightQuickInlineLabel">{todayWeight ? "今日已记" : "今日输入"}</span>
                    <input
                      className="input weightInput weightInputCompact weightInputInline"
                      inputMode="decimal"
                      placeholder={latestWeight ? latestWeight.weightKg.toFixed(1) : "58.6"}
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      onBlur={commitTodayWeight}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        (e.currentTarget as HTMLInputElement).blur();
                      }}
                      aria-label="今天体重"
                    />
                  </label>
                  <div className="weightHeroSide">
                    <div className="pill weightGestationPill">
                      <strong>{formatGestation(pregnancy)}</strong>
                      <span className="muted">·</span>
                      <span>{pregnancy.stage}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="weightHeroMeta">
                {activeWeight ? `${activeWeight.date} · ${activeWeightDeltaText}` : "还没有体重记录，先记录今天的体重吧"}
              </div>
            </div>
          </div>

          <div className="weightBottomRow">
            <div className="weightTrendPanel">
              <WeightTrendChart
                records={weights}
                maxPoints={7}
                height={68}
                minVisualRangeKg={0.9}
                visualPaddingKg={0.12}
                activeDate={activeWeight?.date ?? null}
                onSelectDate={setActiveWeightDate}
              />
            </div>
          </div>
        </div>
      </div>

          <div className="currentHourCount" aria-label="本小时统计">
            <div className="countLabel">本小时</div>
            <div className="countRow">
              <div className="countMain">
                <div className="countValue">{currentHourEffective}</div>
                <div className="countUnit">有效胎动</div>
              </div>
              <div className="countSide">
                <div className="countSideValue">{currentHourClicks}</div>
                <div className="countSideLabel">点击</div>
              </div>
            </div>
          </div>

      <div className="floatArenaWrap">
        <div className="floatArena" ref={arenaRef} aria-label="胎动快速记录">
          {bubbles.map((b, idx) => (
            <button
              key={b.type}
              ref={(n) => {
                bubbleRefs.current[idx] = n;
              }}
              type="button"
              className="floatBubble"
              style={{
                ["--bubble-size" as any]: `${b.size}px`,
                ["--bubble-accent" as any]: String(b.accent),
                ["--bubble-glow" as any]: String(b.glow)
              }}
              onClick={() => onQuickAdd(b.type)}
              aria-label={`记录：${b.title}`}
            >
              <div className="floatBubbleGlow" aria-hidden="true" />
              <div className="floatBubbleInner">
                <div className="floatBubbleTitle">{b.title}</div>
                <div className="floatBubbleSub">{b.sub}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 10 }}>
          点击任意气泡即可记录一次胎动
        </div>
      </div>

      <div className="sectionTitle">
        <h2>最近记录（按小时聚合）</h2>
        <a className="link" href={toHash({ name: "stats" })}>
          查看全部 <strong>›</strong>
        </a>
      </div>
      <div className="list">
        {top3.length ? (
          top3.map((r) => (
            <HourRecordRow
              key={r.hourStart}
              rec={r}
              events={eventsByHour.get(r.hourStart) ?? []}
              onOpenDetail={() => onOpenDetail(r.hourStart)}
            />
          ))
        ) : (
          <div className="card">
            <div className="cardInner">
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                暂无记录。点击上方三个按钮即可快速记录。
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function formatDateKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDayMs(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function strengthLabelFromType(t: MovementType) {
  switch (t) {
    case "hiccup":
      return "轻";
    case "hand":
      return "中";
    case "kick":
      return "强";
  }
}

function formatHourOnly(hourStart: number) {
  const d = new Date(hourStart);
  const hh = String(d.getHours()).padStart(2, "0");
  return `${hh}:00`;
}

function formatShortDateLabel(dateKey: string) {
  return dateKey.slice(5).replace("-", "/");
}

function parseDateKeyToMs(dateKey: string) {
  const ts = new Date(`${dateKey}T00:00:00`).getTime();
  return Number.isFinite(ts) ? ts : Date.now();
}

function formatMonthTitle(dayMs: number) {
  const d = new Date(dayMs);
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月`;
}

function formatWeekRangeTitle(days: number[]) {
  if (!days.length) return "";
  const startKey = formatDateKey(new Date(days[0]));
  const endKey = formatDateKey(new Date(days[days.length - 1]));
  return `${formatShortDateLabel(startKey)} - ${formatShortDateLabel(endKey)}`;
}

function buildSmoothTrendPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    // Catmull-Rom -> cubic Bezier so the curve stays smooth and still passes through every point.
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return path;
}

function WeightTrendChart({
  records,
  activeDate,
  onSelectDate,
  maxPoints = 7,
  height = 96,
  minVisualRangeKg = 1.8,
  visualPaddingKg = 0.35
}: {
  records: WeightRecord[];
  activeDate: string | null;
  onSelectDate: (date: string) => void;
  maxPoints?: number;
  height?: number;
  minVisualRangeKg?: number;
  visualPaddingKg?: number;
}) {
  const series = useMemo(() => [...normalizeWeightRecords(records)].reverse().slice(-maxPoints), [records, maxPoints]);
  const chartId = useId().replace(/:/g, "");

  if (!series.length) {
    return (
      <div className="weightTrendEmpty">
        <div className="muted" style={{ fontSize: 12 }}>暂无体重趋势，记录后会显示曲线。</div>
      </div>
    );
  }

  const width = 100;
  const padX = 7;
  const padTop = 7;
  const padBottom = 8;
  const values = series.map((item) => item.weightKg);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = rawMax - rawMin;
  const mid = (rawMin + rawMax) / 2;
  const visualRange = Math.max(minVisualRangeKg, spread + visualPaddingKg * 2);
  const min = mid - visualRange / 2;
  const max = mid + visualRange / 2;
  const usableWidth = width - padX * 2;
  const usableHeight = height - padTop - padBottom;
  const visualBandRatio = 0.8;
  const visualBandOffset = 0.06;
  const stepX = series.length > 1 ? usableWidth / (series.length - 1) : 0;
  const points = series.map((item, idx) => {
    const normalizedRatio = max === min ? 0.5 : (item.weightKg - min) / (max - min);
    const ratio = visualBandOffset + normalizedRatio * visualBandRatio;
    const x = series.length > 1 ? padX + stepX * idx : width / 2;
    const y = height - padBottom - ratio * usableHeight;
    return { ...item, x, y };
  });
  const activePoint = points.find((item) => item.date === activeDate) ?? points[points.length - 1];
  const guides = [0.2, 0.48, 0.76].map((ratio) => padTop + usableHeight * ratio);
  const linePath = buildSmoothTrendPath(points);
  const areaPath =
    points.length === 1
      ? `M ${points[0].x} ${points[0].y} L ${points[0].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`
      : `${linePath} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`;

  return (
    <div className="weightTrendChart">
      <div className="weightTrendInfo">
        <div className="weightTrendInfoLabel">{`近${series.length}次 · 波动 ${spread.toFixed(1)} kg`}</div>
      </div>

      <div className="weightTrendCanvas">
        <svg
          className="weightTrendSvg"
          style={{ height }}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-label="体重趋势图"
        >
          <defs>
            <linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255, 163, 191, 0.26)" />
              <stop offset="100%" stopColor="rgba(255, 163, 191, 0.02)" />
            </linearGradient>
            <linearGradient id={`${chartId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255, 196, 216, 0.9)" />
              <stop offset="100%" stopColor="rgba(255, 122, 168, 1)" />
            </linearGradient>
          </defs>

          {guides.map((y) => (
            <path key={y} d={`M ${padX} ${y} H ${width - padX}`} className="weightTrendGuide" />
          ))}
          <path d={areaPath} className="weightLineArea" fill={`url(#${chartId}-area)`} />
          <path d={linePath} className="weightTrendPath" stroke={`url(#${chartId}-line)`} />
          <path d={`M ${activePoint.x} ${padTop - 2} V ${height - padBottom + 2}`} className="weightTrendActiveGuide" />
          {points.map((item) => {
            const isActive = item.date === activePoint.date;
            return (
              <g key={item.date}>
                {isActive ? <circle cx={item.x} cy={item.y} r={3.9} className="weightTrendPulse" /> : null}
                <circle cx={item.x} cy={item.y} r={isActive ? 2.2 : 1.5} className={`weightTrendDot ${isActive ? "weightTrendDotActive" : ""}`} />
                <circle
                  cx={item.x}
                  cy={item.y}
                  r={8}
                  fill="transparent"
                  className="weightTrendHit"
                  tabIndex={0}
                  aria-label={`${item.date}，${item.weightKg.toFixed(1)} 公斤`}
                  onMouseEnter={() => onSelectDate(item.date)}
                  onFocus={() => onSelectDate(item.date)}
                  onClick={() => onSelectDate(item.date)}
                  onTouchStart={() => onSelectDate(item.date)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onSelectDate(item.date);
                  }}
                />
              </g>
            );
          })}
        </svg>

        <div className="weightTrendRange" aria-hidden="true">
          <span>{formatShortDateLabel(points[0].date)}</span>
          <span>{formatShortDateLabel(points[points.length - 1].date)}</span>
        </div>
      </div>
    </div>
  );
}

function WeightScrollableLineChart({
  records,
  activeDate,
  onSelectDate,
  height = 168,
  minVisualRangeKg = 2.0,
  visualPaddingKg = 0.35
}: {
  records: WeightRecord[];
  activeDate: string | null;
  onSelectDate: (date: string) => void;
  height?: number;
  minVisualRangeKg?: number;
  visualPaddingKg?: number;
}) {
  const series = useMemo(() => [...normalizeWeightRecords(records)].reverse(), [records]);
  const chartId = useId().replace(/:/g, "");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const width = Math.max(320, 34 + Math.max(0, series.length - 1) * 38);
  const padX = 18;
  const padTop = 18;
  const padBottom = 28;
  const usableHeight = height - padTop - padBottom;

  const points = useMemo(() => {
    if (!series.length) return [] as Array<WeightRecord & { x: number; y: number }>;
    const values = series.map((item) => item.weightKg);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const spread = rawMax - rawMin;
    const mid = (rawMin + rawMax) / 2;
    const visualRange = Math.max(minVisualRangeKg, spread + visualPaddingKg * 2);
    const min = mid - visualRange / 2;
    const max = mid + visualRange / 2;
    const visualBandRatio = 0.56;
    const visualBandOffset = 0.2;
    return series.map((item, idx) => {
      const normalizedRatio = max === min ? 0.5 : (item.weightKg - min) / (max - min);
      const ratio = visualBandOffset + normalizedRatio * visualBandRatio;
      const x = padX + idx * 38;
      const y = height - padBottom - ratio * usableHeight;
      return { ...item, x, y };
    });
  }, [height, minVisualRangeKg, series, usableHeight, visualPaddingKg]);
  const activePoint = points.find((item) => item.date === activeDate) ?? points[points.length - 1] ?? null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !points.length || !activePoint) return;
    const idx = points.findIndex((item) => item.date === activePoint.date);
    if (idx < 0) return;
    const focusX = points[idx].x;
    const target = Math.max(0, focusX - el.clientWidth * 0.5);
    el.scrollTo({ left: target, behavior: "smooth" });
  }, [activePoint?.date, points]);

  if (!series.length || !activePoint) {
    return (
      <div className="weightTrendEmpty">
        <div className="muted" style={{ fontSize: 12 }}>还没有体重记录，先从今天开始记一条吧。</div>
      </div>
    );
  }

  const linePath = points.map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`;
  const guides = [0.22, 0.48, 0.74].map((ratio) => padTop + usableHeight * ratio);
  const labelStep = Math.max(1, Math.ceil(points.length / 5));

  return (
    <div className="weightLineCard">
      <div className="weightLineHead">
        <div className="weightLineSummary">
          <div className="weightLineLabel">{`共 ${series.length} 条记录`}</div>
          <div className="weightLineValue">
            <span>{formatShortDateLabel(activePoint.date)}</span>
            <strong>{activePoint.weightKg.toFixed(1)} kg</strong>
          </div>
        </div>
        <div className="weightLineHint">左右滑动查看趋势</div>
      </div>

      <div className="weightLineScroll" ref={scrollRef}>
        <svg className="weightLineSvg" style={{ width, height }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="体重折线图">
          <defs>
            <linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255, 163, 191, 0.28)" />
              <stop offset="100%" stopColor="rgba(255, 163, 191, 0.02)" />
            </linearGradient>
            <linearGradient id={`${chartId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255, 188, 210, 0.82)" />
              <stop offset="100%" stopColor="rgba(255, 122, 168, 0.98)" />
            </linearGradient>
          </defs>

          {guides.map((y) => (
            <path key={y} d={`M ${padX - 6} ${y} H ${width - padX + 6}`} className="weightLineGuide" />
          ))}
          <path d={areaPath} className="weightLineArea" fill={`url(#${chartId}-area)`} />
          <path d={linePath} className="weightLinePath" stroke={`url(#${chartId}-line)`} />
          <path d={`M ${activePoint.x} ${padTop - 4} V ${height - padBottom + 4}`} className="weightLineActiveGuide" />

          {points.map((point, idx) => {
            const isActive = point.date === activePoint.date;
            const showLabel = idx % labelStep === 0 || idx === points.length - 1;
            return (
              <g key={point.date}>
                <circle cx={point.x} cy={point.y} r={isActive ? 4.2 : 3.1} className={`weightLineDot ${isActive ? "weightLineDotActive" : ""}`} />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={14}
                  fill="transparent"
                  className="weightLineHit"
                  tabIndex={0}
                  onClick={() => onSelectDate(point.date)}
                  onFocus={() => onSelectDate(point.date)}
                  onTouchStart={() => onSelectDate(point.date)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onSelectDate(point.date);
                  }}
                />
                {showLabel ? (
                  <text x={point.x} y={height - 9} textAnchor="middle" className="weightLineTick">
                    {formatShortDateLabel(point.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function WeightRecordManager({
  weights,
  onUpsertWeight,
  onDeleteWeight
}: {
  weights: WeightRecord[];
  onUpsertWeight: (date: string, weightKg: number) => void;
  onDeleteWeight: (date: string) => void;
}) {
  const normalizedWeights = useMemo(() => normalizeWeightRecords(weights), [weights]);
  const latestWeight = normalizedWeights[0] ?? null;
  const todayKey = formatDateKey(new Date());
  const [draftDate, setDraftDate] = useState(todayKey);
  const [draftWeight, setDraftWeight] = useState("");
  const [calendarCursor, setCalendarCursor] = useState(() => startOfDayMs(Date.now()));
  const weekTouchStartXRef = useRef<number | null>(null);
  const weekTouchStartYRef = useRef<number | null>(null);
  const weightMap = useMemo(() => new Map(normalizedWeights.map((item) => [item.date, item])), [normalizedWeights]);
  const existingDraft = weightMap.get(draftDate) ?? null;
  const draftValue = normalizeWeightKg(draftWeight);
  const weekDays = useMemo(() => {
    const d = new Date(calendarCursor);
    const day = (d.getDay() + 6) % 7;
    const start = calendarCursor - day * 86_400_000;
    return Array.from({ length: 7 }, (_, i) => start + i * 86_400_000);
  }, [calendarCursor]);

  useEffect(() => {
    setDraftWeight(existingDraft ? String(existingDraft.weightKg) : "");
  }, [draftDate, existingDraft?.date, existingDraft?.weightKg]);

  function syncDraftDate(date: string) {
    setDraftDate(date);
    setCalendarCursor(startOfDayMs(parseDateKeyToMs(date)));
  }

  function resetDraft() {
    syncDraftDate(todayKey);
  }

  function shiftWeek(offset: number) {
    setCalendarCursor((v) => v + offset * 7 * 86_400_000);
  }

  function onWeekTouchStart(e: TouchEvent<HTMLDivElement>) {
    const touch = e.touches[0];
    if (!touch) return;
    weekTouchStartXRef.current = touch.clientX;
    weekTouchStartYRef.current = touch.clientY;
  }

  function onWeekTouchEnd(e: TouchEvent<HTMLDivElement>) {
    const touch = e.changedTouches[0];
    const startX = weekTouchStartXRef.current;
    const startY = weekTouchStartYRef.current;
    weekTouchStartXRef.current = null;
    weekTouchStartYRef.current = null;
    if (!touch || startX == null || startY == null) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    shiftWeek(deltaX > 0 ? -1 : 1);
  }

  return (
    <div className="card">
      <div className="cardInner">
        <div className="recordRow">
          <div>
            <div className="recordTitle">体重统计</div>
            <div className="recordSub">折线趋势 + 单周日历，点击日期即可查看和修改体重</div>
          </div>
          <div className="pill">
            <strong>{weights.length}</strong>
            <span className="muted">条</span>
          </div>
        </div>

        <div style={{ height: 12 }} />
        <WeightScrollableLineChart
          records={normalizedWeights}
          activeDate={existingDraft?.date ?? latestWeight?.date ?? null}
          onSelectDate={syncDraftDate}
          height={168}
          minVisualRangeKg={2.2}
          visualPaddingKg={0.4}
        />

        <div className="weightComposerCard">
          <div className="formRow">
            <div className="label">日期</div>
            <input className="input" type="date" value={draftDate} onChange={(e) => syncDraftDate(e.target.value)} />
          </div>

          <div className="weightComposerBar">
            <div className="formRow weightValueRow">
              <div className="label">体重（kg）</div>
              <input
                className="input weightValueInput"
                inputMode="decimal"
                placeholder="例如 58.6"
                value={draftWeight}
                onChange={(e) => setDraftWeight(e.target.value)}
              />
            </div>

            <div className="weightComposerActions">
              <button
                type="button"
                className="weightSubmitBtn"
                disabled={!draftDate || draftValue == null}
                onClick={() => {
                  if (!draftDate || draftValue == null) return;
                  onUpsertWeight(draftDate, draftValue);
                }}
              >
                {existingDraft ? "更新记录" : "新增记录"}
              </button>
              <button
                type="button"
                className="weightGhostBtn"
                onClick={resetDraft}
              >
                回到今天
              </button>
              {existingDraft ? (
                <button
                  type="button"
                  className="weightMiniBtn weightMiniBtnDanger"
                  onClick={() => {
                    if (!window.confirm(`确认删除 ${draftDate} 的体重记录？`)) return;
                    onDeleteWeight(draftDate);
                    setDraftWeight("");
                  }}
                >
                  删除记录
                </button>
              ) : null}
            </div>
          </div>

          <div className="weightComposerMeta">
            <div className="weightComposerHint">
              {existingDraft ? `已记录：${formatWeightKg(existingDraft.weightKg)}` : "当前日期还没有体重记录"}
            </div>
            <div className="weightComposerHint">点击折线点或下方周历日期，会自动切换到对应日期</div>
          </div>
        </div>

        <div className="weightCalendarCard" onTouchStart={onWeekTouchStart} onTouchEnd={onWeekTouchEnd} onTouchCancel={onWeekTouchEnd}>
          <div className="weightCalendarHeader">
            <div>
              <div className="label">体重周历</div>
              <div className="weightCalendarSub">左右滑动切换周次，或直接选择日期查看</div>
            </div>
            <div className="weightCalendarNav">
              <button type="button" className="calNavBtn" onClick={() => shiftWeek(-1)}>
                上周
              </button>
              <div className="weightCalendarTitle">{formatWeekRangeTitle(weekDays)}</div>
              <button type="button" className="calNavBtn" onClick={() => shiftWeek(1)}>
                下周
              </button>
            </div>
          </div>

          <div className="calWeekdays" aria-hidden="true">
            {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
              <div key={w} className="calWeekday">
                {w}
              </div>
            ))}
          </div>

          <div className="weightCalGrid">
            {weekDays.map((dayMs) => {
              const day = new Date(dayMs);
              const dayKey = formatDateKey(day);
              const record = weightMap.get(dayKey);
              const isToday = dayKey === todayKey;
              const isSelected = dayKey === draftDate;
              return (
                <button
                  key={dayKey}
                  type="button"
                  className={`weightCalCell ${record ? "weightCalCellHasData" : ""} ${isToday ? "weightCalCellToday" : ""} ${
                    isSelected ? "weightCalCellSelected" : ""
                  }`}
                  onClick={() => syncDraftDate(dayKey)}
                >
                  <div className="weightCalDay">{day.getDate()}</div>
                  <div className="weightCalValue">{record ? record.weightKg.toFixed(1) : ""}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatsCalendarPage({
  events,
  weights,
  records,
  onOpenHourDetail,
  onOpenDay,
  onUpsertWeight,
  onDeleteWeight
}: {
  events: MovementEvent[];
  weights: WeightRecord[];
  records: HourRecord[];
  onOpenHourDetail: (hourStart: number) => void;
  onOpenDay: (dayKey: string) => void;
  onUpsertWeight: (date: string, weightKg: number) => void;
  onDeleteWeight: (date: string) => void;
}) {
  const now = Date.now();
  const hourMs = 3_600_000;
  const currentHourStart = Math.floor(now / hourMs) * hourMs;
  const last12hTotal = last12HoursEffectiveTotal(events, now);
  const [expandedHourStart, setExpandedHourStart] = useState<number | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [calMode, setCalMode] = useState<"week" | "month">("week");
  const [cursorDay, setCursorDay] = useState(() => startOfDayMs(now));

  const recordsByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        totalEffective: number;
        totalClicks: number;
      }
    >();
    for (const r of records) {
      if (r.rawClicks <= 0) continue;
      const key = formatDateKey(new Date(r.hourStart));
      const prev = map.get(key) ?? { totalEffective: 0, totalClicks: 0 };
      map.set(key, { totalEffective: prev.totalEffective + r.effectiveCount, totalClicks: prev.totalClicks + r.rawClicks });
    }
    return map;
  }, [records]);

  const eventsByHour = useMemo(() => {
    const map = new Map<number, MovementEvent[]>();
    for (const e of events) {
      const h = hourStartMs(e.ts);
      const list = map.get(h) ?? [];
      list.push(e);
      map.set(h, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => a.ts - b.ts);
      map.set(k, list);
    }
    return map;
  }, [events]);

  const last12Hours = useMemo(() => {
    const arr: number[] = [];
    for (let i = 11; i >= 0; i--) arr.push(currentHourStart - i * hourMs);
    return arr;
  }, [currentHourStart]);

  const emptyState = !events.length;

  const weekDays = useMemo(() => {
    const d = new Date(cursorDay);
    const day = (d.getDay() + 6) % 7;
    const start = cursorDay - day * 86_400_000;
    return Array.from({ length: 7 }, (_, i) => start + i * 86_400_000);
  }, [cursorDay]);

  const monthCells = useMemo(() => {
    const d = new Date(cursorDay);
    d.setDate(1);
    const monthStart = d.getTime();
    const startDay = (d.getDay() + 6) % 7;
    const gridStart = monthStart - startDay * 86_400_000;
    return Array.from({ length: 42 }, (_, i) => gridStart + i * 86_400_000);
  }, [cursorDay]);

  function goPrev() {
    if (calMode === "week") {
      setCursorDay((v) => v - 7 * 86_400_000);
      return;
    }
    setCursorDay((v) => {
      const d = new Date(v);
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      return d.getTime();
    });
  }

  function goNext() {
    if (calMode === "week") {
      setCursorDay((v) => v + 7 * 86_400_000);
      return;
    }
    setCursorDay((v) => {
      const d = new Date(v);
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      return d.getTime();
    });
  }

  return (
    <div className="page">
      <WeightRecordManager weights={weights} onUpsertWeight={onUpsertWeight} onDeleteWeight={onDeleteWeight} />

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="cardInner">
          <button
            type="button"
            className={`statsStickyHeader statsStickyBtn ${hoursOpen ? "statsStickyBtnOpen" : ""}`}
            onClick={() => setHoursOpen((v) => !v)}
            aria-expanded={hoursOpen}
          >
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="recordTitle">12小时有效胎动</div>
                <div className="recordSub">仅用于趋势观察，数值受孕周与时段影响</div>
              </div>
              <div className="pill">
                <strong>{last12hTotal}</strong>
                <span className="muted">次</span>
              </div>
            </div>
          </button>

          {emptyState ? (
            <div className="emptyBox">
              <div className="emptyIcon">📝</div>
              <div className="emptyTitle">还没有记录</div>
              <div className="emptySub">先在首页录入一条胎动记录，再回来查看统计与日历。</div>
            </div>
          ) : hoursOpen ? (
            <div className="hourAccordion" aria-label="12小时列表">
              {last12Hours.map((h) => {
                const list = eventsByHour.get(h) ?? [];
                const effective = list.length ? effectiveCount(list) : null;
                const open = expandedHourStart === h;
                return (
                  <div key={h} className={`hourItem ${open ? "hourItemOpen" : ""}`}>
                    <button
                      type="button"
                      className="hourRow"
                      onClick={() => setExpandedHourStart(open ? null : h)}
                      aria-expanded={open}
                    >
                      <div className="hourLeft">{formatHourOnly(h)}</div>
                      <div className={`hourRight ${effective == null ? "hourRightEmpty" : ""}`}>
                        {effective == null ? "--" : effective}
                      </div>
                    </button>
                    <div className="hourPanel">
                      <div className="hourPanelInner">
                        {list.length ? (
                          <HourRecordRow
                            rec={{ hourStart: h, rawClicks: list.length, effectiveCount: effectiveCount(list) }}
                            events={list}
                            onOpenDetail={() => onOpenHourDetail(h)}
                          />
                        ) : (
                          <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                            本小时暂无记录。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="hint" style={{ marginTop: 12 }}>
            规则：5分钟内多次点击按1次有效胎动计；每小时有效胎动 ≥3 次通常视为正常。
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="cardInner">
          <div className="recordRow">
            <div>
              <div className="recordTitle">日历</div>
              <div className="recordSub">周/月视图查看达标情况与当天明细</div>
            </div>
            <div className="segTabs" role="tablist" aria-label="日历视图">
              <button
                type="button"
                className={`segTab ${calMode === "week" ? "segTabActive" : ""}`}
                onClick={() => {
                  setCalMode("week");
                  setCursorDay(startOfDayMs(Date.now()));
                }}
              >
                周
              </button>
              <button
                type="button"
                className={`segTab ${calMode === "month" ? "segTabActive" : ""}`}
                onClick={() => {
                  setCalMode("month");
                  setCursorDay(startOfDayMs(Date.now()));
                }}
              >
                月
              </button>
            </div>
          </div>

          <div className="calNav">
            <button type="button" className="calNavBtn" onClick={goPrev}>
              上一页
            </button>
            <div className="calNavTitle">{formatDateKey(new Date(cursorDay))}</div>
            <button type="button" className="calNavBtn" onClick={goNext}>
              下一页
            </button>
          </div>

          <div className="calWeekdays" aria-hidden="true">
            {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
              <div key={w} className="calWeekday">
                {w}
              </div>
            ))}
          </div>

          <div className={`calGrid ${calMode === "month" ? "calGridMonth" : "calGridWeek"}`}>
            {(calMode === "month" ? monthCells : weekDays).map((dayMs) => {
              const dayKey = formatDateKey(new Date(dayMs));
              const sum = recordsByDay.get(dayKey);
              const hasData = !!sum && sum.totalClicks > 0;
              const ok = hasData && sum!.totalEffective >= 12;
              const isToday = dayKey === formatDateKey(new Date());
              return (
                <button
                  key={dayKey}
                  type="button"
                  className={`calCell ${hasData ? (ok ? "calCellOk" : "calCellBad") : "calCellEmpty"} ${
                    isToday ? "calCellToday" : ""
                  }`}
                  onClick={() => onOpenDay(dayKey)}
                >
                  <div className="calCellDay">{Number(dayKey.slice(-2))}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MinePage({
  pregnancyInfo,
  events,
  weights,
  onUpdatePregnancyInfo,
  onRestore,
  onGenerateTestData,
  bubbleSpeed,
  onBubbleSpeedChange,
  themeMode,
  onThemeModeChange,
  aiTextProvider,
  onAiTextProviderChange,
  aiTextProviderStates,
  onAiTextModelChange,
  onAiTextModelsChange,
  aiVendor,
  onAiVendorChange,
  aiModelZhipu,
  onAiModelZhipuChange,
  aiModelAliyun,
  onAiModelAliyunChange,
  aiSystemPrompt,
  onAiSystemPromptChange,
  aiUserPrompt,
  onAiUserPromptChange,
  aiUserPromptDefault,
  onAiUserPromptDefaultChange,
  aiMenuRecipeSystemPrompt,
  onAiMenuRecipeSystemPromptChange,
  aiMenuRecipePrompt,
  aiMenuRecipePromptDefault,
  onAiMenuRecipePromptChange,
  onAiMenuRecipePromptDefaultChange,
  aiThinking,
  onAiThinkingChange,
  aiImageBaseUrl,
  onAiImageBaseUrlChange,
  aiImageMode,
  onAiImageModeChange,
  aiImageTargetKb,
  onAiImageTargetKbChange,
  onClear
}: {
  pregnancyInfo: PregnancyInfo;
  events: MovementEvent[];
  weights: WeightRecord[];
  onUpdatePregnancyInfo: (next: PregnancyInfo) => void;
  onRestore: (payload: {
    pregnancyInfo: PregnancyInfo;
    events: MovementEvent[];
    weights?: WeightRecord[];
    bubbleSpeed?: number;
    themeMode?: "dark" | "light";
    aiTextProvider?: TextAiProvider;
    aiTextProviderStates?: Record<TextAiProvider, TextAiProviderState>;
    aiVendor?: "zhipu" | "aliyun";
    aiModelZhipu?: string;
    aiModelAliyun?: string;
    aiSystemPrompt?: string;
    aiUserPrompt?: string;
    aiUserPromptDefault?: string;
    aiMenuRecipeSystemPrompt?: string;
    aiMenuRecipePrompt?: string;
    aiMenuRecipePromptDefault?: string;
    aiThinking?: boolean;
    aiImageBaseUrl?: string;
    aiImageMode?: "url" | "inline";
    aiImageTargetKb?: number;
  }) => void;
  onGenerateTestData: () => void;
  bubbleSpeed: number;
  onBubbleSpeedChange: (v: number) => void;
  themeMode: "dark" | "light";
  onThemeModeChange: (v: "dark" | "light") => void;
  aiTextProvider: TextAiProvider;
  onAiTextProviderChange: (v: TextAiProvider) => void;
  aiTextProviderStates: Record<TextAiProvider, TextAiProviderState>;
  onAiTextModelChange: (provider: TextAiProvider, model: string) => void;
  onAiTextModelsChange: (provider: TextAiProvider, models: string[]) => void;
  aiVendor: "zhipu" | "aliyun";
  onAiVendorChange: (v: "zhipu" | "aliyun") => void;
  aiModelZhipu: string;
  onAiModelZhipuChange: (v: string) => void;
  aiModelAliyun: string;
  onAiModelAliyunChange: (v: string) => void;
  aiSystemPrompt: string;
  onAiSystemPromptChange: (v: string) => void;
  aiUserPrompt: string;
  onAiUserPromptChange: (v: string) => void;
  aiUserPromptDefault: string;
  onAiUserPromptDefaultChange: (v: string) => void;
  aiMenuRecipeSystemPrompt: string;
  onAiMenuRecipeSystemPromptChange: (v: string) => void;
  aiMenuRecipePrompt: string;
  aiMenuRecipePromptDefault: string;
  onAiMenuRecipePromptChange: (v: string) => void;
  onAiMenuRecipePromptDefaultChange: (v: string) => void;
  aiThinking: boolean;
  onAiThinkingChange: (v: boolean) => void;
  aiImageBaseUrl: string;
  onAiImageBaseUrlChange: (v: string) => void;
  aiImageMode: "url" | "inline";
  onAiImageModeChange: (v: "url" | "inline") => void;
  aiImageTargetKb: number;
  onAiImageTargetKbChange: (v: number) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const origin = typeof window !== "undefined" && window?.location?.origin ? String(window.location.origin).replace(/\/+$/, "") : "";
  const defaultSystemPrompt = "你是一个孕妇营养专家";
  const defaultUserPrompt =
    "请根据图片判断这是什么食物/菜品，并回答：\n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。";
  const defaultMenuRecipeSystemPrompt = "你是一个孕妇饮食助手，简短输出菜名与配菜。";
  const defaultMenuRecipePrompt = "根据当前食材为孕妇推荐1-3道菜，补充所需食材";
  const [textModelDraft, setTextModelDraft] = useState("");
  const currentTextProviderState = aiTextProviderStates[aiTextProvider];
  const currentTextModel = getActiveTextModel(aiTextProvider, aiTextProviderStates);

  function addTextModel() {
    const model = textModelDraft.trim();
    if (!model) return;
    onAiTextModelChange(aiTextProvider, model);
    setTextModelDraft("");
  }

  function removeTextModel(model: string) {
    const nextModels = (currentTextProviderState?.models ?? []).filter((item) => item !== model);
    onAiTextModelsChange(aiTextProvider, nextModels);
  }

  function exportBackup() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      pregnancyInfo,
      events,
      weights,
      bubbleSpeed,
      themeMode,
      aiTextProvider,
      aiTextProviderStates,
      aiVendor,
      aiModelZhipu,
      aiModelAliyun,
      aiSystemPrompt,
      aiUserPrompt,
      aiUserPromptDefault,
      aiMenuRecipeSystemPrompt,
      aiMenuRecipePrompt,
      aiMenuRecipePromptDefault,
      aiThinking,
      aiImageBaseUrl,
      aiImageMode,
      aiImageTargetKb
    };
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date();
    const yyyy = ts.getFullYear();
    const mm = String(ts.getMonth() + 1).padStart(2, "0");
    const dd = String(ts.getDate()).padStart(2, "0");
    const hh = String(ts.getHours()).padStart(2, "0");
    const mi = String(ts.getMinutes()).padStart(2, "0");
    a.href = url;
    a.download = `bbcare-backup-${yyyy}${mm}${dd}-${hh}${mi}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function restoreFromFile(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text) as any;
    const pi = parsed?.pregnancyInfo;
    const evs = parsed?.events;
    const wts = parsed?.weights;
    const bs = parsed?.bubbleSpeed;
    const tm = parsed?.themeMode;
    const atp = parsed?.aiTextProvider;
    const atps = parsed?.aiTextProviderStates;
    const av = parsed?.aiVendor;
    const amz = parsed?.aiModelZhipu;
    const ama = parsed?.aiModelAliyun;
    const asp = parsed?.aiSystemPrompt;
    const aup = parsed?.aiUserPrompt;
    const aupd = parsed?.aiUserPromptDefault;
    const amrsp = parsed?.aiMenuRecipeSystemPrompt;
    const amrp = parsed?.aiMenuRecipePrompt;
    const amrpd = parsed?.aiMenuRecipePromptDefault;
    const at = parsed?.aiThinking;
    const abu = parsed?.aiImageBaseUrl;
    const amode = parsed?.aiImageMode;
    const atk = parsed?.aiImageTargetKb;
    if (!parsed || typeof parsed !== "object" || (parsed.version !== 1 && parsed.version !== 2)) {
      throw new Error("备份格式不正确");
    }
    if (!pi || typeof pi?.lmpDate !== "string") {
      throw new Error("备份中缺少孕期信息");
    }
    if (!Array.isArray(evs)) {
      throw new Error("备份中缺少记录数据");
    }
    const normalized: MovementEvent[] = evs
      .filter((e: any) => typeof e?.id === "string" && typeof e?.type === "string" && typeof e?.ts === "number")
      .map((e: any) => ({ id: e.id, type: e.type, ts: e.ts }));
    const normalizedWeights = normalizeWeightRecords(wts);
    const nextBubbleSpeed = typeof bs === "number" && Number.isFinite(bs) ? Math.min(1, Math.max(0.2, bs)) : undefined;
    const nextThemeMode = tm === "light" || tm === "dark" ? tm : undefined;
    const nextAiTextProvider = (TEXT_AI_PROVIDER_CODES as string[]).includes(String(atp ?? "").trim().toLowerCase())
      ? (String(atp).trim().toLowerCase() as TextAiProvider)
      : undefined;
    const nextAiTextProviderStates =
      atps && typeof atps === "object" ? (atps as Record<TextAiProvider, TextAiProviderState>) : undefined;
    const nextAiVendor = av === "zhipu" || av === "aliyun" ? av : undefined;
    const nextAiModelZhipu = typeof amz === "string" && amz.trim() ? amz.trim().slice(0, 64) : undefined;
    const nextAiModelAliyun = typeof ama === "string" && ama.trim() ? ama.trim().slice(0, 64) : undefined;
    const nextAiSystemPrompt = typeof asp === "string" && asp.trim() ? asp.trim().slice(0, 600) : undefined;
    const nextAiUserPrompt = typeof aup === "string" && aup.trim() ? aup.trim().slice(0, 4000) : undefined;
    const nextAiUserPromptDefault = typeof aupd === "string" && aupd.trim() ? aupd.trim().slice(0, 4000) : undefined;
    const nextAiMenuRecipeSystemPrompt = typeof amrsp === "string" && amrsp.trim() ? amrsp.trim().slice(0, 600) : undefined;
    const nextAiMenuRecipePrompt = typeof amrp === "string" && amrp.trim() ? amrp.trim().slice(0, 600) : undefined;
    const nextAiMenuRecipePromptDefault = typeof amrpd === "string" && amrpd.trim() ? amrpd.trim().slice(0, 600) : undefined;
    const nextAiThinking = typeof at === "boolean" ? at : undefined;
    const nextAiImageBaseUrl = typeof abu === "string" && abu.trim() ? abu.trim().replace(/\/+$/, "").slice(0, 200) : undefined;
    const nextAiImageMode = amode === "url" || amode === "inline" ? amode : undefined;
    const nextAiImageTargetKb = typeof atk === "number" && Number.isFinite(atk) ? Math.min(2000, Math.max(150, Math.round(atk))) : undefined;
    if (nextBubbleSpeed != null) onBubbleSpeedChange(nextBubbleSpeed);
    if (nextThemeMode) onThemeModeChange(nextThemeMode);
    if (nextAiTextProvider) onAiTextProviderChange(nextAiTextProvider);
    if (nextAiVendor) onAiVendorChange(nextAiVendor);
    if (nextAiModelZhipu) onAiModelZhipuChange(nextAiModelZhipu);
    if (nextAiModelAliyun) onAiModelAliyunChange(nextAiModelAliyun);
    if (nextAiSystemPrompt) onAiSystemPromptChange(nextAiSystemPrompt);
    if (nextAiUserPrompt) onAiUserPromptChange(nextAiUserPrompt);
    if (nextAiUserPromptDefault) onAiUserPromptDefaultChange(nextAiUserPromptDefault);
    if (nextAiMenuRecipeSystemPrompt) onAiMenuRecipeSystemPromptChange(nextAiMenuRecipeSystemPrompt);
    if (nextAiMenuRecipePrompt) onAiMenuRecipePromptChange(nextAiMenuRecipePrompt);
    if (nextAiMenuRecipePromptDefault) onAiMenuRecipePromptDefaultChange(nextAiMenuRecipePromptDefault);
    if (nextAiThinking != null) onAiThinkingChange(nextAiThinking);
    if (nextAiImageBaseUrl) onAiImageBaseUrlChange(nextAiImageBaseUrl);
    if (nextAiImageMode) onAiImageModeChange(nextAiImageMode);
    if (nextAiImageTargetKb != null) onAiImageTargetKbChange(nextAiImageTargetKb);
    onRestore({
      pregnancyInfo: { lmpDate: pi.lmpDate, babyName: typeof pi.babyName === "string" ? pi.babyName : "" },
      events: normalized,
      weights: normalizedWeights,
      bubbleSpeed: nextBubbleSpeed,
      themeMode: nextThemeMode,
      aiTextProvider: nextAiTextProvider,
      aiTextProviderStates: nextAiTextProviderStates,
      aiVendor: nextAiVendor,
      aiModelZhipu: nextAiModelZhipu,
      aiModelAliyun: nextAiModelAliyun,
      aiSystemPrompt: nextAiSystemPrompt,
      aiUserPrompt: nextAiUserPrompt,
      aiUserPromptDefault: nextAiUserPromptDefault,
      aiMenuRecipeSystemPrompt: nextAiMenuRecipeSystemPrompt,
      aiMenuRecipePrompt: nextAiMenuRecipePrompt,
      aiMenuRecipePromptDefault: nextAiMenuRecipePromptDefault,
      aiThinking: nextAiThinking,
      aiImageBaseUrl: nextAiImageBaseUrl,
      aiImageMode: nextAiImageMode,
      aiImageTargetKb: nextAiImageTargetKb
    });
  }

  return (
    <div className="page">
      <div className="card">
        <div className="cardInner">
          <div className="recordTitle">我的</div>
          <div className="recordSub">设置与数据管理</div>
        </div>
      </div>
      <div style={{ height: 12 }} />
      <div className="card">
        <div className="cardInner">
          <div className="stack">
            <div className="formRow">
              <div className="label">末次月经日期</div>
              <input
                className="input"
                type="date"
                value={pregnancyInfo.lmpDate}
                onChange={(e) => onUpdatePregnancyInfo({ ...pregnancyInfo, lmpDate: e.target.value })}
              />
              <div className="hint">用于计算孕周、进度与孕期阶段。</div>
            </div>
            <div className="formRow">
              <div className="label">宝宝名字</div>
              <input
                className="input"
                type="text"
                placeholder="例如：小桃子"
                value={pregnancyInfo.babyName ?? ""}
                onChange={(e) => onUpdatePregnancyInfo({ ...pregnancyInfo, babyName: e.target.value })}
              />
              <div className="hint">将同步保存到服务端，可用于个性化展示。</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="cardInner">
          <div className="stack">
            <details className="details">
              <summary className="detailsSummary">AI 设置</summary>
              <div className="detailsBody">
                <div className="formRow">
                  <div className="label">文本 AI 厂商</div>
                  <div className="segTabs" role="tablist" aria-label="文本 AI 厂商">
                    {TEXT_AI_PROVIDER_CODES.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        className={`segTab ${aiTextProvider === provider ? "segTabActive" : ""}`}
                        onClick={() => onAiTextProviderChange(provider)}
                      >
                        {TEXT_AI_PROVIDER_PRESETS[provider].label}
                      </button>
                    ))}
                  </div>
                  <div className="hint">
                    {TEXT_AI_PROVIDER_PRESETS[aiTextProvider].description}
                    {TEXT_AI_PROVIDER_PRESETS[aiTextProvider].supportsSearch ? " 当前可用于推荐菜等文本任务，模型本身支持联网检索。" : " 当前可用于推荐菜等纯文本任务。"}
                  </div>
                </div>
                <div className="formRow">
                  <div className="label">文本 AI 模型</div>
                  <div className="segTabs" role="tablist" aria-label="文本 AI 模型">
                    {(currentTextProviderState?.models ?? []).map((model) => (
                      <button
                        key={model}
                        type="button"
                        className={`segTab ${currentTextModel === model ? "segTabActive" : ""}`}
                        onClick={() => onAiTextModelChange(aiTextProvider, model)}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                  <div className="promptActionRow">
                    <input
                      className="input"
                      type="text"
                      value={textModelDraft}
                      placeholder="添加自定义模型名"
                      onChange={(e) => setTextModelDraft(e.target.value)}
                    />
                    <button className="miniBtn promptActionBtn" type="button" onClick={addTextModel}>
                      添加模型
                    </button>
                  </div>
                  {currentTextProviderState?.models?.length ? (
                    <div className="promptActionRow">
                      {currentTextProviderState.models.map((model) => (
                        <button key={`remove-${model}`} className="miniBtn promptActionBtn" type="button" onClick={() => removeTextModel(model)}>
                          删除 {model}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="hint">当前默认模型：{currentTextModel || "未设置"}</div>
                </div>
                <div className="formRow">
                  <div className="label">识图 AI 厂商</div>
                  <div className="segTabs" role="tablist" aria-label="AI 厂商">
                    <button
                      type="button"
                      className={`segTab ${aiVendor === "zhipu" ? "segTabActive" : ""}`}
                      onClick={() => onAiVendorChange("zhipu")}
                    >
                      智谱
                    </button>
                    <button
                      type="button"
                      className={`segTab ${aiVendor === "aliyun" ? "segTabActive" : ""}`}
                      onClick={() => onAiVendorChange("aliyun")}
                    >
                      阿里云
                    </button>
                  </div>
                  <div className="hint">用于“拍照问 AI”的视觉识别模型。</div>
                </div>
                <div className="formRow">
                  <div className="label">识图 AI 模型</div>
                  {aiVendor === "zhipu" ? (
                    <div className="segTabs" role="tablist" aria-label="智谱模型">
                      <button
                        type="button"
                        className={`segTab ${aiModelZhipu === "glm-4.6v" ? "segTabActive" : ""}`}
                        onClick={() => onAiModelZhipuChange("glm-4.6v")}
                      >
                        glm-4.6v
                      </button>
                      <button
                        type="button"
                        className={`segTab ${aiModelZhipu === "glm-4v" ? "segTabActive" : ""}`}
                        onClick={() => onAiModelZhipuChange("glm-4v")}
                      >
                        glm-4v
                      </button>
                    </div>
                  ) : (
                    <div className="segTabs" role="tablist" aria-label="阿里云百炼模型">
                      <button
                        type="button"
                        className={`segTab ${aiModelAliyun === "qwen3.5-plus" ? "segTabActive" : ""}`}
                        onClick={() => onAiModelAliyunChange("qwen3.5-plus")}
                      >
                        qwen3.5-plus
                      </button>
                      <button
                        type="button"
                        className={`segTab ${aiModelAliyun === "qwen3.5-flash" ? "segTabActive" : ""}`}
                        onClick={() => onAiModelAliyunChange("qwen3.5-flash")}
                      >
                        qwen3.5-flash
                      </button>
                    </div>
                  )}
                  <div className="hint">{aiVendor === "zhipu" ? "当前仅展示常用模型。" : "当前仅展示 qwen3.5-plus / qwen3.5-flash。"}</div>
                </div>
                <div className="promptGroup promptGroupPhoto">
                  <div className="promptGroupHead">
                    <div className="promptGroupTitle">拍照识别提示词</div>
                    <div className="promptGroupTag">拍照问 AI</div>
                  </div>
                  <div className="formRow">
                    <div className="label">系统提示词</div>
                    <textarea
                      className="input"
                      value={aiSystemPrompt}
                      rows={3}
                      placeholder={defaultSystemPrompt}
                      onChange={(e) => onAiSystemPromptChange(e.target.value)}
                      style={{ resize: "vertical" }}
                    />
                  </div>
                  <div className="formRow">
                    <div className="label">提问描述提示词</div>
                    <textarea
                      className="input"
                      value={aiUserPrompt}
                      rows={6}
                      placeholder={defaultUserPrompt}
                      onChange={(e) => onAiUserPromptChange(e.target.value)}
                      style={{ resize: "vertical" }}
                    />
                    <div className="promptActionRow">
                      <button
                        className="miniBtn promptActionBtn"
                        type="button"
                        onClick={() => onAiUserPromptDefaultChange(aiUserPrompt.trim() ? aiUserPrompt : defaultUserPrompt)}
                      >
                        设为默认
                      </button>
                      <button
                        className="miniBtn promptActionBtn"
                        type="button"
                        onClick={() => onAiUserPromptChange(aiUserPromptDefault || defaultUserPrompt)}
                      >
                        恢复默认
                      </button>
                    </div>
                    <div className="hint">当前“恢复默认”会恢复到你设定的默认提问描述。</div>
                  </div>
                  <div className="promptSubTitle">图片传参设置（AI 识图）</div>
                  <div className="formRow">
                    <div className="label">图片传参方式</div>
                    <div className="segTabs" role="tablist" aria-label="图片传参方式">
                      <button
                        type="button"
                        className={`segTab ${aiImageMode === "url" ? "segTabActive" : ""}`}
                        onClick={() => onAiImageModeChange("url")}
                      >
                        URL
                      </button>
                      <button
                        type="button"
                        className={`segTab ${aiImageMode === "inline" ? "segTabActive" : ""}`}
                        onClick={() => onAiImageModeChange("inline")}
                      >
                        Base64
                      </button>
                    </div>
                    <div className="hint">URL 方式更贴近官方文档；仅当大模型可访问该 URL 时才有效。</div>
                  </div>
                  <div className="formRow">
                    <div className="label">图片访问域名</div>
                    <input
                      className="input"
                      type="text"
                      value={aiImageBaseUrl}
                      placeholder={origin || "例如：http://192.168.1.10:8081"}
                      onChange={(e) => onAiImageBaseUrlChange(e.target.value)}
                    />
                    <div className="hint">留空则默认使用当前地址：{origin || "-"}</div>
                  </div>
                  <div className="formRow">
                    <div className="label">图片压缩目标</div>
                    <input
                      className="input"
                      type="range"
                      min={200}
                      max={1200}
                      step={50}
                      value={aiImageTargetKb}
                      onChange={(e) => onAiImageTargetKbChange(Number(e.target.value))}
                    />
                    <div className="hint">当前：{aiImageTargetKb} KB（建议 300–600KB，过低可能影响识别）</div>
                  </div>
                </div>
                <div className="promptGroup promptGroupMenu">
                  <div className="promptGroupHead">
                    <div className="promptGroupTitle">推荐菜提示词</div>
                    <div className="promptGroupTag">每日菜单</div>
                  </div>
                  <div className="formRow">
                    <div className="label">系统提示词</div>
                    <textarea
                      className="input"
                      value={aiMenuRecipeSystemPrompt}
                      rows={3}
                      placeholder={defaultMenuRecipeSystemPrompt}
                      onChange={(e) => onAiMenuRecipeSystemPromptChange(e.target.value)}
                      style={{ resize: "vertical" }}
                    />
                  </div>
                  <div className="formRow">
                    <div className="label">提问描述提示词</div>
                    <textarea
                      className="input"
                      value={aiMenuRecipePrompt}
                      rows={3}
                      placeholder={defaultMenuRecipePrompt}
                      onChange={(e) => onAiMenuRecipePromptChange(e.target.value)}
                      style={{ resize: "vertical" }}
                    />
                    <div className="promptActionRow">
                      <button
                        className="miniBtn promptActionBtn"
                        type="button"
                        onClick={() => onAiMenuRecipePromptDefaultChange(aiMenuRecipePrompt.trim() ? aiMenuRecipePrompt : defaultMenuRecipePrompt)}
                      >
                        设为默认
                      </button>
                      <button
                        className="miniBtn promptActionBtn"
                        type="button"
                        onClick={() => onAiMenuRecipePromptChange(aiMenuRecipePromptDefault || defaultMenuRecipePrompt)}
                      >
                        恢复默认
                      </button>
                    </div>
                    <div className="hint">用于“小工具 &gt; 每日菜单 &gt; 推荐菜”。建议保持简短以减少等待时间。</div>
                  </div>
                </div>
                <div className="formRow">
                  <div className="label">AI Thinking</div>
                  <div className="segTabs" role="tablist" aria-label="AI Thinking">
                    <button
                      type="button"
                      className={`segTab ${aiThinking ? "segTabActive" : ""}`}
                      onClick={() => onAiThinkingChange(true)}
                    >
                      开
                    </button>
                    <button
                      type="button"
                      className={`segTab ${!aiThinking ? "segTabActive" : ""}`}
                      onClick={() => onAiThinkingChange(false)}
                    >
                      关
                    </button>
                  </div>
                  <div className="hint">{aiVendor === "zhipu" ? "关闭可减少等待时间，但回答可能略不稳定。" : "该开关目前仅对智谱生效。"}</div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="cardInner">
          <div className="stack">
            <details className="details">
              <summary className="detailsSummary">系统设置</summary>
              <div className="detailsBody">
                <div className="formRow">
                  <div className="label">配色模式</div>
                  <div className="segTabs" role="tablist" aria-label="配色模式">
                    <button
                      type="button"
                      className={`segTab ${themeMode === "dark" ? "segTabActive" : ""}`}
                      onClick={() => onThemeModeChange("dark")}
                    >
                      夜间
                    </button>
                    <button
                      type="button"
                      className={`segTab ${themeMode === "light" ? "segTabActive" : ""}`}
                      onClick={() => onThemeModeChange("light")}
                    >
                      日间
                    </button>
                  </div>
                  <div className="hint">日间模式为白色/菱花白背景，更适合白天使用。</div>
                </div>
                <div className="formRow">
                  <div className="label">首页气泡速度</div>
                  <input
                    className="input"
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={bubbleSpeed}
                    onChange={(e) => onBubbleSpeedChange(Number(e.target.value))}
                  />
                  <div className="hint">越靠左越慢，更适合单手点击。</div>
                </div>

                <div className="formRow">
                  <div className="label">数据备份与还原</div>
                  <button className="actionBtn actionBtnPrimary" onClick={exportBackup} type="button">
                    <div>
                      <div className="actionTitle">导出备份</div>
                      <div className="actionSub">导出记录与设置为 JSON 文件</div>
                    </div>
                  </button>
                  <button
                    className="actionBtn"
                    type="button"
                    onClick={() => {
                      setRestoreError(null);
                      fileRef.current?.click();
                    }}
                  >
                    <div>
                      <div className="actionTitle">从备份还原</div>
                      <div className="actionSub">选择 JSON 文件，将覆盖当前数据</div>
                    </div>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        await restoreFromFile(file);
                        setRestoreError(null);
                      } catch (err: any) {
                        setRestoreError(err?.message ?? "还原失败");
                      }
                    }}
                  />
                  {restoreError ? <div className="errorText">{restoreError}</div> : null}
                </div>

                <div className="formRow">
                  <div className="label">测试数据</div>
                  <button className="actionBtn" type="button" onClick={onGenerateTestData}>
                    <div>
                      <div className="actionTitle">生成测试数据</div>
                      <div className="actionSub">约 120 条，包含 7 天数据与边界情况，会覆盖当前数据</div>
                    </div>
                  </button>
                </div>

                <button
                  className="dangerBtn"
                  type="button"
                  onClick={() => {
                    const ok = window.confirm("确认清空吗？这会删除当前设备与服务端的记录与设置，且不可恢复。");
                    if (!ok) return;
                    onClear();
                  }}
                >
                  清空数据 <strong>（记录与设置）</strong>
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WidgetsPage({
  aiTextProvider,
  aiTextProviderStates,
  aiVendor,
  aiModelZhipu,
  aiModelAliyun,
  aiSystemPrompt,
  aiUserPrompt,
  aiMenuRecipeSystemPrompt,
  aiMenuRecipePrompt,
  aiThinking,
  aiImageBaseUrl,
  aiImageMode,
  aiImageTargetKb
}: {
  aiTextProvider: TextAiProvider;
  aiTextProviderStates: Record<TextAiProvider, TextAiProviderState>;
  aiVendor: "zhipu" | "aliyun";
  aiModelZhipu: string;
  aiModelAliyun: string;
  aiSystemPrompt: string;
  aiUserPrompt: string;
  aiMenuRecipeSystemPrompt: string;
  aiMenuRecipePrompt: string;
  aiThinking: boolean;
  aiImageBaseUrl: string;
  aiImageMode: "url" | "inline";
  aiImageTargetKb: number;
}) {
  const [goldLoading, setGoldLoading] = useState(false);
  const [goldError, setGoldError] = useState<string | null>(null);
  const [goldData, setGoldData] = useState<CngoldPricesResponse | null>(null);
  const foodFileRef = useRef<HTMLInputElement | null>(null);
  const [foodBusy, setFoodBusy] = useState(false);
  const [foodError, setFoodError] = useState<string | null>(null);
  const [foodPreview, setFoodPreview] = useState<string | null>(null);
  const [foodAnswer, setFoodAnswer] = useState<{ model: string; content: string } | null>(null);
  const [foodProgress, setFoodProgress] = useState(0);
  const [foodElapsedSec, setFoodElapsedSec] = useState(0);
  const [foodFileSize, setFoodFileSize] = useState<number | null>(null);
  const [menuData, setMenuData] = useState<DailyMenuResponse | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRecipeByKey, setMenuRecipeByKey] = useState<Record<string, string>>({});
  const [menuRecipeErrorByKey, setMenuRecipeErrorByKey] = useState<Record<string, string>>({});
  const [menuRecipeBusyKey, setMenuRecipeBusyKey] = useState<string | null>(null);
  const menuRecipeStreamTokenRef = useRef(0);
  const menuRecipeReqAbortRef = useRef<AbortController | null>(null);
  const goldAutoLoadRef = useRef(false);
  const currentTextModel = getActiveTextModel(aiTextProvider, aiTextProviderStates);
  const currentVisionModel = aiVendor === "aliyun" ? aiModelAliyun : aiModelZhipu;
  const fmtPreciousPrice = (price: number | null | undefined, unit = "元/克") => {
    if (price == null || !Number.isFinite(price)) return "--";
    return `${price >= 100 ? price.toFixed(0) : price.toFixed(2)} ${unit}`;
  };
  const fmtMetalAsOf = (value: string | null | undefined, ts?: number | null) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (!ts) return "刚刚";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "刚刚";
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (bytes == null) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const shiftYmd = (ymd: string, offsetDays: number) => {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    const y = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const base = new Date(Date.UTC(y, mm - 1, dd));
    base.setUTCDate(base.getUTCDate() + offsetDays);
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
  };

  const menuToday = useMemo(() => toYmd(new Date()), []);
  const [menuDate, setMenuDate] = useState<string>(() => menuToday);

  const [open, setOpen] = useState(false);

  async function loadGold(force: boolean) {
    setGoldLoading(true);
    setGoldError(null);
    const ac = new AbortController();
    try {
      const res = await fetchCngoldPrices({ force, signal: ac.signal });
      setGoldData(res);
    } catch (err: any) {
      setGoldError(err?.message ?? "获取失败");
    } finally {
      setGoldLoading(false);
      ac.abort();
    }
  }

  useEffect(() => {
    if (!open || goldLoading || goldData || goldAutoLoadRef.current) return;
    goldAutoLoadRef.current = true;
    void loadGold(false);
  }, [open, goldLoading, goldData]);

  useEffect(() => {
    if (open) return;
    goldAutoLoadRef.current = false;
  }, [open]);

  const cleanGoldLabel = (value: string) =>
    String(value ?? "")
      .replace(/\s*参考.*$/, "")
      .replace(/\s*----.*$/, "")
      .replace(/\(内地\)/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const validGoldRows = (rows?: CngoldPriceItem[]) =>
    (rows ?? []).filter((item) => Number.isFinite(item?.price) && (item?.price ?? 0) > 0 && /元\/克/.test(String(item?.unit ?? "")));

  const bankRows = useMemo(() => {
    return validGoldRows(goldData?.sections?.bars?.items)
      .map((item) => ({
        name: cleanGoldLabel(item.label),
        meta: "银行/金条参考价",
        price: item.price,
        unit: item.unit,
        metal: "gold" as const
      }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 6);
  }, [goldData]);

  const jewelryRows = useMemo(() => {
    return validGoldRows(goldData?.sections?.shops?.items)
      .filter((item) => /(黄金价格|饰品金价|足金)/.test(item.label) && !/(铂金|金条|香港)/.test(item.label))
      .map((item) => ({
        name: cleanGoldLabel(item.label).replace(/\s*(黄金价格|饰品金价|足金)$/, "").trim(),
        meta: "品牌首饰金挂牌价",
        price: item.price,
        unit: item.unit,
        metal: "gold" as const
      }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 6);
  }, [goldData]);

  const recycleRows = useMemo(() => {
    const picked = new Map<string, { name: string; meta: string; price: number; unit: string; metal: "gold" | "silver" }>();
    for (const item of validGoldRows(goldData?.sections?.recycle?.items)) {
      const label = cleanGoldLabel(item.label);
      if (/K金|铂金/.test(label)) continue;
      let name = "";
      let metal: "gold" | "silver" = "gold";
      if (/黄金回收/.test(label)) {
        name = "黄金回收";
        metal = "gold";
      } else if (/金条回收/.test(label)) {
        name = "金条回收";
        metal = "gold";
      } else if (/白银/.test(label)) {
        name = "白银回收";
        metal = "silver";
      } else if (/银条/.test(label)) {
        name = "银条回收";
        metal = "silver";
      }
      if (!name) continue;
      const prev = picked.get(name);
      if (!prev || item.price > prev.price) {
        picked.set(name, { name, meta: label, price: item.price, unit: item.unit, metal });
      }
    }
    return ["黄金回收", "金条回收", "白银回收", "银条回收"]
      .map((name) => picked.get(name))
      .filter(Boolean) as { name: string; meta: string; price: number; unit: string; metal: "gold" | "silver" }[];
  }, [goldData]);

  const goldSummaryCards = useMemo(() => {
    const goldRecycle = recycleRows.find((item) => item.metal === "gold") ?? null;
    const silverRecycle = recycleRows.find((item) => item.metal === "silver") ?? null;
    return [
      { label: "银行金条低位", item: bankRows[0] ?? null },
      { label: "首饰金低位", item: jewelryRows[0] ?? null },
      { label: "黄金回收", item: goldRecycle },
      { label: "白银回收", item: silverRecycle }
    ];
  }, [bankRows, jewelryRows, recycleRows]);

  useEffect(() => {
    if (!menuOpen) return;
    const ac = new AbortController();
    setMenuLoading(true);
    setMenuError(null);
    fetchDailyMenu({ date: menuDate, today: menuToday, signal: ac.signal })
      .then((res) => {
        setMenuData(res);
      })
      .catch((err: any) => {
        if (err?.name === "AbortError") return;
        setMenuError(err?.message ?? "获取菜单失败");
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setMenuLoading(false);
        }
      });
    return () => ac.abort();
  }, [menuDate, menuToday, menuOpen]);

  useEffect(() => {
    if (!foodBusy) {
      setFoodProgress(0);
      setFoodElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    setFoodProgress(0.02);
    const tick = () => {
      const elapsedMs = Date.now() - startedAt;
      const elapsed = Math.floor(elapsedMs / 1000);
      setFoodElapsedSec(elapsed);
      const p = Math.min(0.96, Math.max(0.02, elapsedMs / 15_000));
      setFoodProgress(p);
    };
    tick();
    const t = window.setInterval(tick, 200);
    return () => window.clearInterval(t);
  }, [foodBusy]);

  const [foodFile, setFoodFile] = useState<File | null>(null);
  const [foodBlob, setFoodBlob] = useState<Blob | null>(null);

  const compressImage = async (file: File): Promise<{ previewDataUrl: string; blob: Blob }> => {
    const targetBytes = Math.min(1_500_000, Math.max(180_000, Math.round(aiImageTargetKb * 1024)));
    const maxBytes = 5_000_000;

    const toJpegBlob = (canvas: HTMLCanvasElement, quality: number) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (!b) {
              reject(new Error("图片编码失败"));
              return;
            }
            resolve(b);
          },
          "image/jpeg",
          quality
        );
      });

    const drawToCanvas = (img: HTMLImageElement, maxDim: number) => {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context failed");
      (ctx as any).imageSmoothingEnabled = true;
      try {
        (ctx as any).imageSmoothingQuality = "high";
      } catch {}
      ctx.drawImage(img, 0, 0, w, h);
      return canvas;
    };

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        try {
          const dims =
            aiImageTargetKb <= 300 ? [640, 512, 448, 384] : aiImageTargetKb <= 600 ? [768, 640, 512, 448] : [1024, 896, 768, 640];

          let best = null as null | { canvas: HTMLCanvasElement; blob: Blob; q: number };
          for (const maxDim of dims) {
            const canvas = drawToCanvas(img, maxDim);
            let q = 0.75;
            let blob = await toJpegBlob(canvas, q);
            while (blob.size > targetBytes && q > 0.35) {
              q = Math.max(0.35, q - 0.08);
              blob = await toJpegBlob(canvas, q);
            }
            best = { canvas, blob, q };
            if (blob.size <= targetBytes) break;
          }

          if (!best) {
            reject(new Error("图片编码失败"));
            return;
          }
          if (best.blob.size > maxBytes) {
            reject(new Error("图片过大，请换更小的图片重试"));
            return;
          }
          const previewDataUrl = best.canvas.toDataURL("image/jpeg", Math.min(0.75, best.q));
          resolve({ previewDataUrl, blob: best.blob });
        } catch (err: any) {
          reject(err);
        } finally {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        reject(new Error("图片加载失败"));
      };
      img.src = url;
    });
  };

  async function onFoodFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFoodError(null);
    setFoodAnswer(null);
    setFoodPreview(null);
    setFoodFile(null);
    setFoodBlob(null);
    setFoodFileSize(null);

    if (!file.type.startsWith("image/")) {
      setFoodError("请选择图片文件");
      return;
    }

    setFoodBusy(true);
    try {
      const out = await compressImage(file);
      setFoodPreview(out.previewDataUrl);
      setFoodBlob(out.blob);
      setFoodFileSize(out.blob.size);
      setFoodFile(file); // Keep original file ref if needed, but we use compressed data
    } catch (err: any) {
      setFoodError("图片处理失败: " + err.message);
    } finally {
      setFoodBusy(false);
      e.target.value = "";
    }
  }

  async function onFoodSubmit() {
    if (!foodPreview || !foodBlob) return;
    setFoodBusy(true);
    setFoodError(null);
    try {
      const model = currentVisionModel;
      const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
      let done = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          void postClientLog({
            event: "food_submit_attempt",
            level: "info",
            data: { vendor: aiVendor, model, mode: aiImageMode, bytes: foodBlob.size, attempt }
          });
          if (aiImageMode === "url") {
            const up = await uploadFoodImage({ blob: foodBlob });
            let base = String(aiImageBaseUrl ?? "").trim().replace(/\/+$/, "");
            if (!base) base = window.location.origin.replace(/\/+$/, "");
            if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
            const imageUrl = `${base}${up.urlPath}`;
            const res = await checkFoodByImageUrl({
              imageUrl,
              vendor: aiVendor,
              model,
              thinking: aiThinking,
              systemPrompt: aiSystemPrompt,
              userPrompt: aiUserPrompt
            });
            setFoodAnswer(res);
          } else {
            const res = await checkFoodByPhotoBinary({
              blob: foodBlob,
              vendor: aiVendor,
              model,
              thinking: aiThinking,
              systemPrompt: aiSystemPrompt,
              userPrompt: aiUserPrompt
            });
            setFoodAnswer(res);
          }
          void postClientLog({
            event: "food_submit_ok",
            level: "info",
            data: { vendor: aiVendor, model, mode: aiImageMode, bytes: foodBlob.size, attempt }
          });
          done = true;
          break;
        } catch (err: any) {
          if (err?.name === "AbortError" && attempt === 0) {
            void postClientLog({
              event: "food_submit_abort",
              level: "warn",
              data: { vendor: aiVendor, model, mode: aiImageMode, bytes: foodBlob.size, attempt, message: err?.message ?? "" }
            });
            await sleep(350);
            continue;
          }
          throw err;
        }
      }
      if (!done) throw new Error("请求失败");
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? "请求被中断，请重试（可能是图片仍偏大或网络波动）" : err?.message ?? "AI 分析失败";
      void postClientLog({
        event: "food_submit_error",
        level: err?.name === "AbortError" ? "warn" : "error",
        data: { vendor: aiVendor, model: currentVisionModel, mode: aiImageMode, bytes: foodBlob.size, name: err?.name ?? "", message: err?.message ?? "" }
      });
      setFoodError(msg);
    } finally {
      setFoodProgress(1);
      setFoodBusy(false);
    }
  }

  useEffect(() => {
    return () => {
      menuRecipeStreamTokenRef.current += 1;
      if (menuRecipeReqAbortRef.current) {
        menuRecipeReqAbortRef.current.abort();
        menuRecipeReqAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    menuRecipeStreamTokenRef.current += 1;
    if (menuRecipeReqAbortRef.current) {
      menuRecipeReqAbortRef.current.abort();
      menuRecipeReqAbortRef.current = null;
    }
    setMenuRecipeBusyKey(null);
  }, [menuDate]);

  async function onMenuRecipeAsk(item: DailyMenuMeal, key: string) {
    if (!menuData) return;
    if (menuRecipeReqAbortRef.current) {
      menuRecipeReqAbortRef.current.abort();
      menuRecipeReqAbortRef.current = null;
    }
    const ac = new AbortController();
    menuRecipeReqAbortRef.current = ac;
    const streamToken = Date.now();
    menuRecipeStreamTokenRef.current = streamToken;
    setMenuRecipeBusyKey(key);
    setMenuRecipeErrorByKey((prev) => ({ ...prev, [key]: "" }));
    setMenuRecipeByKey((prev) => ({ ...prev, [key]: "" }));

    try {
      const model = currentTextModel;
      const ans = await suggestMenuRecipe(
        {
          meal: item.meal || "",
          food: item.food || "",
          date: menuData.selectedDate,
          weekday: menuData.weekday,
          weekNo: menuData.weekNo,
          provider: aiTextProvider,
          model,
          thinking: false,
          systemPrompt: aiMenuRecipeSystemPrompt,
          menuPrompt: aiMenuRecipePrompt
        },
        { signal: ac.signal }
      );
      const full = String(ans?.content ?? "").trim();
      if (!full) throw new Error("AI 未返回内容");
      const chars = [...full];
      let i = 0;
      while (i < chars.length) {
        if (menuRecipeStreamTokenRef.current !== streamToken) return;
        const next = Math.min(chars.length, i + (chars.length > 200 ? 4 : 2));
        const piece = chars.slice(0, next).join("");
        setMenuRecipeByKey((prev) => ({ ...prev, [key]: piece }));
        i = next;
        await new Promise((r) => window.setTimeout(r, 18));
      }
      void postClientLog({
        event: "menu_recipe_ok",
        level: "info",
        data: { provider: aiTextProvider, model, meal: item.meal, date: menuData.selectedDate, weekNo: menuData.weekNo }
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      const raw = String(err?.message ?? "");
      const msg = /aborted|timeout|timed out/i.test(raw) ? "请求超时，请稍后重试" : raw || "推荐失败";
      setMenuRecipeErrorByKey((prev) => ({ ...prev, [key]: msg }));
      void postClientLog({
        event: "menu_recipe_error",
        level: "warn",
        data: { provider: aiTextProvider, model: currentTextModel, meal: item.meal, message: msg }
      });
    } finally {
      if (menuRecipeStreamTokenRef.current === streamToken) {
        setMenuRecipeBusyKey(null);
      }
      if (menuRecipeReqAbortRef.current === ac) {
        menuRecipeReqAbortRef.current = null;
      }
    }
  }

  const resolveMealTone = (meal: string, idx: number): "breakfast" | "lunch" | "dinner" => {
    const m = String(meal ?? "").replace(/\s+/g, "");
    if (/(早餐|早加餐|早上加餐|上午加餐|晨加餐|早点|早|晨)/.test(m)) return "breakfast";
    if (/(午餐|中餐|午加餐|下午加餐|中午|午后|午)/.test(m)) return "lunch";
    if (/(晚餐|晚加餐|夜加餐|睡前加餐|夜宵|晚间|夜|晚)/.test(m)) return "dinner";
    if (idx <= 1) return "breakfast";
    if (idx <= 3) return "lunch";
    return "dinner";
  };

  const toneClass: Record<"breakfast" | "lunch" | "dinner", string> = {
    breakfast: "menuMealBreakfast",
    lunch: "menuMealLunch",
    dinner: "menuMealDinner"
  };

  const renderGoldMarketItem = (
    item: { name: string; meta: string; price: number; unit: string; metal: "gold" | "silver" },
    idx: number
  ) => {
    const metalText = item.metal === "silver" ? "白银" : "黄金";
    const metalClass = item.metal === "silver" ? "metalAiBadgeSilver" : "metalAiBadgeGold";
    return (
      <div key={`${item.name}-${idx}`} className="metalAiItem">
        <div className="metalAiItemMain">
          <span className={`metalAiBadge ${metalClass}`}>{metalText}</span>
          <div className="metalAiItemText">
            <div className="metalAiItemName">{item.name}</div>
            <div className="metalAiItemMeta">{item.meta}</div>
          </div>
        </div>
        <div className="metalAiItemPrice">{fmtPreciousPrice(item.price, item.unit || "元/克")}</div>
      </div>
    );
  };

  const renderGoldMarketSection = (
    section: { title: string; caption: string; emptyText: string; items: { name: string; meta: string; price: number; unit: string; metal: "gold" | "silver" }[] },
    key: string
  ) => (
    <div key={key} className="metalAiSection">
      <div className="metalAiSectionHead">
        <div>
          <div className="metalAiSectionTitle">{section.title}</div>
          <div className="metalAiSectionCaption">{section.caption}</div>
        </div>
        <div className="metalAiSectionCount">{section.items.length} 条</div>
      </div>
      {section.items.length ? (
        <div className="metalAiList">{section.items.map((item, idx) => renderGoldMarketItem(item, idx))}</div>
      ) : (
        <div className="metalAiEmpty">{section.emptyText}</div>
      )}
    </div>
  );

  return (
    <div className="page">
      <div className="card">
        <div className="cardInner">
          <div className="recordTitle">小工具</div>
          <div className="recordSub">一些方便的小功能</div>
        </div>
      </div>
      <div style={{ height: 12 }} />
      <div className="card">
        <div className="cardInner">
          <button
            className="detailsSummary"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <div style={{ textAlign: "left" }}>
              <div className="recordTitle">每日菜单</div>
              <div className="recordSub">来自 16 周食谱，规则：Week1 的周四与今天对齐</div>
            </div>
            <div style={{ transform: menuOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
              <Icon name="chev" />
            </div>
          </button>

          {menuOpen ? (
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="menuToolbar">
                <button className="miniBtn" type="button" onClick={() => setMenuDate((v) => shiftYmd(v, -1))} disabled={menuLoading}>
                  前一天
                </button>
                <input
                  className="menuDateInput"
                  type="date"
                  value={menuDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setMenuDate(v);
                  }}
                />
                <button className="miniBtn" type="button" onClick={() => setMenuDate((v) => shiftYmd(v, 1))} disabled={menuLoading}>
                  后一天
                </button>
                <button className="miniBtn" type="button" onClick={() => setMenuDate(menuToday)} disabled={menuLoading}>
                  回到今天
                </button>
              </div>

              {menuLoading ? <div className="recordSub">菜单加载中…</div> : null}
              {menuError ? <div className="errorText">{menuError}</div> : null}

              {menuData ? (
                <div className="stack">
                  <div className="recordSub">
                    {menuData.selectedDate} · Week{menuData.weekNo} · {menuData.weekday}
                  </div>
                  <div className="recordSub">{menuData.weekTitle}</div>
                  {menuData.items.length ? (
                    <div className="menuMealList">
                      {menuData.items.map((it: DailyMenuMeal, idx: number) => {
                        const tone = resolveMealTone(it.meal || "", idx);
                        return (
                          <div className={`menuMealItem ${toneClass[tone]}`} key={`${it.meal || "meal"}-${idx}`}>
                            <div className="menuMealHead">
                              <div className="menuMealName">{it.meal || `餐次${idx + 1}`}</div>
                              <div className="menuMealKcal">{it.kcal ? `${it.kcal} kcal` : "-"}</div>
                            </div>
                            <div className="menuMealFood">{it.food || "-"}</div>
                            <div className="menuMealMeta">
                              生重 {it.rawWeightGram || "-"}g · 碳水 {it.carbsGram || "-"}g · 蛋白 {it.proteinGram || "-"}g · 脂肪{" "}
                              {it.fatGram || "-"}g
                            </div>
                            {it.eatOrderTip ? <div className="menuTip">{it.eatOrderTip}</div> : null}
                            {(() => {
                              const key = `${menuData.selectedDate}-${idx}`;
                              const busy = menuRecipeBusyKey === key;
                              const text = menuRecipeByKey[key] ?? "";
                              const err = menuRecipeErrorByKey[key] ?? "";
                              return (
                                <div className="menuAiBox">
                                  <button
                                    className="miniBtn menuAiBtn"
                                    type="button"
                                    onClick={() => void onMenuRecipeAsk(it, key)}
                                    disabled={busy}
                                  >
                                    {busy ? (
                                      <span className="menuAiBtnBusy">
                                        推荐菜
                                        <span className="loadingDots" aria-hidden="true">
                                          <span className="dot">.</span>
                                          <span className="dot">.</span>
                                          <span className="dot">.</span>
                                        </span>
                                      </span>
                                    ) : (
                                      "推荐菜"
                                    )}
                                  </button>
                                  {err ? <div className="errorText">{err}</div> : null}
                                  {text ? <div className="menuAiText">{text}</div> : null}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="recordSub">该日期暂无菜单数据</div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ height: 12 }} />
      <div className="card">
        <div className="cardInner">
          <div className="stack">
            <div>
              <div className="recordTitle">孕妇饮食拍照问 AI</div>
              <div className="recordSub">拍一张食物照片，AI 判断孕期能否食用与每日建议量</div>
            </div>

            {!foodPreview ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <button
                  className="actionBtn actionBtnPrimary"
                  type="button"
                  onClick={() => {
                    setFoodError(null);
                    if (foodFileRef.current) {
                      foodFileRef.current.removeAttribute("capture");
                      foodFileRef.current.click();
                    }
                  }}
                  disabled={foodBusy}
                >
                  <div style={{ textAlign: "center", width: "100%" }}>
                    <div className="actionTitle">相册上传</div>
                  </div>
                </button>
                <button
                  className="actionBtn actionBtnPrimary"
                  type="button"
                  onClick={() => {
                    setFoodError(null);
                    if (foodFileRef.current) {
                      foodFileRef.current.setAttribute("capture", "environment");
                      foodFileRef.current.click();
                    }
                  }}
                  disabled={foodBusy}
                >
                  <div style={{ textAlign: "center", width: "100%" }}>
                    <div className="actionTitle">拍照</div>
                  </div>
                </button>
              </div>
            ) : (
              <div className="stack">
                {foodBusy ? (
                  <div className="stack">
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8 }}>
                      <div>分析中…</div>
                      <div>{Math.min(99, Math.round(foodProgress * 100))}% · {Math.min(99, foodElapsedSec)}s{foodFileSize ? ` · ${formatFileSize(foodFileSize)}` : ""}</div>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: "var(--glass-2)", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, Math.round(foodProgress * 100))}%`,
                          background: "linear-gradient(90deg, var(--pink) 0%, rgba(var(--pink2-rgb), 0.78) 55%, rgba(255, 255, 255, 0.2) 100%)",
                          transition: "width 0.2s ease"
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>预计约 15 秒，偶尔因模型侧拥塞会更久</div>
                  </div>
                ) : null}
                <div 
                  className="priceTableWrap" 
                  style={{ 
                    borderRadius: 18, 
                    overflow: "hidden", 
                    maxHeight: foodAnswer ? 120 : 300, 
                    transition: "max-height 0.3s ease" 
                  }}
                >
                  <img 
                    src={foodPreview} 
                    alt="食物照片" 
                    style={{ 
                      width: "100%", 
                      height: "100%",
                      objectFit: "cover",
                      display: "block" 
                    }} 
                  />
                </div>

                {!foodBusy && foodFileSize ? (
                   <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                     图片已处理 ({formatFileSize(foodFileSize)})
                   </div>
                ) : null}

                {!foodAnswer && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                    <button
                      className="actionBtn"
                      type="button"
                      style={{ background: "var(--glass-2)", border: "none" }}
                      onClick={() => {
                        setFoodPreview(null);
                        setFoodFile(null);
                        setFoodBlob(null);
                        setFoodAnswer(null);
                        setFoodError(null);
                      }}
                      disabled={foodBusy}
                    >
                      <div style={{ textAlign: "center", width: "100%" }}>
                        <div className="actionTitle" style={{ color: "var(--text)" }}>重选</div>
                      </div>
                    </button>
                    <button
                      className="actionBtn actionBtnPrimary"
                      type="button"
                      onClick={onFoodSubmit}
                      disabled={foodBusy}
                    >
                      <div style={{ textAlign: "center", width: "100%" }}>
                        <div className="actionTitle">{foodBusy ? "分析中…" : "确认并询问 AI"}</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

            <input
              ref={foodFileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={onFoodFileSelect}
            />

            {foodError ? <div className="errorText">{foodError}</div> : null}

            {foodAnswer ? (
              <div className="stack">
                <div className="card" style={{ background: "var(--glass-1)" }}>
                  <div className="cardInner">
                    <div className="recordSub" style={{ marginBottom: 8 }}>
                      模型：{foodAnswer.model}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13 }}>{foodAnswer.content}</div>
                  </div>
                </div>
                <button
                  className="actionBtn"
                  type="button"
                  style={{ background: "var(--glass-2)", border: "none", marginTop: 8 }}
                  onClick={() => {
                    setFoodPreview(null);
                    setFoodFile(null);
                    setFoodBlob(null);
                    setFoodAnswer(null);
                    setFoodError(null);
                  }}
                >
                  <div style={{ textAlign: "center", width: "100%" }}>
                    <div className="actionTitle" style={{ fontSize: 13 }}>再测一次</div>
                  </div>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div style={{ height: 12 }} />
      <div className="card">
        <div className="cardInner">
          <div className="stack">
            <button 
              className="detailsSummary" 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              onClick={() => setOpen(!open)}
            >
              <div style={{ textAlign: 'left' }}>
                <div className="recordTitle">今日金价</div>
                <div className="recordSub">固定行情源整理银行金条、首饰金与黄金白银回收价</div>
              </div>
              <div style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                <Icon name="chev" />
              </div>
            </button>

            {open && (
              <div className="metalAiWrap">
                <div className="metalAiMetaCard">
                  <div className="metalAiToolbar">
                    <div className="metalAiToolbarInfo">
                      <div className="metalAiMetaTitle">固定数据源</div>
                      <div className="metalAiMetaText">
                        {goldData ? `${goldData.source} · ${fmtMetalAsOf(null, goldData.updatedAt)}` : "展开后自动拉取，支持手动刷新"}
                      </div>
                    </div>
                    <div className="metalAiToolbarActions">
                      <div className="metalAiMetaTag">{goldData?.cached ? "缓存" : "实时"}</div>
                      <button className="miniBtn metalAiMiniBtn" type="button" onClick={() => void loadGold(true)} disabled={goldLoading}>
                        {goldLoading ? "刷新中…" : "刷新"}
                      </button>
                    </div>
                  </div>
                </div>

                {goldError ? <div className="errorText">{goldError}</div> : null}

                {goldData ? (
                  <div className="metalAiBoard">
                    <div className="metalAiSummaryGrid">
                      {goldSummaryCards.map((card) => (
                        <div key={card.label} className="metalAiSummaryCard">
                          <div className="metalAiSummaryLabel">{card.label}</div>
                          <div className="metalAiSummaryValue">{fmtPreciousPrice(card.item?.price, card.item?.unit ?? "元/克")}</div>
                          <div className="metalAiSummaryHint">{card.item?.name ?? "暂无数据"}</div>
                        </div>
                      ))}
                    </div>

                    <div className="metalAiSectionGrid">
                      {renderGoldMarketSection(
                        {
                          title: "银行金条",
                          caption: "优先展示主流银行与投资金条",
                          emptyText: "暂未拉到银行金条价格",
                          items: bankRows
                        },
                        "bank"
                      )}
                      {renderGoldMarketSection(
                        {
                          title: "首饰金",
                          caption: "展示主流品牌挂牌首饰金",
                          emptyText: "暂未拉到首饰金价格",
                          items: jewelryRows
                        },
                        "jewelry"
                      )}
                      {renderGoldMarketSection(
                        {
                          title: "回收价格",
                          caption: "仅保留黄金与白银回收参考",
                          emptyText: "暂未拉到回收报价",
                          items: recycleRows
                        },
                        "recycle"
                      )}
                    </div>

                    <div className="metalAiFootnote">固定行情源整理，仅供参考，请以银行、品牌门店与实际回收报价为准。</div>
                  </div>
                ) : !goldLoading ? (
                  <div className="metalAiPlaceholder">
                    展开后会读取固定行情源，保留银行金条、首饰金与黄金白银回收价。
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
