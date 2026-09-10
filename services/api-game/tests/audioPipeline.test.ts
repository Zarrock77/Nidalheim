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
  private finalHandler: (text: string, final: boolean, info: { fromFinalize: boolean; end?: number }) => void = () => {};
  set onFinal(fn: typeof this.finalHandler) {this.finalHandler=fn;}
  get onFinal(): typeof this.finalHandler {return (text,final,info)=>this.finalHandler(text,final,{end:this.audioSecondsSent,...info});}
  onInterim = () => {}; onError = () => {}; onUtteranceEnd = () => {};
  sampleRate = 48000; audioSecondsSent = 0; finalAudioSeconds = 0;
  start = async () => {};
  sendAudio = jest.fn((b: Buffer) => { this.audioSecondsSent += b.length / 96000; });
  finalize = jest.fn(() => true);
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
const { AudioPipeline, INPUT_FINALIZATION_TIMEOUT_MS } = await import("../src/audioPipeline.js");
const idle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

beforeEach(() => { synths.length = 0; stts.length = 0; respond.mockClear(); appendTurn.mockClear(); });
afterEach(() => { jest.useRealTimers(); });

const record = (p: InstanceType<typeof AudioPipeline>, text: string) => {
  p.onClientAudio(Buffer.alloc(96000));p.onClientCommit();
  stts[0].onFinal(text,true,{fromFinalize:true});
};

test("a second utterance cannot replace the first context after text completes", async () => {
  const events: Record<string, unknown>[] = [];
  const ws = { readyState: 1, send: (s: string) => events.push(JSON.parse(s)) } as unknown as WebSocket;
  const pipeline = new AudioPipeline(ws, { id: "u", username: "test" } as AuthenticatedUser, { id: "olaf" } as Npc, {});
  try {
    await pipeline.start();
    await pipeline.onClientAudioConfig({sample_rate:48000});
    record(pipeline,"Premiere demande"); await idle();
    expect(respond).toHaveBeenCalledTimes(1);
    expect(events.some(e => e.type === "text")).toBe(true);
    record(pipeline,"Deuxieme demande"); await idle();
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
  await pipeline.onClientAudioConfig({sample_rate:48000});
  record(pipeline,"Premiere demande"); await idle();
  record(pipeline,"Deuxieme demande");
  const late = synths[0].onAudio;
  const count = events.length;
  pipeline.shutdown();
  late(Buffer.alloc(4800).toString("base64")); await idle();
  expect(events).toHaveLength(count);
  expect(respond).toHaveBeenCalledTimes(1);
  expect(synths[0].close).toHaveBeenCalled();
});

async function fixture(configure=true) {
  const events: Record<string,unknown>[]=[];
  const close=jest.fn();
  const ws={readyState:1,send:(s:string)=>events.push(JSON.parse(s)),close} as unknown as WebSocket;
  const pipeline=new AudioPipeline(ws,{id:'u',username:'test'} as AuthenticatedUser,{id:'olaf'} as Npc,{});
  await pipeline.start();
  if(configure)await pipeline.onClientAudioConfig({sample_rate:48000});
  return {pipeline,events,close,stt:stts[0]};
}

test("incident: transcript before COMMIT and an empty final boundary produces one reply",async()=>{
  const {pipeline,events,stt}=await fixture();
  try {
    pipeline.onClientAudio(Buffer.alloc(96000));
    stt.onFinal('Objet secret',false,{fromFinalize:false});
    expect(respond).not.toHaveBeenCalled();
    pipeline.onClientCommit();
    stt.onFinal('',true,{fromFinalize:true});await idle();
    expect(respond).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(respond.mock.calls[0][0])).toContain('Objet secret');
    expect(events.filter(e=>e.type==='user_transcript').map(e=>e.data)).toEqual(['Objet secret']);
    pipeline.onClientCommit();stt.onFinal('',true,{fromFinalize:true});await idle();
    expect(respond).toHaveBeenCalledTimes(1);
  } finally {pipeline.shutdown();}
});

test("COMMIT before multiple final segments waits for the trailing words",async()=>{
  const {pipeline,stt}=await fixture();
  try {
    pipeline.onClientAudio(Buffer.alloc(96000));pipeline.onClientCommit();
    stt.onFinal('Un objet',false,{fromFinalize:false});await idle();
    expect(respond).not.toHaveBeenCalled();
    stt.onFinal('secret',false,{fromFinalize:true});await idle();
    expect(respond).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(respond.mock.calls[0][0])).toContain('Un objet secret');
  } finally {pipeline.shutdown();}
});

test("a pause while PTT is held does not split the recording",async()=>{
  const {pipeline,stt}=await fixture();
  try {
    pipeline.onClientAudio(Buffer.alloc(48000));
    stt.onFinal('La premiere partie',true,{fromFinalize:false});await idle();
    expect(respond).not.toHaveBeenCalled();
    pipeline.onClientAudio(Buffer.alloc(48000));pipeline.onClientCommit();
    stt.onFinal('et la suite',true,{fromFinalize:true});await idle();
    expect(JSON.stringify(respond.mock.calls[0][0])).toContain('La premiere partie et la suite');
  } finally {pipeline.shutdown();}
});

test("already finalized audio does not wait for an optional Finalize acknowledgement",async()=>{
  const {pipeline,stt}=await fixture();
  try {
    pipeline.onClientAudio(Buffer.alloc(96000));
    stt.finalAudioSeconds=stt.audioSecondsSent;
    stt.onFinal('Tout est transcrit',false,{fromFinalize:false});pipeline.onClientCommit();await idle();
    expect(stt.finalize).not.toHaveBeenCalled();expect(respond).toHaveBeenCalledTimes(1);
  } finally {pipeline.shutdown();}
});

test("an empty speech_final result covering the committed audio closes the turn",async()=>{
  const {pipeline,stt}=await fixture();
  try {
    pipeline.onClientAudio(Buffer.alloc(96000));
    stt.onFinal('Objet secret',false,{fromFinalize:false});pipeline.onClientCommit();
    stt.finalAudioSeconds=stt.audioSecondsSent;
    stt.onFinal('',true,{fromFinalize:false});await idle();expect(respond).toHaveBeenCalledTimes(1);
  } finally {pipeline.shutdown();}
});

test("recordings arriving during finalization remain separate and ordered",async()=>{
  const {pipeline,stt}=await fixture();
  try {
    pipeline.onClientAudio(Buffer.alloc(96000));pipeline.onClientCommit();
    pipeline.onClientAudio(Buffer.alloc(96000));pipeline.onClientCommit();pipeline.onClientCommit();
    expect(stt.sendAudio).toHaveBeenCalledTimes(1);
    stt.onFinal('Premier',true,{fromFinalize:true});await idle();
    expect(stt.sendAudio).toHaveBeenCalledTimes(2);
    stt.onFinal('Deuxieme',true,{fromFinalize:true});await idle();
    expect(respond).toHaveBeenCalledTimes(1);
    synths[0].onFinal();await idle();expect(respond).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(respond.mock.calls[1][0])).toContain('Deuxieme');
    expect(JSON.stringify(respond.mock.calls[1][0])).not.toContain('Premier');
  } finally {pipeline.shutdown();}
});

test("missing finalization gives an error and reconnect, never a partial reply",async()=>{
  jest.useFakeTimers();
  const {pipeline,stt,events,close}=await fixture();
  pipeline.onClientAudio(Buffer.alloc(96000));stt.onFinal('Debut incomplet',false,{fromFinalize:false});pipeline.onClientCommit();
  await jest.advanceTimersByTimeAsync(INPUT_FINALIZATION_TIMEOUT_MS);
  expect(respond).not.toHaveBeenCalled();expect(close).toHaveBeenCalledWith(1011,'speech input failed');
  expect(events.some(e=>e.type==='error')).toBe(true);
  stt.onFinal('trop tard',true,{fromFinalize:true});await idle();expect(respond).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test("a delayed boundary from the previous turn cannot complete the next recording",async()=>{
  const {pipeline,stt}=await fixture();
  try {
    pipeline.onClientAudio(Buffer.alloc(96000));pipeline.onClientCommit();
    pipeline.onClientAudio(Buffer.alloc(96000));pipeline.onClientCommit();
    stt.finalAudioSeconds=1;
    stt.onFinal('Premier',true,{fromFinalize:false,end:1});await idle();
    expect(stt.audioSecondsSent).toBe(2);
    stt.onFinal('',true,{fromFinalize:true,end:1});
    stt.onFinal('Deuxieme',true,{fromFinalize:true,end:2});await idle();
    synths[0].onFinal();await idle();
    expect(respond).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(respond.mock.calls[1][0])).toContain('Deuxieme');
  } finally {pipeline.shutdown();}
});

test("disconnect cancels the pending finalization deadline",async()=>{
  jest.useFakeTimers();
  const {pipeline,close}=await fixture();pipeline.onClientAudio(Buffer.alloc(96000));pipeline.onClientCommit();pipeline.shutdown();
  await jest.advanceTimersByTimeAsync(INPUT_FINALIZATION_TIMEOUT_MS);
  expect(close).not.toHaveBeenCalled();expect(respond).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);
});

test("COMMIT before audio_config finalizes only after buffered PCM was sent",async()=>{
  const {pipeline,stt}=await fixture(false);
  try {
    pipeline.onClientAudio(Buffer.alloc(96000));pipeline.onClientCommit();expect(stt.finalize).not.toHaveBeenCalled();
    await pipeline.onClientAudioConfig({sample_rate:48000});expect(stt.sendAudio).toHaveBeenCalledTimes(1);
    expect(stt.finalize).toHaveBeenCalledTimes(1);
    stt.onFinal('Configure',true,{fromFinalize:true});await idle();expect(respond).toHaveBeenCalledTimes(1);
  } finally {pipeline.shutdown();}
});

test("silence completes without sending an empty request to the LLM",async()=>{
  const {pipeline,stt,events}=await fixture();
  try {
    pipeline.onClientAudio(Buffer.alloc(96000));pipeline.onClientCommit();stt.onFinal('',true,{fromFinalize:true});await idle();
    expect(respond).not.toHaveBeenCalled();expect(events.some(e=>e.type==='error')).toBe(true);
  } finally {pipeline.shutdown();}
});
