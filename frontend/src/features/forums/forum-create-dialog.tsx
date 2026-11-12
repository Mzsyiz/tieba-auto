"use client";

import { useState, type CSSProperties } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Account } from "@/lib/api/accounts";
import { createForums } from "@/lib/api/forums";

import { AccountSelect } from "./account-select";

export function ForumCreateDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
}) {
  const queryClient = useQueryClient();
  const [names, setNames] = useState("");
  const [accountId, setAccountId] = useState("none");
  const [isPostTarget, setIsPostTarget] = useState(false);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createForums({
        names,
        account_id: accountId === "none" ? null : Number(accountId),
        is_post_target: isPostTarget,
        notes: notes.trim() || null,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      const parts: string[] = [];
      if (result.added > 0) parts.push(`新增 ${result.added} 个`);
      if (result.promoted > 0) parts.push(`从账号数据转入 ${result.promoted} 个`);
      if (result.existing > 0) parts.push(`已在池中 ${result.existing} 个`);
      toast.success(`贴吧池已更新：${parts.join("，") || "没有变化"}`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>添加贴吧</DialogTitle>
          <DialogDescription>支持一次粘贴多个吧名，用换行、逗号或空格分隔。</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!names.trim()) {
              toast.error("请至少输入一个贴吧名");
              return;
            }
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="forum-names">贴吧名</Label>
            <Textarea
              id="forum-names"
              autoFocus
              value={names}
              onChange={(e) => setNames(e.target.value)}
              rows={4}
              placeholder={"例如：传奇\n复古传奇\n迷失传奇"}
              className="h-28 resize-none overflow-auto font-mono text-xs"
              style={{ fieldSizing: "fixed" } as CSSProperties}
            />
            <p className="text-xs text-muted-foreground">
              已输入 {names.split(/[\s,，;；]+/).filter(Boolean).length} 个吧名
            </p>
            <p className="text-xs text-muted-foreground">
              请填写百度贴吧的真实吧名，通常不需要带“吧”后缀。
            </p>
          </div>

          <div className="grid gap-2">
            <Label>来源账号（可选）</Label>
            <AccountSelect value={accountId} onValueChange={setAccountId} accounts={accounts} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>设为发帖目标</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                添加后直接进入发帖目标池
              </p>
            </div>
            <Switch checked={isPostTarget} onCheckedChange={setIsPostTarget} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="forum-notes">备注</Label>
            <Input
              id="forum-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="选填"
            />
          </div>

          <DialogFooter className="sticky bottom-0 z-10">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "添加中…" : "添加"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
