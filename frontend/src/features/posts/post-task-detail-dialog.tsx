"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPostTask } from "@/lib/api/post-tasks";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

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

export function PostTaskDetailDialog({
  taskId,
  onOpenChange,
}: {
  taskId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["post-task", taskId],
    queryFn: () => getPostTask(taskId as number),
    enabled: taskId !== null,
    refetchInterval: (query) =>
      query.state.data?.task.status === "running" ? 2000 : false,
  });

  const task = data?.task;
  const logs = data?.logs ?? [];
  const meta = task ? STATUS_META[task.status] ?? STATUS_META.pending : null;

  return (
    <Dialog open={taskId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>{task?.name ?? "任务详情"}</DialogTitle>
              <DialogDescription>
                {task ? `任务 #${task.id}` : "加载中…"}
              </DialogDescription>
            </div>
            {meta ? (
              <Badge variant="outline" className={cn(meta.className)}>
                {meta.label}
              </Badge>
            ) : null}
          </div>
        </DialogHeader>

        {isLoading || !task ? (
          <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">进度</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {task.completed}/{task.total}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">成功</p>
                <p className="mt-1 font-semibold tabular-nums">{task.success}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">失败</p>
                <p className="mt-1 font-semibold tabular-nums">{task.failed}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">账号 × 贴吧 × 素材</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {task.account_ids.length} × {task.forum_ids.length} ×{" "}
                  {task.material_ids.length}
                </p>
              </div>
            </div>

            <div className="grid gap-2 rounded-lg border p-3 text-sm text-muted-foreground sm:grid-cols-2">
              <p>
                间隔：{task.interval_min}-{task.interval_max} 秒
              </p>
              <p>计划时间：{formatDateTime(task.scheduled_at)}</p>
              <p>开始时间：{formatDateTime(task.started_at)}</p>
              <p>结束时间：{formatDateTime(task.finished_at)}</p>
              {task.last_error ? (
                <p className="text-destructive sm:col-span-2">
                  最近错误：{task.last_error}
                </p>
              ) : null}
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${
                    task.total > 0
                      ? Math.min(100, (task.completed / task.total) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>

            {logs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无发帖日志
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>账号</TableHead>
                    <TableHead>贴吧</TableHead>
                    <TableHead>素材</TableHead>
                    <TableHead>结果</TableHead>
                    <TableHead>帖子 ID</TableHead>
                    <TableHead>说明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </TableCell>
                      <TableCell>{log.account_name || "—"}</TableCell>
                      <TableCell>{log.fname || "—"}</TableCell>
                      <TableCell className="max-w-48 truncate">
                        {log.title || "—"}
                      </TableCell>
                      <TableCell>
                        {log.status === "success" ? (
                          <Badge variant="secondary">成功</Badge>
                        ) : (
                          <Badge variant="destructive">失败</Badge>
                        )}
                      </TableCell>
                      <TableCell>{log.tid ?? "—"}</TableCell>
                      <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                        {log.message || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
