import type { components } from "./schema";
import { request } from "./client";

export type SignItem = components["schemas"]["SignItemRead"];
export type SignStats = components["schemas"]["SignStats"];
export type SignOverview = components["schemas"]["SignOverviewResponse"];
export type SignRequestInput = components["schemas"]["SignRequest"];
export type SignRunResult = components["schemas"]["SignRunResult"];
export type SignLog = components["schemas"]["SignLogRead"];
export type SignLogList = components["schemas"]["SignLogListResponse"];

export function getSignOverview(accountId: number): Promise<SignOverview> {
  return request<SignOverview>(`/api/v1/sign/accounts/${accountId}`);
}

export function runSign(
  accountId: number,
  forumIds?: number[]
): Promise<SignRunResult> {
  return request<SignRunResult>(`/api/v1/sign/accounts/${accountId}/sign`, {
    method: "POST",
    body: JSON.stringify({ forum_ids: forumIds ?? null }),
  });
}

export function listSignLogs(
  accountId?: number,
  limit = 30
): Promise<SignLogList> {
  const search = new URLSearchParams({ limit: String(limit) });
  if (accountId !== undefined) search.set("account_id", String(accountId));
  return request<SignLogList>(`/api/v1/sign/logs?${search.toString()}`);
}
