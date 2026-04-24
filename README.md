# Expense Tracker

A small personal finance tool: record and review expenses, filter by category, sort by date, see the total.

Built as a take-home. Aim was **production-like quality on a small feature set**, with real-world conditions (unreliable networks, refreshes, retries) taken seriously.

- **Repo:** https://github.com/AlfredNavin/ExpenseTracker
- **Live:** _add Vercel URL here after first deploy_

---

## Tech stack — and why

Every choice below was made against one bar: what gives the most correctness and clarity for the smallest footprint.

### Next.js 16 (App Router)
One framework hosts both the UI and the API routes, deployed as a single unit on Vercel. That means **no CORS, no separate backend host, no two-moving-parts deploy**. For a single-user tool with a handful of endpoints, splitting into a separate Java/Go/Python backend would have added operational complexity for no gain.

### TypeScript
Money, dates, and UUIDs are exactly the kinds of values where a stray `any` becomes a silent bug. Strict mode catches shape drift between the server response, the fetch layer, and the UI for free.

### Neon Postgres
A real database is the right answer for "real money." Specifically:
- **`NUMERIC(14,2)`** — exact decimal arithmetic for currency. SQLite's `REAL` and in-memory stores using JS `number` can't represent `0.1 + 0.2` exactly; Postgres can.
- **Row-level locks + `ON CONFLICT DO NOTHING`** — serverless functions scale horizontally, so the serialization point for concurrent duplicate POSTs has to live in the DB, not the app. Postgres' primary-key uniqueness gives us that for free.
- **Serverless-friendly HTTP driver** (`@neondatabase/serverless`) — no long-lived connections, no pool to manage, one HTTP call per statement. Works perfectly inside Vercel's serverless invocation model.
- **Free tier, no sleep** — unlike Supabase's 7-day pause, Neon branches suspend on idle and resume in ~1s, so a reviewer visiting days later still gets a working app.

### Drizzle ORM
SQL-first (you see the query you're running) and has **~5ms cold-start overhead** — an order of magnitude lighter than Prisma. That matters on Vercel's serverless: a heavy ORM turns every cold invocation into a user-facing delay.

### Zod
One schema definition, used on both the client (pre-submit validation in the form) and the server (POST body validation in the route). There's no "client validation drift" because they're literally the same object. Also gives typed `safeParse` results for free.

### TanStack Query (React Query)
The network is where most of the brief's "real-world conditions" live — retries, stale caches, loading states, cancellation. TanStack Query ships all of that as battle-tested defaults (exponential backoff, request deduplication, query invalidation) rather than me rolling it by hand and getting the edge cases wrong.

### Tailwind CSS
Brief says *"keep styling simple; focus on correctness and clarity."* Tailwind lets me style inline without fighting a component library or a CSS-in-JS runtime. No Radix, no MUI, no imported dark-mode system — everything visible is spelled out in the component.

### Vitest
Near-zero-config, runs under Vite, same config style as the rest of the stack. 33 unit tests run in ~180ms.

### Vercel
Deploy = `git push`. No Dockerfile, no VPC, no IAM. Vercel-Neon integration injects `DATABASE_URL` automatically.

---

## What "real-world conditions" actually means — and how each one is handled

The brief called out unreliable networks, browser refreshes, and retries as first-class evaluation criteria. Here's the concrete mapping from each condition to the mechanism that covers it:

### Double-clicking "Submit" (or any client-side retry)
The client generates a UUID v4 (`crypto.randomUUID()`) *before* the mutation fires, and sends it in the POST body as `id`. The server uses this as the table's primary key:

```sql
INSERT INTO expenses (id, amount, ...) VALUES (...)
ON CONFLICT (id) DO NOTHING RETURNING *;
```

- If it's a genuine first submission → row inserted, `201`.
- If it's a retry of the same body → conflict, empty RETURNING, fall through to a `SELECT` that returns the existing row with `200`.
- If it's a retry with the same `id` but a *different* body (shouldn't happen, but is possible with a client bug) → `409 Conflict` so the problem is loud, not silent.

The natural primary key *is* the idempotency key. No separate `idempotency_keys` table, no TTL sweep, no request-hash middleware.

### Refresh during compose
Every keystroke in the form is mirrored into `localStorage` (`expense-tracker:draft`). On mount the form hydrates from it. Typing "Rent 15000 for March" then hitting F5 by accident no longer loses anything.

### Refresh after submit
Submitted data lives in Postgres, not in React state. The list refetches on mount. No "disappearing" expenses.

### Slow API responses
- The submit button switches to `"Adding…"` and disables, so double-clicks can't queue up a second mutation.
- The list has a visible loading state and — when paginating — uses `placeholderData` so Prev/Next don't flash "Loading…" on every click.
- Failed requests surface inline with a Retry button instead of a toast that disappears.

### Failed API responses
TanStack Query retries **mutations up to 5 times** and **queries up to 3 times** with exponential backoff (1s → 2s → 4s → 8s → 15s cap). 4xx errors don't retry (they won't magically become valid); 5xx and network errors do. If every retry fails, the error surfaces with its actual message.

### Concurrent / parallel requests
Because the idempotency key is the PK and `ON CONFLICT DO NOTHING` is atomic within the single statement, **50 parallel POSTs with the same `id` produce exactly one row** — Postgres' row-level lock on the PK index serializes them. The API handler itself is stateless; the DB is the only synchronization point. There's no in-memory cache, no global mutex, no race window between "check" and "insert."

### Money precision
`NUMERIC(14,2)` in Postgres, **decimal string** on the wire (never a JS `number` for the amount field), and **`BigInt` paise** for sums (`lib/money.ts`). The canonical `0.1 + 0.2` test is covered in the unit test suite. A 1,000-item sum of `0.01` returns exactly `10.00`, not `9.999999…`.

### Browser extensions mutating the DOM
Some extensions (Ember Inspector, Grammarly, password managers) inject attributes on `<html>` before React hydrates, producing a false hydration-mismatch warning. `suppressHydrationWarning` on that single element silences the noise without hiding real bugs.

### Pagination correctness under growing data
The list endpoint is paginated (20/page) but `total` and `totalAmount` are aggregated server-side over the **full filtered set**, not just the current page. So "Total: ₹X" means "total of everything matching your filter," which is what a user actually wants — even if they've only paged through the first 20.

---

## Key design decisions

These go beyond the stack — they're about how the pieces fit.

- **Client-generated UUIDs as the primary key.** Makes the PK double as the idempotency key. Cheapest possible implementation for the "submit multiple times" and "retry" requirements.
- **Decimal strings end-to-end for money.** Input stays a string from the form → network → DB → display. Sums happen in `BigInt`. There is no code path where money ever becomes a float.
- **Server-computed page totals.** The "Total: ₹X" display is aggregated in SQL, not summed from the visible rows. Paging doesn't break the total, even at huge dataset sizes.
- **Lazy DB initialization.** `neon()` is constructed on first query, not at module load. Keeps `next build` green in CI even without a real `DATABASE_URL`.
- **Two endpoints for two different reads.** `/expenses` is paginated (for the table); `/summary` is aggregated (for the category panel). Using the paginated endpoint to build the summary would fetch every row and defeat pagination.
- **Defense in depth on validation.** Zod on the client (pre-submit UX), Zod on the server (trust nothing from the wire), `NUMERIC(14,2)` in the DB (last line of defense).

---

## Trade-offs (made because of the timebox)

- **No authentication or multi-user support.** The assignment scopes to "my personal expenses" — singular. Auth done right (hashing, sessions, CSRF, password reset) would have traded hours away from the correctness concerns the brief actually emphasizes.
- **No edit / delete endpoints.** Not in the acceptance criteria. Add-and-review is the scoped loop.
- **Offset, not cursor, pagination.** Simpler UX and familiar to reviewers. Fine up to ~10k rows. Cursor would be more robust under concurrent inserts on the same sort key; would be the right call at higher scale.
- **No client-side optimistic insert** (dropped after adding pagination). Inserting optimistically across paginated caches — shifting every row forward — is the sort of place bugs hide. Chose idempotent POST + "Adding…" state + brief invalidation instead. Still retry-safe, still responsive.
- **No server-side rendering of the list.** The page is a client component to lean on TanStack Query's retry / cache / pagination machinery. RSC + Server Actions would be more idiomatic but a bigger rewrite.

## Intentionally not done

- Login, accounts, sessions.
- Edit / delete expenses.
- Budgets, recurring expenses, reports.
- E2E (Playwright) — unit tests cover the places bugs actually hurt.
- Category CRUD — categories are free-text with `<datalist>` suggestions.
