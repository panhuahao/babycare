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
import { fetchState, pushState } from "./api";

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
    { label: "记录", icon: "grid", to: { name: "history" } },
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

function Sheet({
  open,
  onClose,
  onPick
}: {
  open: boolean;
  onClose: () => void;
  onPick: (t: MovementType) => void;
}) {
  if (!open) return null;
  return (
    <div className="sheetOverlay" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheetHeader">
          <div className="sheetHeaderTitle">选择一次胎动表现</div>
          <button className="iconBtn" onClick={onClose} aria-label="关闭">
            <Icon name="chev" />
          </button>
        </div>
        <div className="sheetActions">
          <button className="pickBtn pickBtnPrimary" onClick={() => onPick("hiccup")}>
            <div>
              <div className="actionTitle">打嗝</div>
              <div className="actionSub">轻微、规律的小颤动</div>
            </div>
          </button>
          <button className="pickBtn" onClick={() => onPick("hand")}>
            <div>
              <div className="actionTitle">伸伸手</div>
              <div className="actionSub">轻柔的推顶或滑动感</div>
            </div>
          </button>
          <button className="pickBtn" onClick={() => onPick("kick")}>
            <div>
              <div className="actionTitle">踢踢脚</div>
              <div className="actionSub">较明显的踢动或翻滚</div>
            </div>
          </button>
        </div>
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

function HomePage({
  pregnancy,
  pregnancyInfo,
  records,
  eventsByHour,
  currentHourEffective,
  onOpenPick,
  onOpenDetail
}: {
  pregnancy: ReturnType<typeof computePregnancy>;
  pregnancyInfo: PregnancyInfo;
  records: HourRecord[];
  eventsByHour: Map<number, MovementEvent[]>;
  currentHourEffective: number;
  onOpenPick: () => void;
  onOpenDetail: (hourStart: number) => void;
}) {
  const top3 = records.filter((r) => r.effectiveCount > 0).slice(0, 3);
  const [ringPulse, setRingPulse] = useState(false);
  const ringTimerRef = useRef<number | null>(null);

  function handleRingClick() {
    if (ringTimerRef.current != null) window.clearTimeout(ringTimerRef.current);
    setRingPulse(true);
    ringTimerRef.current = window.setTimeout(() => setRingPulse(false), 520);
    onOpenPick();
  }

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

      <div className="ringWrap">
        <button className={`ring${ringPulse ? " ringPulse" : ""}`} onClick={handleRingClick} aria-label="记录胎动">
          <div className="ringInner">
            <div>
              <div className="ringCount">{currentHourEffective}</div>
              <div className="ringHint">本小时有效胎动</div>
              <div className="ringHint">点击记录一次</div>
            </div>
          </div>
        </button>
      </div>

      <div className="sectionTitle">
        <h2>最近记录（按小时聚合）</h2>
        <a className="link" href={toHash({ name: "history" })}>
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
                暂无记录。点击上方圆环，选择一次胎动表现即可完成记录。
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsCalendarPage({ events, records }: { events: MovementEvent[]; records: HourRecord[] }) {
  const now = Date.now();
  const hours = groupByHour(events);
  const last12hTotal = last12HoursEffectiveTotal(events, now);
  const recent = hours.slice(0, 12).reverse();
  const max = Math.max(3, ...recent.map((r) => r.effectiveCount));

  const byDay = useMemo(() => {
    const map = new Map<string, HourRecord[]>();
    for (const r of records) {
      if (r.effectiveCount <= 0) continue;
      const d = new Date(r.hourStart);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [records]);

  return (
    <div className="page">
      <div className="card">
        <div className="cardInner">
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
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {recent.length ? (
              recent.map((r) => (
                <div key={r.hourStart} style={{ display: "grid", gap: 6 }}>
                  <div className="recordRow" style={{ alignItems: "baseline" }}>
                    <div className="recordSub">{formatHourLabel(r.hourStart)}</div>
                    <div className="recordSub">有效 {r.effectiveCount} · 点击 {r.rawClicks}</div>
                  </div>
                  <div className="progressBar" aria-label="小时胎动">
                    <div className="progressFill" style={{ width: `${Math.round((r.effectiveCount / max) * 100)}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                暂无统计数据。先在首页记录胎动，再回来查看趋势。
              </div>
            )}
          </div>
          <div className="hint" style={{ marginTop: 12 }}>
            规则：5分钟内多次点击按1次有效胎动计；每小时有效胎动 ≥3 次通常视为正常。
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="cardInner">
          <div className="recordTitle">日历</div>
          <div className="recordSub">按日期查看有记录的小时</div>
        </div>
      </div>
      <div style={{ height: 12 }} />

      <div className="stack">
        {byDay.length ? (
          byDay.map(([day, list]) => (
            <div key={day} className="card">
              <div className="cardInner">
                <div className="recordRow">
                  <div className="recordTitle">{day}</div>
                  <div className="pill">
                    <strong>{list.reduce((a, b) => a + b.effectiveCount, 0)}</strong>
                    <span className="muted">次</span>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {list
                    .sort((a, b) => b.hourStart - a.hourStart)
                    .slice(0, 6)
                    .map((r) => (
                      <div key={r.hourStart} className="recordRow">
                        <div className="recordSub">{formatHourLabel(r.hourStart)}</div>
                        <Badge status={statusForHour(r.effectiveCount)} />
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="card">
            <div className="cardInner">
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                暂无日历数据。
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryPage({
  records,
  eventsByHour,
  onOpenDetail
}: {
  records: HourRecord[];
  eventsByHour: Map<number, MovementEvent[]>;
  onOpenDetail: (hourStart: number) => void;
}) {
  const list = records.filter((r) => r.effectiveCount > 0);
  return (
    <div className="page">
      <div className="card">
        <div className="cardInner">
          <div className="recordTitle">全部历史（按小时）</div>
          <div className="recordSub">包含每次点击的具体时间与表现</div>
        </div>
      </div>
      <div style={{ height: 12 }} />
      <div className="list">
        {list.length ? (
          list.map((r) => (
            <HourRecordRow
              key={r.hourStart}
              rec={r}
              events={eventsByHour.get(r.hourStart) ?? []}
              onOpenDetail={() => onOpenDetail(r.hourStart)}
            />
          ))
        ) : null}
      </div>
      {!list.length ? (
        <div style={{ marginTop: 12 }} className="card">
          <div className="cardInner">
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              暂无历史记录。
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MinePage({
  pregnancyInfo,
  events,
  onUpdatePregnancyInfo,
  onRestore,
  onGenerateTestData,
  onClear
}: {
  pregnancyInfo: PregnancyInfo;
  events: MovementEvent[];
  onUpdatePregnancyInfo: (next: PregnancyInfo) => void;
  onRestore: (payload: { pregnancyInfo: PregnancyInfo; events: MovementEvent[] }) => void;
  onGenerateTestData: () => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  function exportBackup() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      pregnancyInfo,
      events
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
    onRestore({ pregnancyInfo: { lmpDate: pi.lmpDate, babyName: typeof pi.babyName === "string" ? pi.babyName : "" }, events: normalized });
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
              <summary className="detailsSummary">高级设置</summary>
              <div className="detailsBody">
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

export function App() {
  const route = useHashRoute();
  const fallbackPreg = useMemo(() => defaultPregnancyInfo(new Date()), []);
  const initialState = useMemo(() => loadState(fallbackPreg), [fallbackPreg]);
  const [events, setEvents] = useState<MovementEvent[]>(() => initialState.events);
  const [pregnancyInfo, setPregnancyInfo] = useState<PregnancyInfo>(() => initialState.pregnancyInfo);
  const [updatedAt, setUpdatedAt] = useState<number>(() => initialState.updatedAt);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailHour, setDetailHour] = useState<number | null>(null);
  const suppressSaveRef = useRef(true);

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
          setEvents(remoteEvents);
          setPregnancyInfo(remotePreg);
          setUpdatedAt(remote.updatedAt);
        } else if (updatedAt > (remote?.updatedAt ?? 0)) {
          await pushState({ pregnancyInfo, events, updatedAt }, ac.signal);
        }
      } catch {}
      suppressSaveRef.current = false;
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (suppressSaveRef.current) return;
    const nextUpdatedAt = Date.now();
    setUpdatedAt(nextUpdatedAt);
    saveState({ pregnancyInfo, events, updatedAt: nextUpdatedAt });
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      pushState({ pregnancyInfo, events, updatedAt: nextUpdatedAt }, ac.signal).catch(() => {});
    }, 800);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [events, pregnancyInfo]);

  function addMovement(type: MovementType) {
    const next: MovementEvent = { id: newId(), type, ts: Date.now() };
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
    setUpdatedAt(nextUpdatedAt);
    saveState({ pregnancyInfo: nextPreg, events: [], updatedAt: nextUpdatedAt });
    pushState({ pregnancyInfo: nextPreg, events: [], updatedAt: nextUpdatedAt }).catch(() => {});
    suppressSaveRef.current = false;
    navTo({ name: "home" });
  }

  function restore(payload: { pregnancyInfo: PregnancyInfo; events: MovementEvent[] }) {
    const nextEvents = [...payload.events].sort((a, b) => b.ts - a.ts).slice(0, 2000);
    const nextPreg = payload.pregnancyInfo;
    const nextUpdatedAt = Date.now();
    suppressSaveRef.current = true;
    setEvents(nextEvents);
    setPregnancyInfo(nextPreg);
    setUpdatedAt(nextUpdatedAt);
    saveState({ pregnancyInfo: nextPreg, events: nextEvents, updatedAt: nextUpdatedAt });
    pushState({ pregnancyInfo: nextPreg, events: nextEvents, updatedAt: nextUpdatedAt }).catch(() => {});
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
        : route.name === "history"
          ? "历史"
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
          onOpenPick={() => setSheetOpen(true)}
          onOpenDetail={(h) => setDetailHour(h)}
        />
      ) : route.name === "stats" ? (
        <StatsCalendarPage events={events} records={records} />
      ) : route.name === "history" ? (
        <HistoryPage records={records} eventsByHour={eventsByHour} onOpenDetail={(h) => setDetailHour(h)} />
      ) : (
        <MinePage
          pregnancyInfo={pregnancyInfo}
          events={events}
          onUpdatePregnancyInfo={updatePregnancy}
          onRestore={restore}
          onGenerateTestData={generateTestData}
          onClear={clear}
        />
      )}
      <BottomNav route={route} />
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={(t) => {
          addMovement(t);
          setSheetOpen(false);
        }}
      />
      <DetailSheet
        open={detailHour != null}
        title={detailHour != null ? formatHourLabel(detailHour) : ""}
        events={detailHour != null ? eventsByHour.get(detailHour) ?? [] : []}
        onClose={() => setDetailHour(null)}
      />
    </div>
  );
}
