import { ExpenseTracker } from "./expense-tracker";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Expense Tracker
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Record and review your personal expenses.
        </p>
      </header>
      <ExpenseTracker />
    </main>
  );
}
