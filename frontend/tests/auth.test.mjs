import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../lib/storage.ts";

describe("auth SSR guard", () => {
  it("storage getItem returns null on server", async () => {
    const result = await storage.getItem("test");
    assert.equal(result, null);
  });
});
