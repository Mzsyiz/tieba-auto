"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/account-status";
import { updateAccount, type Account, type AccountStatus } from "@/lib/api/accounts";
import { listProxies } from "@/lib/api/proxies";

export function EditAccountForm({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState(account.nickname ?? "");
  const [status, setStatus] = useState<AccountStatus>(account.status);
  const [statusReason, setStatusReason] = useState(account.status_reason ?? "");
  const [bduss, setBduss] = useState("");
  const [stoken, setStoken] = useState("");
  const [notes, setNotes] = useState(account.notes ?? "");
  const [proxyId, setProxyId] = useState(
    account.proxy_id ? String(account.proxy_id) : "none"
  );
  const { data: proxyData } = useQuery({
    queryKey: ["proxies", "all-options"],
    queryFn: () => listProxies(),
  });

  const mutation = useMutation({
    mutationFn: () =>
      updateAccount(account.id, {
        nickname: nickname.trim() || null,
        status,
        status_reason: statusReason.trim() || null,
        bduss: bduss.trim() || undefined,
        stoken: stoken.trim() || undefined,
        notes: notes.trim() || null,
        proxy_id: proxyId === "none" ? null : Number(proxyId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("账号已更新");
      onClose();
    },
    onError: (error: Error) => toast.error(`保存失败：${error.message}`),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid gap-2">
        <Label>登录用户名</Label>
        <Input value={account.username} disabled />
        {account.tieba_uid ? (
          <p className="text-xs text-muted-foreground">贴吧 UID：{account.tieba_uid}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="edit-nickname">贴吧昵称</Label>
        <Input
          id="edit-nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="选填"
        />
      </div>

      <div className="grid gap-2">
        <Label>状态</Label>
        <Select
          items={STATUS_ORDER.map((item) => ({
            value: item,
            label: STATUS_LABELS[item],
          }))}
          value={status}
          onValueChange={(v) => setStatus(v as AccountStatus)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((item) => (
              <SelectItem key={item} value={item}>
                {STATUS_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="edit-status-reason">状态原因</Label>
        <Input
          id="edit-status-reason"
          value={statusReason}
          onChange={(e) => setStatusReason(e.target.value)}
          placeholder="例如：cookie 失效"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="edit-bduss">新的 BDUSS</Label>
        <Input
          id="edit-bduss"
          type="password"
          value={bduss}
          onChange={(e) => setBduss(e.target.value)}
          placeholder="留空则不修改"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="edit-stoken">新的 STOKEN</Label>
        <Input
          id="edit-stoken"
          type="password"
          value={stoken}
          onChange={(e) => setStoken(e.target.value)}
          placeholder="留空则不修改"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-2">
        <Label>代理节点</Label>
        <Select
          items={[
            { value: "none", label: "直连 / 使用默认代理" },
            ...(proxyData?.items ?? []).map((proxy) => ({
              value: String(proxy.id),
              label: proxy.display_name,
            })),
          ]}
          value={proxyId}
          onValueChange={(value) => setProxyId(value ?? "none")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">直连 / 使用默认代理</SelectItem>
            {(proxyData?.items ?? []).map((proxy) => (
              <SelectItem key={proxy.id} value={String(proxy.id)}>
                {proxy.display_name}（{proxy.host}:{proxy.port}）
                {proxy.is_active ? "" : " · 已停用"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="edit-notes">备注</Label>
        <Textarea
          id="edit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <DialogFooter className="sticky bottom-0 z-10">
        <Button type="button" variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "保存中…" : "保存"}
        </Button>
      </DialogFooter>
    </form>
  );
}
