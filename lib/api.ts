import type { Expense } from "./types";
import type { CreateExpenseInput, SortOption } from "./validation";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: { error?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    throw new ApiError(
      res.status,
      body.error ?? `Request failed with ${res.status}`,
      body.details,
    );
  }
  return (await res.json()) as T;
}

export type ListParams = {
  category?: string;
  sort?: SortOption;
};

export async function listExpenses(
  params: ListParams,
  signal?: AbortSignal,
): Promise<Expense[]> {
  const url = new URL("/api/expenses", window.location.origin);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.sort) url.searchParams.set("sort", params.sort);
  const res = await fetch(url, { signal, cache: "no-store" });
  const body = await handle<{ expenses: Expense[] }>(res);
  return body.expenses;
}

export async function createExpense(
  input: CreateExpenseInput,
): Promise<Expense> {
  const res = await fetch("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await handle<{ expense: Expense }>(res);
  return body.expense;
}

export async function listCategories(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch("/api/categories", { signal, cache: "no-store" });
  const body = await handle<{ categories: string[] }>(res);
  return body.categories;
}
