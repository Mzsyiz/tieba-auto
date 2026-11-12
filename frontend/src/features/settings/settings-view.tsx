"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Save, Server, ShieldCheck, TimerReset } from "lucide-react";
import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { listProxies } from "@/lib/api/proxies";
import {
  getAppSettings,
  getSystemInfo,
  updateAppSettings,
  type AppSettings,
} from "@/lib/api/settings";

function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 0.1,
  suffix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-12"
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}

export function SettingsView() {
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getAppSettings,
  });

  if (isLoading || !data) {
    return <p className="p-6 text-sm text-muted-foreground">加载设置中…</p>;
  }
  return <SettingsForm key={data.updated_at} settings={data} />;
}

function SettingsForm({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient();
  const [autoSyncForums, setAutoSyncForums] = useState(settings.auto_sync_forums);
  const [defaultProxyId, setDefaultProxyId] = useState(
    settings.default_proxy_id ? String(settings.default_proxy_id) : "none"
  );
  const [proxyAutoDisable, setProxyAutoDisable] = useState(
    settings.proxy_auto_disable
  );
  const [proxyFailureThreshold, setProxyFailureThreshold] = useState(
    String(settings.proxy_failure_threshold)
  );
  const [requestTimeout, setRequestTimeout] = useState(
    String(settings.request_timeout_seconds)
  );
  const [followMin, setFollowMin] = useState(String(settings.follow_interval_min));
  const [followMax, setFollowMax] = useState(String(settings.follow_interval_max));
  const [signMin, setSignMin] = useState(String(settings.sign_interval_min));
  const [signMax, setSignMax] = useState(String(settings.sign_interval_max));
  const [postMin, setPostMin] = useState(String(settings.post_interval_min));
  const [postMax, setPostMax] = useState(String(settings.post_interval_max));
  const [prewarmMin, setPrewarmMin] = useState(String(settings.post_prewarm_min));
  const [prewarmMax, setPrewarmMax] = useState(String(settings.post_prewarm_max));
  const [maxTaskTotal, setMaxTaskTotal] = useState(String(settings.max_task_total));

  const { data: proxyData } = useQuery({
    queryKey: ["proxies", "settings-options"],
    queryFn: () => listProxies({ status: "active" }),
  });
  const { data: systemInfo } = useQuery({
    queryKey: ["system-info"],
    queryFn: getSystemInfo,
    refetchInterval: 5000,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const numbers = {
        proxy_failure_threshold: Number(proxyFailureThreshold),
        request_timeout_seconds: Number(requestTimeout),
        follow_interval_min: Number(followMin),
        follow_interval_max: Number(followMax),
        sign_interval_min: Number(signMin),
        sign_interval_max: Number(signMax),
        post_interval_min: Number(postMin),
        post_interval_max: Number(postMax),
        post_prewarm_min: Number(prewarmMin),
        post_prewarm_max: Number(prewarmMax),
        max_task_total: Number(maxTaskTotal),
      };
      if (Object.values(numbers).some((value) => !Number.isFinite(value))) {
        throw new Error("请输入有效的数字");
      }
      return updateAppSettings({
        auto_sync_forums: autoSyncForums,
        default_proxy_id:
          defaultProxyId === "none" ? null : Number(defaultProxyId),
        proxy_auto_disable: proxyAutoDisable,
        ...numbers,
      });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["system-info"] });
      toast.success("全局设置已保存");
    },
    onError: (error: Error) => toast.error(`保存失败：${error.message}`),
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">设置</h1>
          <p className="text-sm text-muted-foreground">
            管理账号自动同步、代理容错和自动化任务默认参数
          </p>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          <Save className="size-4" />
          {mutation.isPending ? "保存中…" : "保存设置"}
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="size-4" />
              <CardTitle>网络与代理</CardTitle>
            </div>
            <CardDescription>
              未绑定代理的账号优先使用这里的默认节点；停用节点不会被选中
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>默认代理</Label>
              <Select
                items={[
                  { value: "none", label: "直连（不使用代理）" },
                  ...(proxyData?.items ?? []).map((proxy) => ({
                    value: String(proxy.id),
                    label: `${proxy.display_name}（${proxy.host}:${proxy.port}）`,
                  })),
                ]}
                value={defaultProxyId}
                onValueChange={(value) => setDefaultProxyId(value ?? "none")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择默认代理" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">直连（不使用代理）</SelectItem>
                  {(proxyData?.items ?? []).map((proxy) => (
                    <SelectItem key={proxy.id} value={String(proxy.id)}>
                      {proxy.display_name}（{proxy.host}:{proxy.port}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                需要新增节点或为账号单独绑定时，前往
                <Link href="/proxies" className="ml-1 underline underline-offset-4">
                  代理池
                </Link>
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>代理自动停用</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  连续测速失败达到阈值后停止使用该节点
                </p>
              </div>
              <Switch
                checked={proxyAutoDisable}
                onCheckedChange={setProxyAutoDisable}
                aria-label="代理自动停用"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                id="proxy-failure-threshold"
                label="失败阈值"
                value={proxyFailureThreshold}
                onChange={setProxyFailureThreshold}
                min={1}
                max={100}
                step={1}
                suffix="次"
              />
              <NumberField
                id="request-timeout"
                label="请求超时"
                value={requestTimeout}
                onChange={setRequestTimeout}
                min={5}
                max={180}
                step={1}
                suffix="秒"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TimerReset className="size-4" />
              <CardTitle>自动化默认值</CardTitle>
            </div>
            <CardDescription>
              用于新发帖任务和实际操作间隔，已有任务保留自身配置
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>添加账号后自动同步关注贴吧</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  新增、导入、重新验证账号时自动刷新关注列表
                </p>
              </div>
              <Switch
                checked={autoSyncForums}
                onCheckedChange={setAutoSyncForums}
                aria-label="添加账号后自动同步关注贴吧"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                id="follow-min"
                label="关注最小间隔"
                value={followMin}
                onChange={setFollowMin}
                max={3600}
                suffix="秒"
              />
              <NumberField
                id="follow-max"
                label="关注最大间隔"
                value={followMax}
                onChange={setFollowMax}
                max={3600}
                suffix="秒"
              />
              <NumberField
                id="sign-min"
                label="签到最小间隔"
                value={signMin}
                onChange={setSignMin}
                max={3600}
                suffix="秒"
              />
              <NumberField
                id="sign-max"
                label="签到最大间隔"
                value={signMax}
                onChange={setSignMax}
                max={3600}
                suffix="秒"
              />
              <NumberField
                id="post-min"
                label="新任务最小发帖间隔"
                value={postMin}
                onChange={setPostMin}
                max={3600}
                suffix="秒"
              />
              <NumberField
                id="post-max"
                label="新任务最大发帖间隔"
                value={postMax}
                onChange={setPostMax}
                max={3600}
                suffix="秒"
              />
              <NumberField
                id="prewarm-min"
                label="发帖预热最小等待"
                value={prewarmMin}
                onChange={setPrewarmMin}
                max={60}
                suffix="秒"
              />
              <NumberField
                id="prewarm-max"
                label="发帖预热最大等待"
                value={prewarmMax}
                onChange={setPrewarmMax}
                max={60}
                suffix="秒"
              />
            </div>

            <NumberField
              id="max-task-total"
              label="单任务最大发帖数"
              value={maxTaskTotal}
              onChange={setMaxTaskTotal}
              min={1}
              max={5000}
              step={1}
              suffix="条"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              <CardTitle>内容发布规则</CardTitle>
            </div>
            <CardDescription>系统按贴吧输入限制自动校验，无需手动配置</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="font-medium">普通发帖</p>
              <p className="mt-1 text-xs text-muted-foreground">
                标题 5–31 字，正文 1–2000 字，最多 10 张图片
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium">发视频</p>
              <p className="mt-1 text-xs text-muted-foreground">
                标题 5–60 字，1 个视频，简介可选且不超过 2000 字
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="size-4" />
              <CardTitle>系统信息</CardTitle>
            </div>
            <CardDescription>{settings.updated_at ? "运行状态每 5 秒刷新" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{systemInfo?.environment ?? "加载中"}</Badge>
              <Badge variant="secondary">v{systemInfo?.version ?? "0.1.0"}</Badge>
              <Badge
                variant="outline"
                className={
                  systemInfo?.running_auto_sign
                    ? "border-sky-500/30 text-sky-600"
                    : "text-muted-foreground"
                }
              >
                自动签到 {systemInfo?.running_auto_sign ? "运行中" : "空闲"}
              </Badge>
              <Badge
                variant="outline"
                className={
                  systemInfo?.running_post_task
                    ? "border-sky-500/30 text-sky-600"
                    : "text-muted-foreground"
                }
              >
                发帖任务 {systemInfo?.running_post_task ? "运行中" : "空闲"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["账号", systemInfo?.account_count ?? 0],
                ["贴吧", systemInfo?.forum_count ?? 0],
                ["素材", systemInfo?.material_count ?? 0],
                ["代理", systemInfo?.proxy_count ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          <Save className="size-4" />
          {mutation.isPending ? "保存中…" : "保存设置"}
        </Button>
      </div>
    </div>
  );
}
