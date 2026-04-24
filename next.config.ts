import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Aliases so the API matches the brief's URL shape verbatim
  // (POST /expenses, GET /expenses) while the implementation lives
  // under Next's conventional /api/* path.
  async rewrites() {
    return [
      { source: "/expenses", destination: "/api/expenses" },
      { source: "/categories", destination: "/api/categories" },
      { source: "/summary", destination: "/api/summary" },
    ];
  },
};

export default nextConfig;
