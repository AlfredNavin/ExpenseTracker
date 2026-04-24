import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { fromPaise, toPaise } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aggregate-only endpoint. Cheap even at millions of rows thanks to the
// category index. This is what the UI's "Summary by category" section
// reads from, so the main list can be paginated without affecting the
// summary's accuracy.
export async function GET() {
  const rows = await db
    .select({
      category: expenses.category,
      count: sql<number>`count(*)::int`,
      totalAmount: sql<string>`sum(${expenses.amount})::text`,
    })
    .from(expenses)
    .groupBy(expenses.category);

  // Sort by total desc, comparing in BigInt paise to avoid float drift.
  const sorted = [...rows].sort((a, b) => {
    const ap = toPaise(a.totalAmount);
    const bp = toPaise(b.totalAmount);
    if (ap !== bp) return ap < bp ? 1 : -1;
    return a.category.localeCompare(b.category);
  });

  const grandCount = sorted.reduce((acc, r) => acc + r.count, 0);
  const grandPaise = sorted.reduce(
    (acc, r) => acc + toPaise(r.totalAmount),
    0n,
  );

  return NextResponse.json({
    categories: sorted,
    total: grandCount,
    totalAmount: fromPaise(grandPaise),
  });
}
