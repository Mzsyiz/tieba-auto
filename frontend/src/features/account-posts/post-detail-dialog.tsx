/* eslint-disable @next/next/no-img-element */

import { ExternalLink, FilePenLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AccountPost } from "@/lib/api/account-posts";
import { formatDateTime } from "@/lib/format";

export function PostDetailDialog({
  post,
  onOpenChange,
  onEditToMaterial,
}: {
  post: AccountPost | null;
  onOpenChange: (open: boolean) => void;
  onEditToMaterial: (post: AccountPost) => void;
}) {
  return (
    <Dialog open={post !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="line-clamp-2 text-lg">
                {post?.title || "无标题帖子"}
              </DialogTitle>
              <DialogDescription>
                {post
                  ? `${post.fname} · ${formatDateTime(post.created_at)} · tid ${post.tid}`
                  : ""}
              </DialogDescription>
            </div>
            {post ? (
              <div className="flex gap-1">
                <Badge variant="secondary">{post.reply_num} 回复</Badge>
                <Badge variant="secondary">{post.view_num} 浏览</Badge>
              </div>
            ) : null}
          </div>
        </DialogHeader>

        {post ? (
          <div className="space-y-4">
            <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 leading-7">
              {post.content || "该帖子正文为空"}
            </div>

            {post.image_urls.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {post.image_urls.map((url, index) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-lg border bg-muted"
                  >
                    <img
                      src={url}
                      alt={`帖子配图 ${index + 1}`}
                      className="aspect-square h-full w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            ) : null}

            {post.video_url ? (
              <video
                src={post.video_url}
                controls
                preload="metadata"
                className="aspect-video w-full rounded-lg border bg-black object-contain"
              />
            ) : null}

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">贴吧</p>
                <p className="mt-1 truncate font-medium">{post.fname}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">回复</p>
                <p className="mt-1 font-medium tabular-nums">{post.reply_num}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">浏览</p>
                <p className="mt-1 font-medium tabular-nums">{post.view_num}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">点赞</p>
                <p className="mt-1 font-medium tabular-nums">{post.agree_num}</p>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          {post ? (
            <>
              <Button
                variant="outline"
                onClick={() => window.open(post.url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="size-4" />
                打开原帖
              </Button>
              <Button onClick={() => onEditToMaterial(post)}>
                <FilePenLine className="size-4" />
                编辑并存入素材库
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
