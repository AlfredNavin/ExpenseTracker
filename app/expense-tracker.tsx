"use client";

import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, createExpense, listExpenses } from "@/lib/api";
import type { Expense } from "@/lib/types";
import type { SortOption } from "@/lib/validation";
import { formatINR, sumAmounts, toPaise } from "@/lib/money";
import { ExpenseForm } from "./expense-form";

type Filters = {
  category: string; // "" = all
  sort: SortOption;
};

const LIST_KEY = (filters: Filters) =>
  ["expenses", { category: filters.category || null, sort: filters.sort }] as const;

const SUMMARY_KEY = ["expenses", { category: null, sort: "date_desc" }] as const;

export function ExpenseTracker() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>({
    category: "",
    sort: "date_desc",
  });

  const listQuery = useQuery({
    queryKey: LIST_KEY(filters),
    queryFn: ({ signal }) =>
      listExpenses(
        {
          category: filters.category || undefined,
          sort: filters.sort,
        },
        signal,
      ),
  });

  // Unfiltered list powers the per-category summary so it always reflects
  // the full picture regardless of which filter is applied.
  const summaryQuery = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: ({ signal }) => listExpenses({ sort: "date_desc" }, signal),
  });

  const createMutation = useMutation({
    mutationFn: createExpense,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["expenses"] });

      const optimistic: Expense = {
        id: input.id,
        amount: input.amount,
        category: input.category,
        description: input.description ?? "",
        date: input.date,
        createdAt: new Date().toISOString(),
      };

      const previous = qc.getQueriesData<Expense[]>({ queryKey: ["expenses"] });
      for (const [key, old] of previous) {
        if (!old) continue;
        const keyFilters = key[1] as {
          category: string | null;
          sort: SortOption;
        };
        const matchesCategory =
          !keyFilters.category || keyFilters.category === input.category;
        if (!matchesCategory) continue;

        const next = [optimistic, ...old.filter((e) => e.id !== input.id)];
        const dir = keyFilters.sort === "date_asc" ? 1 : -1;
        next.sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? dir : -dir;
          return a.createdAt < b.createdAt ? dir : -dir;
        });
        qc.setQueryData(key, next);
      }

      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });

  const expenses = listQuery.data ?? [];
  const allExpenses = summaryQuery.data ?? [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of allExpenses) set.add(e.category);
    // Include the active filter even if it's not yet in the summary (stale).
    if (filters.category) set.add(filters.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allExpenses, filters.category]);

  const total = useMemo(() => sumAmounts(expenses.map((e) => e.amount)), [
    expenses,
  ]);

  const perCategory = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const e of allExpenses) {
      const arr = groups.get(e.category) ?? [];
      arr.push(e.amount);
      groups.set(e.category, arr);
    }
    return Array.from(groups.entries())
      .map(([category, amounts]) => ({
        category,
        total: sumAmounts(amounts),
        count: amounts.length,
      }))
      .sort((a, b) => {
        // Largest total first (BigInt compare for correctness).
        const ap = toPaise(a.total);
        const bp = toPaise(b.total);
        if (ap !== bp) return ap < bp ? 1 : -1;
        return a.category.localeCompare(b.category);
      });
  }, [allExpenses]);

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
        ) : expenses.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            {filters.category
              ? `No expenses in "${filters.category}" yet.`
              : "No expenses yet. Add one on the left."}
          </p>
        ) : (
          <ExpenseTable expenses={expenses} />
        )}

        <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {expenses.length} item{expenses.length === 1 ? "" : "s"}
          </span>
          <span className="text-base font-semibold tabular-nums">
            Total: {formatINR(total)}
          </span>
        </div>
      </section>
    </div>

    {perCategory.length > 0 ? (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Summary by category
        </h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {perCategory.map(({ category, total, count }) => (
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
                {formatINR(total)}
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
