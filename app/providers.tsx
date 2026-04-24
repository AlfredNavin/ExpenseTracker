"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: (failureCount, error) => {
              // Don't retry 4xx; retry on network / 5xx up to 3 times.
              const status = (error as { status?: number } | undefined)?.status;
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 3;
            },
            retryDelay: (attempt) =>
              Math.min(1000 * 2 ** attempt, 15_000),
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: (failureCount, error) => {
              const status = (error as { status?: number } | undefined)?.status;
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 5;
            },
            retryDelay: (attempt) =>
              Math.min(1000 * 2 ** attempt, 15_000),
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
