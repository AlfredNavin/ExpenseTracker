import type { Expense, PagedExpenses, Summary } from "./types";
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
  page?: number;
  limit?: number;
};

export async function listExpenses(
  params: ListParams,
  signal?: AbortSignal,
): Promise<PagedExpenses> {
  const url = new URL("/api/expenses", window.location.origin);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.sort) url.searchParams.set("sort", params.sort);
  if (params.page) url.searchParams.set("page", String(params.page));
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  const res = await fetch(url, { signal, cache: "no-store" });
  return handle<PagedExpenses>(res);
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

export async function fetchSummary(signal?: AbortSignal): Promise<Summary> {
  const res = await fetch("/api/summary", { signal, cache: "no-store" });
  return handle<Summary>(res);
}
