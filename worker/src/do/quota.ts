import { DurableObject } from "cloudflare:workers";

// 全局每日请求配额守卫。
// 阈值设 90000/天，预留 Cloudflare Free 计划 10 万请求/天硬限的安全垫。
// 超限时 fetch 入口中间件返回 429 quota_exceeded（见 src/middleware/quota.ts）。
//
// 计数策略：DO 内存权威计数 + 每 FLUSH_EVERY 次回写 storage（重启最多丢
// FLUSH_EVERY-1 次，安全垫可容忍），避免每请求消耗 DO storage 写配额。
const DAILY_LIMIT = 90_000;
const FLUSH_EVERY = 500;

function todayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10); // UTC 日期
}

function usedKey(day: string): string {
  return `used:${day}`;
}

interface DayState {
  day: string;
  count: number; // 权威计数（内存）
  flushed: number; // 已回写 storage 的计数值
}

export class QuotaGuard extends DurableObject {
  private mem: DayState | null = null;
  private flushing = false;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/consume") {
      const used = await this.consume();
      return Response.json({ used, limit: DAILY_LIMIT, exceeded: used > DAILY_LIMIT });
    }
    if (url.pathname === "/status") {
      const s = await this.loadState();
      return Response.json({ day: s.day, used: s.count, limit: DAILY_LIMIT });
    }
    return new Response("not found", { status: 404 });
  }

  private async loadState(): Promise<DayState> {
    const day = todayKey(Date.now());
    if (this.mem && this.mem.day === day) return this.mem;
    const stored = (await this.ctx.storage.get<number>(usedKey(day))) ?? 0;
    this.mem = { day, count: stored, flushed: stored };
    this.ctx.waitUntil(this.cleanupOldDays(day));
    return this.mem;
  }

  // DO 单线程内同步递增，无 await 交错，天然无竞态
  private async consume(): Promise<number> {
    const s = await this.loadState();
    s.count += 1;
    if (s.count - s.flushed >= FLUSH_EVERY && !this.flushing) {
      this.ctx.waitUntil(this.flush());
    }
    return s.count;
  }

  private async flush(): Promise<void> {
    if (!this.mem || this.flushing) return;
    this.flushing = true;
    const target = this.mem.count;
    try {
      await this.ctx.storage.put(usedKey(this.mem.day), target);
      if (this.mem) this.mem.flushed = Math.max(this.mem.flushed, target);
    } finally {
      this.flushing = false;
    }
  }

  // 只保留当天 used:* 键，避免 DO 存储无限增长
  private async cleanupOldDays(keepDay: string): Promise<void> {
    const keys = await this.ctx.storage.list<number>();
    const keep = usedKey(keepDay);
    const stale = [...keys.keys()].filter((k) => k.startsWith("used:") && k !== keep);
    if (stale.length > 0) await this.ctx.storage.delete(stale);
  }
}
