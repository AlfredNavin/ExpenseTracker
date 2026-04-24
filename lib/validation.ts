import { z } from "zod";

const amountSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .regex(/^-?\d+(\.\d{1,2})?$/, "Amount must be a number with up to 2 decimals")
  .refine((v) => Number(v) > 0, "Amount must be greater than 0")
  .refine(
    (v) => Number(v) < 1_000_000_000_000,
    "Amount is too large",
  );

const categorySchema = z
  .string()
  .trim()
  .min(1, "Category is required")
  .max(64, "Category is too long");

const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Description is too long")
  .default("");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((v) => !Number.isNaN(new Date(v + "T00:00:00Z").getTime()), "Invalid date");

export const createExpenseSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
  amount: amountSchema,
  category: categorySchema,
  description: descriptionSchema,
  date: dateSchema,
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const listQuerySchema = z.object({
  category: z.string().trim().min(1).max(64).optional(),
  sort: z.enum(["date_desc", "date_asc"]).optional(),
  page: z
    .coerce.number({ error: "page must be a number" })
    .int("page must be an integer")
    .min(1, "page must be >= 1")
    .default(1),
  limit: z
    .coerce.number({ error: "limit must be a number" })
    .int("limit must be an integer")
    .min(1, "limit must be >= 1")
    .max(MAX_PAGE_LIMIT, `limit must be <= ${MAX_PAGE_LIMIT}`)
    .default(DEFAULT_PAGE_LIMIT),
});

export type SortOption = "date_desc" | "date_asc";
