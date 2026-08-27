import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    bridge.listeners.set(event, handler);
    return () => bridge.listeners.delete(event);
  }),
  emitTo: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: bridge.listen, emitTo: bridge.emitTo }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import { publishQuestPois, publishSquadPositions, subscribeQuestPois, subscribeSquadPositions } from "./locator";
import type { QuestPoiSnapshot } from "./types";

const position = {
  senderId: "11111111-1111-1111-1111-111111111111",
  sequence: 1,
  nickname: "PLAYER",
  mapId: "customs",
  position: { x: 1, y: 2, z: 3 },
  heading: null,
  observedAt: 1,
  receivedAt: 2,
};

const questSnapshot: QuestPoiSnapshot = {
  mapId: "customs",
  pois: [
    {
      id: "quest-active-task-objective-customs-0",
      kind: "quest-objective",
      category: "quest-objective",
      mapId: "customs",
      name: "Debut",
      description: "Eliminate Scavs",
      taskId: "task",
      objectiveId: "objective",
      position: { x: 10, y: 0, z: 20 },
    },
  ],
};

const enterNativeRuntime = () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    bridge.listeners.clear();
    vi.clearAllMocks();
  });
};

describe("squad position bridge", () => {
  enterNativeRuntime();

  it("stays inert outside the native runtime", async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    await publishSquadPositions([position]);
    const unlisten = await subscribeSquadPositions(vi.fn());
    expect(bridge.emitTo).not.toHaveBeenCalled();
    expect(bridge.listen).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });

  it("sends positions to the overlay window", async () => {
    await publishSquadPositions([position]);
    expect(bridge.emitTo).toHaveBeenCalledWith("overlay", "squad://positions", [position]);
  });

  it("delivers valid payloads and drops malformed ones", async () => {
    const handler = vi.fn();
    await subscribeSquadPositions(handler);
    const deliver = bridge.listeners.get("squad://positions")!;
    deliver({ payload: [position] });
    deliver({ payload: [{ ...position, senderId: "not-a-sender" }] });
    deliver({ payload: "not-an-array" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([position]);
  });
});

describe("quest objective bridge", () => {
  enterNativeRuntime();

  it("stays inert outside the native runtime", async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    await publishQuestPois(questSnapshot);
    const unlisten = await subscribeQuestPois(vi.fn());
    expect(bridge.emitTo).not.toHaveBeenCalled();
    expect(bridge.listen).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });

  it("sends the snapshot to the overlay window", async () => {
    await publishQuestPois(questSnapshot);
    expect(bridge.emitTo).toHaveBeenCalledWith("overlay", "quest://objective-pois", questSnapshot);
  });

  it("delivers valid snapshots and drops malformed ones", async () => {
    const handler = vi.fn();
    await subscribeQuestPois(handler);
    const deliver = bridge.listeners.get("quest://objective-pois")!;
    deliver({ payload: questSnapshot });
    deliver({ payload: { ...questSnapshot, mapId: "../escape" } });
    deliver({ payload: "not-a-snapshot" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(questSnapshot);
  });
});
