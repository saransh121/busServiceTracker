import { describe, expect, it } from "vitest";
import { QuotaError, withFallback } from "../src/core/fallback";

describe("withFallback", () => {
  it("returns the first successful provider", async () => {
    const r = await withFallback([
      { name: "a", fn: async () => 1 },
      { name: "b", fn: async () => 2 },
    ]);
    expect(r).toEqual({ provider: "a", data: 1 });
  });

  it("skips failing and quota-limited providers", async () => {
    const r = await withFallback([
      {
        name: "a",
        fn: async () => {
          throw new Error("boom");
        },
      },
      {
        name: "b",
        fn: async () => {
          throw new QuotaError("HTTP 429");
        },
      },
      { name: "c", fn: async () => "ok" },
    ]);
    expect(r).toEqual({ provider: "c", data: "ok" });
  });

  it("skips providers that exceed the timeout", async () => {
    const r = await withFallback(
      [
        { name: "slow", fn: () => new Promise((res) => setTimeout(() => res("late"), 500)) },
        { name: "fast", fn: async () => "fast" },
      ],
      50,
    );
    expect(r.provider).toBe("fast");
  });

  it("throws with all provider errors when everything fails", async () => {
    await expect(
      withFallback([
        {
          name: "a",
          fn: async () => {
            throw new Error("x");
          },
        },
        {
          name: "b",
          fn: async () => {
            throw new Error("y");
          },
        },
      ]),
    ).rejects.toThrow(/a: x.*b: y/);
  });
});
