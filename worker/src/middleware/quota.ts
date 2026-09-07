import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

// 每请求消耗 1 点全局日配额；超限返回友好 429 JSON（对齐 DRF 错误体风格）。
// P0 阶段先提供开关：wrangler vars QUOTA_ENFORCED=1 时启用，默认关闭，
// 待 P4 双跑验证后再全局启用。
export const quotaGuard = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const enforced = c.env.APP_ENV === "prod";
  if (!enforced) {
    await next();
    return;
  }
  const id = c.env.QUOTA.idFromName("global");
  const stub = c.env.QUOTA.get(id);
  const res = await stub.fetch("https://quota.internal/consume");
  const data = (await res.json()) as { used: number; limit: number; exceeded: boolean };
  c.header("X-Quota-Used", String(data.used));
  if (data.exceeded) {
    return c.json(
      { code: "quota_exceeded", detail: "今日服务配额已用完，请明天再试。" },
      429,
    );
  }
  await next();
});
