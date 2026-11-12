"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/account-status";
import {
  createAccount,
  importCookie,
  type AccountStatus,
} from "@/lib/api/accounts";
import { listProxies } from "@/lib/api/proxies";
import { parseCookie } from "@/lib/cookie";

export function CreateAccountPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"cookie" | "manual">("cookie");

  const [cookie, setCookie] = useState("");
  const [name, setName] = useState("");
  const parsed = useMemo(() => parseCookie(cookie), [cookie]);

  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<AccountStatus>("pending");
  const [statusReason, setStatusReason] = useState("");
  const [bduss, setBduss] = useState("");
  const [stoken, setStoken] = useState("");
  const [notes, setNotes] = useState("");
  const [proxyId, setProxyId] = useState("none");
  const { data: proxyData } = useQuery({
    queryKey: ["proxies", "active-options"],
    queryFn: () => listProxies({ status: "active" }),
  });

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["proxies"] });
    onClose();
  };

  const quickAdd = useMutation({
    mutationFn: (verify: boolean) =>
      importCookie({
        cookie,
        name: name.trim() || undefined,
        verify,
        proxy_id: proxyId === "none" ? null : Number(proxyId),
      }),
    onSuccess: (account) => {
      toast.success(`账号「${account.username}」已添加`);
      finish();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const manualCreate = useMutation({
    mutationFn: () =>
      createAccount({
        username: username.trim(),
        nickname: nickname.trim() || null,
        status,
        status_reason: statusReason.trim() || null,
        bduss: bduss.trim() || null,
        stoken: stoken.trim() || null,
        notes: notes.trim() || null,
        proxy_id: proxyId === "none" ? null : Number(proxyId),
      }),
    onSuccess: (account) => {
      toast.success(`账号「${account.username}」已添加`);
      finish();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (mode === "manual") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!username.trim()) {
            toast.error("请输入登录用户名");
            return;
          }
          manualCreate.mutate();
        }}
        className="space-y-4"
      >
        <button
          type="button"
          onClick={() => setMode("cookie")}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          返回 Cookie 一键导入
        </button>

        <div className="grid gap-2">
          <Label htmlFor="manual-username">登录用户名</Label>
          <Input
            id="manual-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="手机号 / 邮箱 / 用户名"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="manual-nickname">贴吧昵称</Label>
          <Input
            id="manual-nickname"
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
          <Label htmlFor="manual-bduss">BDUSS</Label>
          <Input
            id="manual-bduss"
            type="password"
            value={bduss}
            onChange={(e) => setBduss(e.target.value)}
            placeholder="百度贴吧登录凭据"
            autoComplete="off"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="manual-stoken">STOKEN</Label>
          <Input
            id="manual-stoken"
            type="password"
            value={stoken}
            onChange={(e) => setStoken(e.target.value)}
            placeholder="选填"
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
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="manual-status-reason">状态原因</Label>
          <Input
            id="manual-status-reason"
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            placeholder="选填"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="manual-notes">备注</Label>
          <Textarea
            id="manual-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter className="sticky bottom-0 z-10">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={manualCreate.isPending}>
            {manualCreate.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  const busy = quickAdd.isPending;
  const bdussLengthOk = !parsed.bduss || parsed.bduss.length === 192;
  const hint = !parsed.bduss
    ? cookie.trim()
      ? "未识别到 BDUSS，请检查粘贴内容"
      : "在贴吧网页登录后，从开发者工具复制整段 Cookie 粘贴到这里"
    : bdussLengthOk
      ? parsed.stoken
        ? "已识别 BDUSS 和 STOKEN"
        : "已识别 BDUSS（未识别到 STOKEN，可选）"
      : `已识别 BDUSS，但长度为 ${parsed.bduss.length} 位（通常应为 192 位），请确认是否复制完整`;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!parsed.bduss) {
          toast.error("请先粘贴包含 BDUSS 的 Cookie");
          return;
        }
        quickAdd.mutate(true);
      }}
      className="space-y-4"
    >
      <div className="grid gap-2">
        <Label htmlFor="quick-cookie">
          Cookie / BDUSS
          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-normal text-primary">
            推荐
          </span>
        </Label>
        <Textarea
          id="quick-cookie"
          autoFocus
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && parsed.bduss && !busy) {
              quickAdd.mutate(true);
            }
          }}
          rows={4}
          placeholder="粘贴整段 Cookie（自动提取 BDUSS/STOKEN），也可以只粘贴 BDUSS"
          className="h-28 resize-none overflow-auto font-mono text-xs"
          style={{ fieldSizing: "fixed" } as CSSProperties}
        />
        <p
          className={
            parsed.bduss && bdussLengthOk
              ? "flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
              : cookie.trim() || parsed.bduss
                ? "text-xs text-amber-600 dark:text-amber-400"
                : "flex items-center gap-1 text-xs text-muted-foreground"
          }
        >
          {parsed.bduss ? <CheckCircle2 className="size-3.5" /> : <ClipboardPaste className="size-3.5" />}
          {hint}
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">
            如何获取 Cookie？
          </summary>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li>浏览器登录 tieba.baidu.com</li>
            <li>按 F12 打开开发者工具，进入 Application → Cookies</li>
            <li>复制整段 Cookie，或只复制 BDUSS（必填）和 STOKEN（可选）</li>
          </ol>
        </details>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="quick-name">账号备注（可选）</Label>
        <Input
          id="quick-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="留空会自动使用贴吧昵称"
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
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          手动填写
        </button>
        <span className="text-muted-foreground">Ctrl/⌘ + Enter 快速验证</span>
      </div>

      <DialogFooter className="sticky bottom-0 z-10">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          取消
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => quickAdd.mutate(false)}
          disabled={!parsed.bduss || busy}
          title="不调用百度接口，直接保存为待验证状态"
        >
          跳过验证直接保存
        </Button>
        <Button type="submit" disabled={!parsed.bduss || busy}>
          {busy ? "验证中…" : "验证并添加"}
        </Button>
      </DialogFooter>
    </form>
  );
}
