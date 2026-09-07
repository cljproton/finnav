import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("health endpoints", () => {
  it("GET /api/health/ 返回 {status: ok}", async () => {
    const request = new Request("http://localhost/api/health/");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("GET /healthz 返回 {status: ok}", async () => {
    const response = await SELF.fetch("http://localhost/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("未知路径返回 DRF 风格 404 JSON", async () => {
    const response = await SELF.fetch("http://localhost/api/nope/");
    expect(response.status).toBe(404);
    const body = await response.json<{ code: string; detail: string }>();
    expect(body.code).toBe("not_found");
    expect(typeof body.detail).toBe("string");
  });
});
