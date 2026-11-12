"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/account-status";
import type { Account } from "@/lib/api/accounts";
import { cn } from "@/lib/utils";

import { AccountSelect } from "./account-select";

const STATUS_CLASSES: Record<string, string> = {
  valid:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  invalid: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  disabled: "border-zinc-400/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

export function ForumHeader({
  title,
  description,
  accountId,
  account,
  accounts,
  onAccountChange,
  children,
}: {
  title: string;
  description: string;
  accountId: string;
  account: Account | null;
  accounts: Account[];
  onAccountChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
          <span className="text-xs text-muted-foreground">当前账号</span>
          <AccountSelect
            value={accountId}
            onValueChange={onAccountChange}
            accounts={accounts}
            allowNone={false}
            className="h-8 w-40 border-0 bg-transparent shadow-none dark:bg-transparent"
          />
        </div>

        {account ? (
          <Badge variant="outline" className={cn(STATUS_CLASSES[account.status])}>
            {STATUS_LABELS[account.status]}
          </Badge>
        ) : null}

        {children}
      </div>
    </div>
  );
}
