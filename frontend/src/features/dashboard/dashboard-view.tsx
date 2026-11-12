"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  CalendarCheck,
  CircleAlert,
  Clock3,
  Library,
  Network,
  RefreshCw,
  Send,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboard, type Dashboard } from "@/lib/api/dashboard";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TASK_STATUS: Record<string, { label: string; className: string }> = {
  pending: {
    label: "待执行",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  },
  running: {
    label: "运行中",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700",
  },
  completed: {
    label: "已完成",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  },
  failed: {
    label: "失败",
    className: "border-red-500/30 bg-red-500/10 text-red-700",
  },
  stopped: {
    label: "已停止",
    className: "border-zinc-400/30 bg-zinc-500/10 text-zinc-600",
  },
};

const QUICK_ACTIONS = [
  {
    href: "/accounts",
    label: "添加账号",
    description: "导入 Cookie 并自动同步关注贴吧",
    icon: Users,
  },
  {
    href: "/posts",
    label: "新建发帖任务",
    description: "组合账号、贴吧与素材批量发布",
    icon: Send,
  },
  {
    href: "/sign/auto",
    label: "自动签到",
    description: "设置账号范围、间隔和每日计划",
    icon: Timer,
  },
  {
    href: "/proxies",
    label: "检查代理池",
    description: "管理出口节点和账号绑定",
    icon: Network,
  },
];

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Users;
  accent?: boolean;
}) {
  return (
    <Card size="sm" className={cn(accent && "border-primary/20 bg-primary/[0.03]")}>
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {value}
            </p>
          </div>
          <span className="rounded-lg bg-muted p-2 text-muted-foreground">
            <Icon className="size-4" />
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function TaskDistribution({ data }: { data: Dashboard["tasks"] }) {
  const items = [
    ["待执行", data.pending],
    ["运行中", data.running],
    ["已完成", data.completed],
    ["失败", data.failed],
    ["已停止", data.stopped],
  ] as const;
  return (
    <div className="grid grid-cols-5 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border bg-muted/20 px-2 py-2 text-center">
          <p className="text-lg font-semibold tabular-nums">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function DashboardView() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    refetchInterval: 10000,
  });

  if (isLoading || !data) {
    return <p className="p-6 text-sm text-muted-foreground">加载首页统计中…</p>;
  }

  const { overview, tasks, signs, runners } = data;
  const successfulJobs =
    tasks.jobs_success + tasks.jobs_failed > 0
      ? Math.round(
          (tasks.jobs_success / (tasks.jobs_success + tasks.jobs_failed)) * 100
        )
      : 0;

  return (
    <div className="space-y-5 p-6">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-background to-background p-6">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Dashboard
            </p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
              贴吧自动化概览
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              集中查看账号、贴吧、内容发布和签到任务的当前状态。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              更新于 {formatDateTime(data.generated_at)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => refetch()}
              aria-label="刷新首页"
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>
      </section>

      {runners.auto_sign_running || runners.post_task_running ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3">
          <Activity className="size-4 text-sky-600" />
          <span className="text-sm font-medium">后台任务运行中</span>
          {runners.auto_sign_running ? (
            <Badge variant="outline" className="border-sky-500/30 text-sky-700">
              自动签到：{runners.auto_sign_message}
            </Badge>
          ) : null}
          {runners.post_task_running ? (
            <Badge variant="outline" className="border-sky-500/30 text-sky-700">
              发帖任务：{runners.post_task_message}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="有效账号"
          value={overview.account_valid}
          detail={`共 ${overview.account_total} 个账号 · ${overview.account_with_credentials} 个已配置凭据`}
          icon={Users}
          accent
        />
        <MetricCard
          label="账号关注贴吧"
          value={overview.followed_forums}
          detail={`手动贴吧池 ${overview.manual_forums} 个`}
          icon={ShieldCheck}
        />
        <MetricCard
          label="素材总数"
          value={overview.material_total}
          detail={`${overview.material_video} 个视频帖素材`}
          icon={Library}
        />
        <MetricCard
          label="今日签到"
          value={signs.today_total}
          detail={`成功 ${signs.success} · 已签 ${signs.already} · 失败 ${signs.failed}`}
          icon={CalendarCheck}
          accent
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>发帖任务</CardTitle>
                <CardDescription>
                  共 {tasks.total} 个任务，累计 {tasks.jobs_total} 条发帖
                </CardDescription>
              </div>
              <Link href="/posts" className="text-xs font-medium hover:underline">
                查看全部 <ArrowUpRight className="inline size-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <TaskDistribution data={tasks} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">成功发帖</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">
                  {tasks.jobs_success}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">失败发帖</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-red-600">
                  {tasks.jobs_failed}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">执行成功率</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {successfulJobs}%
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {data.recent_tasks.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  暂无发帖任务
                </div>
              ) : (
                data.recent_tasks.map((task) => {
                  const status = TASK_STATUS[task.status] ?? TASK_STATUS.pending;
                  const progress =
                    task.total > 0 ? Math.min(100, (task.completed / task.total) * 100) : 0;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{task.name}</p>
                          <Badge variant="outline" className={status.className}>
                            {status.label}
                          </Badge>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <p className="tabular-nums">
                          {task.completed}/{task.total}
                        </p>
                        <p>{formatDateTime(task.created_at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>自动化状态</CardTitle>
              <CardDescription>最近 7 天签到与代理健康度</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="size-4 text-emerald-600" />
                  <span className="text-sm">近 7 天签到成功</span>
                </div>
                <span className="font-semibold tabular-nums">
                  {signs.seven_day_success}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <CircleAlert className="size-4 text-amber-600" />
                  <span className="text-sm">近 7 天签到失败</span>
                </div>
                <span className="font-semibold tabular-nums">{signs.seven_day_failed}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Network className="size-4 text-sky-600" />
                  <span className="text-sm">在线代理</span>
                </div>
                <span className="font-semibold tabular-nums">
                  {overview.proxy_online}/{overview.proxy_total}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  <span className="text-sm">已启用代理</span>
                </div>
                <span className="font-semibold tabular-nums">{overview.proxy_active}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>快捷操作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                  >
                    <span className="rounded-md bg-muted p-1.5">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{action.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {action.description}
                      </span>
                    </span>
                    <ArrowUpRight className="size-3.5 text-muted-foreground" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>最近签到</CardTitle>
                <CardDescription>最新账号与贴吧签到结果</CardDescription>
              </div>
              <Clock3 className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {data.recent_signs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无签到记录</p>
            ) : (
              <div className="space-y-2">
                {data.recent_signs.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  >
                    <Badge
                      variant="outline"
                      className={
                        item.status === "failed"
                          ? TASK_STATUS.failed.className
                          : TASK_STATUS.completed.className
                      }
                    >
                      {item.status === "failed" ? "失败" : item.status === "already" ? "已签" : "成功"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{item.fname}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.account_name} · {item.message || "—"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDateTime(item.signed_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>最近发帖异常</CardTitle>
                <CardDescription>便于优先处理失败任务</CardDescription>
              </div>
              <CircleAlert className="size-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            {data.recent_post_failures.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-emerald-600" />
                暂无发帖异常
              </div>
            ) : (
              <div className="space-y-2">
                {data.recent_post_failures.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-red-500/15 bg-red-500/[0.03] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {item.title || "无标题素材"}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {item.account_name} · {item.fname} · {item.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
