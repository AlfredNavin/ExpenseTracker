"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { createExpenseSchema, type CreateExpenseInput } from "@/lib/validation";

const DRAFT_KEY = "expense-tracker:draft";

type Draft = {
  amount: string;
  category: string;
  description: string;
  date: string;
};

const emptyDraft = (): Draft => ({
  amount: "",
  category: "",
  description: "",
  date: todayISO(),
});

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ExpenseForm({
  onSubmit,
  submitting,
  lastError,
  onResetError,
}: {
  onSubmit: (input: CreateExpenseInput) => Promise<unknown>;
  submitting: boolean;
  lastError: ApiError | null;
  onResetError: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const hydrated = useRef(false);

  // Hydrate draft from localStorage once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Draft>;
        setDraft({
          amount: parsed.amount ?? "",
          category: parsed.category ?? "",
          description: parsed.description ?? "",
          date: parsed.date ?? todayISO(),
        });
      }
    } catch {
      // ignore malformed draft
    }
    hydrated.current = true;
  }, []);

  // Persist draft on every change after hydration.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // quota / private mode — ignore
    }
  }, [draft]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    }
    if (lastError) onResetError();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const id = crypto.randomUUID();
    const candidate: CreateExpenseInput = {
      id,
      amount: draft.amount.trim(),
      category: draft.category.trim(),
      description: draft.description.trim(),
      date: draft.date,
    };

    const parsed = createExpenseSchema.safeParse(candidate);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setFieldErrors({});

    try {
      await onSubmit(parsed.data);
      setDraft(emptyDraft());
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
    } catch {
      // error surfaces via lastError prop
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <Field label="Amount (₹)" error={fieldErrors.amount}>
        <input
          type="text"
          inputMode="decimal"
          value={draft.amount}
          onChange={(e) => update("amount", e.target.value)}
          placeholder="0.00"
          autoComplete="off"
          className="input"
        />
      </Field>

      <Field label="Category" error={fieldErrors.category}>
        <input
          type="text"
          value={draft.category}
          onChange={(e) => update("category", e.target.value)}
          placeholder="Food, Travel, …"
          autoComplete="off"
          list="category-suggestions"
          className="input"
        />
        <datalist id="category-suggestions">
          <option value="Food" />
          <option value="Travel" />
          <option value="Groceries" />
          <option value="Rent" />
          <option value="Utilities" />
          <option value="Entertainment" />
          <option value="Health" />
          <option value="Other" />
        </datalist>
      </Field>

      <Field label="Description" error={fieldErrors.description}>
        <input
          type="text"
          value={draft.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Optional"
          className="input"
        />
      </Field>

      <Field label="Date" error={fieldErrors.date}>
        <input
          type="date"
          value={draft.date}
          onChange={(e) => update("date", e.target.value)}
          onFocus={(e) => e.currentTarget.showPicker?.()}
          max={todayISO()}
          className="input"
        />
      </Field>

      {lastError ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {lastError.message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Adding…" : "Add expense"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      ) : null}
    </label>
  );
}
