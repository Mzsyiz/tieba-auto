import type { components } from "./schema";
import { request } from "./client";

export type Forum = components["schemas"]["ForumRead"];
export type ForumStats = components["schemas"]["ForumStats"];
export type ForumListResponse = components["schemas"]["ForumListResponse"];
export type ForumCreateInput = components["schemas"]["ForumCreateRequest"];
export type ForumUpdateInput = components["schemas"]["ForumUpdate"];
export type ForumSyncInput = components["schemas"]["ForumSyncRequest"];
export type ForumSyncResult = components["schemas"]["ForumSyncResult"];
export type AccountForum = components["schemas"]["AccountForumRead"];
export type AccountForumStats = components["schemas"]["AccountForumStats"];
export type AccountForumListResponse = components["schemas"]["AccountForumListResponse"];
export type ForumFollowInput = components["schemas"]["ForumFollowRequest"];
export type ForumFollowResult = components["schemas"]["ForumFollowResult"];
export type ForumBulkCreateResult = components["schemas"]["ForumBulkCreateResult"];
export type ForumPoolImportInput = components["schemas"]["ForumPoolImportRequest"];
export type ForumPoolImportResult = components["schemas"]["ForumPoolImportResult"];

export function listForums(params?: {
  q?: string;
  status?: "active" | "banned";
  postTarget?: boolean;
  accountId?: number;
  followState?: "followed" | "unfollowed";
}): Promise<ForumListResponse> {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);
  if (params?.postTarget !== undefined) search.set("post_target", String(params.postTarget));
  if (params?.accountId !== undefined) search.set("account_id", String(params.accountId));
  if (params?.followState) search.set("follow_state", params.followState);
  const qs = search.toString();
  return request<ForumListResponse>(`/api/v1/forums${qs ? `?${qs}` : ""}`);
}

export function createForums(input: ForumCreateInput): Promise<ForumBulkCreateResult> {
  return request<ForumBulkCreateResult>("/api/v1/forums", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function importForumsToPool(
  input: ForumPoolImportInput
): Promise<ForumPoolImportResult> {
  return request<ForumPoolImportResult>("/api/v1/forums/pool/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateForum(id: number, input: ForumUpdateInput): Promise<Forum> {
  return request<Forum>(`/api/v1/forums/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteForum(id: number): Promise<void> {
  return request<void>(`/api/v1/forums/${id}`, { method: "DELETE" });
}

export function syncForums(input: ForumSyncInput): Promise<ForumSyncResult> {
  return request<ForumSyncResult>("/api/v1/forums/sync", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listAccountForums(
  accountId: number,
  params?: { q?: string; status?: "followed" | "unfollowed" | "banned" }
): Promise<AccountForumListResponse> {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  return request<AccountForumListResponse>(
    `/api/v1/forums/accounts/${accountId}${qs ? `?${qs}` : ""}`
  );
}

export function followForums(input: ForumFollowInput): Promise<ForumFollowResult> {
  return request<ForumFollowResult>("/api/v1/forums/follow", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function unfollowForums(input: ForumFollowInput): Promise<ForumFollowResult> {
  return request<ForumFollowResult>("/api/v1/forums/unfollow", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function clearAccountForumBan(
  accountId: number,
  forumId: number
): Promise<AccountForum> {
  return request<AccountForum>(
    `/api/v1/forums/accounts/${accountId}/forums/${forumId}/unban`,
    { method: "POST" }
  );
}
