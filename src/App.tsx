import { useEffect, useMemo, useRef, useState } from "react";
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
import { clearAll, loadState, saveState } from "./storage";
import { navTo, Route, toHash } from "./routes";
import { useHashRoute } from "./useHashRoute";
import { CngoldPriceItem, CngoldPricesResponse, fetchCngoldPrices, fetchState, pushState } from "./api";

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

function TopNav({ title }: { title: string }) {
  return (
    <div className="topNav">
      <div className="topNavRow">
        <div className="topTitle">{title}</div>
        <div style={{ width: 82 }} />
      </div>
    </div>
  );
}

function BottomNav({ route }: { route: Route }) {
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
              <button className="eventChip eventMoreBtn" onClick={onOpenDetail} type="button">
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

function DetailSheet({
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

function DayDrawer({
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

function HomePage({
  pregnancy,
  pregnancyInfo,
  records,
  eventsByHour,
  currentHourEffective,
  currentHourClicks,
  bubbleSpeed,
  onQuickAdd,
  onOpenDetail
}: {
  pregnancy: ReturnType<typeof computePregnancy>;
  pregnancyInfo: PregnancyInfo;
  records: HourRecord[];
  eventsByHour: Map<number, MovementEvent[]>;
  currentHourEffective: number;
  currentHourClicks: number;
  bubbleSpeed: number;
  onQuickAdd: (t: MovementType) => void;
  onOpenDetail: (hourStart: number) => void;
}) {
  const top3 = records.filter((r) => r.effectiveCount > 0).slice(0, 3);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const bubbleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const animRef = useRef<number | null>(null);
  const seedRef = useRef(20260301);
  const speedRef = useRef(bubbleSpeed);
  const speedPrevRef = useRef(bubbleSpeed);
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

  return (
    <div className="page">
      <div className="card">
        <div className="cardInner">
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div className="pill">
                <span className="muted">当前孕期</span>
                <strong>{formatGestation(pregnancy)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                末次月经：{pregnancyInfo.lmpDate}
              </div>
            </div>
            <div className="pill">
              <span className="muted">进度</span>
              <strong>{pregnancy.progressPct}%</strong>
            </div>
          </div>

          <div className="progressWrap">
            <div className="progressBar" aria-label="孕期进度">
              <div className="progressFill" style={{ width: `${pregnancy.progressPct}%` }} />
            </div>
            <div className="progressMeta">
              <div>目标 40周</div>
              <div>{pregnancy.stage}</div>
            </div>
            <div className="stageLine">
              <div className={`stageItem ${pregnancy.stage === "孕早期" ? "stageItemActive" : ""}`}>孕早期</div>
              <div className={`stageItem ${pregnancy.stage === "孕中期" ? "stageItemActive" : ""}`}>孕中期</div>
              <div className={`stageItem ${pregnancy.stage === "孕晚期" ? "stageItemActive" : ""}`}>孕晚期</div>
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

function formatDateKey(d: Date) {
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

function StatsCalendarPage({
  events,
  records,
  onOpenHourDetail,
  onOpenDay
}: {
  events: MovementEvent[];
  records: HourRecord[];
  onOpenHourDetail: (hourStart: number) => void;
  onOpenDay: (dayKey: string) => void;
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

function MinePage({
  pregnancyInfo,
  events,
  onUpdatePregnancyInfo,
  onRestore,
  onGenerateTestData,
  bubbleSpeed,
  onBubbleSpeedChange,
  themeMode,
  onThemeModeChange,
  onClear
}: {
  pregnancyInfo: PregnancyInfo;
  events: MovementEvent[];
  onUpdatePregnancyInfo: (next: PregnancyInfo) => void;
  onRestore: (payload: { pregnancyInfo: PregnancyInfo; events: MovementEvent[]; bubbleSpeed?: number; themeMode?: "dark" | "light" }) => void;
  onGenerateTestData: () => void;
  bubbleSpeed: number;
  onBubbleSpeedChange: (v: number) => void;
  themeMode: "dark" | "light";
  onThemeModeChange: (v: "dark" | "light") => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  function exportBackup() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      pregnancyInfo,
      events,
      bubbleSpeed,
      themeMode
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
    const bs = parsed?.bubbleSpeed;
    const tm = parsed?.themeMode;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
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
    const nextBubbleSpeed = typeof bs === "number" && Number.isFinite(bs) ? Math.min(1, Math.max(0.2, bs)) : undefined;
    const nextThemeMode = tm === "light" || tm === "dark" ? tm : undefined;
    if (nextBubbleSpeed != null) onBubbleSpeedChange(nextBubbleSpeed);
    if (nextThemeMode) onThemeModeChange(nextThemeMode);
    onRestore({
      pregnancyInfo: { lmpDate: pi.lmpDate, babyName: typeof pi.babyName === "string" ? pi.babyName : "" },
      events: normalized,
      bubbleSpeed: nextBubbleSpeed,
      themeMode: nextThemeMode
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

function WidgetsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CngoldPricesResponse | null>(null);

  const fmt = (n: number | null | undefined, digits?: number | null) => {
    if (n == null || !Number.isFinite(n)) return "-";
    const d = typeof digits === "number" && Number.isFinite(digits) ? digits : 2;
    return d <= 0 ? String(Math.round(n)) : n.toFixed(d);
  };

  const fmtPercent = (n: number | null | undefined, digits?: number | null) => {
    if (n == null || !Number.isFinite(n)) return "-";
    const d = typeof digits === "number" && Number.isFinite(digits) ? Math.min(4, Math.max(0, digits)) : 2;
    return `${n.toFixed(d)}%`;
  };

  const fmtTime = (ts: number | null | undefined) => {
    if (!ts) return "-";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "-";
    }
  };

  const [open, setOpen] = useState(false);

  async function load(force: boolean) {
    setLoading(true);
    setError(null);
    const ac = new AbortController();
    try {
      const res = await fetchCngoldPrices({ force, signal: ac.signal });
      setData(res);
    } catch (err: any) {
      setError(err?.message ?? "获取失败");
    } finally {
      setLoading(false);
      ac.abort();
    }
  }

  useEffect(() => {
    if (open && !data && !loading) {
      void load(false);
    }
  }, [open]);

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
          <div className="stack">
            <button 
              className="detailsSummary" 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              onClick={() => setOpen(!open)}
            >
              <div style={{ textAlign: 'left' }}>
                <div className="recordTitle">今日金价</div>
                <div className="recordSub">现货贵金属与金店价格（仅供参考）</div>
              </div>
              <div style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                <Icon name="chev" />
              </div>
            </button>

            {open && (
              <div className="stack" style={{ marginTop: 12 }}>
                <button className="actionBtn actionBtnPrimary" type="button" onClick={() => void load(true)} disabled={loading}>
                  <div>
                    <div className="actionTitle">{loading ? "获取中…" : "获取最新价格"}</div>
                    <div className="actionSub">金价 / 金店金价 / 金条 / 回收价格</div>
                  </div>
                </button>

                {error ? <div className="errorText">{error}</div> : null}

                {data ? (
                  <div className="stack">
                    <div className="recordSub">
                      数据来源：{data.source}
                      {data.updatedAt ? ` · 更新时间：${new Date(data.updatedAt).toLocaleString()}` : ""}
                    </div>

                    {(["shops", "bars", "recycle"] as const).map((k) => {
                      const sec = data.sections[k];
                      const items = sec.items ?? [];
                      const limit = k === "bars" ? 3 : 8;
                      const rows = items.slice(0, limit);

                      const Table = ({ rows }: { rows: CngoldPriceItem[] }) => (
                        <div className="priceTableWrap">
                          <table className="priceTable">
                            <thead>
                              <tr>
                                <th>名称</th>
                                <th>最新价</th>
                                <th>昨收价</th>
                                <th>更新时间</th>
                                <th>单位</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((it) => {
                                let label = it.label;
                                if (k === "bars") {
                                  if (label.includes("建行")) label = "建设银行";
                                  else if (label.includes("中行")) label = "中国银行";
                                  else if (label.includes("工行")) label = "工商银行";
                                }
                                return (
                                  <tr key={it.code}>
                                    <td className="priceName">{label}</td>
                                    <td className="priceNum">{fmt(it.price, it.digits)}</td>
                                    <td className="priceNum">{fmt(it.prevClose, it.digits)}</td>
                                    <td className="priceTime">{fmtTime(it.updatedAt)}</td>
                                    <td className="priceUnit">{it.unit}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );

                      return (
                        <div key={k} className="stack">
                          <div className="recordTitle">{sec.title}</div>
                          <Table rows={rows} />
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="recordSub">提示：以上数据仅供参考，请以实际成交/门店为准。</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const route = useHashRoute();
  const fallbackPreg = useMemo(() => defaultPregnancyInfo(new Date()), []);
  const initialState = useMemo(() => loadState(fallbackPreg), [fallbackPreg]);
  const [events, setEvents] = useState<MovementEvent[]>(() => initialState.events);
  const [pregnancyInfo, setPregnancyInfo] = useState<PregnancyInfo>(() => initialState.pregnancyInfo);
  const [updatedAt, setUpdatedAt] = useState<number>(() => initialState.updatedAt);
  const [detailHour, setDetailHour] = useState<number | null>(null);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [dayTall, setDayTall] = useState(false);
  const suppressSaveRef = useRef(true);
  const [bubbleSpeed, setBubbleSpeed] = useState<number>(() => initialState.bubbleSpeed);
  const [themeMode, setThemeMode] = useState<"dark" | "light">(() => initialState.themeMode);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  const records = useMemo(() => groupByHour(events), [events]);
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
  const pregnancy = useMemo(() => computePregnancy(pregnancyInfo), [pregnancyInfo]);

  const currentHourEffective = useMemo(() => {
    const now = Date.now();
    const start = Math.floor(now / 3_600_000) * 3_600_000;
    const currentHourEvents = events.filter((e) => e.ts >= start && e.ts <= now);
    return effectiveCount(currentHourEvents);
  }, [events]);

  const currentHourClicks = useMemo(() => {
    const now = Date.now();
    const start = Math.floor(now / 3_600_000) * 3_600_000;
    return events.filter((e) => e.ts >= start && e.ts <= now).length;
  }, [events]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const remote = await fetchState(ac.signal);
        if (typeof remote?.updatedAt === "number" && remote.updatedAt > updatedAt) {
          suppressSaveRef.current = true;
          const remoteEvents = Array.isArray(remote.events)
            ? remote.events
                .filter((e: any) => typeof e?.id === "string" && typeof e?.type === "string" && typeof e?.ts === "number")
                .slice(0, 2000)
            : [];
          const remotePreg =
            remote?.pregnancyInfo && typeof (remote as any).pregnancyInfo?.lmpDate === "string" && (remote as any).pregnancyInfo.lmpDate
              ? remote.pregnancyInfo
              : fallbackPreg;
          const remoteBubble =
            typeof (remote as any)?.bubbleSpeed === "number" && Number.isFinite((remote as any).bubbleSpeed)
              ? Math.min(1, Math.max(0.2, (remote as any).bubbleSpeed))
              : initialState.bubbleSpeed;
          const remoteTheme = (remote as any)?.themeMode === "light" || (remote as any)?.themeMode === "dark" ? remote.themeMode : initialState.themeMode;
          setEvents(remoteEvents);
          setPregnancyInfo(remotePreg);
          setBubbleSpeed(remoteBubble);
          setThemeMode(remoteTheme);
          setUpdatedAt(remote.updatedAt);
        } else if (updatedAt > (remote?.updatedAt ?? 0)) {
          await pushState({ pregnancyInfo, events, bubbleSpeed, themeMode, updatedAt }, ac.signal);
        }
      } catch {}
      suppressSaveRef.current = false;
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (suppressSaveRef.current) {
      saveState({ pregnancyInfo, events, bubbleSpeed, themeMode, updatedAt });
      return;
    }
    const nextUpdatedAt = Date.now();
    setUpdatedAt(nextUpdatedAt);
    saveState({ pregnancyInfo, events, bubbleSpeed, themeMode, updatedAt: nextUpdatedAt });
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      pushState({ pregnancyInfo, events, bubbleSpeed, themeMode, updatedAt: nextUpdatedAt }, ac.signal).catch(() => {});
    }, 800);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [events, pregnancyInfo, bubbleSpeed, themeMode]);

  function addMovement(type: MovementType) {
    const next: MovementEvent = { id: newId(), type, ts: Date.now() };
    const merged = [next, ...events].slice(0, 2000);
    setEvents(merged);
  }

  function addMovementAt(type: MovementType, ts: number) {
    const next: MovementEvent = { id: newId(), type, ts };
    const merged = [next, ...events].slice(0, 2000);
    setEvents(merged);
  }


  function updatePregnancy(next: PregnancyInfo) {
    setPregnancyInfo(next);
  }

  function clear() {
    clearAll();
    const nextPreg = defaultPregnancyInfo(new Date());
    const nextUpdatedAt = Date.now();
    suppressSaveRef.current = true;
    setEvents([]);
    setPregnancyInfo(nextPreg);
    setBubbleSpeed(0.35);
    setThemeMode("dark");
    setUpdatedAt(nextUpdatedAt);
    saveState({ pregnancyInfo: nextPreg, events: [], bubbleSpeed: 0.35, themeMode: "dark", updatedAt: nextUpdatedAt });
    pushState({ pregnancyInfo: nextPreg, events: [], bubbleSpeed: 0.35, themeMode: "dark", updatedAt: nextUpdatedAt }).catch(() => {});
    suppressSaveRef.current = false;
    navTo({ name: "home" });
  }

  function restore(payload: { pregnancyInfo: PregnancyInfo; events: MovementEvent[]; bubbleSpeed?: number; themeMode?: "dark" | "light" }) {
    const nextEvents = [...payload.events].sort((a, b) => b.ts - a.ts).slice(0, 2000);
    const nextPreg = payload.pregnancyInfo;
    const nextBubbleSpeed =
      typeof payload.bubbleSpeed === "number" && Number.isFinite(payload.bubbleSpeed)
        ? Math.min(1, Math.max(0.2, payload.bubbleSpeed))
        : bubbleSpeed;
    const nextThemeMode = payload.themeMode === "light" || payload.themeMode === "dark" ? payload.themeMode : themeMode;
    const nextUpdatedAt = Date.now();
    suppressSaveRef.current = true;
    setEvents(nextEvents);
    setPregnancyInfo(nextPreg);
    setBubbleSpeed(nextBubbleSpeed);
    setThemeMode(nextThemeMode);
    setUpdatedAt(nextUpdatedAt);
    saveState({ pregnancyInfo: nextPreg, events: nextEvents, bubbleSpeed: nextBubbleSpeed, themeMode: nextThemeMode, updatedAt: nextUpdatedAt });
    pushState({ pregnancyInfo: nextPreg, events: nextEvents, bubbleSpeed: nextBubbleSpeed, themeMode: nextThemeMode, updatedAt: nextUpdatedAt }).catch(() => {});
    suppressSaveRef.current = false;
    navTo({ name: "home" });
  }

  function generateTestData() {
    const types: MovementType[] = ["hiccup", "hand", "kick"];
    const dayMs = 86_400_000;
    const hourMs = 3_600_000;
    const now = Date.now();
    const todayStart = new Date(new Date(now).toDateString()).getTime();

    let seed = 20260227;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    const generated: MovementEvent[] = [];

    const add = (ts: number, idx: number) => {
      generated.push({ id: newId(), type: types[idx % types.length], ts });
    };

    const addHourPattern = (dayOffset: number, hour: number, mins: number[], startTypeIdx: number) => {
      const dayStart = todayStart - dayOffset * dayMs;
      for (let i = 0; i < mins.length; i++) {
        const sec = Math.floor(rand() * 50);
        add(dayStart + hour * hourMs + mins[i] * 60_000 + sec * 1000, startTypeIdx + i);
      }
    };

    const addCluster = (hourStart: number, count: number, spanMs: number, startTypeIdx: number) => {
      for (let i = 0; i < count; i++) {
        const within = Math.floor(rand() * spanMs);
        add(hourStart + within, startTypeIdx + i);
      }
    };

    for (let d = 0; d < 7; d++) {
      const baseHour = (d * 3 + 8) % 24;
      addHourPattern(d, baseHour, [2, 8], d);
      addHourPattern(d, (baseHour + 2) % 24, [1, 7, 13], d + 3);
      addHourPattern(d, (baseHour + 5) % 24, [5, 9, 14, 20], d + 6);

      if (d % 2 === 0) {
        const dayStart = todayStart - d * dayMs;
        const hourStart = dayStart + ((baseHour + 9) % 24) * hourMs;
        addCluster(hourStart, 18 + Math.floor(rand() * 18), 4 * 60_000, d + 9);
      }
    }

    const heavyHourStart = Math.floor(now / hourMs) * hourMs;
    addCluster(heavyHourStart, 60, 4 * 60_000, 1000);

    const boundaryDayStart = todayStart - 2 * dayMs;
    addHourPattern(2, 23, [55, 58], 2000);
    addHourPattern(1, 0, [1, 4], 2100);

    const last12hHourStart = Math.floor((now - 2 * hourMs) / hourMs) * hourMs;
    addCluster(last12hHourStart, 10, 50 * 60_000, 2200);

    const olderHourStart = Math.floor((now - 14 * hourMs) / hourMs) * hourMs;
    addCluster(olderHourStart, 12, 50 * 60_000, 2300);

    generated.sort((a, b) => b.ts - a.ts);
    restore({ pregnancyInfo, events: generated.slice(0, 2000) });
  }

  const babyPrefix = (pregnancyInfo.babyName ?? "").trim();
  const topTitle =
    route.name === "home"
      ? `${babyPrefix ? `${babyPrefix} · ` : ""}胎动记录`
      : route.name === "stats"
        ? "统计"
        : route.name === "widgets"
          ? "小工具"
        : "我的";

  return (
    <div className="appShell">
      <TopNav title={topTitle} />
      {route.name === "home" ? (
        <HomePage
          pregnancy={pregnancy}
          pregnancyInfo={pregnancyInfo}
          records={records}
          eventsByHour={eventsByHour}
          currentHourEffective={currentHourEffective}
          currentHourClicks={currentHourClicks}
          bubbleSpeed={bubbleSpeed}
          onQuickAdd={(t) => addMovement(t)}
          onOpenDetail={(h) => setDetailHour(h)}
        />
      ) : route.name === "stats" ? (
        <StatsCalendarPage
          events={events}
          records={records}
          onOpenHourDetail={(h) => setDetailHour(h)}
          onOpenDay={(k) => {
            setDayKey(k);
            setDayTall(false);
          }}
        />
      ) : route.name === "widgets" ? (
        <WidgetsPage />
      ) : (
        <MinePage
          pregnancyInfo={pregnancyInfo}
          events={events}
          onUpdatePregnancyInfo={updatePregnancy}
          onRestore={restore}
          onGenerateTestData={generateTestData}
          bubbleSpeed={bubbleSpeed}
          onBubbleSpeedChange={setBubbleSpeed}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          onClear={clear}
        />
      )}
      <BottomNav route={route} />
      <DetailSheet
        open={detailHour != null}
        title={detailHour != null ? formatHourLabel(detailHour) : ""}
        events={detailHour != null ? eventsByHour.get(detailHour) ?? [] : []}
        onClose={() => setDetailHour(null)}
      />
      {dayKey ? (
        <DayDrawer
          open={!!dayKey}
          tall={dayTall}
          dayKey={dayKey}
          totalEffective={records
            .filter((r) => formatDateKey(new Date(r.hourStart)) === dayKey)
            .reduce((acc, r) => acc + r.effectiveCount, 0)}
          totalClicks={events.filter((e) => formatDateKey(new Date(e.ts)) === dayKey).length}
          ok={
            records
              .filter((r) => formatDateKey(new Date(r.hourStart)) === dayKey)
              .reduce((acc, r) => acc + r.effectiveCount, 0) >= 12
          }
          events={events
            .filter((e) => formatDateKey(new Date(e.ts)) === dayKey)
            .sort((a, b) => a.ts - b.ts)}
          onClose={() => setDayKey(null)}
          onToggleTall={() => setDayTall((v) => !v)}
          onAdd={(t) => {
            const d = new Date(`${dayKey}T00:00:00`);
            const dayStart = d.getTime();
            const msInDay = Date.now() % 86_400_000;
            addMovementAt(t, dayStart + msInDay);
          }}
          onOpenHour={(h) => {
            setDayKey(null);
            setDetailHour(h);
          }}
        />
      ) : null}
    </div>
  );
}
