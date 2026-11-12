"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HeartPlus,
  LayoutGrid,
  Pencil,
  RefreshCw,
  Search,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  deleteForum,
  followForums,
  listForums,
  updateForum,
  type Forum,
  type ForumListResponse,
} from "@/lib/api/forums";
import { formatDateTime } from "@/lib/format";
import { chunk, unfollowedSelectedIds } from "@/lib/forum-selection";
import { cn } from "@/lib/utils";

import { ForumEditDialog } from "./forum-edit-dialog";

const EMPTY_FORUMS: ForumListResponse = {
  items: [],
  total: 0,
  stats: { total: 0, active: 0, banned: 0, post_targets: 0 },
};

type PoolFilter = "all" | "unfollowed" | "followed" | "banned";

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

export function ForumPoolTab({
  accountId,
  account,
}: {
  accountId: number | null;
  account: Account | null;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<PoolFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Forum | null>(null);
  const [deleting, setDeleting] = useState<Forum | null>(null);
  const [followProgress, setFollowProgress] = useState<{ done: number; total: number } | null>(
    null
  );

  const { data = EMPTY_FORUMS, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["forums", filter, search, accountId],
    queryFn: () =>
      listForums({
        q: search || undefined,
        status: filter === "banned" ? "banned" : undefined,
        followState:
          filter === "followed" ? "followed" : filter === "unfollowed" ? "unfollowed" : undefined,
        accountId: accountId ?? undefined,
      }),
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!accountId) {
        throw new Error("请先选择账号");
      }

      const targetIds = unfollowedSelectedIds(selected, data.items);
      const skipped = selected.size - targetIds.length;
      if (targetIds.length === 0) {
        return { success: 0, failed: 0, skipped, failures: [] as string[] };
      }

      const batches = chunk(targetIds, 8);

      let success = 0;
      let failed = 0;
      const failures: string[] = [];
      setFollowProgress({ done: 0, total: batches.length });

      for (let index = 0; index < batches.length; index += 1) {
        const result = await followForums({
          account_id: accountId,
          forum_ids: batches[index],
        });
        success += result.success;
        failed += result.failed;
        failures.push(
          ...result.items
            .filter((item) => !item.success)
            .map((item) => `${item.fname}：${item.message || "关注失败"}`)
        );
        setFollowProgress({ done: index + 1, total: batches.length });
      }

      return { success, failed, skipped, failures };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      if (accountId) {
        queryClient.invalidateQueries({ queryKey: ["account-forums", accountId] });
      }
      if (result.success > 0) {
        const extra = result.failed ? `，失败 ${result.failed} 个` : "";
        const skipped = result.skipped ? `，跳过 ${result.skipped} 个已关注` : "";
        toast.success(`关注成功 ${result.success} 个${extra}${skipped}`);
      } else if (result.skipped > 0) {
        toast.info("选中的贴吧都已关注，无需重复操作");
      }
      if (result.failures.length > 0) {
        toast.error(`部分关注失败：${result.failures[0]}`);
      }
      setSelected(new Set());
      setFollowProgress(null);
    },
    onError: (error: Error) => {
      setFollowProgress(null);
      toast.error(`关注失败：${error.message}`);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, checked }: { id: number; checked: boolean }) =>
      updateForum(id, { is_post_target: checked }),
    onSuccess: (forum) => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      toast.success(`「${forum.fname}」${forum.is_post_target ? "已加入" : "已移出"}发帖目标`);
    },
    onError: (error: Error) => toast.error(`更新失败：${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteForum(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      toast.success("贴吧已删除");
      setDeleting(null);
    },
    onError: (error: Error) => toast.error(`删除失败：${error.message}`),
  });

  const applySearch = () => {
    setSearch(searchInput.trim());
    setSelected(new Set());
  };
  const allSelected =
    data.items.length > 0 && data.items.every((forum) => selected.has(forum.id));
  const canFollow =
    accountId !== null && account?.has_credentials === true && selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((forum) => forum.id)));
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="吧池总数" value={data.stats.total} />
        <StatCard label="正常" value={data.stats.active} />
        <StatCard label="已封禁" value={data.stats.banned} />
        <StatCard label="发帖目标" value={data.stats.post_targets} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>贴吧池</CardTitle>
              <CardDescription>
                仅显示手动添加的贴吧，勾选后可关注到当前账号，当前筛选 {data.total} 个
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={[
                  { value: "all", label: "全部" },
                  { value: "unfollowed", label: "未关注" },
                  { value: "followed", label: "已关注" },
                  { value: "banned", label: "已封禁" },
                ]}
                value={filter}
                onValueChange={(v) => {
                  setFilter(v as PoolFilter);
                  setSelected(new Set());
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="unfollowed" disabled={!accountId}>
                    未关注
                  </SelectItem>
                  <SelectItem value="followed" disabled={!accountId}>
                    已关注
                  </SelectItem>
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
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              已选 {selected.size} 个
              {account ? ` · 目标账号：${account.nickname || account.username}` : " · 未选择账号"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAll}
                disabled={data.items.length === 0}
              >
                {allSelected ? "清空选择" : "全选当前"}
              </Button>
              <Button
                size="sm"
                onClick={() => followMutation.mutate()}
                disabled={!canFollow || followMutation.isPending}
              >
                <HeartPlus className="size-4" />
                {followMutation.isPending
                  ? followProgress
                    ? `关注中… ${followProgress.done}/${followProgress.total}`
                    : "关注中…"
                  : "关注选中"}
              </Button>
            </div>
          </div>

          {!accountId ? (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              请先选择账号，才能执行关注操作。
            </p>
          ) : account && !account.has_credentials ? (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              当前账号未配置 BDUSS，无法关注贴吧。
            </p>
          ) : null}

          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <LayoutGrid className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                吧池为空或没有匹配项，点击右上角「添加贴吧」手动录入
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="全选贴吧"
                    />
                  </TableHead>
                  <TableHead>贴吧名</TableHead>
                  <TableHead>吧ID</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>该账号</TableHead>
                  <TableHead>发帖目标</TableHead>
                  <TableHead>来源账号</TableHead>
                  <TableHead>最后同步</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((forum) => (
                  <TableRow key={forum.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(forum.id)}
                        onCheckedChange={(checked) => toggleOne(forum.id, checked)}
                        aria-label={`选择-${forum.fname}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{forum.fname}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {forum.fid ?? "—"}
                    </TableCell>
                    <TableCell>{forum.level}</TableCell>
                    <TableCell>
                      {forum.is_banned ? (
                        <Badge
                          variant="outline"
                          className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                        >
                          已封禁
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        >
                          正常
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {forum.followed_by_account === true ? (
                        <Badge variant="secondary">已关注</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          未关注
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={forum.is_post_target}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: forum.id, checked })
                        }
                        disabled={forum.is_banned || toggleMutation.isPending}
                        aria-label={`发帖目标-${forum.fname}`}
                      />
                    </TableCell>
                    <TableCell>{forum.account_name ?? "—"}</TableCell>
                    <TableCell>{formatDateTime(forum.last_synced_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditing(forum)}
                          aria-label="编辑"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleting(forum)}
                          aria-label="删除"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editing ? (
        <ForumEditDialog
          key={editing.id}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          forum={editing}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="删除贴吧"
        description={
          deleting
            ? `确定要从吧池删除「${deleting.fname}」吗？此操作不会取消百度贴吧的关注。`
            : ""
        }
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
