"use client";

import { useRole } from "./use-role";

// Wraps a placeholder that supporters should not see. It reads the reader's own role in the
// browser and never queries ad tables. Everyone else, and anyone signed out, sees the children.
export function SupporterHidden({ children }: { children: React.ReactNode }) {
  return useRole() === "supporter" ? null : children;
}
