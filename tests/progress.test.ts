import { describe, expect, it } from "vitest";
import { calcPercent } from "@/lib/progress";

describe("calcPercent", () => {
  it("returns 0 when total is 0 (no NaN)", () => expect(calcPercent(0, 0)).toBe(0));
  it("returns 25 for 1/4", () => expect(calcPercent(1, 4)).toBe(25));
  it("returns 100 for 4/4", () => expect(calcPercent(4, 4)).toBe(100));
  it("rounds 1/3 to 33", () => expect(calcPercent(1, 3)).toBe(33));
});
