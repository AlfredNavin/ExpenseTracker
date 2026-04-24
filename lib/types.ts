export type Expense = {
  id: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  createdAt: string;
};

export type PagedExpenses = {
  expenses: Expense[];
  page: number;
  limit: number;
  total: number;
  totalAmount: string;
  hasMore: boolean;
};

export type CategorySummaryItem = {
  category: string;
  count: number;
  totalAmount: string;
};

export type Summary = {
  categories: CategorySummaryItem[];
  total: number;
  totalAmount: string;
};
