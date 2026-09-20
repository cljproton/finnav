import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../lib/storage.ts";

describe("storage SSR guard", () => {
  it("getItem returns null on server (no DOM)", async () => {
    const result = await storage.getItem("test-key");
    assert.equal(result, null);
  });

  it("setItem is no-op on server", async () => {
    await storage.setItem("test-key", "test-value");
  });

  it("removeItem is no-op on server", async () => {
    await storage.removeItem("test-key");
  });

  it("clear is no-op on server", async () => {
    await storage.clear();
  });
});
