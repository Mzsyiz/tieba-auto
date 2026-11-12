"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  createProxy,
  updateProxy,
  type ProxyNode,
} from "@/lib/api/proxies";

type ProxyProtocol = "http" | "https";

export function ProxyFormDialog({
  open,
  onOpenChange,
  proxy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proxy: ProxyNode | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(proxy?.name ?? "");
  const [protocol, setProtocol] = useState<ProxyProtocol>(
    (proxy?.protocol as ProxyProtocol) ?? "http"
  );
  const [host, setHost] = useState(proxy?.host ?? "");
  const [port, setPort] = useState(proxy ? String(proxy.port) : "8080");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(proxy?.is_active ?? true);

  const mutation = useMutation({
    mutationFn: () => {
      const portNumber = Number(port);
      if (!host.trim()) throw new Error("请填写代理主机");
      if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
        throw new Error("代理端口需为 1-65535");
      }
      if (proxy) {
        return updateProxy(proxy.id, {
          name: name.trim(),
          protocol,
          host: host.trim(),
          port: portNumber,
          ...(username.trim() ? { username: username.trim() } : {}),
          ...(password.trim() ? { password: password.trim() } : {}),
          is_active: active,
        });
      }
      return createProxy({
        name: name.trim(),
        protocol,
        host: host.trim(),
        port: portNumber,
        username: username.trim() || null,
        password: password.trim() || null,
        is_active: active,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(proxy ? "代理节点已更新" : "代理节点已添加");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(`保存失败：${error.message}`),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{proxy ? "编辑代理节点" : "添加代理节点"}</DialogTitle>
          <DialogDescription>
            支持 HTTP/HTTPS 代理。账号完成绑定后，贴吧请求会通过该节点发送。
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="proxy-name">节点名称</Label>
            <Input
              id="proxy-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="选填，例如：香港-01"
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-[7rem_1fr_7rem] gap-3">
            <div className="grid gap-2">
              <Label>协议</Label>
              <Select
                items={[
                  { value: "http", label: "HTTP" },
                  { value: "https", label: "HTTPS" },
                ]}
                value={protocol}
                onValueChange={(value) => setProtocol(value as ProxyProtocol)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-host">主机</Label>
              <Input
                id="proxy-host"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="127.0.0.1 或域名"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-port">端口</Label>
              <Input
                id="proxy-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="proxy-username">用户名</Label>
              <Input
                id="proxy-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={proxy?.has_auth ? "留空则保持原用户名" : "选填"}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-password">密码</Label>
              <Input
                id="proxy-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={proxy?.has_auth ? "留空则保持原密码" : "选填"}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>启用节点</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                停用后，绑定账号会回退到默认代理或直连
              </p>
            </div>
            <Switch
              checked={active}
              onCheckedChange={setActive}
              aria-label="启用代理节点"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "保存中…" : "保存节点"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
