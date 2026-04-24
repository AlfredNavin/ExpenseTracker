# Expense Tracker

A small personal finance tool: record and review expenses, filter by category, sort by date, see the total.

Built as a take-home. Aim was **production-like quality on a small feature set**, with real-world conditions (unreliable networks, refreshes, retries) taken seriously.

---

## Stack

- **Next.js 16** (App Router) — single deployable unit for UI + API.
- **TypeScript** — compile-time guards around money, dates, IDs.
- **Neon Postgres** — real `NUMERIC(14,2)` for money, serverless-friendly.
- **Drizzle ORM** — SQL-first, tiny cold-start, typed queries.
- **Zod** — one schema, validates on both client and server.
- **TanStack Query** — retries, optimistic updates, cache invalidation.
- **Tailwind CSS** — simple styling without a component library.
- **Vercel** — hosts frontend + API routes on one domain (no CORS).

## Live

- App: _add Vercel URL here after first deploy_
- Repo: _add GitHub URL here_

---

## Running locally

```bash
# 1. install
npm install

# 2. set up env
cp .env.example .env.local
# then paste your Neon DATABASE_URL into .env.local

# 3. apply migrations
npm run db:migrate

# 4. dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run db:generate` | Generate migration SQL from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations to the DB in `DATABASE_URL` |
| `npm run db:studio` | Drizzle Studio (visual browser for the DB) |
| `npm test` | Run unit tests (Vitest) |

---

## API

Both paths resolve to the same handlers: the brief's canonical `/expenses` and `/categories` are registered as rewrites in `next.config.ts`, while the implementation lives under Next.js' conventional `/api/*` tree. Use whichever you prefer.

### `POST /expenses` (also `POST /api/expenses`)
Create an expense.

**Body**
```json
{
  "id": "<client-generated UUID v4>",
  "amount": "1234.56",
  "category": "Food",
  "description": "lunch",
  "date": "2026-04-24"
}
```

> **Note on the `id` field (deviation from the literal brief).**
> The brief lists only `amount, category, description, date` in the request body. I require an additional client-generated UUID `id` because it's the cleanest path to end-to-end idempotency (see ["Real-world conditions"](#how-the-real-world-conditions-are-handled)). Without it, deduping a retried POST needs either a separate `Idempotency-Key` header + a short-lived key table, or a stateful server-side request hash — both with more moving parts and more edge cases. Keeping the PK client-generated makes the natural primary key *also* the idempotency key, with zero extra state.

- Amount is sent and stored as a **decimal string** (no float rounding).
- `id` must be a UUID v4 — generated via `crypto.randomUUID()` in the browser.

**Responses**
- `201` — new expense created
- `200` — same `id` + same fields (idempotent replay)
- `400` — validation error
- `409` — `id` already exists with different fields

### `GET /expenses` (also `GET /api/expenses`)
List expenses.

**Query params** (all optional)
- `category` — exact-match filter
- `sort=date_desc` — newest first (by `date`, then `created_at`) — default
- `sort=date_asc` — oldest first

### `GET /categories` (also `GET /api/categories`)
Distinct categories, for the filter dropdown.

---

## Data model

```sql
CREATE TABLE expenses (
  id          uuid                      PRIMARY KEY,
  amount      numeric(14,2)             NOT NULL,
  category    text                      NOT NULL,
  description text                      NOT NULL DEFAULT '',
  date        date                      NOT NULL,
  created_at  timestamptz               NOT NULL DEFAULT now()
);
CREATE INDEX ON expenses (date DESC);
CREATE INDEX ON expenses (category);
```

Money is stored as `numeric(14,2)` and carried through the app as a **string**. Sums are computed in `BigInt` paise to avoid floating-point drift (`lib/money.ts`).

---

## Features

- **Add expense** — amount, category, description, date (required: amount, category, date).
- **List expenses** — sortable and filterable table.
- **Filter by category** — dropdown, auto-populated from existing categories.
- **Sort by date** — newest-first (default) or oldest-first.
- **Total** — sum of the currently visible (filtered) list, shown as `Total: ₹X`.
- **Summary by category** — separate section showing total + count per category across **all** expenses (ignores the active filter so you always see the full picture). Click a category name to apply/clear it as a filter.
- **Draft persistence** — typing in the form is mirrored to `localStorage`; a refresh mid-compose restores your input.
- **Inline validation** — amounts must be positive with ≤2 decimals; date is required; errors appear next to the offending field.
- **Loading & error states** — spinner on list fetch, "Adding…" on submit, retry buttons on failures.

---

## How the "real-world conditions" are handled

The brief called these out explicitly; here's the mapping.

| Condition | How it's handled |
|---|---|
| **Double-click submit** | Client generates a UUID before showing the form's submit handler. `POST` uses `INSERT ... ON CONFLICT (id) DO NOTHING`. A retry with the same body returns the existing row. |
| **Refresh during compose** | Form draft is mirrored to `localStorage` on every keystroke, hydrated on mount. Refresh does not lose typed-but-unsubmitted input. |
| **Refresh after submit** | Submitted data lives in Postgres; the list refetches on mount. |
| **Slow response** | UI shows a loading state on the list, and the submit button shows an "Adding…" state. Optimistic update adds the expense to the list instantly so the user sees feedback even before the server responds. |
| **Failed response** | TanStack Query retries mutations with exponential backoff (up to 5 attempts). On hard failure, the optimistic row is rolled back and the error is shown inline. User can re-submit. |
| **Money precision** | Decimal string end-to-end; `BigInt` for sums; `numeric(14,2)` in the DB. No `parseFloat` for arithmetic. |

---

## Design decisions

- **One deployment, one domain.** Next.js API routes live alongside the UI, so there's no CORS, no separate backend host, no two-moving-parts deploy. For a single-user tool this is strictly simpler.
- **Client-generated UUIDs as the primary key.** This is the cheapest way to get end-to-end idempotency. No separate `idempotency_keys` table, no TTL sweep, no header-vs-body conflict — the natural PK *is* the dedupe key.
- **Decimal strings for money.** JS `number` can't represent `0.1 + 0.2`. Postgres `numeric` can. Keeping the value as a string from input → wire → DB → display avoids any conversion where precision could leak.
- **Optimistic UI with rollback.** Feels fast, but correctness is preserved: on error, TanStack Query's `onError` restores the previous cache, and `onSettled` invalidates to sync with the server.
- **Lazy DB init.** `neon()` is constructed on first query, not at module load. This keeps builds green when `DATABASE_URL` isn't present (e.g. during `next build` in CI).

---

## Trade-offs (made because of the timebox)

- **No authentication or multi-user support.** The assignment scopes to "my personal expenses" — single user. Adding auth would have traded time away from the correctness concerns the brief actually emphasizes.
- **No edit/delete endpoints.** Not in the acceptance criteria. Add-and-review is the scoped loop.
- **No pagination.** Fine for a personal tool with hundreds of rows; would need cursor pagination past ~10k.
- **No server-side rendering of the list.** The page ships as a client component because we lean on TanStack Query for the retry / optimistic / cache machinery. An RSC-first approach with Server Actions would be more idiomatic but is a bigger rewrite.
- **Styling is intentionally plain.** The brief says "keep styling simple; focus on correctness."
- **Minimal tests.** 27 Vitest unit tests cover the two places a bug would do the most damage: money arithmetic (`lib/money.test.ts` — including the classic `0.1 + 0.2` float trap and a 1,000-item sum) and input validation (`lib/validation.test.ts` — negative amounts, bad formats, UUID shape, whitespace trimming). Run with `npm test`.

## Intentionally not done

- Login / accounts / sessions.
- Edit / delete expenses.
- Category CRUD (categories are free-text with suggestions via `<datalist>`).
- Budgets, recurring expenses, reports.
- E2E / browser-driven tests (Playwright) — covered enough by the unit tests plus manual verification.

---

## Deploying to Vercel

1. Create a Neon project → grab the pooled connection string.
2. Push this repo to GitHub.
3. Import the repo into Vercel.
4. Set `DATABASE_URL` in the Vercel project's Environment Variables.
5. Run migrations once against the Neon DB (`npm run db:migrate` locally with `DATABASE_URL` pointed at Neon).
6. Deploy.
