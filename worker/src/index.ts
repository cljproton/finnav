import { Hono } from "hono";
import type { Env } from "./types";
import { quotaGuard } from "./middleware/quota";

const api = new Hono<{ Bindings: Env }>();

api.use("*", quotaGuard);

// GET /api/health/ —— 契约对齐 Django docs/api.md
api.get("/health/", (c) => c.json({ status: "ok" }));

const app = new Hono<{ Bindings: Env }>();

app.route("/api", api);

// 根级健康检查（运维探活）
app.get("/healthz", (c) => c.json({ status: "ok" }));

app.notFound((c) => c.json({ code: "not_found", detail: "Not found." }, 404));

app.onError((err, c) => {
  console.error(`[unhandled] ${c.req.method} ${c.req.path}:`, err);
  return c.json({ code: "server_error", detail: "Internal server error." }, 500);
});

export default app;

export { QuotaGuard } from "./do/quota";
