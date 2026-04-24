"use client";

import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, createExpense, fetchSummary, listExpenses } from "@/lib/api";
import type { Expense } from "@/lib/types";
import type { SortOption } from "@/lib/validation";
import { DEFAULT_PAGE_LIMIT } from "@/lib/validation";
import { formatINR } from "@/lib/money";
import { ExpenseForm } from "./expense-form";

type Filters = {
  category: string; // "" = all
  sort: SortOption;
  page: number;
};

const LIST_KEY = (filters: Filters) =>
  [
    "expenses",
    "list",
    {
      category: filters.category || null,
      sort: filters.sort,
      page: filters.page,
      limit: DEFAULT_PAGE_LIMIT,
    },
  ] as const;

const SUMMARY_KEY = ["expenses", "summary"] as const;

export function ExpenseTracker() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>({
    category: "",
    sort: "date_desc",
    page: 1,
  });

  const listQuery = useQuery({
    queryKey: LIST_KEY(filters),
    queryFn: ({ signal }) =>
      listExpenses(
        {
          category: filters.category || undefined,
          sort: filters.sort,
          page: filters.page,
          limit: DEFAULT_PAGE_LIMIT,
        },
        signal,
      ),
    // Keep the previous page visible while the new one loads — avoids a
    // jarring "Loading…" flash when clicking Next/Prev.
    placeholderData: (prev) => prev,
  });

  const summaryQuery = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: ({ signal }) => fetchSummary(signal),
  });

  const createMutation = useMutation({
    mutationFn: createExpense,
    onMutate: async () => {
      // Cancel in-flight reads so they don't overwrite our optimistic state.
      await qc.cancelQueries({ queryKey: ["expenses"] });
      return {};
    },
    onSettled: () => {
      // After any insert, the counts and pagination shift, so just refetch
      // everything under the "expenses" key. Cheap, and keeps state honest.
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });

  // Whenever filters or sort change, jump back to page 1. This prevents
  // the UI from showing "page 5 of 2" after filtering down.
  useEffect(() => {
    setFilters((f) => (f.page === 1 ? f : { ...f, page: 1 }));
    // Intentionally omitting `page` from deps — only reset on filter/sort change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, filters.sort]);

  const pageData = listQuery.data;
  const rows = pageData?.expenses ?? [];
  const total = pageData?.total ?? 0;
  const totalAmount = pageData?.totalAmount ?? "0";
  const limit = pageData?.limit ?? DEFAULT_PAGE_LIMIT;
  const currentPage = pageData?.page ?? filters.page;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageStart = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const pageEnd = Math.min(currentPage * limit, total);

  const summary = summaryQuery.data;
  const categories =
    summary?.categories.map((c) => c.category) ??
    (filters.category ? [filters.category] : []);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Add expense
          </h2>
          <ExpenseForm
            onSubmit={(input) => createMutation.mutateAsync(input)}
            submitting={createMutation.isPending}
            lastError={
              createMutation.error instanceof ApiError
                ? createMutation.error
                : createMutation.error
                  ? new ApiError(0, createMutation.error.message)
                  : null
            }
            onResetError={() => createMutation.reset()}
          />
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Expenses
            </h2>
            <button
              type="button"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
            >
              {listQuery.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <span>Category</span>
              <select
                value={filters.category}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, category: e.target.value }))
                }
                className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <span>Sort</span>
              <select
                value={filters.sort}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    sort: e.target.value as SortOption,
                  }))
                }
                className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="date_desc">Date: newest first</option>
                <option value="date_asc">Date: oldest first</option>
              </select>
            </label>
          </div>

          {listQuery.isPending ? (
            <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
          ) : listQuery.isError ? (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
              Failed to load expenses: {(listQuery.error as Error).message}
              <button
                type="button"
                onClick={() => listQuery.refetch()}
                className="ml-2 font-medium underline"
              >
                Retry
              </button>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {filters.category
                ? `No expenses in "${filters.category}" yet.`
                : "No expenses yet. Add one on the left."}
            </p>
          ) : (
            <ExpenseTable expenses={rows} />
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {total === 0
                ? "0 items"
                : `${pageStart}–${pageEnd} of ${total} item${total === 1 ? "" : "s"}`}
            </span>
            <span className="text-base font-semibold tabular-nums">
              Total: {formatINR(totalAmount)}
            </span>
          </div>

          {totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    page: Math.max(1, f.page - 1),
                  }))
                }
                disabled={currentPage <= 1 || listQuery.isFetching}
                className="rounded border border-zinc-300 px-3 py-1 text-sm enabled:hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:enabled:hover:bg-zinc-800"
              >
                ← Prev
              </button>
              <span className="text-xs text-zinc-500 tabular-nums">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    page: Math.min(totalPages, f.page + 1),
                  }))
                }
                disabled={currentPage >= totalPages || listQuery.isFetching}
                className="rounded border border-zinc-300 px-3 py-1 text-sm enabled:hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:enabled:hover:bg-zinc-800"
              >
                Next →
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {summary && summary.categories.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Summary by category
            </h2>
            <span className="text-xs text-zinc-500 tabular-nums">
              {summary.total} item{summary.total === 1 ? "" : "s"} · {formatINR(summary.totalAmount)}
            </span>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {summary.categories.map(({ category, totalAmount, count }) => (
              <li
                key={category}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <button
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      category: f.category === category ? "" : category,
                    }))
                  }
                  className={`text-left font-medium hover:underline ${
                    filters.category === category ? "text-blue-600" : ""
                  }`}
                  aria-pressed={filters.category === category}
                  title={
                    filters.category === category
                      ? "Clear filter"
                      : `Filter list to ${category}`
                  }
                >
                  {category}
                </button>
                <span className="text-xs text-zinc-500">
                  {count} item{count === 1 ? "" : "s"}
                </span>
                <span className="tabular-nums font-semibold">
                  {formatINR(totalAmount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ExpenseTable({ expenses }: { expenses: Expense[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 pr-3 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((e) => (
            <tr
              key={e.id}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
            >
              <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                {e.date}
              </td>
              <td className="py-2 pr-3">
                <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                  {e.category}
                </span>
              </td>
              <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-300">
                {e.description || (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatINR(e.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
