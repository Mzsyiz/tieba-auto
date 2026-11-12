"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, CalendarPlus, RefreshCw, Search } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ForumHeader } from "@/features/forums/forum-header";
import { useAccountContext } from "@/hooks/use-account-context";
import type { Account } from "@/lib/api/accounts";
import { syncForums } from "@/lib/api/forums";
import {
  getSignOverview,
  listSignLogs,
  runSign,
  type SignItem,
  type SignLogList,
  type SignOverview,
} from "@/lib/api/sign";
import { chunk } from "@/lib/forum-selection";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const EMPTY_OVERVIEW: SignOverview = {
  items: [],
  total: 0,
  stats: { total: 0, signed: 0, pending: 0, failed: 0, banned: 0 },
};

type SignFilter = "all" | "pending" | "signed" | "failed" | "banned";

const FILTER_ITEMS: Array<{ value: SignFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待签到" },
  { value: "signed", label: "已签到" },
  { value: "failed", label: "签到失败" },
  { value: "banned", label: "已封禁" },
];

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

function SignStatusBadge({ item }: { item: SignItem }) {
  if (item.is_banned) {
    return (
      <Badge
        variant="outline"
        className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
      >
        已封禁
      </Badge>
    );
  }
  if (item.is_signed) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        已签到
      </Badge>
    );
  }
  if (item.last_sign_status === "failed") {
    return (
      <Badge
        variant="outline"
        className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
      >
        签到失败
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
    >
      待签到
    </Badge>
  );
}

export function SignView() {
  const { accounts, accountId, account, accountIdNumber, setSelectedAccountId } =
    useAccountContext();
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: () => syncForums({ account_id: accountIdNumber as number }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      queryClient.invalidateQueries({ queryKey: ["account-forums", accountIdNumber] });
      queryClient.invalidateQueries({ queryKey: ["sign-overview", accountIdNumber] });
      queryClient.invalidateQueries({ queryKey: ["sign-logs", accountIdNumber] });
      toast.success(`同步完成：获取 ${result.fetched} 个关注吧`);
    },
    onError: (error: Error) => toast.error(`同步失败：${error.message}`),
  });

  return (
    <div className="space-y-4 p-6">
      <ForumHeader
        title="签到任务"
        description="查看并执行当前账号的贴吧签到，支持部分签到与全部待签"
        accountId={accountId}
        account={account}
        accounts={accounts}
        onAccountChange={setSelectedAccountId}
      >
        <Button
          variant="outline"
          onClick={() => syncMutation.mutate()}
          disabled={!account?.has_credentials || syncMutation.isPending}
        >
          <RefreshCw className={cn("size-4", syncMutation.isPending && "animate-spin")} />
          {syncMutation.isPending ? "同步中…" : "同步关注"}
        </Button>
      </ForumHeader>

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          还没有账号，请先到「账号管理」添加百度贴吧账号。
        </p>
      ) : null}

      <SignPanel
        key={`sign-${accountId}`}
        accountId={accountIdNumber}
        account={account}
      />
    </div>
  );
}

function SignPanel({
  accountId,
  account,
}: {
  accountId: number | null;
  account: Account | null;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<SignFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const autoSyncAttempted = useRef(new Set<number>());

  const { data = EMPTY_OVERVIEW, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sign-overview", accountId],
    queryFn: () => getSignOverview(accountId as number),
    enabled: accountId !== null,
  });

  const { data: logs = { items: [] } as SignLogList } = useQuery({
    queryKey: ["sign-logs", accountId],
    queryFn: () => listSignLogs(accountId as number, 30),
    enabled: accountId !== null,
  });

  const canSync = accountId !== null && account?.has_credentials === true;
  const autoSyncMutation = useMutation({
    mutationFn: (currentAccountId: number) =>
      syncForums({ account_id: currentAccountId }),
    onSuccess: (result, currentAccountId) => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      queryClient.invalidateQueries({
        queryKey: ["account-forums", currentAccountId],
      });
      queryClient.invalidateQueries({
        queryKey: ["sign-overview", currentAccountId],
      });
      toast.success(`已自动同步 ${result.fetched} 个关注贴吧`);
    },
    onError: (error: Error) => {
      toast.error(`自动同步关注贴吧失败：${error.message}`);
    },
  });

  useEffect(() => {
    if (
      accountId === null ||
      !canSync ||
      isLoading ||
      isFetching ||
      data.total > 0 ||
      autoSyncAttempted.current.has(accountId)
    ) {
      return;
    }
    autoSyncAttempted.current.add(accountId);
    autoSyncMutation.mutate(accountId);
  }, [
    accountId,
    autoSyncMutation,
    canSync,
    data.total,
    isFetching,
    isLoading,
  ]);

  const signMutation = useMutation({
    mutationFn: async (forumIds: number[]) => {
      if (!accountId) {
        throw new Error("请先选择账号");
      }
      if (forumIds.length === 0) {
        throw new Error("没有可签到的贴吧");
      }
      const batches = chunk(forumIds, 8);
      let success = 0;
      let already = 0;
      let failed = 0;
      const failures: string[] = [];
      setProgress({ done: 0, total: batches.length });

      for (let index = 0; index < batches.length; index += 1) {
        const result = await runSign(accountId, batches[index]);
        success += result.success;
        already += result.already;
        failed += result.failed;
        failures.push(
          ...result.items
            .filter((item) => !item.success)
            .map((item) => `${item.fname}：${item.message || "签到失败"}`)
        );
        setProgress({ done: index + 1, total: batches.length });
      }

      return { success, already, failed, failures };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["sign-overview", accountId] });
      queryClient.invalidateQueries({ queryKey: ["sign-logs", accountId] });
      if (result.success + result.already > 0) {
        toast.success(
          `签到完成：成功 ${result.success}，今日已签 ${result.already}，失败 ${result.failed}`
        );
      } else {
        toast.error(`签到失败 ${result.failed} 个`);
      }
      if (result.failures.length > 0) {
        toast.error(`部分失败：${result.failures[0]}`);
      }
      setSelected(new Set());
      setProgress(null);
    },
    onError: (error: Error) => {
      setProgress(null);
      toast.error(`签到失败：${error.message}`);
    },
  });

  const filtered = data.items.filter((item) => {
    if (search && !item.fname.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filter === "pending") {
      return !item.is_signed && !item.is_banned && item.last_sign_status !== "failed";
    }
    if (filter === "signed") {
      return item.is_signed && !item.is_banned;
    }
    if (filter === "failed") {
      return !item.is_signed && !item.is_banned && item.last_sign_status === "failed";
    }
    if (filter === "banned") {
      return item.is_banned;
    }
    return true;
  });

  const selectable = filtered.filter((item) => !item.is_banned);
  const allSelected =
    selectable.length > 0 && selectable.every((item) => selected.has(item.forum_id));
  const pendingIds = data.items
    .filter((item) => !item.is_signed && !item.is_banned)
    .map((item) => item.forum_id);
  const selectedIds = selectable
    .filter((item) => selected.has(item.forum_id))
    .map((item) => item.forum_id);
  const canSign = canSync;
  const busy = signMutation.isPending;

  const applySearch = () => {
    setSearch(searchInput.trim());
    setSelected(new Set());
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((item) => item.forum_id)));
    }
  };

  const toggleOne = (forumId: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(forumId);
      else next.delete(forumId);
      return next;
    });
  };

  if (!accountId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <CalendarCheck2 className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">请先在页头选择一个账号</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="总关注吧" value={data.stats.total} />
        <StatCard label="今日已签" value={data.stats.signed} />
        <StatCard label="待签到" value={data.stats.pending} />
        <StatCard label="签到失败" value={data.stats.failed} />
        <StatCard label="已封禁" value={data.stats.banned} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>签到列表</CardTitle>
              <CardDescription>当前筛选 {filtered.length} 个贴吧</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={FILTER_ITEMS}
                value={filter}
                onValueChange={(value) => {
                  setFilter(value as SignFilter);
                  setSelected(new Set());
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_ITEMS.map((item) => (
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
                  className="h-8 w-40 pl-8"
                  placeholder="搜索贴吧名"
                />
              </div>
              <Button variant="outline" size="sm" onClick={applySearch}>
                搜索
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => refetch()} aria-label="刷新">
                <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">已选 {selected.size} 个</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleAll} disabled={selectable.length === 0}>
                {allSelected ? "清空选择" : "全选当前"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => signMutation.mutate(pendingIds)}
                disabled={!canSign || busy || pendingIds.length === 0}
              >
                {busy && progress
                  ? `签到中… ${progress.done}/${progress.total}`
                  : `签到全部待签 (${pendingIds.length})`}
              </Button>
              <Button
                size="sm"
                onClick={() => signMutation.mutate(selectedIds)}
                disabled={!canSign || busy || selectedIds.length === 0}
              >
                <CalendarCheck2 className="size-4" />
                签到选中
              </Button>
            </div>
          </div>

          {account && !account.has_credentials ? (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              当前账号未配置 BDUSS，无法签到。
            </p>
          ) : null}

          {isLoading || autoSyncMutation.isPending ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {autoSyncMutation.isPending
                ? "正在自动同步关注贴吧…"
                : "加载中…"}
            </p>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CalendarCheck2 className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                该账号还没有关注贴吧，请先在「贴吧管理」页同步关注
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">没有匹配的贴吧</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="全选签到贴吧"
                    />
                  </TableHead>
                  <TableHead>贴吧名</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>连续天数</TableHead>
                  <TableHead>最近签到</TableHead>
                  <TableHead>历史</TableHead>
                  <TableHead>失败原因</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.forum_id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(item.forum_id)}
                        onCheckedChange={(checked) => toggleOne(item.forum_id, checked)}
                        disabled={item.is_banned}
                        aria-label={`选择签到-${item.fname}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{item.fname}</TableCell>
                    <TableCell>{item.level}</TableCell>
                    <TableCell>
                      <SignStatusBadge item={item} />
                    </TableCell>
                    <TableCell>{item.sign_count} 天</TableCell>
                    <TableCell>{formatDateTime(item.last_sign_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      成功 {item.history_success} / 失败 {item.history_failed}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                      {item.sign_error || item.ban_reason || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => signMutation.mutate([item.forum_id])}
                        disabled={!canSign || busy || item.is_banned}
                      >
                        <CalendarPlus className="size-4" />
                        签到
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近签到记录</CardTitle>
          <CardDescription>当前账号最近 30 条签到结果</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无签到记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>贴吧</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDateTime(log.signed_at)}</TableCell>
                    <TableCell>{log.fname}</TableCell>
                    <TableCell>
                      {log.success ? (
                        <Badge variant="secondary">
                          {log.status === "already" ? "今日已签" : "成功"}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">失败</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-xs text-muted-foreground">
                      {log.message || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
