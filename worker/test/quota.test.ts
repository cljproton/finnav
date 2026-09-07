import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// QuotaGuard 直接经 DO stub 验证计数语义（不经过 quotaGuard 中间件开关）
async function consumeOnce(): Promise<{ used: number; limit: number; exceeded: boolean }> {
  const stub = env.QUOTA.get(env.QUOTA.idFromName("global"));
  const res = await stub.fetch("https://quota.internal/consume");
  return res.json();
}

describe("QuotaGuard", () => {
  it("连续 consume 递增计数并带回 limit", async () => {
    const a = await consumeOnce();
    const b = await consumeOnce();
    expect(a.limit).toBe(90_000);
    expect(b.used).toBe(a.used + 1);
    expect(a.exceeded).toBe(false);
  });

  it("/status 返回当天已用量", async () => {
    const before = await consumeOnce();
    const stub = env.QUOTA.get(env.QUOTA.idFromName("global"));
    const res = await stub.fetch("https://quota.internal/status");
    const status = await res.json<{ day: string; used: number; limit: number }>();
    expect(status.used).toBeGreaterThanOrEqual(before.used);
    expect(status.limit).toBe(90_000);
  });
});
