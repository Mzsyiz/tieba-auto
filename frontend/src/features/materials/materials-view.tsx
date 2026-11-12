/* eslint-disable @next/next/no-img-element */

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleSlash,
  FileText,
  Images,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteMaterial,
  listMaterials,
  updateMaterial,
  useMaterial as markMaterialUsed,
  type Material,
  type MaterialList,
} from "@/lib/api/materials";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { MaterialFormDialog } from "./material-form-dialog";

const EMPTY_MATERIALS: MaterialList = {
  items: [],
  total: 0,
  stats: { total: 0, available: 0, used: 0, disabled: 0 },
};

type StatusFilter = "all" | "available" | "used" | "disabled";
type TypeFilter = "all" | "post" | "video";

const STATUS_FILTER_ITEMS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "available", label: "可用" },
  { value: "used", label: "已使用" },
  { value: "disabled", label: "已停用" },
];

const TYPE_FILTER_ITEMS: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "post", label: "普通发帖" },
  { value: "video", label: "发视频" },
];

const STATUS_META: Record<
  "available" | "used" | "disabled",
  { label: string; className: string }
> = {
  available: {
    label: "可用",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  used: {
    label: "已使用",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  disabled: {
    label: "已停用",
    className: "border-zinc-400/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  },
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function MaterialCard({
  material,
  onEdit,
  onDelete,
  onUse,
  onToggle,
  busy,
}: {
  material: Material;
  onEdit: () => void;
  onDelete: () => void;
  onUse: () => void;
  onToggle: () => void;
  busy: boolean;
}) {
  const status = STATUS_META[material.status];
  const isVideo = material.post_type === "video";
  const visibleImages = material.image_urls.slice(0, 3);
  const extraImages = material.image_urls.length - visibleImages.length;

  return (
    <Card className="flex min-h-72 flex-col" data-material-card={material.id}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-base">{material.title}</CardTitle>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
            <Badge variant="secondary" className="gap-1 text-[10px]">
              {isVideo ? <Video className="size-3" /> : <FileText className="size-3" />}
              {isVideo ? "视频帖" : "普通帖"}
            </Badge>
          </div>
        </div>
        {material.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {material.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
        <CardDescription className="line-clamp-4 whitespace-pre-wrap pt-1">
          {material.content || (isVideo ? "未填写视频简介" : "未填写正文")}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {isVideo && material.video_urls.length > 0 ? (
          <div className="overflow-hidden rounded-lg border bg-black">
            <video
              src={material.video_urls[0]}
              controls
              preload="metadata"
              className="aspect-video w-full object-contain"
            />
            <div className="flex items-center gap-1 bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
              <Video className="size-3.5" />
              视频帖
            </div>
          </div>
        ) : null}

        {!isVideo && visibleImages.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {visibleImages.map((url, index) => (
              <div
                key={url}
                className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img
                  src={url}
                  alt={`${material.title} 配图 ${index + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {index === visibleImages.length - 1 && extraImages > 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white">
                    +{extraImages}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : isVideo ? null : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <Images className="size-4" />
            无配图（纯文字帖）
          </div>
        )}

        {material.notes ? (
          <p className="rounded-lg bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
            备注：{material.notes}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>使用 {material.usage_count} 次</span>
          <span>{formatDateTime(material.created_at)}</span>
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onUse}
            disabled={busy}
            aria-label="标记已用"
            title="标记已用"
          >
            <CheckCircle2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            disabled={busy}
            aria-label="编辑"
            title="编辑"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            disabled={busy}
            aria-label={material.status === "disabled" ? "启用" : "停用"}
            title={material.status === "disabled" ? "启用" : "停用"}
          >
            <CircleSlash className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            disabled={busy}
            aria-label="删除"
            title="删除"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export function MaterialsView() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);

  const { data = EMPTY_MATERIALS, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["materials", statusFilter, search],
    queryFn: () =>
      listMaterials({
        q: search || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
  });

  const markUsedMutation = useMutation({
    mutationFn: (id: number) => markMaterialUsed(id),
    onSuccess: (material) => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast.success(`「${material.title}」已标记使用`);
    },
    onError: (error: Error) => toast.error(`操作失败：${error.message}`),
  });

  const toggleMutation = useMutation({
    mutationFn: (material: Material) =>
      updateMaterial(material.id, {
        status: material.status === "disabled" ? "available" : "disabled",
      }),
    onSuccess: (material) => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast.success(material.status === "disabled" ? "素材已停用" : "素材已启用");
    },
    onError: (error: Error) => toast.error(`操作失败：${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMaterial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast.success("素材已删除");
      setDeleting(null);
    },
    onError: (error: Error) => toast.error(`删除失败：${error.message}`),
  });

  const allTags = Array.from(new Set(data.items.flatMap((item) => item.tags))).sort();
  const tagItems = [
    { value: "all", label: "全部标签" },
    ...allTags.map((tag) => ({ value: tag, label: tag })),
  ];
  const filtered = data.items.filter(
    (item) =>
      (tagFilter === "all" || item.tags.includes(tagFilter)) &&
      (typeFilter === "all" || item.post_type === typeFilter)
  );
  const busy =
    markUsedMutation.isPending || toggleMutation.isPending || deleteMutation.isPending;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (material: Material) => {
    setEditing(material);
    setFormOpen(true);
  };

  const applySearch = () => setSearch(searchInput.trim());

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">素材库</h1>
          <p className="text-sm text-muted-foreground">
            普通发帖与视频帖分开管理，避免图片和视频混排
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          添加素材
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="素材总数" value={data.stats.total} />
        <StatCard label="可用" value={data.stats.available} />
        <StatCard label="已使用" value={data.stats.used} />
        <StatCard label="已停用" value={data.stats.disabled} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>素材列表</CardTitle>
              <CardDescription>当前筛选 {filtered.length} 条</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={STATUS_FILTER_ITEMS}
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                items={TYPE_FILTER_ITEMS}
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as TypeFilter)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_FILTER_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                items={tagItems}
                value={tagFilter}
                onValueChange={(value) => setTagFilter(String(value))}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tagItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applySearch();
                  }}
                  className="h-8 w-48 pl-8"
                  placeholder="搜索标题 / 正文 / 备注"
                />
              </div>
              <Button variant="outline" size="sm" onClick={applySearch}>
                搜索
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => refetch()}
                aria-label="刷新"
              >
                <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Images className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">素材库为空</p>
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" />
                添加第一条素材
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              没有匹配的素材
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((material) => (
                <MaterialCard
                  key={material.id}
                  material={material}
                  onEdit={() => openEdit(material)}
                  onDelete={() => setDeleting(material)}
                  onUse={() => markUsedMutation.mutate(material.id)}
                  onToggle={() => toggleMutation.mutate(material)}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {formOpen ? (
        <MaterialFormDialog
          key={editing?.id ?? "new"}
          open
          onOpenChange={setFormOpen}
          material={editing}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="删除素材"
        description={
          deleting ? `确定要删除「${deleting.title}」吗？此操作不可恢复。` : ""
        }
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
