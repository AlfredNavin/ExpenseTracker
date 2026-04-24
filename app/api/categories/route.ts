import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .selectDistinct({ category: expenses.category })
    .from(expenses)
    .orderBy(sql`${expenses.category} asc`);

  return NextResponse.json({ categories: rows.map((r) => r.category) });
}
