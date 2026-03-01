import { MovementEvent } from "./domain/movement";
import { PregnancyInfo } from "./domain/pregnancy";

export type RemoteState = {
  pregnancyInfo: PregnancyInfo;
  events: MovementEvent[];
  updatedAt: number;
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

