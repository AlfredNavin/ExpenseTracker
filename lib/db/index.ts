import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  // Trim + strip accidental surrounding quotes — classic deploy-env footguns.
  // A stray space pasted into the Vercel UI turns into "Invalid URL" at runtime.
  const raw = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, "");
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(raw);
  _db = drizzle(sql, { schema });
  return _db;
}

// Proxy so callers can write `db.select(...)` without worrying about init order.
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
