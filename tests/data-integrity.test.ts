import { describe, expect, it } from "vitest";
import { validateDataset } from "@/data/validate";

/** Development gate: any critical dataset error fails `npm test` (see src/data/validate.ts). */
describe("dataset integrity", () => {
  it("has no critical errors", async () => {
    const r = await validateDataset();
    if (r.errors.length) console.error(r.errors.slice(0, 40).join("\n"));
    expect(r.errors).toEqual([]);
    expect(r.checked.playerEras).toBeGreaterThanOrEqual(4000);
    expect(r.checked.identities).toBeGreaterThanOrEqual(1500);
  }, 60_000);
});
