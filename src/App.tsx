import { useEffect, useMemo, useRef, useState } from "react";
import {
  effectiveCount,
  formatHourLabel,
  groupByHour,
  hourStartMs,
  MovementEvent,
  MovementType,
  newId
} from "./domain/movement";
import { computePregnancy, defaultPregnancyInfo, PregnancyInfo } from "./domain/pregnancy";
import { deleteWeightRecord, normalizeWeightRecords, upsertWeightRecord, WeightRecord } from "./domain/weight";
import { fetchState, pushState } from "./api";
import { clearAll, loadState, saveState } from "./storage";
import { navTo } from "./routes";
import { useHashRoute } from "./useHashRoute";
import {
  BottomNav,
  DayDrawer,
  DetailSheet,
  formatDateKey,
  HomePage,
  MinePage,
  StatsCalendarPage,
  TopNav,
  WidgetsPage
} from "./appViews";

export function App() {
  const route = useHashRoute();
  const fallbackPreg = useMemo(() => defaultPregnancyInfo(new Date()), []);
  const initialState = useMemo(() => loadState(fallbackPreg), [fallbackPreg]);
  const [events, setEvents] = useState<MovementEvent[]>(() => initialState.events);
  const [weights, setWeights] = useState<WeightRecord[]>(() => initialState.weights);
  const [pregnancyInfo, setPregnancyInfo] = useState<PregnancyInfo>(() => initialState.pregnancyInfo);
  const [updatedAt, setUpdatedAt] = useState<number>(() => initialState.updatedAt);
  const [detailHour, setDetailHour] = useState<number | null>(null);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [dayTall, setDayTall] = useState(false);
  const suppressSaveRef = useRef(true);
  const [bubbleSpeed, setBubbleSpeed] = useState<number>(() => initialState.bubbleSpeed);
  const [themeMode, setThemeMode] = useState<"dark" | "light">(() => initialState.themeMode);
  const [aiVendor, setAiVendor] = useState<"zhipu" | "aliyun">(() => initialState.aiVendor);
  const [aiModelZhipu, setAiModelZhipu] = useState<string>(() => initialState.aiModelZhipu);
  const [aiModelAliyun, setAiModelAliyun] = useState<string>(() => initialState.aiModelAliyun);
  const [aiSystemPrompt, setAiSystemPrompt] = useState<string>(() => initialState.aiSystemPrompt);
  const [aiUserPrompt, setAiUserPrompt] = useState<string>(() => initialState.aiUserPrompt);
  const [aiUserPromptDefault, setAiUserPromptDefault] = useState<string>(() => initialState.aiUserPromptDefault);
  const [aiMenuRecipeSystemPrompt, setAiMenuRecipeSystemPrompt] = useState<string>(() => initialState.aiMenuRecipeSystemPrompt);
  const [aiMenuRecipePrompt, setAiMenuRecipePrompt] = useState<string>(() => initialState.aiMenuRecipePrompt);
  const [aiMenuRecipePromptDefault, setAiMenuRecipePromptDefault] = useState<string>(() => initialState.aiMenuRecipePromptDefault);
  const [aiThinking, setAiThinking] = useState<boolean>(() => initialState.aiThinking);
  const [aiImageBaseUrl, setAiImageBaseUrl] = useState<string>(() => initialState.aiImageBaseUrl);
  const [aiImageMode, setAiImageMode] = useState<"url" | "inline">(() => initialState.aiImageMode);
  const [aiImageTargetKb, setAiImageTargetKb] = useState<number>(() => initialState.aiImageTargetKb);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const homeRefreshBusyRef = useRef(false);

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

  function applyRemoteState(remote: any) {
    suppressSaveRef.current = true;
    const remoteEvents = Array.isArray(remote?.events)
      ? remote.events
          .filter((e: any) => typeof e?.id === "string" && typeof e?.type === "string" && typeof e?.ts === "number")
          .slice(0, 2000)
      : [];
    const remoteWeights = Array.isArray(remote?.weights) ? normalizeWeightRecords(remote.weights) : weights;
    const remotePreg =
      remote?.pregnancyInfo && typeof remote?.pregnancyInfo?.lmpDate === "string" && remote.pregnancyInfo.lmpDate ? remote.pregnancyInfo : fallbackPreg;
    const remoteBubble =
      typeof remote?.bubbleSpeed === "number" && Number.isFinite(remote.bubbleSpeed)
        ? Math.min(1, Math.max(0.2, remote.bubbleSpeed))
        : initialState.bubbleSpeed;
    const remoteTheme = remote?.themeMode === "light" || remote?.themeMode === "dark" ? remote.themeMode : initialState.themeMode;
    const remoteAiVendor = remote?.aiVendor === "zhipu" || remote?.aiVendor === "aliyun" ? remote.aiVendor : initialState.aiVendor;
    const remoteAiModelZhipu =
      typeof remote?.aiModelZhipu === "string" && remote.aiModelZhipu.trim()
        ? remote.aiModelZhipu.trim().slice(0, 64)
        : typeof remote?.aiModel === "string" && String(remote.aiModel).trim()
          ? String(remote.aiModel).trim().slice(0, 64)
          : initialState.aiModelZhipu;
    const remoteAiModelAliyun =
      typeof remote?.aiModelAliyun === "string" && remote.aiModelAliyun.trim() ? remote.aiModelAliyun.trim().slice(0, 64) : initialState.aiModelAliyun;
    const remoteAiSystemPrompt =
      typeof remote?.aiSystemPrompt === "string" && String(remote.aiSystemPrompt).trim()
        ? String(remote.aiSystemPrompt).trim().slice(0, 600)
        : initialState.aiSystemPrompt;
    const remoteAiUserPrompt =
      typeof remote?.aiUserPrompt === "string" && String(remote.aiUserPrompt).trim()
        ? String(remote.aiUserPrompt).trim().slice(0, 4000)
        : initialState.aiUserPrompt;
    const remoteAiUserPromptDefault =
      typeof remote?.aiUserPromptDefault === "string" && String(remote.aiUserPromptDefault).trim()
        ? String(remote.aiUserPromptDefault).trim().slice(0, 4000)
        : initialState.aiUserPromptDefault;
    const remoteAiMenuRecipeSystemPrompt =
      typeof remote?.aiMenuRecipeSystemPrompt === "string" && String(remote.aiMenuRecipeSystemPrompt).trim()
        ? String(remote.aiMenuRecipeSystemPrompt).trim().slice(0, 600)
        : initialState.aiMenuRecipeSystemPrompt;
    const remoteAiMenuRecipePrompt =
      typeof remote?.aiMenuRecipePrompt === "string" && String(remote.aiMenuRecipePrompt).trim()
        ? String(remote.aiMenuRecipePrompt).trim().slice(0, 600)
        : initialState.aiMenuRecipePrompt;
    const remoteAiMenuRecipePromptDefault =
      typeof remote?.aiMenuRecipePromptDefault === "string" && String(remote.aiMenuRecipePromptDefault).trim()
        ? String(remote.aiMenuRecipePromptDefault).trim().slice(0, 600)
        : initialState.aiMenuRecipePromptDefault;
    const remoteAiThinking = typeof remote?.aiThinking === "boolean" ? remote.aiThinking : initialState.aiThinking;
    const remoteAiImageBaseUrl =
      typeof remote?.aiImageBaseUrl === "string" && remote.aiImageBaseUrl.trim()
        ? remote.aiImageBaseUrl.trim().replace(/\/+$/, "").slice(0, 200)
        : initialState.aiImageBaseUrl;
    const remoteAiImageMode = remote?.aiImageMode === "url" || remote?.aiImageMode === "inline" ? remote.aiImageMode : initialState.aiImageMode;
    const remoteAiImageTargetKb =
      typeof remote?.aiImageTargetKb === "number" && Number.isFinite(remote.aiImageTargetKb)
        ? Math.min(2000, Math.max(150, Math.round(remote.aiImageTargetKb)))
        : initialState.aiImageTargetKb;

    setEvents(remoteEvents);
    setWeights(remoteWeights);
    setPregnancyInfo(remotePreg);
    setBubbleSpeed(remoteBubble);
    setThemeMode(remoteTheme);
    setAiVendor(remoteAiVendor);
    setAiModelZhipu(remoteAiModelZhipu);
    setAiModelAliyun(remoteAiModelAliyun);
    setAiSystemPrompt(remoteAiSystemPrompt);
    setAiUserPrompt(remoteAiUserPrompt);
    setAiUserPromptDefault(remoteAiUserPromptDefault);
    setAiMenuRecipeSystemPrompt(remoteAiMenuRecipeSystemPrompt);
    setAiMenuRecipePrompt(remoteAiMenuRecipePrompt);
    setAiMenuRecipePromptDefault(remoteAiMenuRecipePromptDefault);
    setAiThinking(remoteAiThinking);
    setAiImageBaseUrl(remoteAiImageBaseUrl);
    setAiImageMode(remoteAiImageMode);
    setAiImageTargetKb(remoteAiImageTargetKb);
    setUpdatedAt(typeof remote?.updatedAt === "number" ? remote.updatedAt : Date.now());
  }

  async function refreshHomeData() {
    if (homeRefreshBusyRef.current) return;
    homeRefreshBusyRef.current = true;
    setHomeRefreshing(true);
    const ac = new AbortController();
    try {
      const remote = await fetchState(ac.signal);
      if (typeof remote?.updatedAt === "number" && remote.updatedAt > updatedAt) {
        applyRemoteState(remote);
      } else if (updatedAt > (remote?.updatedAt ?? 0)) {
        await pushState(
          {
            pregnancyInfo,
            events,
            weights,
            bubbleSpeed,
            themeMode,
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
            aiImageTargetKb,
            updatedAt
          },
          ac.signal
        );
      }
    } catch {
    } finally {
      suppressSaveRef.current = false;
      ac.abort();
      homeRefreshBusyRef.current = false;
      setHomeRefreshing(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const remote = await fetchState(ac.signal);
        if (typeof remote?.updatedAt === "number" && remote.updatedAt > updatedAt) {
          applyRemoteState(remote);
        } else if (updatedAt > (remote?.updatedAt ?? 0)) {
          await pushState(
            {
              pregnancyInfo,
              events,
              weights,
              bubbleSpeed,
              themeMode,
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
              aiImageTargetKb,
              updatedAt
            },
            ac.signal
          );
        }
      } catch {}
      suppressSaveRef.current = false;
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (suppressSaveRef.current) {
      saveState({
        pregnancyInfo,
        events,
        weights,
        bubbleSpeed,
        themeMode,
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
        aiImageTargetKb,
        updatedAt
      });
      return;
    }
    const nextUpdatedAt = Date.now();
    setUpdatedAt(nextUpdatedAt);
    saveState({
      pregnancyInfo,
      events,
      weights,
      bubbleSpeed,
      themeMode,
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
      aiImageTargetKb,
      updatedAt: nextUpdatedAt
    });
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      pushState(
        {
          pregnancyInfo,
          events,
          weights,
          bubbleSpeed,
          themeMode,
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
          aiImageTargetKb,
          updatedAt: nextUpdatedAt
        },
        ac.signal
      ).catch(() => {});
    }, 800);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [
    events,
    weights,
    pregnancyInfo,
    bubbleSpeed,
    themeMode,
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
  ]);

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

  function upsertWeight(date: string, weightKg: number) {
    setWeights((current) => upsertWeightRecord(current, date, weightKg));
  }

  function removeWeight(date: string) {
    setWeights((current) => deleteWeightRecord(current, date));
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
    setWeights([]);
    setPregnancyInfo(nextPreg);
    setBubbleSpeed(0.35);
    setThemeMode("dark");
    setAiVendor("zhipu");
    setAiModelZhipu("glm-4.6v");
    setAiModelAliyun("qwen3.5-plus");
    setAiSystemPrompt("你是一个孕妇营养专家");
    setAiUserPrompt(
      "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。"
    );
    setAiUserPromptDefault(
      "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。"
    );
    setAiMenuRecipeSystemPrompt("你是一个孕妇饮食助手，简短输出菜名与配菜。");
    setAiMenuRecipePrompt("根据当前食材为孕妇推荐1-3道菜，补充所需食材");
    setAiMenuRecipePromptDefault("根据当前食材为孕妇推荐1-3道菜，补充所需食材");
    setAiThinking(true);
    setAiImageBaseUrl(window.location.origin);
    setAiImageMode("url");
    setAiImageTargetKb(450);
    setUpdatedAt(nextUpdatedAt);
    saveState({
      pregnancyInfo: nextPreg,
      events: [],
      weights: [],
      bubbleSpeed: 0.35,
      themeMode: "dark",
      aiVendor: "zhipu",
      aiModelZhipu: "glm-4.6v",
      aiModelAliyun: "qwen3.5-plus",
      aiSystemPrompt: "你是一个孕妇营养专家",
      aiUserPrompt:
        "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
      aiUserPromptDefault:
        "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
      aiMenuRecipeSystemPrompt: "你是一个孕妇饮食助手，简短输出菜名与配菜。",
      aiMenuRecipePrompt: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
      aiMenuRecipePromptDefault: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
      aiThinking: true,
      aiImageBaseUrl: window.location.origin,
      aiImageMode: "url",
      aiImageTargetKb: 450,
      updatedAt: nextUpdatedAt
    });
    pushState({
      pregnancyInfo: nextPreg,
      events: [],
      weights: [],
      bubbleSpeed: 0.35,
      themeMode: "dark",
      aiVendor: "zhipu",
      aiModelZhipu: "glm-4.6v",
      aiModelAliyun: "qwen3.5-plus",
      aiSystemPrompt: "你是一个孕妇营养专家",
      aiUserPrompt:
        "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
      aiUserPromptDefault:
        "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
      aiMenuRecipeSystemPrompt: "你是一个孕妇饮食助手，简短输出菜名与配菜。",
      aiMenuRecipePrompt: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
      aiMenuRecipePromptDefault: "根据当前食材为孕妇推荐1-3道菜，补充所需食材",
      aiThinking: true,
      aiImageBaseUrl: window.location.origin,
      aiImageMode: "url",
      aiImageTargetKb: 450,
      updatedAt: nextUpdatedAt
    }).catch(() => {});
    suppressSaveRef.current = false;
    navTo({ name: "home" });
  }

  function restore(payload: {
    pregnancyInfo: PregnancyInfo;
    events: MovementEvent[];
    weights?: WeightRecord[];
    bubbleSpeed?: number;
    themeMode?: "dark" | "light";
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
  }) {
    const nextEvents = [...payload.events].sort((a, b) => b.ts - a.ts).slice(0, 2000);
    const nextWeights = normalizeWeightRecords(payload.weights);
    const nextPreg = payload.pregnancyInfo;
    const nextBubbleSpeed =
      typeof payload.bubbleSpeed === "number" && Number.isFinite(payload.bubbleSpeed)
        ? Math.min(1, Math.max(0.2, payload.bubbleSpeed))
        : bubbleSpeed;
    const nextThemeMode = payload.themeMode === "light" || payload.themeMode === "dark" ? payload.themeMode : themeMode;
    const nextAiVendor = payload.aiVendor === "zhipu" || payload.aiVendor === "aliyun" ? payload.aiVendor : aiVendor;
    const nextAiModelZhipu = typeof payload.aiModelZhipu === "string" && payload.aiModelZhipu.trim() ? payload.aiModelZhipu.trim().slice(0, 64) : aiModelZhipu;
    const nextAiModelAliyun = typeof payload.aiModelAliyun === "string" && payload.aiModelAliyun.trim() ? payload.aiModelAliyun.trim().slice(0, 64) : aiModelAliyun;
    const nextAiSystemPrompt =
      typeof payload.aiSystemPrompt === "string" && payload.aiSystemPrompt.trim() ? payload.aiSystemPrompt.trim().slice(0, 600) : aiSystemPrompt;
    const nextAiUserPrompt =
      typeof payload.aiUserPrompt === "string" && payload.aiUserPrompt.trim() ? payload.aiUserPrompt.trim().slice(0, 4000) : aiUserPrompt;
    const nextAiUserPromptDefault =
      typeof payload.aiUserPromptDefault === "string" && payload.aiUserPromptDefault.trim()
        ? payload.aiUserPromptDefault.trim().slice(0, 4000)
        : aiUserPromptDefault;
    const nextAiMenuRecipeSystemPrompt =
      typeof payload.aiMenuRecipeSystemPrompt === "string" && payload.aiMenuRecipeSystemPrompt.trim()
        ? payload.aiMenuRecipeSystemPrompt.trim().slice(0, 600)
        : aiMenuRecipeSystemPrompt;
    const nextAiMenuRecipePrompt =
      typeof payload.aiMenuRecipePrompt === "string" && payload.aiMenuRecipePrompt.trim()
        ? payload.aiMenuRecipePrompt.trim().slice(0, 600)
        : aiMenuRecipePrompt;
    const nextAiMenuRecipePromptDefault =
      typeof payload.aiMenuRecipePromptDefault === "string" && payload.aiMenuRecipePromptDefault.trim()
        ? payload.aiMenuRecipePromptDefault.trim().slice(0, 600)
        : aiMenuRecipePromptDefault;
    const nextAiThinking = typeof payload.aiThinking === "boolean" ? payload.aiThinking : aiThinking;
    const nextAiImageBaseUrl =
      typeof payload.aiImageBaseUrl === "string" && payload.aiImageBaseUrl.trim()
        ? payload.aiImageBaseUrl.trim().replace(/\/+$/, "").slice(0, 200)
        : aiImageBaseUrl;
    const nextAiImageMode = payload.aiImageMode === "url" || payload.aiImageMode === "inline" ? payload.aiImageMode : aiImageMode;
    const nextAiImageTargetKb =
      typeof payload.aiImageTargetKb === "number" && Number.isFinite(payload.aiImageTargetKb)
        ? Math.min(2000, Math.max(150, Math.round(payload.aiImageTargetKb)))
        : aiImageTargetKb;
    const nextUpdatedAt = Date.now();
    suppressSaveRef.current = true;
    setEvents(nextEvents);
    setWeights(nextWeights);
    setPregnancyInfo(nextPreg);
    setBubbleSpeed(nextBubbleSpeed);
    setThemeMode(nextThemeMode);
    setAiVendor(nextAiVendor);
    setAiModelZhipu(nextAiModelZhipu);
    setAiModelAliyun(nextAiModelAliyun);
    setAiSystemPrompt(nextAiSystemPrompt);
    setAiUserPrompt(nextAiUserPrompt);
    setAiUserPromptDefault(nextAiUserPromptDefault);
    setAiMenuRecipeSystemPrompt(nextAiMenuRecipeSystemPrompt);
    setAiMenuRecipePrompt(nextAiMenuRecipePrompt);
    setAiMenuRecipePromptDefault(nextAiMenuRecipePromptDefault);
    setAiThinking(nextAiThinking);
    setAiImageBaseUrl(nextAiImageBaseUrl);
    setAiImageMode(nextAiImageMode);
    setAiImageTargetKb(nextAiImageTargetKb);
    setUpdatedAt(nextUpdatedAt);
    saveState({
      pregnancyInfo: nextPreg,
      events: nextEvents,
      weights: nextWeights,
      bubbleSpeed: nextBubbleSpeed,
      themeMode: nextThemeMode,
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
      aiImageTargetKb: nextAiImageTargetKb,
      updatedAt: nextUpdatedAt
    });
    pushState({
      pregnancyInfo: nextPreg,
      events: nextEvents,
      weights: nextWeights,
      bubbleSpeed: nextBubbleSpeed,
      themeMode: nextThemeMode,
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
      aiImageTargetKb: nextAiImageTargetKb,
      updatedAt: nextUpdatedAt
    }).catch(() => {});
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
    const generatedWeights = Array.from({ length: 14 }, (_, idx) => {
      const date = formatDateKey(new Date(todayStart - (13 - idx) * dayMs));
      const noise = Math.round((rand() * 0.6 - 0.3) * 10) / 10;
      return { date, weightKg: Math.round((58.2 + idx * 0.05 + noise) * 10) / 10, updatedAt: now - (13 - idx) * dayMs };
    });
    restore({ pregnancyInfo, events: generated.slice(0, 2000), weights: generatedWeights });
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
      <TopNav
        title={topTitle}
        rightActionLabel={route.name === "home" ? (homeRefreshing ? "刷新中…" : "刷新") : undefined}
        onRightAction={route.name === "home" ? () => void refreshHomeData() : undefined}
        rightActionDisabled={route.name === "home" ? homeRefreshing : undefined}
      />
      {route.name === "home" ? (
        <HomePage
          pregnancy={pregnancy}
          weights={weights}
          records={records}
          eventsByHour={eventsByHour}
          currentHourEffective={currentHourEffective}
          currentHourClicks={currentHourClicks}
          bubbleSpeed={bubbleSpeed}
          onQuickAdd={(t) => addMovement(t)}
          onOpenDetail={(h) => setDetailHour(h)}
          onUpsertWeight={upsertWeight}
          onRefresh={refreshHomeData}
        />
      ) : route.name === "stats" ? (
        <StatsCalendarPage
          events={events}
          weights={weights}
          records={records}
          onOpenHourDetail={(h) => setDetailHour(h)}
          onOpenDay={(k) => {
            setDayKey(k);
            setDayTall(false);
          }}
          onUpsertWeight={upsertWeight}
          onDeleteWeight={removeWeight}
        />
      ) : route.name === "widgets" ? (
        <WidgetsPage
          aiVendor={aiVendor}
          aiModelZhipu={aiModelZhipu}
          aiModelAliyun={aiModelAliyun}
          aiSystemPrompt={aiSystemPrompt}
          aiUserPrompt={aiUserPrompt}
          aiMenuRecipeSystemPrompt={aiMenuRecipeSystemPrompt}
          aiMenuRecipePrompt={aiMenuRecipePrompt}
          aiThinking={aiThinking}
          aiImageBaseUrl={aiImageBaseUrl}
          aiImageMode={aiImageMode}
          aiImageTargetKb={aiImageTargetKb}
        />
      ) : (
        <MinePage
          pregnancyInfo={pregnancyInfo}
          events={events}
          weights={weights}
          onUpdatePregnancyInfo={updatePregnancy}
          onRestore={restore}
          onGenerateTestData={generateTestData}
          bubbleSpeed={bubbleSpeed}
          onBubbleSpeedChange={setBubbleSpeed}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          aiVendor={aiVendor}
          onAiVendorChange={setAiVendor}
          aiModelZhipu={aiModelZhipu}
          onAiModelZhipuChange={(v) => setAiModelZhipu(v.trim().slice(0, 64))}
          aiModelAliyun={aiModelAliyun}
          onAiModelAliyunChange={(v) => setAiModelAliyun(v.trim().slice(0, 64))}
          aiSystemPrompt={aiSystemPrompt}
          onAiSystemPromptChange={(v) => setAiSystemPrompt(v.replace(/\r\n/g, "\n").slice(0, 600))}
          aiUserPrompt={aiUserPrompt}
          onAiUserPromptChange={(v) => setAiUserPrompt(v.replace(/\r\n/g, "\n").slice(0, 4000))}
          aiUserPromptDefault={aiUserPromptDefault}
          onAiUserPromptDefaultChange={(v) => setAiUserPromptDefault(v.replace(/\r\n/g, "\n").slice(0, 4000))}
          aiMenuRecipeSystemPrompt={aiMenuRecipeSystemPrompt}
          onAiMenuRecipeSystemPromptChange={(v) => setAiMenuRecipeSystemPrompt(v.replace(/\r\n/g, "\n").slice(0, 600))}
          aiMenuRecipePrompt={aiMenuRecipePrompt}
          aiMenuRecipePromptDefault={aiMenuRecipePromptDefault}
          onAiMenuRecipePromptChange={(v) => setAiMenuRecipePrompt(v.replace(/\r\n/g, "\n").slice(0, 600))}
          onAiMenuRecipePromptDefaultChange={(v) => setAiMenuRecipePromptDefault(v.replace(/\r\n/g, "\n").slice(0, 600))}
          aiThinking={aiThinking}
          onAiThinkingChange={setAiThinking}
          aiImageBaseUrl={aiImageBaseUrl}
          onAiImageBaseUrlChange={(v) => setAiImageBaseUrl(v.trim().replace(/\/+$/, "").slice(0, 200))}
          aiImageMode={aiImageMode}
          onAiImageModeChange={setAiImageMode}
          aiImageTargetKb={aiImageTargetKb}
          onAiImageTargetKbChange={(v) => setAiImageTargetKb(Math.min(2000, Math.max(150, Math.round(v))))}
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
