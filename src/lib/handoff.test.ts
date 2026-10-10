import { describe, it, expect, vi } from "vitest";
import {
  CONSUME_SCRIPT,
  HANDOFF_TTL_SECONDS,
  consumeHandoff,
  handoffKey,
  memoryHandoffStore,
  registerHandoff,
  upstashHandoffStore,
  type HandoffStore,
} from "./handoff";

const ID = "0123456789abcdef";

function setup() {
  let t = 1_000_000;
  const clock = { advance: (ms: number) => (t += ms) };
  const store = memoryHandoffStore(() => t);
  const source = () => registerHandoff(store, "jordan", ID);
  const arrival = () => consumeHandoff(store, "jordan", ID);
  return { store, clock, source, arrival };
}

describe("one-direction handoff pairing", () => {
  it("collapses one arrival after a recorded source", async () => {
    const { source, arrival } = setup();
    await source();
    expect(await arrival()).toBe(true);
  });

  it("counts an arrival that comes before its source (the accepted double count)", async () => {
    const { source, arrival } = setup();
    expect(await arrival()).toBe(false);
    await source();
    // The late credit is unspent: the arrival that belonged to it already
    // counted. Only a further arrival with the same id could spend it, and
    // otherwise it simply expires.
  });

  it("lets exactly one of several concurrent arrivals spend the credit", async () => {
    const { source, arrival } = setup();
    await source();
    const results = await Promise.all([arrival(), arrival(), arrival(), arrival()]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("never resets a consumed credit when the source registers again", async () => {
    const { source, arrival } = setup();
    await source();
    expect(await arrival()).toBe(true);
    await source(); // e.g. a retried beacon carrying the same id
    expect(await arrival()).toBe(false);
  });

  it("pairs source → arrival → source → arrival only once", async () => {
    const { source, arrival } = setup();
    await source();
    const first = await arrival();
    await source();
    const second = await arrival();
    expect([first, second]).toEqual([true, false]);
  });

  it("counts arrivals after the credit expires", async () => {
    const { source, arrival, clock } = setup();
    await source();
    clock.advance(HANDOFF_TTL_SECONDS * 1000);
    expect(await arrival()).toBe(false);
  });

  it("counts an arrival with no credit, or a credit for another page", async () => {
    const { store, arrival } = setup();
    expect(await arrival()).toBe(false);
    await registerHandoff(store, "someone-else", ID);
    expect(await arrival()).toBe(false);
  });

  it("counts the arrival when the store is missing or failing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: HandoffStore = {
      register: () => Promise.reject(new Error("down")),
      consume: () => Promise.reject(new Error("down")),
    };
    await expect(registerHandoff(broken, "jordan", ID)).resolves.toBeUndefined();
    expect(await consumeHandoff(broken, "jordan", ID)).toBe(false);
    await expect(registerHandoff(null, "jordan", ID)).resolves.toBeUndefined();
    expect(await consumeHandoff(null, "jordan", ID)).toBe(false);
    consoleError.mockRestore();
  });

  it("treats a hung store as a failure", async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const hung: HandoffStore = { register: () => new Promise(() => {}), consume: () => new Promise(() => {}) };
    const result = consumeHandoff(hung, "jordan", ID);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(false);
    consoleError.mockRestore();
    vi.useRealTimers();
  });
});

describe("upstashHandoffStore", () => {
  it("registers with SET NX EX and consumes with the atomic script", async () => {
    const set = vi.fn().mockResolvedValue(null);
    const evalFn = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const store = upstashHandoffStore({ set, eval: evalFn } as never);
    const key = handoffKey("jordan", ID);

    await store.register(key, 1800);
    expect(set).toHaveBeenCalledWith("handoff:jordan:" + ID, "available", { nx: true, ex: 1800 });

    expect(await store.consume(key, 1800)).toBe(true);
    expect(await store.consume(key, 1800)).toBe(false);
    expect(evalFn).toHaveBeenCalledWith(CONSUME_SCRIPT, [key], ["1800"]);
  });

  it("only flips available to consumed, keeping the consumed state with a TTL", () => {
    expect(CONSUME_SCRIPT).toContain("== 'available'");
    expect(CONSUME_SCRIPT).toContain("'consumed', 'EX'");
    expect(CONSUME_SCRIPT).not.toMatch(/DEL/);
  });
});
