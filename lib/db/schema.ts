import {
  pgTable,
  uuid,
  numeric,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    date: date("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("expenses_date_desc_idx").on(t.date.desc()),
    index("expenses_category_idx").on(t.category),
  ],
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
