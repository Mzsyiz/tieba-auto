import type { AccountStatus } from "@/lib/api/accounts";

export const STATUS_ORDER: AccountStatus[] = ["valid", "pending", "invalid", "disabled"];

export const STATUS_LABELS: Record<AccountStatus, string> = {
  valid: "正常",
  pending: "待验证",
  invalid: "失效",
  disabled: "已停用",
};

export const STATUS_BADGE_CLASSES: Record<AccountStatus, string> = {
  valid:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  invalid: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  disabled:
    "border-zinc-400/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};
