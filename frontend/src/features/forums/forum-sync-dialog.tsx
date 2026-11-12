"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudDownload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Account } from "@/lib/api/accounts";
import { syncForums, type ForumSyncResult } from "@/lib/api/forums";

import { AccountSelect } from "./account-select";

export function ForumSyncDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
}) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState(() => {
    const preferred = accounts.find((a) => a.has_credentials) ?? accounts[0];
    return preferred ? String(preferred.id) : "";
  });
  const [result, setResult] = useState<ForumSyncResult | null>(null);

  const selected = accounts.find((a) => String(a.id) === accountId);

  const mutation = useMutation({
    mutationFn: () => syncForums({ account_id: Number(accountId) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      queryClient.invalidateQueries({ queryKey: ["account-forums"] });
      setResult(data);
      toast.success(`同步完成：新增 ${data.added} 个，更新 ${data.updated} 个`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>同步关注吧</DialogTitle>
          <DialogDescription>
            读取所选账号在百度贴吧关注的吧，自动补充到吧库并刷新等级。
          </DialogDescription>
        </DialogHeader>

        {accounts.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            还没有可用账号，请先在「账号管理」中添加百度贴吧账号。
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>同步账号</Label>
              <AccountSelect
                value={accountId}
                onValueChange={setAccountId}
                accounts={accounts}
                allowNone={false}
              />
              {selected && !selected.has_credentials ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  该账号尚未配置 BDUSS，无法同步。
                </p>
              ) : null}
            </div>

            {result ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">同步结果</p>
                <p className="mt-1 text-muted-foreground">
                  账号「{result.account_name}」：获取 {result.fetched} 个关注吧，新增{" "}
                  {result.added} 个，更新 {result.updated} 个。
                </p>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!accountId || mutation.isPending || accounts.length === 0}
          >
            <CloudDownload className="size-4" />
            {mutation.isPending ? "同步中…" : "开始同步"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
