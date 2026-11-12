"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RefreshCw, Square } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { STATUS_LABELS } from "@/lib/account-status";
import {
  getAutoSignSettings,
  getAutoSignStatus,
  startAutoSign,
  stopAutoSign,
  updateAutoSignSettings,
  type AutoSignSettings,
  type AutoSignSettingsUpdate,
} from "@/lib/api/auto-sign";
import { listAccounts, type Account } from "@/lib/api/accounts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<string, string> = {
  valid:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  invalid: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  disabled: "border-zinc-400/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

export function AutoSignView() {
  const settingsQuery = useQuery({
    queryKey: ["auto-sign-settings"],
    queryFn: getAutoSignSettings,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });

  if (!settingsQuery.data) {
    return <p className="p-6 text-sm text-muted-foreground">加载自动签到设置…</p>;
  }

  return (
    <AutoSignPanel
      settings={settingsQuery.data}
      accounts={accounts}
    />
  );
}

function AutoSignPanel({
  settings,
  accounts,
}: {
  settings: AutoSignSettings;
  accounts: Account[];
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(settings.account_ids)
  );
  const [intervalMin, setIntervalMin] = useState(String(settings.interval_min));
  const [intervalMax, setIntervalMax] = useState(String(settings.interval_max));
  const [accountMin, setAccountMin] = useState(
    String(settings.account_interval_min)
  );
  const [accountMax, setAccountMax] = useState(
    String(settings.account_interval_max)
  );
  const [scheduleEnabled, setScheduleEnabled] = useState(settings.enabled);
  const [scheduleTime, setScheduleTime] = useState(settings.schedule_time);

  const statusQuery = useQuery({
    queryKey: ["auto-sign-status"],
    queryFn: getAutoSignStatus,
    refetchInterval: (query) =>
      query.state.data?.running ? 2000 : false,
  });
  const status = statusQuery.data;
  const running = status?.running ?? false;
  const previousRunning = useRef(false);

  useEffect(() => {
    if (previousRunning.current && !running) {
      queryClient.invalidateQueries({ queryKey: ["sign-overview"] });
      queryClient.invalidateQueries({ queryKey: ["sign-logs"] });
    }
    previousRunning.current = running;
  }, [running, queryClient]);

  const buildSettings = (): AutoSignSettingsUpdate => {
    const values = {
      interval_min: Number(intervalMin),
      interval_max: Number(intervalMax),
      account_interval_min: Number(accountMin),
      account_interval_max: Number(accountMax),
    };
    if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("间隔必须是非负数字");
    }
    if (values.interval_min > values.interval_max) {
      throw new Error("贴吧间隔最小值不能大于最大值");
    }
    if (values.account_interval_min > values.account_interval_max) {
      throw new Error("账号间隔最小值不能大于最大值");
    }
    return {
      enabled: scheduleEnabled,
      schedule_time: scheduleTime || "08:00",
      ...values,
      account_ids: Array.from(selected),
    };
  };

  const saveMutation = useMutation({
    mutationFn: async () => updateAutoSignSettings(buildSettings()),
    onSuccess: (updated) => {
      queryClient.setQueryData(["auto-sign-settings"], updated);
      toast.success("自动签到设置已保存");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (
        !accounts.some(
          (account) => account.has_credentials && account.status === "valid"
        )
      ) {
        throw new Error("没有可用的有效账号");
      }
      await updateAutoSignSettings(buildSettings());
      return startAutoSign(selected.size > 0 ? Array.from(selected) : null);
    },
    onSuccess: (state) => {
      queryClient.setQueryData(["auto-sign-status"], state);
      queryClient.invalidateQueries({ queryKey: ["auto-sign-settings"] });
      queryClient.invalidateQueries({ queryKey: ["sign-overview"] });
      queryClient.invalidateQueries({ queryKey: ["sign-logs"] });
      toast.success("自动签到已开始");
    },
    onError: (error: Error) => toast.error(`启动失败：${error.message}`),
  });

  const stopMutation = useMutation({
    mutationFn: stopAutoSign,
    onSuccess: (state) => {
      queryClient.setQueryData(["auto-sign-status"], state);
      queryClient.invalidateQueries({ queryKey: ["sign-overview"] });
      queryClient.invalidateQueries({ queryKey: ["sign-logs"] });
      toast.success("已发送停止指令");
    },
    onError: (error: Error) => toast.error(`停止失败：${error.message}`),
  });

  const orderedAccounts = [...accounts].sort((a, b) => {
    if (a.has_credentials !== b.has_credentials) {
      return a.has_credentials ? -1 : 1;
    }
    return a.id - b.id;
  });
  const credentialAccounts = orderedAccounts.filter(
    (account) => account.has_credentials && account.status === "valid"
  );
  const allSelected =
    credentialAccounts.length > 0 &&
    credentialAccounts.every((account) => selected.has(account.id));
  const runningBusy = startMutation.isPending || stopMutation.isPending;
  const progressPercent = (() => {
    if (!status) return 0;
    if (status.forum_total > 0) {
      return Math.min(100, (status.forum_index / status.forum_total) * 100);
    }
    if (status.account_total > 0) {
      return Math.min(100, (status.account_index / status.account_total) * 100);
    }
    return 0;
  })();

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(credentialAccounts.map((account) => account.id)));
    }
  };

  const toggleOne = (accountId: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(accountId);
      else next.delete(accountId);
      return next;
    });
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">自动签到</h1>
          <p className="text-sm text-muted-foreground">
            批量签到所选账号的全部贴吧，可设置贴吧间隔、账号间隔和每日定时
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={running ? "default" : "outline"}>
            {running ? "运行中" : "空闲"}
          </Badge>
          {scheduleEnabled ? (
            <Badge variant="secondary">每日 {scheduleTime}</Badge>
          ) : (
            <Badge variant="outline">手动触发</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>账号范围</CardTitle>
                <CardDescription>
                  未选择账号时，默认签到所有已配置凭据的账号
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {allSelected ? "清空" : "全选可用"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                还没有账号，请先在「账号管理」添加。
              </p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {orderedAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <Checkbox
                      checked={selected.has(account.id)}
                      onCheckedChange={(checked) => toggleOne(account.id, checked)}
                      disabled={
                        !selected.has(account.id) &&
                        (!account.has_credentials || account.status !== "valid")
                      }
                      aria-label={`选择自动账号-${account.username}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {account.nickname || account.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {account.username}
                        {account.tieba_uid ? ` · UID ${account.tieba_uid}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(STATUS_CLASSES[account.status])}
                    >
                      {STATUS_LABELS[account.status]}
                    </Badge>
                    {!account.has_credentials ? (
                      <span className="text-xs text-muted-foreground">未配置凭据</span>
                    ) : account.status !== "valid" ? (
                      <span className="text-xs text-muted-foreground">账号不可用</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>签到参数</CardTitle>
            <CardDescription>间隔越短速度越快，建议保持随机间隔以降低风控风险</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>每个贴吧间隔（秒）</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={intervalMin}
                  onChange={(event) => setIntervalMin(event.target.value)}
                  aria-label="贴吧间隔最小值"
                />
                <span className="text-xs text-muted-foreground">至</span>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={intervalMax}
                  onChange={(event) => setIntervalMax(event.target.value)}
                  aria-label="贴吧间隔最大值"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>每个账号间隔（秒）</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={accountMin}
                  onChange={(event) => setAccountMin(event.target.value)}
                  aria-label="账号间隔最小值"
                />
                <span className="text-xs text-muted-foreground">至</span>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={accountMax}
                  onChange={(event) => setAccountMax(event.target.value)}
                  aria-label="账号间隔最大值"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>每日定时</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  服务运行期间，每天到点自动执行
                </p>
              </div>
              <Switch
                checked={scheduleEnabled}
                onCheckedChange={setScheduleEnabled}
                aria-label="启用每日定时"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="auto-schedule-time">每日执行时间</Label>
              <Input
                id="auto-schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(event) => setScheduleTime(event.target.value)}
                disabled={!scheduleEnabled}
                className="w-36"
              />
            </div>

            <Button
              variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || running}
            >
              {saveMutation.isPending ? "保存中…" : "保存设置"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>运行状态</CardTitle>
              <CardDescription>{status?.message || "空闲"}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => startMutation.mutate()}
                disabled={running || runningBusy || credentialAccounts.length === 0}
              >
                <Play className="size-4" />
                {startMutation.isPending ? "启动中…" : "立即自动签到"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => stopMutation.mutate()}
                disabled={!running || runningBusy}
              >
                <Square className="size-4" />
                停止
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => statusQuery.refetch()}
                aria-label="刷新运行状态"
              >
                <RefreshCw
                  className={cn("size-4", statusQuery.isFetching && "animate-spin")}
                />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">账号进度</p>
              <p className="mt-1 font-semibold tabular-nums">
                {status?.account_index ?? 0}/{status?.account_total ?? 0}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">当前贴吧进度</p>
              <p className="mt-1 font-semibold tabular-nums">
                {status?.forum_index ?? 0}/{status?.forum_total ?? 0}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">成功 / 已签</p>
              <p className="mt-1 font-semibold tabular-nums">
                {status?.success ?? 0} / {status?.already ?? 0}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">失败 / 跳过账号</p>
              <p className="mt-1 font-semibold tabular-nums">
                {status?.failed ?? 0} / {status?.skipped ?? 0}
              </p>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="text-sm text-muted-foreground">
            {status?.current_account_name ? (
              <p>
                当前账号：{status.current_account_name}
                {status.current_forum ? ` · 当前贴吧：${status.current_forum}` : ""}
              </p>
            ) : null}
            {status?.started_at ? <p>开始时间：{formatDateTime(status.started_at)}</p> : null}
            {status?.finished_at ? (
              <p>结束时间：{formatDateTime(status.finished_at)}</p>
            ) : null}
          </div>

          {status?.recent_errors.length ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive">最近错误</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {status.recent_errors.map((error, index) => (
                  <li key={`${index}-${error}`} className="truncate">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {settings.last_run_date ? (
            <p className="text-xs text-muted-foreground">
              上次定时执行日期：{settings.last_run_date}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
