"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listAccounts } from "@/lib/api/accounts";

export function useAccountContext() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });

  const defaultAccount =
    accounts.find((item) => item.status === "valid" && item.has_credentials) ??
    accounts[0];
  const accountId =
    selectedAccountId ?? (defaultAccount ? String(defaultAccount.id) : "");
  const account = accounts.find((item) => String(item.id) === accountId) ?? null;
  const accountIdNumber = accountId ? Number(accountId) : null;

  return {
    accounts,
    accountId,
    account,
    accountIdNumber,
    accountsLoading,
    setSelectedAccountId,
  };
}
