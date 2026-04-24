import { describe, it, expect } from "vitest";
import { toPaise, fromPaise, sumAmounts, formatINR } from "./money";

describe("toPaise", () => {
  it("converts whole rupees", () => {
    expect(toPaise("100")).toBe(10000n);
  });

  it("converts two-decimal values", () => {
    expect(toPaise("1234.56")).toBe(123456n);
  });

  it("pads single-decimal values to two decimals", () => {
    expect(toPaise("1.5")).toBe(150n);
  });

  it("handles zero", () => {
    expect(toPaise("0")).toBe(0n);
    expect(toPaise("0.00")).toBe(0n);
  });

  it("handles large values that exceed Number.MAX_SAFE_INTEGER in paise", () => {
    // 99999999999.99 rupees = 9_999_999_999_999 paise — beyond Number precision
    // but exact in BigInt.
    expect(toPaise("99999999999.99")).toBe(9999999999999n);
  });
});

describe("fromPaise", () => {
  it("produces a 2-decimal string", () => {
    expect(fromPaise(123456n)).toBe("1234.56");
  });

  it("pads fractional zeros", () => {
    expect(fromPaise(10000n)).toBe("100.00");
    expect(fromPaise(5n)).toBe("0.05");
  });
});

describe("sumAmounts", () => {
  it("sums classic floating-point-trap values exactly", () => {
    // 0.1 + 0.2 is the canonical JS float bug; we must produce exactly 0.30
    expect(sumAmounts(["0.10", "0.20"])).toBe("0.30");
  });

  it("sums a long list without drift", () => {
    // 1000 * 0.01 = 10.00 (would be 9.99999... with naive floats)
    expect(sumAmounts(Array(1000).fill("0.01"))).toBe("10.00");
  });

  it("returns 0.00 for an empty list", () => {
    expect(sumAmounts([])).toBe("0.00");
  });

  it("mixes whole and fractional values", () => {
    expect(sumAmounts(["100", "49.50", "0.25"])).toBe("149.75");
  });
});

describe("formatINR", () => {
  it("renders as ₹-prefixed with 2 decimals", () => {
    const s = formatINR("1234.56");
    expect(s).toMatch(/₹/);
    expect(s).toMatch(/1,234\.56/);
  });

  it("pads zero decimals", () => {
    const s = formatINR("100.00");
    expect(s).toMatch(/100\.00/);
  });
});
