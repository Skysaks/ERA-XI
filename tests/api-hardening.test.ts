import { describe, expect, it } from "vitest";
import { clientIp, rateLimited, readJson, MAX_BODY_BYTES } from "@/server/rooms";

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/rooms", { method: "POST", body, headers });

describe("room API hardening", () => {
  it("reads a normal JSON body", async () => {
    expect(await readJson(req(JSON.stringify({ a: 1 })))).toEqual({ a: 1 });
  });

  it("returns null for an empty or unparsable body", async () => {
    expect(await readJson(req(""))).toBeNull();
    expect(await readJson(req("{not json"))).toBeNull();
  });

  it("refuses an oversized body, declared or actual", async () => {
    const big = JSON.stringify({ x: "a".repeat(MAX_BODY_BYTES) });
    expect(await readJson(req(big))).toBeUndefined();
    expect(await readJson(req("{}", { "content-length": String(MAX_BODY_BYTES + 1) }))).toBeUndefined();
  });

  it("prefers x-real-ip and otherwise the right-most forwarded hop", () => {
    const h = (headers: Record<string, string>) => new Request("http://localhost/", { headers });
    expect(clientIp(h({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.7");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(h({}))).toBe("local");
  });

  it("rate-limits within a window and allows again after it", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimited(key, 3, 60_000)).toBe(false);
    expect(rateLimited(key, 3, 60_000)).toBe(true);
    const other = `test:${Math.random()}`;
    expect(rateLimited(other, 1, 0)).toBe(false);
  });
});
