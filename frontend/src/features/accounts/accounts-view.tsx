"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteAccount,
  listAccounts,
  verifyAccount,
  type Account,
  type AccountStatus,
} from "@/lib/api/accounts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { AccountFormDialog } from "./account-form-dialog";
import { StatusBadge } from "./status-badge";

const STATUS_OPTIONS: { value: AccountStatus | "all"; label: string }[] = [
  { value: "all", label: "全部状态" },
  { value: "valid", label: "正常" },
  { value: "pending", label: "待验证" },
  { value: "invalid", label: "失效" },
  { value: "disabled", label: "已停用" },
];

export function AccountsView() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  const {
    data: accounts = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["accounts", statusFilter, search],
    queryFn: () =>
      listAccounts({
        status: statusFilter === "all" ? undefined : statusFilter,
        q: search || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("账号已删除");
      setDeleting(null);
    },
    onError: (error: Error) => {
      toast.error(`删除失败：${error.message}`);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) => verifyAccount(id),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      if (account.status === "valid") {
        toast.success(`「${account.nickname || account.username}」验证通过`);
      } else {
        toast.error(`验证未通过：${account.status_reason || "请重新登录"}`);
      }
    },
    onError: (error: Error) => toast.error(`验证失败：${error.message}`),
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditing(account);
    setFormOpen(true);
  };

  const applySearch = () => {
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">账号管理</h1>
          <p className="text-sm text-muted-foreground">
            管理百度贴吧账号、登录凭据与账号状态
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          添加账号
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>账号列表</CardTitle>
              <CardDescription>共 {accounts.length} 个账号</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select
                items={STATUS_OPTIONS}
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as AccountStatus | "all")}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
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
                  className="h-8 w-56 pl-8"
                  placeholder="搜索用户名 / 昵称"
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
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-muted-foreground">暂无账号</p>
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="size-4" />
                添加第一个账号
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>昵称</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>凭据</TableHead>
                  <TableHead>最近登录</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {account.avatar_url ? (
                          <Image
                            src={account.avatar_url}
                            alt={account.nickname || account.username}
                            width={32}
                            height={32}
                            unoptimized
                            className="size-8 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {(account.nickname || account.username).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium">{account.username}</p>
                          {account.tieba_uid ? (
                            <p className="text-xs text-muted-foreground">
                              UID {account.tieba_uid}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{account.nickname || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={account.status} />
                      {account.status_reason ? (
                        <p className="mt-1 max-w-40 truncate text-xs text-muted-foreground">
                          {account.status_reason}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {account.has_credentials ? (
                        <Badge variant="secondary">已配置</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          未配置
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(account.last_login_at)}</TableCell>
                    <TableCell className="max-w-48 truncate">{account.notes || "—"}</TableCell>
                    <TableCell>{formatDateTime(account.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => verifyMutation.mutate(account.id)}
                          disabled={verifyMutation.isPending}
                          aria-label="验证"
                          title="重新验证账号"
                        >
                          <ShieldCheck className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(account)}
                          aria-label="编辑"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleting(account)}
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

      {formOpen ? (
        <AccountFormDialog
          key={editing?.id ?? "new"}
          onOpenChange={setFormOpen}
          account={editing}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="删除账号"
        description={
          deleting
            ? `确定要删除账号「${deleting.username}」吗？此操作不可恢复。`
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
