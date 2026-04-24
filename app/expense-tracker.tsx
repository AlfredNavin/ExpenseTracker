"use client";

import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, createExpense, listExpenses } from "@/lib/api";
import type { Expense } from "@/lib/types";
import { formatINR, sumAmounts } from "@/lib/money";
import { ExpenseForm } from "./expense-form";

type Filters = {
  category: string; // "" = all
};

const LIST_KEY = (filters: Filters) =>
  ["expenses", { category: filters.category || null, sort: "date_desc" }] as const;

export function ExpenseTracker() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ category: "" });

  const listQuery = useQuery({
    queryKey: LIST_KEY(filters),
    queryFn: ({ signal }) =>
      listExpenses(
        {
          category: filters.category || undefined,
          sort: "date_desc",
        },
        signal,
      ),
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
      qc.setQueriesData<Expense[]>({ queryKey: ["expenses"] }, (old) => {
        if (!old) return old;
        const next = [optimistic, ...old.filter((e) => e.id !== input.id)];
        next.sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? 1 : -1;
          return a.createdAt < b.createdAt ? 1 : -1;
        });
        return next;
      });

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

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) set.add(e.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [expenses]);

  const total = useMemo(() => sumAmounts(expenses.map((e) => e.amount)), [
    expenses,
  ]);

  return (
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

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-sm text-zinc-600 dark:text-zinc-400">
            Category:
          </label>
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
          <span className="text-xs text-zinc-500">sorted by date (newest first)</span>
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
