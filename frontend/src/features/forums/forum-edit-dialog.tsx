"use client";

import { useState } from "react";
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
import { updateForum, type Forum } from "@/lib/api/forums";

export function ForumEditDialog({
  open,
  onOpenChange,
  forum,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forum: Forum;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(forum.notes ?? "");
  const [level, setLevel] = useState(String(forum.level));
  const [postTarget, setPostTarget] = useState(forum.is_post_target);
  const [banned, setBanned] = useState(forum.is_banned);
  const [banReason, setBanReason] = useState(forum.ban_reason ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      updateForum(forum.id, {
        notes: notes.trim() || null,
        level: Number(level) || 0,
        is_post_target: postTarget,
        is_banned: banned,
        ban_reason: banned ? banReason.trim() || "手动标记封禁" : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      toast.success("贴吧已更新");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑「{forum.fname}」</DialogTitle>
          <DialogDescription>调整等级、发帖目标、封禁状态与备注。</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="forum-level">等级</Label>
            <Input
              id="forum-level"
              type="number"
              min={0}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>发帖目标</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">是否允许用于自动发帖</p>
            </div>
            <Switch checked={postTarget} onCheckedChange={setPostTarget} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>已封禁</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">标记后不参与发帖任务</p>
            </div>
            <Switch checked={banned} onCheckedChange={setBanned} />
          </div>

          {banned ? (
            <div className="grid gap-2">
              <Label htmlFor="forum-ban-reason">封禁原因</Label>
              <Input
                id="forum-ban-reason"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="例如：吧务权限不足"
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="forum-edit-notes">备注</Label>
            <Input
              id="forum-edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="选填"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
