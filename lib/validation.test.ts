import { describe, it, expect } from "vitest";
import { createExpenseSchema, listQuerySchema } from "./validation";

const validBody = {
  id: "00000000-0000-4000-8000-000000000001",
  amount: "100.00",
  category: "Food",
  description: "lunch",
  date: "2026-04-20",
};

describe("createExpenseSchema", () => {
  it("accepts a valid expense", () => {
    const result = createExpenseSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("rejects negative amount with a meaningful message", () => {
    const result = createExpenseSchema.safeParse({ ...validBody, amount: "-10" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => /greater than 0/i.test(m))).toBe(true);
    }
  });

  it("rejects zero amount", () => {
    const result = createExpenseSchema.safeParse({ ...validBody, amount: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects more than 2 decimal places", () => {
    const result = createExpenseSchema.safeParse({ ...validBody, amount: "1.234" });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric amount", () => {
    const result = createExpenseSchema.safeParse({ ...validBody, amount: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const { id: _id, ...rest } = validBody;
    void _id;
    const result = createExpenseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid uuid", () => {
    const result = createExpenseSchema.safeParse({ ...validBody, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects empty category", () => {
    const result = createExpenseSchema.safeParse({ ...validBody, category: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects bad date format", () => {
    const result = createExpenseSchema.safeParse({ ...validBody, date: "20-04-2026" });
    expect(result.success).toBe(false);
  });

  it("accepts empty description and defaults it", () => {
    const result = createExpenseSchema.safeParse({ ...validBody, description: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe("");
  });

  it("trims surrounding whitespace on category and description", () => {
    const result = createExpenseSchema.safeParse({
      ...validBody,
      category: "  Travel  ",
      description: "  trip  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("Travel");
      expect(result.data.description).toBe("trip");
    }
  });
});

describe("listQuerySchema", () => {
  it("accepts empty object and applies pagination defaults", () => {
    const r = listQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(1);
      expect(r.data.limit).toBe(20);
    }
  });

  it("accepts date_desc and date_asc", () => {
    expect(listQuerySchema.safeParse({ sort: "date_desc" }).success).toBe(true);
    expect(listQuerySchema.safeParse({ sort: "date_asc" }).success).toBe(true);
  });

  it("rejects unknown sort", () => {
    expect(listQuerySchema.safeParse({ sort: "amount_asc" }).success).toBe(false);
  });

  it("coerces page and limit from strings (real query-string behaviour)", () => {
    const r = listQuerySchema.safeParse({ page: "3", limit: "50" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(3);
      expect(r.data.limit).toBe(50);
    }
  });

  it("rejects page < 1", () => {
    expect(listQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listQuerySchema.safeParse({ page: -5 }).success).toBe(false);
  });

  it("rejects non-integer page", () => {
    expect(listQuerySchema.safeParse({ page: 1.5 }).success).toBe(false);
  });

  it("rejects limit > 100", () => {
    expect(listQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("rejects limit < 1", () => {
    expect(listQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("rejects non-numeric page", () => {
    expect(listQuerySchema.safeParse({ page: "abc" }).success).toBe(false);
  });
});
