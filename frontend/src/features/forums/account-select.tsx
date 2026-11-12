"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account } from "@/lib/api/accounts";

export function AccountSelect({
  value,
  onValueChange,
  accounts,
  allowNone = true,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  accounts: Account[];
  allowNone?: boolean;
  className?: string;
}) {
  const items = [
    ...(allowNone ? [{ value: "none", label: "不指定" }] : []),
    ...accounts.map((account) => ({
      value: String(account.id),
      label: account.nickname || account.username,
    })),
  ];

  return (
    <Select items={items} value={value} onValueChange={(v) => onValueChange(String(v))}>
      <SelectTrigger className={className ?? "w-full"}>
        <SelectValue placeholder={allowNone ? "不指定" : "选择账号"} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value="none">不指定</SelectItem> : null}
        {accounts.map((account) => (
          <SelectItem key={account.id} value={String(account.id)}>
            {account.nickname || account.username}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
