import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { createExpenseSchema, listQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    category: url.searchParams.get("category") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { category, sort } = parsed.data;

  const where = category ? eq(expenses.category, category) : undefined;

  const orderBy =
    sort === "date_asc"
      ? [asc(expenses.date), asc(expenses.createdAt)]
      : [desc(expenses.date), desc(expenses.createdAt)];

  const rows = await db
    .select()
    .from(expenses)
    .where(where)
    .orderBy(...orderBy);

  return NextResponse.json({ expenses: rows });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createExpenseSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, amount, category, description, date } = parsed.data;

  // Idempotent insert: client-supplied UUID as PK.
  // Retrying the same payload returns the existing row with 200.
  const inserted = await db
    .insert(expenses)
    .values({ id, amount, category, description, date })
    .onConflictDoNothing({ target: expenses.id })
    .returning();

  if (inserted.length > 0) {
    return NextResponse.json({ expense: inserted[0] }, { status: 201 });
  }

  const existing = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json(
      { error: "Conflict resolving idempotent insert" },
      { status: 500 },
    );
  }

  const row = existing[0];
  const sameFields =
    row.amount === amount &&
    row.category === category &&
    row.description === description &&
    row.date === date;

  if (!sameFields) {
    return NextResponse.json(
      {
        error:
          "An expense with this id already exists with different values. Use a new id.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ expense: row }, { status: 200 });
}
