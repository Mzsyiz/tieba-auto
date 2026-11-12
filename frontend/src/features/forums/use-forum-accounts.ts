"use client";

import { useAccountContext } from "@/hooks/use-account-context";

export function useForumAccounts() {
  return useAccountContext();
}
