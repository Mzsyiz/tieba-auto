import type { components } from "./schema";
import { request } from "./client";

export type AccountPost = components["schemas"]["AccountPostRead"];
export type AccountPostList = components["schemas"]["AccountPostListResponse"];

export function listAccountPosts(accountId: number, page = 1): Promise<AccountPostList> {
  const search = new URLSearchParams({
    account_id: String(accountId),
    page: String(page),
  });
  return request<AccountPostList>(`/api/v1/account-posts?${search.toString()}`);
}

export function deleteAccountPost(input: {
  account_id: number;
  tid: number;
  fname: string;
}): Promise<components["schemas"]["AccountPostDeleteResponse"]> {
  return request<components["schemas"]["AccountPostDeleteResponse"]>(
    "/api/v1/account-posts/delete",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}
