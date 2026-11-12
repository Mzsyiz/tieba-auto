"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Video, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { STATUS_LABELS } from "@/lib/account-status";
import { listAccounts } from "@/lib/api/accounts";
import { listAccountForums, listForums } from "@/lib/api/forums";
import { listMaterials } from "@/lib/api/materials";
import {
  createPostTask,
  startPostTask,
  updatePostTask,
  type PostTask,
} from "@/lib/api/post-tasks";
import { getAppSettings } from "@/lib/api/settings";
import { cn } from "@/lib/utils";

const ACCOUNT_STATUS_CLASSES: Record<string, string> = {
  valid:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  invalid: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  disabled: "border-zinc-400/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

function toggleSet(
  setter: Dispatch<SetStateAction<Set<number>>>,
  id: number,
  checked: boolean
) {
  setter((prev) => {
    const next = new Set(prev);
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  });
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function SelectionSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative px-2 py-2">
      <Search className="absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-7 pr-7 pl-7 text-xs"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-4 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`清空${label}`}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function CreatePostTaskDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: PostTask | null;
}) {
  const queryClient = useQueryClient();
  const editing = task !== null && task !== undefined;
  const [name, setName] = useState(task?.name ?? "");
  const [accountIds, setAccountIds] = useState<Set<number>>(
    () => new Set(task?.account_ids ?? [])
  );
  const [forumIds, setForumIds] = useState<Set<number>>(
    () => new Set(task?.forum_ids ?? [])
  );
  const [materialIds, setMaterialIds] = useState<Set<number>>(
    () => new Set(task?.material_ids ?? [])
  );
  const [intervalMin, setIntervalMin] = useState(
    task ? String(task.interval_min) : ""
  );
  const [intervalMax, setIntervalMax] = useState(
    task ? String(task.interval_max) : ""
  );
  const [scheduledAt, setScheduledAt] = useState(
    task?.scheduled_at ? toLocalDateTime(task.scheduled_at) : ""
  );
  const [immediate, setImmediate] = useState(!editing);
  const [accountSearch, setAccountSearch] = useState("");
  const [forumSearch, setForumSearch] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });
  const { data: forumData } = useQuery({
    queryKey: ["forums", "manual"],
    queryFn: () => listForums(),
  });
  const { data: materialData } = useQuery({
    queryKey: ["materials", "all"],
    queryFn: () => listMaterials(),
  });
  const { data: appSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: getAppSettings,
  });

  const intervalMinValue =
    intervalMin || String(appSettings?.post_interval_min ?? 10);
  const intervalMaxValue =
    intervalMax || String(appSettings?.post_interval_max ?? 30);

  const forums = forumData?.items ?? [];
  const materials = materialData?.items ?? [];
  const orderedAccounts = [...accounts].sort((a, b) => {
    if (a.has_credentials !== b.has_credentials) {
      return a.has_credentials ? -1 : 1;
    }
    return a.id - b.id;
  });
  const followedQueries = useQueries({
    queries: Array.from(accountIds).map((accountId) => ({
      queryKey: ["account-forums", accountId],
      queryFn: () => listAccountForums(accountId),
    })),
  });
  const followsLoading = followedQueries.some((query) => query.isLoading);
  const followedById = new Map<number, { fname: string; isBanned: boolean }>();
  for (const query of followedQueries) {
    for (const item of query.data?.items ?? []) {
      if (item.is_followed) {
        followedById.set(item.forum_id, {
          fname: item.fname,
          isBanned: item.is_banned,
        });
      }
    }
  }
  const manualForumIds = new Set(forums.map((forum) => forum.id));
  const forumOptions = [
    ...forums.map((forum) => ({
      id: forum.id,
      fname: forum.fname,
      source: "manual" as const,
      isBanned: forum.is_banned || (followedById.get(forum.id)?.isBanned ?? false),
    })),
    ...Array.from(followedById.entries())
      .filter(([forumId]) => !manualForumIds.has(forumId))
      .map(([forumId, forum]) => ({
        id: forumId,
        fname: forum.fname,
        source: "followed" as const,
        isBanned: forum.isBanned,
      })),
  ].sort((a, b) => a.fname.localeCompare(b.fname, "zh-CN"));
  const normalizedAccountSearch = accountSearch.trim().toLocaleLowerCase("zh-CN");
  const normalizedForumSearch = forumSearch.trim().toLocaleLowerCase("zh-CN");
  const normalizedMaterialSearch =
    materialSearch.trim().toLocaleLowerCase("zh-CN");
  const filteredAccounts = orderedAccounts.filter((account) =>
    [account.nickname, account.username].some((value) =>
      (value ?? "").toLocaleLowerCase("zh-CN").includes(normalizedAccountSearch)
    )
  );
  const filteredForums = forumOptions.filter((forum) =>
    forum.fname.toLocaleLowerCase("zh-CN").includes(normalizedForumSearch)
  );
  const filteredMaterials = materials.filter((material) =>
    [material.title, material.content, ...material.tags].some((value) =>
      value.toLocaleLowerCase("zh-CN").includes(normalizedMaterialSearch)
    )
  );
  const selectableFilteredAccounts = filteredAccounts.filter(
    (account) => account.has_credentials && account.status === "valid"
  );
  const selectableFilteredForums = filteredForums.filter(
    (forum) => !forum.isBanned
  );
  const selectableFilteredMaterials = filteredMaterials.filter(
    (material) => material.status !== "disabled"
  );
  const hasSchedule = scheduledAt.trim() !== "";
  const total = accountIds.size * forumIds.size;

  const mutation = useMutation({
    mutationFn: async () => {
      if (accountIds.size === 0) throw new Error("请至少选择一个账号");
      if (forumIds.size === 0) throw new Error("请至少选择一个贴吧");
      if (materialIds.size === 0) throw new Error("请至少选择一条素材");
      const min = Number(intervalMinValue);
      const max = Number(intervalMaxValue);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
        throw new Error("发帖间隔必须是非负数字");
      }
      if (min > max) throw new Error("发帖间隔最小值不能大于最大值");

      const payload = {
        name: name.trim() || null,
        account_ids: Array.from(accountIds),
        forum_ids: Array.from(forumIds),
        material_ids: Array.from(materialIds),
        interval_min: min,
        interval_max: max,
        scheduled_at: hasSchedule ? new Date(scheduledAt).toISOString() : null,
      };

      if (task) {
        const updated = await updatePostTask(task.id, payload);
        return { task: updated, started: false, edited: true };
      }

      const created = await createPostTask(payload);

      if (immediate && !hasSchedule) {
        await startPostTask(created.id);
        return { task: created, started: true, edited: false };
      }
      return { task: created, started: false, edited: false };
    },
    onSuccess: ({ task: savedTask, started, edited }) => {
      queryClient.invalidateQueries({ queryKey: ["post-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["post-task", savedTask.id] });
      if (edited) {
        toast.success(`任务「${savedTask.name}」已更新`);
      } else {
        toast.success(
          started
            ? `任务「${savedTask.name}」已创建并开始`
            : `任务「${savedTask.name}」已创建`
        );
      }
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleAllAccounts = () => {
    if (selectableFilteredAccounts.length === 0) return;
    const allSelected = selectableFilteredAccounts.every((account) =>
      accountIds.has(account.id)
    );
    setAccountIds((current) => {
      const next = new Set(current);
      for (const account of selectableFilteredAccounts) {
        if (allSelected) next.delete(account.id);
        else next.add(account.id);
      }
      return next;
    });
    setForumIds(new Set());
  };

  const toggleAllForums = () => {
    if (selectableFilteredForums.length === 0) return;
    const allSelected = selectableFilteredForums.every((forum) =>
      forumIds.has(forum.id)
    );
    setForumIds((current) => {
      const next = new Set(current);
      for (const forum of selectableFilteredForums) {
        if (allSelected) next.delete(forum.id);
        else next.add(forum.id);
      }
      return next;
    });
  };

  const toggleAccount = (accountId: number, checked: boolean) => {
    toggleSet(setAccountIds, accountId, checked);
    setForumIds(new Set());
  };

  const toggleAllMaterials = () => {
    if (selectableFilteredMaterials.length === 0) return;
    const allSelected = selectableFilteredMaterials.every((material) =>
      materialIds.has(material.id)
    );
    setMaterialIds((current) => {
      const next = new Set(current);
      for (const material of selectableFilteredMaterials) {
        if (allSelected) next.delete(material.id);
        else next.add(material.id);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑发帖任务" : "新建发帖任务"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "修改账号、贴吧、素材、间隔或计划时间，保存后仍保持待执行状态。"
              : "每个账号 × 每个贴吧发一条，素材按选择顺序轮换使用。"}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="post-task-name">任务名称</Label>
            <Input
              id="post-task-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="选填，留空自动生成"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">账号 ({accountIds.size})</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={toggleAllAccounts}
                  disabled={selectableFilteredAccounts.length === 0}
                >
                  全选结果
                </Button>
              </div>
              <SelectionSearch
                value={accountSearch}
                onChange={setAccountSearch}
                placeholder="搜索昵称或用户名"
                label="搜索账号"
              />
              <div className="max-h-56 space-y-1 overflow-y-auto p-2">
                {orderedAccounts.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-muted-foreground">还没有账号</p>
                ) : filteredAccounts.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-muted-foreground">
                    没有匹配的账号
                  </p>
                ) : (
                  filteredAccounts.map((account) => (
                    <div key={account.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                      <Checkbox
                        checked={accountIds.has(account.id)}
                        onCheckedChange={(checked) => toggleAccount(account.id, checked)}
                        disabled={
                          !accountIds.has(account.id) &&
                          (!account.has_credentials || account.status !== "valid")
                        }
                        aria-label={`选择发帖账号-${account.username}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {account.nickname || account.username}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", ACCOUNT_STATUS_CLASSES[account.status])}
                      >
                        {STATUS_LABELS[account.status]}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">
                  贴吧 ({forumIds.size}/{forumOptions.length})
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={toggleAllForums}
                  disabled={selectableFilteredForums.length === 0}
                >
                  全选结果
                </Button>
              </div>
              <SelectionSearch
                value={forumSearch}
                onChange={setForumSearch}
                placeholder="搜索贴吧名"
                label="搜索贴吧"
              />
              <div className="max-h-56 space-y-1 overflow-y-auto p-2">
                {followsLoading ? (
                  <p className="px-2 py-4 text-xs text-muted-foreground">
                    正在加载账号关注贴吧…
                  </p>
                ) : forumOptions.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-muted-foreground">
                    暂无可用贴吧，请先添加吧池或给账号同步关注
                  </p>
                ) : filteredForums.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-muted-foreground">
                    没有匹配的贴吧
                  </p>
                ) : (
                  filteredForums.map((forum) => (
                    <div key={forum.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                      <Checkbox
                        checked={forumIds.has(forum.id)}
                        onCheckedChange={(checked) =>
                          toggleSet(setForumIds, forum.id, checked)
                        }
                        disabled={!forumIds.has(forum.id) && forum.isBanned}
                        aria-label={`选择发帖贴吧-${forum.fname}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">{forum.fname}</span>
                      {forum.isBanned ? (
                        <Badge variant="destructive" className="text-[10px]">
                          已封禁
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {forum.source === "manual" ? "吧池" : "关注"}
                        </Badge>
                      )}
                    </div>
                  ))
                )}
                <p className="px-2 pb-1 text-[10px] text-muted-foreground">
                  已合并手动吧池和所选账号关注的贴吧。
                </p>
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">素材 ({materialIds.size})</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={toggleAllMaterials}
                  disabled={selectableFilteredMaterials.length === 0}
                >
                  全选结果
                </Button>
              </div>
              <SelectionSearch
                value={materialSearch}
                onChange={setMaterialSearch}
                placeholder="搜索标题 / 正文 / 标签"
                label="搜索素材"
              />
              <div className="max-h-56 space-y-1 overflow-y-auto p-2">
                {materials.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-muted-foreground">
                    素材库为空，请先到「素材库」添加
                  </p>
                ) : filteredMaterials.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-muted-foreground">
                    没有匹配的素材
                  </p>
                ) : (
                  filteredMaterials.map((material) => (
                    <div key={material.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                      <Checkbox
                        checked={materialIds.has(material.id)}
                        onCheckedChange={(checked) =>
                          toggleSet(setMaterialIds, material.id, checked)
                        }
                        disabled={
                          !materialIds.has(material.id) &&
                          material.status === "disabled"
                        }
                        aria-label={`选择发帖素材-${material.title}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">{material.title}</span>
                      {material.post_type === "video" ? (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[10px] text-amber-700 dark:text-amber-400"
                          title="视频帖使用独立发布结构，当前自动视频通道尚未接入"
                        >
                          <Video className="size-3" />
                          视频帖
                        </Badge>
                      ) : null}
                      {material.status === "disabled" ? (
                        <Badge variant="destructive" className="text-[10px]">
                          已停用
                        </Badge>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>发帖间隔（秒）</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={intervalMinValue}
                  onChange={(event) => setIntervalMin(event.target.value)}
                  aria-label="发帖间隔最小值"
                />
                <span className="text-xs text-muted-foreground">至</span>
                <Input
                  type="number"
                  min={0}
                  value={intervalMaxValue}
                  onChange={(event) => setIntervalMax(event.target.value)}
                  aria-label="发帖间隔最大值"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="post-task-schedule">计划时间（可选）</Label>
              <Input
                id="post-task-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => {
                  setScheduledAt(event.target.value);
                  if (event.target.value) setImmediate(false);
                }}
              />
            </div>
          </div>

          {!editing ? (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>创建后立即开始</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  设置计划时间后将按计划自动开始
                </p>
              </div>
              <Switch
                checked={immediate && !hasSchedule}
                onCheckedChange={setImmediate}
                disabled={hasSchedule}
                aria-label="创建后立即开始"
              />
            </div>
          ) : null}

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            预计生成 <span className="font-semibold">{total}</span> 条发帖
            （{accountIds.size} 账号 × {forumIds.size} 贴吧），
            素材按顺序轮换。
          </div>

          {materials.some(
            (material) => materialIds.has(material.id) && material.post_type === "video"
          ) ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              已选择视频帖。普通发帖与发视频是两条独立通道；当前文字/图片任务不会把视频静默当作
              普通帖发布，自动视频通道接入前会明确记为失败。
            </p>
          ) : null}

          <DialogFooter className="sticky bottom-0 z-10">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending || total === 0}>
              {editing
                ? mutation.isPending
                  ? "保存中…"
                  : "保存修改"
                : mutation.isPending
                  ? "创建中…"
                  : immediate && !hasSchedule
                    ? "创建并开始"
                    : "创建任务"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
