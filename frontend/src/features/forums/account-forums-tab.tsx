"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FolderPlus,
  HeartOff,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
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
import type { Account } from "@/lib/api/accounts";
import {
  clearAccountForumBan,
  importForumsToPool,
  listAccountForums,
  syncForums,
  unfollowForums,
  type AccountForum,
  type AccountForumListResponse,
} from "@/lib/api/forums";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const EMPTY_ACCOUNT_FORUMS: AccountForumListResponse = {
  items: [],
  total: 0,
  stats: { total: 0, followed: 0, banned: 0, signed: 0 },
};

type AccountForumFilter = "all" | "followed" | "unfollowed" | "banned";

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

export function AccountForumsTab({
  accountId,
  account,
}: {
  accountId: number | null;
  account: Account | null;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AccountForumFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [unfollowing, setUnfollowing] = useState<AccountForum | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data = EMPTY_ACCOUNT_FORUMS, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["account-forums", accountId, filter, search],
    queryFn: () =>
      listAccountForums(accountId as number, {
        q: search || undefined,
        status: filter === "all" ? undefined : filter,
      }),
    enabled: accountId !== null,
  });

  const syncMutation = useMutation({
    mutationFn: () => syncForums({ account_id: accountId as number }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      queryClient.invalidateQueries({ queryKey: ["account-forums", accountId] });
      toast.success(
        `同步完成：获取 ${result.fetched} 个关注吧，新增 ${result.added} 个，更新 ${result.updated} 个`
      );
    },
    onError: (error: Error) => toast.error(`同步失败：${error.message}`),
  });

  const unfollowMutation = useMutation({
    mutationFn: (forumId: number) =>
      unfollowForums({ account_id: accountId as number, forum_ids: [forumId] }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      queryClient.invalidateQueries({ queryKey: ["account-forums", accountId] });
      if (result.success > 0) {
        toast.success("已取消关注");
      } else {
        toast.error(result.items[0]?.message || "取消关注失败");
      }
      setUnfollowing(null);
    },
    onError: (error: Error) => toast.error(`取关失败：${error.message}`),
  });

  const importMutation = useMutation({
    mutationFn: () => importForumsToPool({ forum_ids: Array.from(selected) }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      const parts: string[] = [];
      if (result.promoted > 0) parts.push(`转入 ${result.promoted} 个`);
      if (result.existing > 0) parts.push(`已在池中 ${result.existing} 个`);
      toast.success(`已更新贴吧池：${parts.join("，") || "没有变化"}`);
      setSelected(new Set());
    },
    onError: (error: Error) => toast.error(`加入贴吧池失败：${error.message}`),
  });

  const unbanMutation = useMutation({
    mutationFn: (forumId: number) =>
      clearAccountForumBan(accountId as number, forumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      queryClient.invalidateQueries({ queryKey: ["account-forums", accountId] });
      queryClient.invalidateQueries({ queryKey: ["sign-overview", accountId] });
      toast.success("已清除本地封禁标记，可重新签到或发帖");
    },
    onError: (error: Error) => toast.error(`解除标记失败：${error.message}`),
  });

  const applySearch = () => {
    setSearch(searchInput.trim());
    setSelected(new Set());
  };
  const canSync = accountId !== null && account?.has_credentials === true;
  const hasRichStats = data.items.some(
    (item) => item.is_signed || item.hot_num > 0 || item.member_count > 0 || item.thread_num > 0
  );
  const allSelected =
    data.items.length > 0 &&
    data.items.every((item) => selected.has(item.forum_id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((item) => item.forum_id)));
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
          <Users className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">请先在页头选择一个账号</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="关联贴吧" value={data.stats.total} />
        <StatCard label="已关注" value={data.stats.followed} />
        <StatCard label="已封禁" value={data.stats.banned} />
        <StatCard label="已取关" value={Math.max(data.stats.total - data.stats.followed, 0)} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>
                {account ? `${account.nickname || account.username} 的关注` : "账号关注"}
              </CardTitle>
              <CardDescription>
                查看该账号关注的全部贴吧及等级、签到、封禁状态
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={[
                  { value: "all", label: "全部" },
                  { value: "followed", label: "已关注" },
                  { value: "unfollowed", label: "已取关" },
                  { value: "banned", label: "已封禁" },
                ]}
                value={filter}
                onValueChange={(v) => {
                  setFilter(v as AccountForumFilter);
                  setSelected(new Set());
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="followed">已关注</SelectItem>
                  <SelectItem value="unfollowed">已取关</SelectItem>
                  <SelectItem value="banned">已封禁</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySearch();
                  }}
                  className="h-8 w-44 pl-8"
                  placeholder="搜索贴吧名"
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => importMutation.mutate()}
                disabled={selected.size === 0 || importMutation.isPending}
              >
                <FolderPlus className="size-4" />
                {importMutation.isPending ? "加入中…" : "加入贴吧池"}
              </Button>
              <Button
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={!canSync || syncMutation.isPending}
              >
                <RefreshCw className={cn("size-4", syncMutation.isPending && "animate-spin")} />
                {syncMutation.isPending ? "同步中…" : "同步此账号"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {account && !account.has_credentials ? (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              当前账号未配置 BDUSS，无法同步或取关。
            </p>
          ) : null}

          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Users className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                还没有该账号的关注数据，点击「同步此账号」拉取
              </p>
              <Button
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={!canSync || syncMutation.isPending}
              >
                同步此账号
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="全选账号贴吧"
                    />
                  </TableHead>
                  <TableHead>贴吧名</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>关注</TableHead>
                  <TableHead>封禁</TableHead>
                  {hasRichStats ? <TableHead>今日签到</TableHead> : null}
                  {hasRichStats ? <TableHead>热度</TableHead> : null}
                  {hasRichStats ? <TableHead>会员数</TableHead> : null}
                  <TableHead>最后同步</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((forum) => (
                  <TableRow key={forum.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(forum.forum_id)}
                        onCheckedChange={(checked) =>
                          toggleOne(forum.forum_id, checked)
                        }
                        aria-label={`选择账号贴吧-${forum.fname}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{forum.fname}</TableCell>
                    <TableCell>{forum.level}</TableCell>
                    <TableCell>
                      {forum.is_followed ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        >
                          已关注
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          已取关
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {forum.is_banned ? (
                        <Badge
                          variant="outline"
                          className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                        >
                          已封禁
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">正常</span>
                      )}
                      {forum.ban_reason ? (
                        <p className="mt-1 max-w-40 truncate text-xs text-muted-foreground">
                          {forum.ban_reason}
                        </p>
                      ) : null}
                    </TableCell>
                    {hasRichStats ? (
                      <TableCell>
                        {forum.is_signed ? (
                          <Badge variant="secondary">已签</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">未签</span>
                        )}
                      </TableCell>
                    ) : null}
                    {hasRichStats ? (
                      <TableCell>{forum.hot_num.toLocaleString("zh-CN")}</TableCell>
                    ) : null}
                    {hasRichStats ? (
                      <TableCell>{forum.member_count.toLocaleString("zh-CN")}</TableCell>
                    ) : null}
                    <TableCell>{formatDateTime(forum.last_synced_at)}</TableCell>
                    <TableCell className="text-right">
                      {forum.is_banned ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => unbanMutation.mutate(forum.forum_id)}
                          disabled={unbanMutation.isPending}
                          aria-label="解除封禁标记"
                          title="解除本地封禁标记"
                        >
                          <ShieldCheck className="size-4" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setUnfollowing(forum)}
                        disabled={!forum.is_followed}
                        aria-label="取消关注"
                        className="text-destructive hover:text-destructive"
                        title="取消关注"
                      >
                        <HeartOff className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={unfollowing !== null}
        onOpenChange={(open) => {
          if (!open) setUnfollowing(null);
        }}
        title="取消关注"
        description={
          unfollowing
            ? `确定让当前账号取消关注「${unfollowing.fname}」吗？`
            : ""
        }
        confirmLabel="取消关注"
        loadingLabel="处理中…"
        onConfirm={() => {
          if (unfollowing) unfollowMutation.mutate(unfollowing.forum_id);
        }}
        loading={unfollowMutation.isPending}
      />
    </div>
  );
}
