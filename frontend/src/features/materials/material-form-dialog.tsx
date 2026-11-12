/* eslint-disable @next/next/no-img-element */

"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, ImagePlus, Link2, Loader2, Video, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createMaterial,
  updateMaterial,
  uploadMaterialImage,
  uploadMaterialVideo,
  type Material,
} from "@/lib/api/materials";
import { countCharacters, parseTags } from "@/lib/material-utils";
import { cn } from "@/lib/utils";

type MaterialStatus = "available" | "used" | "disabled";
type MaterialPostType = "post" | "video";

const STATUS_ITEMS: Array<{ value: MaterialStatus; label: string }> = [
  { value: "available", label: "可用" },
  { value: "used", label: "已使用" },
  { value: "disabled", label: "已停用" },
];

const POST_TYPE_ITEMS: Array<{
  value: MaterialPostType;
  label: string;
  description: string;
}> = [
  {
    value: "post",
    label: "普通发帖",
    description: "标题 5–31 字，正文最多 2000 字，可选配图",
  },
  {
    value: "video",
    label: "发视频",
    description: "标题 5–60 字，仅限 1 个视频，简介可选",
  },
];

const TITLE_BY_TYPE: Record<MaterialPostType, { min: number; max: number }> = {
  post: { min: 5, max: 31 },
  video: { min: 5, max: 60 },
};

export function MaterialFormDialog({
  open,
  onOpenChange,
  material,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: Material | null;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(material?.title ?? "");
  const [content, setContent] = useState(material?.content ?? "");
  const [postType, setPostType] = useState<MaterialPostType>(
    material?.post_type ??
      ((material?.video_urls.length ?? 0) > 0 ? "video" : "post")
  );
  const [tagsInput, setTagsInput] = useState(material?.tags.join(", ") ?? "");
  const [status, setStatus] = useState<MaterialStatus>(
    (material?.status as MaterialStatus) ?? "available"
  );
  const [notes, setNotes] = useState(material?.notes ?? "");
  const [images, setImages] = useState<string[]>(material?.image_urls ?? []);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [videos, setVideos] = useState<string[]>(material?.video_urls ?? []);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingVideos, setUploadingVideos] = useState(false);
  const titleLimit = TITLE_BY_TYPE[postType];
  const titleLength = countCharacters(title.trim());
  const contentLength = countCharacters(content.trim());

  const changePostType = (nextType: MaterialPostType) => {
    if (nextType === postType) return;
    setPostType(nextType);
    if (nextType === "post") {
      setVideos([]);
      setVideoUrlInput("");
    } else {
      setImages([]);
      setImageUrlInput("");
    }
  };

  const addImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    if (images.includes(url)) {
      toast.info("这张图片已经在列表中");
      return;
    }
    if (images.length >= 10) {
      toast.error("最多添加 10 张图片");
      return;
    }
    setImages((prev) => [...prev, url]);
    setImageUrlInput("");
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 10 - images.length;
    if (remaining <= 0) {
      toast.error("最多添加 10 张图片");
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    setUploadingImages(true);
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const result = await uploadMaterialImage(file);
        uploaded.push(result.url);
      }
      setImages((prev) => [...prev, ...uploaded]);
      toast.success(`已上传 ${uploaded.length} 张图片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploadingImages(false);
    }
  };

  const addVideoUrl = () => {
    const url = videoUrlInput.trim();
    if (!url) return;
    if (videos.includes(url)) {
      toast.info("这个视频已经在列表中");
      return;
    }
    if (videos.length >= 1) {
      toast.error("视频帖只能添加 1 个视频");
      return;
    }
    setVideos((prev) => [...prev, url]);
    setVideoUrlInput("");
  };

  const handleVideoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 1 - videos.length;
    if (remaining <= 0) {
      toast.error("视频帖只能添加 1 个视频");
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    setUploadingVideos(true);
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const result = await uploadMaterialVideo(file);
        uploaded.push(result.url);
      }
      setVideos((prev) => [...prev, ...uploaded]);
      toast.success(`已上传 ${uploaded.length} 个视频`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "视频上传失败");
    } finally {
      setUploadingVideos(false);
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        post_type: postType,
        image_urls: images,
        video_urls: videos,
        tags: parseTags(tagsInput),
        status,
        notes: notes.trim() || null,
      };
      if (!payload.title) throw new Error("请填写素材标题");
      if (titleLength < titleLimit.min) {
        throw new Error(`标题至少需要 ${titleLimit.min} 字`);
      }
      if (titleLength > titleLimit.max) {
        throw new Error(`标题最多 ${titleLimit.max} 字，当前 ${titleLength} 字`);
      }
      if (postType === "post" && !payload.content) {
        throw new Error("请填写普通帖正文");
      }
      if (contentLength > 2000) {
        throw new Error(`正文不能超过 2000 字，当前 ${contentLength} 字`);
      }
      if (postType === "video" && videos.length !== 1) {
        throw new Error("视频帖必须且只能添加 1 个视频");
      }
      return material
        ? updateMaterial(material.id, payload)
        : createMaterial(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast.success(material ? "素材已更新" : "素材已添加");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(`保存失败：${error.message}`),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{material ? "编辑素材" : "添加素材"}</DialogTitle>
          <DialogDescription>
            普通发帖和发视频是两种独立素材，请先选择发布形式。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {POST_TYPE_ITEMS.map((item) => {
              const Icon = item.value === "post" ? FileText : Video;
              const selected = postType === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => changePostType(item.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "hover:bg-muted/40"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 rounded-md p-1.5",
                      selected ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="material-title">标题</Label>
            <Input
              id="material-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                postType === "post"
                  ? "5–31 字，用于贴吧主题帖标题"
                  : "5–60 字，用于视频帖标题"
              }
            />
            <p
              className={cn(
                "text-right text-xs",
                titleLength < titleLimit.min || titleLength > titleLimit.max
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {titleLength}/{titleLimit.max} 字（最少 {titleLimit.min} 字）
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="material-content">
              {postType === "post" ? "正文" : "视频简介（可选）"}
            </Label>
            <Textarea
              id="material-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={
                postType === "post"
                  ? "填写贴吧帖子正文"
                  : "选填，补充视频说明"
              }
              className="h-40 resize-y overflow-auto"
              style={{ fieldSizing: "fixed" } as CSSProperties}
            />
            <p
              className={cn(
                "text-right text-xs",
                contentLength > 2000 ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {contentLength}/2000 字
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="material-tags">标签</Label>
            <Input
              id="material-tags"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="用逗号分隔，例如：传奇, 资源, 推广"
            />
          </div>

          <div className="grid gap-2">
            <Label>状态</Label>
            <Select
              items={STATUS_ITEMS}
              value={status}
              onValueChange={(value) => setStatus(value as MaterialStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {postType === "post" ? (
            <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>配图</Label>
              <span className="text-xs text-muted-foreground">{images.length}/10</span>
            </div>

            {images.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {images.map((url) => (
                  <div
                    key={url}
                    className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
                  >
                    <img
                      src={url}
                      alt="素材配图"
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setImages((prev) => prev.filter((item) => item !== url))
                      }
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="移除图片"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImages || images.length >= 10}
              >
                {uploadingImages ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                {uploadingImages ? "上传中…" : "上传图片"}
              </Button>

              <div className="relative min-w-48 flex-1">
                <Link2 className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={imageUrlInput}
                  onChange={(event) => setImageUrlInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addImageUrl();
                    }
                  }}
                  placeholder="或粘贴图片链接"
                  className="h-8 pl-8"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addImageUrl}>
                添加链接
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              支持 JPG、PNG、WebP、GIF，单张不超过 10MB。
            </p>
            </div>
          ) : null}

          {postType === "video" ? (
            <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>视频（必填）</Label>
              <span className="text-xs text-muted-foreground">{videos.length}/1</span>
            </div>

            {videos.length > 0 ? (
              <div className="grid gap-2">
                {videos.map((url, index) => (
                  <div
                    key={url}
                    className="group relative overflow-hidden rounded-lg border bg-black"
                  >
                    <video
                      src={url}
                      controls
                      preload="metadata"
                      className="aspect-video w-full bg-black object-contain"
                    />
                    <div className="pointer-events-none absolute top-1 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      视频 {index + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setVideos((prev) => prev.filter((item) => item !== url))
                      }
                      className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="移除视频"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(event) => {
                  void handleVideoFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadingVideos || videos.length >= 1}
              >
                {uploadingVideos ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Video className="size-4" />
                )}
                {uploadingVideos ? "上传中…" : "上传视频"}
              </Button>
              <div className="relative min-w-48 flex-1">
                <Link2 className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={videoUrlInput}
                  onChange={(event) => setVideoUrlInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addVideoUrl();
                    }
                  }}
                  placeholder="或粘贴视频直链"
                  className="h-8 pl-8"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addVideoUrl}>
                添加链接
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              视频帖仅支持 1 个视频，不能与图片混排；支持 MP4、WebM、MOV，单条不超过 500MB。
            </p>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="material-notes">备注</Label>
            <Textarea
              id="material-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="选填"
              rows={2}
            />
          </div>

          <DialogFooter className="sticky bottom-0 z-10">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || uploadingImages || uploadingVideos}
            >
              {mutation.isPending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
