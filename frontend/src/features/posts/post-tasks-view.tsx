"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Eye,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  clonePostTask,
  deletePostTask,
  listPostTasks,
  startPostTask,
  stopPostTask,
  type PostTask,
  type PostTaskList,
} from "@/lib/api/post-tasks";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CreatePostTaskDialog } from "./create-post-task-dialog";
import { PostTaskDetailDialog } from "./post-task-detail-dialog";

const EMPTY_TASKS: PostTaskList = {
  items: [],
  stats: { pending: 0, running: 0, completed: 0, failed: 0, stopped: 0 },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: {
    label: "待执行",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  running: {
    label: "运行中",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  completed: {
    label: "已完成",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  failed: {
    label: "失败",
    className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  stopped: {
    label: "已停止",
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

function TaskStatusBadge({ task }: { task: PostTask }) {
  const meta = STATUS_META[task.status] ?? STATUS_META.pending;
  return (
    <Badge variant="outline" className={cn(meta.className)}>
      {meta.label}
    </Badge>
  );
}

export function PostTasksView() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PostTask | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<PostTask | null>(null);

  const { data = EMPTY_TASKS, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["post-tasks"],
    queryFn: listPostTasks,
    refetchInterval: (query) => {
      const current = query.state.data;
      if (!current) return false;
      const active = current.items.some(
        (task) =>
          task.status === "running" ||
          (task.status === "pending" && task.scheduled_at !== null)
      );
      return active ? 2000 : false;
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: number) => startPostTask(id),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["post-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["post-task", task.id] });
      toast.success(`任务「${task.name}」已开始`);
    },
    onError: (error: Error) => toast.error(`启动失败：${error.message}`),
  });

  const stopMutation = useMutation({
    mutationFn: (id: number) => stopPostTask(id),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["post-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["post-task", task.id] });
      toast.success("已发送停止指令");
    },
    onError: (error: Error) => toast.error(`停止失败：${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePostTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-tasks"] });
      toast.success("任务已删除");
      setDeleting(null);
    },
    onError: (error: Error) => toast.error(`删除失败：${error.message}`),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: number) => clonePostTask(id),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["post-tasks"] });
      setEditing(task);
      setCreateOpen(true);
      toast.success("任务已复制，可继续修改");
    },
    onError: (error: Error) => toast.error(`复制失败：${error.message}`),
  });

  const busy =
    startMutation.isPending ||
    stopMutation.isPending ||
    deleteMutation.isPending ||
    cloneMutation.isPending;

  const openCreate = () => {
    setEditing(null);
    setCreateOpen(true);
  };

  const openEdit = (task: PostTask) => {
    setEditing(task);
    setCreateOpen(true);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">发帖任务</h1>
          <p className="text-sm text-muted-foreground">
            组合账号、贴吧和素材，批量或定时发布主题帖
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          新建任务
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="待执行" value={data.stats.pending} />
        <StatCard label="运行中" value={data.stats.running} />
        <StatCard label="已完成" value={data.stats.completed} />
        <StatCard label="失败" value={data.stats.failed} />
        <StatCard label="已停止" value={data.stats.stopped} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>任务列表</CardTitle>
              <CardDescription>共 {data.items.length} 个任务</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => refetch()}
              aria-label="刷新"
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Play className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">还没有发帖任务</p>
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" />
                新建第一个任务
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>任务</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>账号/贴吧/素材</TableHead>
                  <TableHead>进度</TableHead>
                  <TableHead>成功/失败</TableHead>
                  <TableHead>间隔</TableHead>
                  <TableHead>计划时间</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((task) => {
                  const waitingForSchedule =
                    task.status === "pending" && task.scheduled_at !== null;

                  return (
                    <TableRow key={task.id}>
                    <TableCell>
                      <p className="font-medium">{task.name}</p>
                      <p className="text-xs text-muted-foreground">#{task.id}</p>
                    </TableCell>
                    <TableCell>
                      <TaskStatusBadge task={task} />
                    </TableCell>
                    <TableCell>
                      {task.account_ids.length}/{task.forum_ids.length}/
                      {task.material_ids.length}
                    </TableCell>
                    <TableCell className="min-w-32">
                      <p className="text-xs tabular-nums">
                        {task.completed}/{task.total}
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${
                              task.total > 0
                                ? Math.min(100, (task.completed / task.total) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {task.success}
                      </span>
                      {" / "}
                      <span className="text-destructive">{task.failed}</span>
                    </TableCell>
                    <TableCell>
                      {task.interval_min}-{task.interval_max}s
                    </TableCell>
                    <TableCell>{formatDateTime(task.scheduled_at)}</TableCell>
                    <TableCell>{formatDateTime(task.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {task.status === "pending" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startMutation.mutate(task.id)}
                            disabled={busy || waitingForSchedule}
                            aria-label="开始"
                            title={
                              waitingForSchedule
                                ? `将在计划时间 ${formatDateTime(task.scheduled_at)} 自动开始`
                                : "开始"
                            }
                          >
                            <Play className="size-4" />
                          </Button>
                        ) : null}
                        {task.status === "running" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => stopMutation.mutate(task.id)}
                            disabled={busy}
                            aria-label="停止"
                            title="停止"
                          >
                            <Square className="size-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDetailTaskId(task.id)}
                          aria-label="查看"
                          title="查看"
                        >
                          <Eye className="size-4" />
                        </Button>
                        {task.status === "pending" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(task)}
                            disabled={busy}
                            aria-label="编辑"
                            title="编辑"
                          >
                            <Pencil className="size-4" />
                          </Button>
                        ) : null}
                        {task.status !== "running" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => cloneMutation.mutate(task.id)}
                            disabled={busy}
                            aria-label="复制"
                            title="复制为新任务"
                          >
                            <Copy className="size-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleting(task)}
                          disabled={busy || task.status === "running"}
                          aria-label="删除"
                          title="删除"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {createOpen ? (
        <CreatePostTaskDialog
          key={editing?.id ?? "new"}
          open
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setEditing(null);
          }}
          task={editing}
        />
      ) : null}

      <PostTaskDetailDialog
        taskId={detailTaskId}
        onOpenChange={(open) => {
          if (!open) setDetailTaskId(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="删除发帖任务"
        description={
          deleting ? `确定要删除任务「${deleting.name}」及其日志吗？` : ""
        }
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
