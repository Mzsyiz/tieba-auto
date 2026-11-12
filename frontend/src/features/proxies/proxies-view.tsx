"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleOff,
  Gauge,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { listAccounts } from "@/lib/api/accounts";
import {
  bindProxyAccounts,
  bulkImportProxies,
  deleteProxy,
  listProxies,
  testProxy,
  updateProxy,
  type ProxyList,
  type ProxyNode,
} from "@/lib/api/proxies";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ProxyFormDialog } from "./proxy-form-dialog";

const EMPTY_PROXIES: ProxyList = {
  items: [],
  total: 0,
  stats: { total: 0, active: 0, online: 0, failed: 0, bound_accounts: 0 },
};

type ProxyFilter = "all" | "active" | "inactive" | "failed";

const FILTER_ITEMS: Array<{ value: ProxyFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "已启用" },
  { value: "inactive", label: "已停用" },
  { value: "failed", label: "有故障" },
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

function ProxyStatus({ proxy }: { proxy: ProxyNode }) {
  if (!proxy.is_active) {
    return (
      <Badge variant="outline" className="border-zinc-400/30 text-zinc-500">
        已停用
      </Badge>
    );
  }
  if (proxy.last_error) {
    return (
      <Badge
        variant="outline"
        className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
      >
        连接失败
      </Badge>
    );
  }
  if (proxy.last_checked_at) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        在线 {proxy.latency_ms ?? "—"}ms
      </Badge>
    );
  }
  return <Badge variant="secondary">未检测</Badge>;
}

export function ProxiesView() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProxyFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProxyNode | null>(null);
  const [deleting, setDeleting] = useState<ProxyNode | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRaw, setBulkRaw] = useState("");
  const [binding, setBinding] = useState<ProxyNode | null>(null);
  const [boundIds, setBoundIds] = useState<Set<number>>(new Set());

  const { data = EMPTY_PROXIES, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["proxies", filter, search],
    queryFn: () =>
      listProxies({
        q: search || undefined,
        status: filter === "all" ? undefined : filter,
      }),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });

  const testMutation = useMutation({
    mutationFn: (proxy: ProxyNode) => testProxy(proxy.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(`代理不可用：${result.message}`);
      }
    },
    onError: (error: Error) => toast.error(`测试失败：${error.message}`),
  });

  const toggleMutation = useMutation({
    mutationFn: (proxy: ProxyNode) =>
      updateProxy(proxy.id, { is_active: !proxy.is_active }),
    onSuccess: (proxy) => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(proxy.is_active ? "代理已启用" : "代理已停用");
    },
    onError: (error: Error) => toast.error(`操作失败：${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (proxy: ProxyNode) => deleteProxy(proxy.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("代理节点已删除，绑定账号已切回直连");
      setDeleting(null);
    },
    onError: (error: Error) => toast.error(`删除失败：${error.message}`),
  });

  const bulkMutation = useMutation({
    mutationFn: () => bulkImportProxies(bulkRaw),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      const parts = [`新增 ${result.added} 个`];
      if (result.skipped > 0) parts.push(`跳过重复 ${result.skipped} 个`);
      if (result.errors.length > 0) parts.push(`格式错误 ${result.errors.length} 行`);
      toast.success(`批量导入完成：${parts.join("，")}`);
      if (result.errors.length > 0) {
        toast.error(result.errors.slice(0, 2).join("；"));
      }
      setBulkOpen(false);
      setBulkRaw("");
    },
    onError: (error: Error) => toast.error(`导入失败：${error.message}`),
  });

  const bindMutation = useMutation({
    mutationFn: () =>
      bindProxyAccounts(binding?.id as number, Array.from(boundIds)),
    onSuccess: (proxy) => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(`已更新 ${proxy.display_name} 的账号绑定`);
      setBinding(null);
    },
    onError: (error: Error) => toast.error(`绑定失败：${error.message}`),
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (proxy: ProxyNode) => {
    setEditing(proxy);
    setFormOpen(true);
  };

  const openBinding = (proxy: ProxyNode) => {
    setBinding(proxy);
    setBoundIds(new Set(proxy.bound_accounts.map((account) => account.id)));
  };

  const busy =
    testMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending ||
    bindMutation.isPending;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">代理池</h1>
          <p className="text-sm text-muted-foreground">
            管理 HTTP/HTTPS 出口节点，并为贴吧账号绑定固定代理
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload className="size-4" />
            批量导入
          </Button>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            添加代理
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="节点总数" value={data.stats.total} />
        <StatCard label="已启用" value={data.stats.active} />
        <StatCard label="在线" value={data.stats.online} />
        <StatCard label="有故障" value={data.stats.failed} />
        <StatCard label="已绑定账号" value={data.stats.bound_accounts} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>代理节点</CardTitle>
              <CardDescription>当前筛选 {data.items.length} 个节点</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={FILTER_ITEMS}
                value={filter}
                onValueChange={(value) => setFilter(value as ProxyFilter)}
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
                    if (event.key === "Enter") setSearch(searchInput.trim());
                  }}
                  className="h-8 w-52 pl-8"
                  placeholder="搜索名称 / IP / 账号"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearch(searchInput.trim())}
              >
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
              <Link2 className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">代理池为空</p>
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" />
                添加第一个代理
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>节点</TableHead>
                  <TableHead>协议 / 认证</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>测速</TableHead>
                  <TableHead>绑定账号</TableHead>
                  <TableHead>最近检测</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((proxy) => (
                  <TableRow key={proxy.id}>
                    <TableCell>
                      <p className="font-medium">{proxy.display_name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {proxy.host}:{proxy.port}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline">{proxy.protocol.toUpperCase()}</Badge>
                        {proxy.has_auth ? (
                          <Badge variant="secondary">认证</Badge>
                        ) : (
                          <Badge variant="secondary">匿名</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ProxyStatus proxy={proxy} />
                      {proxy.last_error ? (
                        <p className="mt-1 max-w-52 truncate text-[10px] text-destructive" title={proxy.last_error}>
                          {proxy.last_error}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      成功 {proxy.success_count} · 失败 {proxy.fail_count}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-sm hover:underline"
                        onClick={() => openBinding(proxy)}
                      >
                        <Users className="size-3.5" />
                        {proxy.bound_accounts.length} 个
                      </button>
                      {proxy.bound_accounts.length > 0 ? (
                        <p className="mt-1 max-w-52 truncate text-[10px] text-muted-foreground">
                          {proxy.bound_accounts.map((account) => account.name).join("、")}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(proxy.last_checked_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => testMutation.mutate(proxy)}
                          disabled={busy}
                          aria-label="测试连通性"
                          title="测试连通性"
                        >
                          <Gauge className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openBinding(proxy)}
                          disabled={busy}
                          aria-label="绑定账号"
                          title="绑定账号"
                        >
                          <Users className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(proxy)}
                          disabled={busy}
                          aria-label="编辑"
                          title="编辑"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => toggleMutation.mutate(proxy)}
                          disabled={busy}
                          aria-label={proxy.is_active ? "停用" : "启用"}
                          title={proxy.is_active ? "停用" : "启用"}
                        >
                          {proxy.is_active ? (
                            <CircleOff className="size-4" />
                          ) : (
                            <CircleCheck className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleting(proxy)}
                          disabled={busy}
                          aria-label="删除"
                          title="删除"
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

      {formOpen ? (
        <ProxyFormDialog
          key={editing?.id ?? "new"}
          open
          onOpenChange={setFormOpen}
          proxy={editing}
        />
      ) : null}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>批量导入代理</DialogTitle>
            <DialogDescription>
              每行一个节点，支持 URL、host:port、host:port:user:pass。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={bulkRaw}
            onChange={(event) => setBulkRaw(event.target.value)}
            rows={12}
            className="font-mono text-xs"
            placeholder={
              "http://user:pass@127.0.0.1:8080\n127.0.0.2:8081\n127.0.0.3:8082:user:pass"
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => bulkMutation.mutate()}
              disabled={!bulkRaw.trim() || bulkMutation.isPending}
            >
              {bulkMutation.isPending ? "导入中…" : "开始导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={binding !== null}
        onOpenChange={(open) => {
          if (!open) setBinding(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>绑定账号到 {binding?.display_name}</DialogTitle>
            <DialogDescription>
              一个账号只能绑定一个代理；取消勾选会将该账号切回直连或默认代理。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
            {accounts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">暂无账号</p>
            ) : (
              accounts.map((account) => (
                <label
                  key={account.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={boundIds.has(account.id)}
                    onCheckedChange={(checked) =>
                      setBoundIds((current) => {
                        const next = new Set(current);
                        if (checked) next.add(account.id);
                        else next.delete(account.id);
                        return next;
                      })
                    }
                    aria-label={`绑定账号-${account.username}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {account.nickname || account.username}
                  </span>
                  <span className="text-xs text-muted-foreground">#{account.id}</span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBinding(null)}>
              取消
            </Button>
            <Button
              onClick={() => bindMutation.mutate()}
              disabled={bindMutation.isPending}
            >
              {bindMutation.isPending ? "绑定中…" : "保存绑定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="删除代理节点"
        description={
          deleting
            ? `确定删除「${deleting.display_name}」吗？绑定该节点的账号会切回直连或默认代理。`
            : ""
        }
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting);
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
