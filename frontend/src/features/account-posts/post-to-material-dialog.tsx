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
import { Textarea } from "@/components/ui/textarea";
import type { AccountPost } from "@/lib/api/account-posts";
import { createMaterial } from "@/lib/api/materials";
import { parseTags } from "@/lib/material-utils";

export function PostToMaterialDialog({
  post,
  onOpenChange,
}: {
  post: AccountPost | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(post?.title || `${post?.fname ?? ""}帖子`);
  const [content, setContent] = useState(post?.content ?? "");
  const [tags, setTags] = useState(post ? `帖子管理, ${post.fname}` : "帖子管理");

  const mutation = useMutation({
    mutationFn: () =>
      createMaterial({
        title: title.trim(),
        content: content.trim(),
        post_type: post?.video_url ? "video" : "post",
        image_urls: post?.video_url ? [] : (post?.image_urls ?? []),
        video_urls: post?.video_url ? [post.video_url] : [],
        tags: parseTags(tags),
        status: "available",
        notes: post ? `由帖子 ${post.tid} 复制整理` : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast.success("已存入素材库，可在发帖任务中重新使用");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(`保存失败：${error.message}`),
  });

  return (
    <Dialog open={post !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑并存入素材库</DialogTitle>
          <DialogDescription>
            贴吧接口不提供主题帖正文的原生修改。这里可以改写标题和正文，保存为素材后再通过发帖任务发布。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="post-material-title">素材标题</Label>
            <Input
              id="post-material-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="post-material-content">素材正文</Label>
            <Textarea
              id="post-material-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-40"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="post-material-tags">标签</Label>
            <Input
              id="post-material-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="逗号分隔"
            />
          </div>
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            原帖中的 {post?.image_urls.length ?? 0} 张图片
            {post?.video_url ? "和 1 个视频" : ""}会一并带入素材，不会修改或删除原帖。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !title.trim() || !content.trim()}
          >
            {mutation.isPending ? "保存中…" : "存入素材库"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
