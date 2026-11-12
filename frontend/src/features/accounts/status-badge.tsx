import { Badge } from "@/components/ui/badge";
import type { AccountStatus } from "@/lib/api/accounts";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/account-status";

export function StatusBadge({ status }: { status: AccountStatus }) {
  const label = STATUS_LABELS[status] ?? STATUS_LABELS.pending;
  const className = STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.pending;
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}
