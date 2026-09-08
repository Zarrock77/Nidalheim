import { jest } from "@jest/globals";
import type { AuthenticatedUser, Npc } from "../src/types.js";
import type WebSocket from "ws";

const synths: FakeTTS[] = [];
class FakeTTS {
  onAudio: (pcm: string) => void = () => {};
  onFinal: () => void = () => {};
  onError: (err: Error) => void = () => {};
  start = jest.fn(async () => {});
  beginUtterance = jest.fn();
  sendText = jest.fn();
  flush = jest.fn();
  close = jest.fn();
  constructor() { synths.push(this); }
}
const stts: FakeSTT[] = [];
class FakeSTT {
  onFinal: (text: string, final: boolean) => void = () => {};
  onInterim = () => {}; onError = () => {}; onUtteranceEnd = () => {};
  keepAlive = () => {}; close = () => {};
  constructor() { stts.push(this); }
}
const respond = jest.fn(async (_messages: unknown, options: { onDelta: (d: string) => void }) => {
  options.onDelta("Bonjour."); return "Bonjour.";
});
const appendTurn = jest.fn(async () => {});
jest.unstable_mockModule("../src/providers/cartesia.js", () => ({ CartesiaStreamingTTS: FakeTTS }));
jest.unstable_mockModule("../src/providers/deepgram.js", () => ({ DeepgramStreamingSTT: FakeSTT }));
jest.unstable_mockModule("../src/providers/chatEngine.js", () => ({ ChatEngine: class { respond = respond; } }));
jest.unstable_mockModule("../src/conversationStore.js", () => ({ ConversationStore: class {
  loadRecent = async () => []; appendTurn = appendTurn;
} }));
jest.unstable_mockModule("../src/missionState.js", () => ({
  acquireMissionState: () => ({ all: () => [], getInventory: () => [] }), releaseMissionState: () => {},
}));
jest.unstable_mockModule("../src/missionTool.js", () => ({ applyDeterministicMissionActions: () => ({ events: [], notes: [] }) }));
jest.unstable_mockModule("../src/systemPrompt.js", () => ({ buildSystemPrompt: () => "NPC test" }));
const { AudioPipeline } = await import("../src/audioPipeline.js");
const idle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

beforeEach(() => { synths.length = 0; stts.length = 0; respond.mockClear(); appendTurn.mockClear(); });

test("a second utterance cannot replace the first context after text completes", async () => {
  const events: Record<string, unknown>[] = [];
  const ws = { readyState: 1, send: (s: string) => events.push(JSON.parse(s)) } as unknown as WebSocket;
  const pipeline = new AudioPipeline(ws, { id: "u", username: "test" } as AuthenticatedUser, { id: "olaf" } as Npc, {});
  try {
    await pipeline.start();
    stts[0].onFinal("Premiere demande", true); await idle();
    expect(respond).toHaveBeenCalledTimes(1);
    expect(events.some(e => e.type === "text")).toBe(true);
    stts[0].onFinal("Deuxieme demande", true); await idle();
    expect(respond).toHaveBeenCalledTimes(1);
    expect(synths[0].beginUtterance).toHaveBeenCalledTimes(1);
    synths[0].onAudio(Buffer.alloc(4800).toString("base64"));
    synths[0].onFinal(); await idle();
    expect(respond).toHaveBeenCalledTimes(2);
    expect(synths[0].beginUtterance).toHaveBeenCalledTimes(2);
    const firstEnd = events.findIndex(e => e.type === "audio_end");
    const starts = events.map((e, i) => e.type === "audio_start" ? i : -1).filter(i => i >= 0);
    expect(firstEnd).toBeLessThan(starts[1]);
    expect(events[starts[0]].request_id).not.toBe(events[starts[1]].request_id);
    synths[0].onFinal(); await idle();
    expect(appendTurn).toHaveBeenCalledTimes(2);
  } finally { pipeline.shutdown(); }
});

test("disconnect cancels active generation and discards pending requests", async () => {
  const events: Record<string, unknown>[] = [];
  const ws = { readyState: 1, send: (s: string) => events.push(JSON.parse(s)) } as unknown as WebSocket;
  const pipeline = new AudioPipeline(ws, { id: "u", username: "test" } as AuthenticatedUser, { id: "olaf" } as Npc, {});
  await pipeline.start();
  stts[0].onFinal("Premiere demande", true); await idle();
  stts[0].onFinal("Deuxieme demande", true);
  const late = synths[0].onAudio;
  const count = events.length;
  pipeline.shutdown();
  late(Buffer.alloc(4800).toString("base64")); await idle();
  expect(events).toHaveLength(count);
  expect(respond).toHaveBeenCalledTimes(1);
  expect(synths[0].close).toHaveBeenCalled();
});
