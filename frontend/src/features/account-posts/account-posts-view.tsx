"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  FilePenLine,
  MessageSquareText,
  RefreshCw,
  Search,
  Trash2,
  Users,
  Video,
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
import { useAccountContext } from "@/hooks/use-account-context";
import {
  deleteAccountPost,
  listAccountPosts,
  type AccountPost,
  type AccountPostList,
} from "@/lib/api/account-posts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PostDetailDialog } from "./post-detail-dialog";
import { PostToMaterialDialog } from "./post-to-material-dialog";

const EMPTY_POSTS: AccountPostList = {
  items: [],
  page: 1,
  page_size: 20,
  has_more: false,
};

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

export function AccountPostsView() {
  const queryClient = useQueryClient();
  const {
    accounts,
    accountId,
    account,
    accountIdNumber,
    accountsLoading,
    setSelectedAccountId,
  } = useAccountContext();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [forumFilter, setForumFilter] = useState("all");
  const [detailPost, setDetailPost] = useState<AccountPost | null>(null);
  const [editingPost, setEditingPost] = useState<AccountPost | null>(null);
  const [deletingPost, setDeletingPost] = useState<AccountPost | null>(null);

  const canLoad =
    accountIdNumber !== null && account?.has_credentials === true;
  const { data = EMPTY_POSTS, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["account-posts", accountIdNumber, page],
    queryFn: () => listAccountPosts(accountIdNumber as number, page),
    enabled: canLoad,
  });

  const deleteMutation = useMutation({
    mutationFn: (post: AccountPost) =>
      deleteAccountPost({
        account_id: accountIdNumber as number,
        tid: post.tid,
        fname: post.fname,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["account-posts"] });
      toast.success(result.message);
      setDeletingPost(null);
    },
    onError: (error: Error) => toast.error(`删除失败：${error.message}`),
  });

  const forums = Array.from(new Set(data.items.map((post) => post.fname))).sort(
    (a, b) => a.localeCompare(b, "zh-CN")
  );
  const filtered = data.items.filter((post) => {
    const matchesForum = forumFilter === "all" || post.fname === forumFilter;
    const query = search.trim().toLocaleLowerCase("zh-CN");
    const matchesSearch =
      !query ||
      [post.title, post.content, post.fname].some((value) =>
        value.toLocaleLowerCase("zh-CN").includes(query)
      );
    return matchesForum && matchesSearch;
  });
  const pageReplies = data.items.reduce((sum, post) => sum + post.reply_num, 0);
  const pageViews = data.items.reduce((sum, post) => sum + post.view_num, 0);
  const pageVideos = data.items.filter((post) => post.video_url).length;

  const copyLink = async (post: AccountPost) => {
    try {
      await navigator.clipboard.writeText(post.url);
      toast.success("帖子链接已复制");
    } catch {
      toast.error("复制失败，请打开原帖后复制地址");
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">帖子管理</h1>
          <p className="text-sm text-muted-foreground">
            查看当前账号发布的主题帖，整理内容或删除帖子
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">当前账号</span>
          <Select
            items={accounts.map((item) => ({
              value: String(item.id),
              label: item.nickname || item.username,
            }))}
            value={accountId}
            onValueChange={(value) => {
              setSelectedAccountId(String(value));
              setPage(1);
              setSearch("");
              setSearchInput("");
              setForumFilter("all");
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue
                placeholder={
                  accountsLoading
                    ? "加载账号中…"
                    : account?.nickname || account?.username || "选择账号"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.nickname || item.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {accountsLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            正在加载账号…
          </CardContent>
        </Card>
      ) : !canLoad ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {accounts.length === 0
                ? "请先在账号管理中添加贴吧账号"
                : "当前账号没有可用的登录凭据"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="当前页帖子" value={data.items.length} />
            <StatCard label="当前页回复" value={pageReplies} />
            <StatCard label="当前页浏览" value={pageViews} />
            <StatCard label="含视频帖子" value={pageVideos} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>
                    {account ? `${account.nickname || account.username} 的帖子` : "我的帖子"}
                  </CardTitle>
                  <CardDescription>
                    第 {data.page} 页 · 当前显示 {filtered.length} 条
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    items={[
                      { value: "all", label: "全部贴吧" },
                      ...forums.map((forum) => ({ value: forum, label: forum })),
                    ]}
                    value={forumFilter}
                    onValueChange={(value) => setForumFilter(String(value))}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部贴吧</SelectItem>
                      {forums.map((forum) => (
                        <SelectItem key={forum} value={forum}>
                          {forum}
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
                        if (event.key === "Enter") setSearch(searchInput);
                      }}
                      className="h-8 w-48 pl-8"
                      placeholder="搜索标题 / 正文"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSearch(searchInput)}>
                    搜索
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => refetch()}
                    aria-label="刷新帖子"
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
                  <MessageSquareText className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">当前账号还没有发布主题帖</p>
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  当前页没有匹配的帖子
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>帖子</TableHead>
                      <TableHead>贴吧</TableHead>
                      <TableHead>数据</TableHead>
                      <TableHead>发布时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((post) => (
                      <TableRow key={`${post.tid}-${post.pid}`}>
                        <TableCell className="max-w-xl">
                          <button
                            type="button"
                            onClick={() => setDetailPost(post)}
                            className="block max-w-full text-left"
                          >
                            <p className="truncate font-medium hover:underline">
                              {post.title || "无标题帖子"}
                            </p>
                            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                              {post.content || "正文为空"}
                            </p>
                          </button>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {post.image_urls.length > 0 ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {post.image_urls.length} 图
                              </Badge>
                            ) : null}
                            {post.video_url ? (
                              <Badge variant="secondary" className="gap-1 text-[10px]">
                                <Video className="size-3" />
                                视频
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{post.fname}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {post.reply_num} 回复 · {post.view_num} 浏览
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(post.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDetailPost(post)}
                              aria-label="查看帖子"
                              title="查看帖子"
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setEditingPost(post)}
                              aria-label="编辑并存入素材库"
                              title="编辑并存入素材库"
                            >
                              <FilePenLine className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void copyLink(post)}
                              aria-label="复制帖子链接"
                              title="复制帖子链接"
                            >
                              <Copy className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                window.open(
                                  post.url,
                                  "_blank",
                                  "noopener,noreferrer"
                                )
                              }
                              aria-label="打开原帖"
                              title="打开原帖"
                            >
                              <ExternalLink className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeletingPost(post)}
                              aria-label="删除帖子"
                              title="删除帖子"
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

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || isFetching}
                >
                  <ChevronLeft className="size-4" />
                  上一页
                </Button>
                <span className="text-xs text-muted-foreground">第 {page} 页</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!data.has_more || isFetching}
                >
                  下一页
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <PostDetailDialog
        post={detailPost}
        onOpenChange={(open) => {
          if (!open) setDetailPost(null);
        }}
        onEditToMaterial={(post) => {
          setDetailPost(null);
          setEditingPost(post);
        }}
      />

      {editingPost ? (
        <PostToMaterialDialog
          key={editingPost.tid}
          post={editingPost}
          onOpenChange={(open) => {
            if (!open) setEditingPost(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deletingPost !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingPost(null);
        }}
        title="从贴吧删除帖子"
        description={
          deletingPost
            ? `确定使用账号「${account?.nickname || account?.username || ""}」永久删除「${deletingPost.title || "无标题帖子"}」吗？帖子将从贴吧服务器删除，无法恢复。`
            : ""
        }
        onConfirm={() => {
          if (deletingPost) deleteMutation.mutate(deletingPost);
        }}
        loading={deleteMutation.isPending}
        confirmLabel="确认删除"
        loadingLabel="删除中…"
      />
    </div>
  );
}
